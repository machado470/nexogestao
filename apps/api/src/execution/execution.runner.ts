import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Prisma, WhatsAppMessageType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FinanceService } from '../finance/finance.service'
import { ExecutionConfigService } from './execution.config'
import { ExecutionGovernanceService } from './execution.governance'
import { ExecutionEventsService } from './execution.events'
import { buildExecutionKey } from './execution.idempotency'
import type {
  ExecutionActionCandidate,
  ExecutionContext,
  ExecutionEventPayload,
  ExecutionPriority,
  ExecutionResult,
} from './execution.types'
import { MetricsService } from '../common/metrics/metrics.service'
import { TenantOperationsService } from '../common/tenant-ops/tenant-ops.service'
import { buildOperationalLogContext } from '../common/logging/operational-log-context'
import {
  CommercialPolicyService,
  isCommercialBlocked,
} from '../common/commercial/commercial-policy.service'

@Injectable()
export class ExecutionRunner {
  private readonly logger = new Logger(ExecutionRunner.name)
  private nextCycleAt = 0
  private readonly blockedRecentCooldownMap = new Map<string, number>()
  private readonly blockedLogSuppression = new Map<string, { until: number; blockedCountDuringWindow: number }>()
  private readonly blockedReasonCounters = new Map<string, number>()
  private readonly manualModeBlockedSummary = new Map<string, { count: number; nextLogAt: number }>()
  private readonly priorityOrder: Record<ExecutionPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private hasUsablePhone(phone: string | null | undefined): boolean {
    return typeof phone === 'string' && phone.trim().length > 0
  }

  private sortCandidatesByPriority(candidates: ExecutionActionCandidate[]) {
    return [...candidates].sort((a, b) => this.priorityOrder[a.priority] - this.priorityOrder[b.priority])
  }

  private buildExecutionContext(candidate: ExecutionActionCandidate, correlationId: string): ExecutionContext {
    return {
      orgId: candidate.orgId,
      entityId: candidate.entityId,
      decisionId: candidate.decisionId,
      actionId: candidate.actionId,
      intent: candidate.intent,
      priority: candidate.priority,
      correlationId,
    }
  }

  private buildCooldownKey(candidate: ExecutionActionCandidate): string {
    return `${candidate.orgId}:${candidate.decisionId}:${candidate.actionId}:${candidate.entityId}`
  }

  private isCandidateInRecentCooldown(candidate: ExecutionActionCandidate) {
    const key = this.buildCooldownKey(candidate)
    const blockedUntil = this.blockedRecentCooldownMap.get(key)
    if (!blockedUntil) return null
    if (Date.now() >= blockedUntil) {
      this.blockedRecentCooldownMap.delete(key)
      return null
    }
    return blockedUntil
  }

  private markCandidateRecentCooldown(candidate: ExecutionActionCandidate, blockedUntil: number) {
    const key = this.buildCooldownKey(candidate)
    this.blockedRecentCooldownMap.set(key, blockedUntil)
  }

  private shouldSuppressBlockedLog(params: {
    candidate: ExecutionActionCandidate
    reasonCode: string
    status: 'blocked' | 'requires_confirmation' | 'throttled'
    suppressionWindowMs: number
  }) {
    const key = `${this.buildCooldownKey(params.candidate)}:${params.reasonCode}:${params.status}`
    const current = this.blockedLogSuppression.get(key)
    const now = Date.now()

    if (current && now < current.until) {
      current.blockedCountDuringWindow += 1
      this.blockedLogSuppression.set(key, current)
      return {
        suppressed: true as const,
        suppressedCount: current.blockedCountDuringWindow,
      }
    }

    const previousSuppressedCount = current?.blockedCountDuringWindow ?? 0
    this.blockedLogSuppression.set(key, {
      until: now + params.suppressionWindowMs,
      blockedCountDuringWindow: 0,
    })
    return {
      suppressed: false as const,
      previousSuppressedCount,
    }
  }

  private mapExpectedReasonFromError(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error)
    if (!message) return null
    if (message === 'charge_followup_already_exists') return 'charge_followup_already_exists'
    if (message === 'charge_not_eligible_for_payment_link') return 'no_valid_phone'
    if (message === 'charge_not_eligible_for_overdue_reminder') return 'already_sent_recently'
    if (message === 'charge_not_eligible_for_followup') return 'already_paid'
    if (message === 'charge_not_overdue_enough_for_followup') return 'blocked_recent_execution'
    if (message === 'risk_review_already_escalated_recently') return 'already_sent_recently'
    return null
  }

  private isDebugExecutionEnabled(input?: { debugExecution?: boolean }): boolean {
    if (input?.debugExecution) return true
    return process.env.EXECUTION_DEBUG_MODE === '1'
  }

  private requiresInteractiveAuthForAutomation(): boolean {
    const raw = (process.env.EXECUTION_REQUIRE_INTERACTIVE_AUTH ?? '').trim().toLowerCase()
    return ['1', 'true', 'yes', 'y', 'on'].includes(raw)
  }

  private incrementBlockedReason(reasonCode: string) {
    const current = this.blockedReasonCounters.get(reasonCode) ?? 0
    this.blockedReasonCounters.set(reasonCode, current + 1)
  }

  private maybeLogManualModeBlockedSummary(orgId: string, reasonCode: string) {
    if (reasonCode !== 'mode_manual_explicit_configuration') return
    const now = Date.now()
    const summaryIntervalMs = 5 * 60_000
    const current = this.manualModeBlockedSummary.get(orgId) ?? {
      count: 0,
      nextLogAt: now,
    }
    current.count += 1

    if (now >= current.nextLogAt) {
      this.logger.log(
        JSON.stringify({
          event: 'execution_runner_manual_mode_summary',
          logClass: '[WARN-LOCAL]',
          orgId,
          reasonCode,
          blockedCountLastWindow: current.count,
          windowMs: summaryIntervalMs,
          note: 'runner em modo manual por configuração explícita (resumo periódico, sem flood por ciclo)',
        }),
      )
      current.count = 0
      current.nextLogAt = now + summaryIntervalMs
    }

    this.manualModeBlockedSummary.set(orgId, current)
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly config: ExecutionConfigService,
    private readonly governance: ExecutionGovernanceService,
    private readonly events: ExecutionEventsService,
    private readonly metrics: MetricsService,
    private readonly tenantOps: TenantOperationsService,
    private readonly commercial: CommercialPolicyService,
  ) {}

  private countOperationalStatus(status: 'executed' | 'blocked' | 'requires_confirmation' | 'throttled' | 'failed') {
    const mapped =
      status === 'requires_confirmation'
        ? 'blocked'
        : status
    this.metrics.increment(`executionActionStatus:${mapped}`)
  }

  private async reserveExecutionStart(params: {
    candidate: ExecutionActionCandidate
    executionKey: string
    mode: 'manual' | 'semi_automatic' | 'automatic'
    executionContext: ExecutionContext
    throttleWindowMs: number
    policySnapshot: unknown
    customerId?: string
  }) {
    const lockKey =
      `execution.runner.v5:${params.candidate.orgId}:${params.executionKey}`

    const startedPayload: ExecutionEventPayload = {
      eventType: 'EXECUTION_STARTED',
      entityType: params.candidate.entityType,
      entityId: params.candidate.entityId,
      actionId: params.candidate.actionId,
      decisionId: params.candidate.decisionId,
      executionKey: params.executionKey,
      mode: params.mode,
      status: 'pending',
      intent: params.executionContext.intent,
      priority: params.executionContext.priority,
      correlationId:
        params.executionContext.correlationId,
      reasonCode: 'runner_execution_requested',
      result: { outcome: 'success' },
      timestamp: new Date().toISOString(),
      customerId: params.customerId,
      metadata: {
        policySnapshot: params.policySnapshot,
        trigger: params.candidate.metadata ?? {},
      },
      reasonDetail:
        'candidate aprovado para execução automática',
      explanation: {
        ruleId: params.candidate.decisionId,
        eligibility: 'eligible',
        trigger: params.candidate.metadata ?? {},
      },
    }

    const reservation =
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`
            SELECT 1::int AS "locked"
            FROM pg_advisory_xact_lock(
              hashtextextended(${lockKey}, 0)
            )
          `,
        )

        const recent =
          await tx.timelineEvent.findFirst({
            where: {
              orgId: params.candidate.orgId,
              action: 'EXECUTION_EVENT',
              createdAt: {
                gte: new Date(
                  Date.now()
                    - params.throttleWindowMs,
                ),
              },
              metadata: {
                path: ['executionKey'],
                equals: params.executionKey,
              },
              OR: [
                {
                  metadata: {
                    path: ['status'],
                    equals: 'executed',
                  },
                },
                {
                  metadata: {
                    path: ['eventType'],
                    equals: 'EXECUTION_STARTED',
                  },
                },
              ],
            },
            select: { id: true },
          })

        if (recent?.id) {
          return {
            status: 'recent' as const,
          }
        }

        /*
         * Somente quem possui ownership consome
         * o bucket local de execução.
         */
        const tenantLimit =
          this.tenantOps.enforceLimit({
            orgId: params.candidate.orgId,
            scope: 'execution:auto-actions',
            limit: 180,
            windowMs: 60_000,
            blockedReason:
              'tenant_execution_rate_limit_reached',
          })

        if (!tenantLimit.allowed) {
          return {
            status: 'throttled' as const,
            tenantLimit,
          }
        }

        /*
         * STARTED é evidência autoritativa e entra
         * na mesma transação do advisory lock.
         */
        const event =
          await this.events.recordEventInTransaction(
            params.candidate.orgId,
            startedPayload,
            tx,
          )

        return {
          status: 'reserved' as const,
          timelineEventId: event.id,
        }
      })

    /*
     * Integração externa só após COMMIT.
     */
    if (reservation.status === 'reserved') {
      await this.events.dispatchRecordedEventWebhook(
        params.candidate.orgId,
        startedPayload,
        reservation.timelineEventId,
      )
    }

    return reservation
  }

  private extractCustomerId(metadata: Record<string, unknown> | null | undefined): string | null {
    const raw = metadata?.customerId
    if (typeof raw !== 'string') return null
    const normalized = raw.trim()
    return normalized.length > 0 ? normalized : null
  }

  private async validateCandidateContext(candidate: ExecutionActionCandidate) {
    const customerId = this.extractCustomerId(candidate.metadata ?? null)

    if (!candidate.orgId || !candidate.actionId || !candidate.decisionId || !candidate.entityId) {
      return {
        valid: false as const,
        reason: 'missing_required_context_fields',
        customerId,
      }
    }

    if (candidate.entityType === 'serviceOrder') {
      const serviceOrder = await this.prisma.serviceOrder.findFirst({
        where: { id: candidate.entityId, orgId: candidate.orgId },
        select: { id: true, customerId: true },
      })

      if (!serviceOrder?.id) {
        return {
          valid: false as const,
          reason: 'service_order_not_found_for_org',
          customerId,
        }
      }

      if (!serviceOrder.customerId) {
        return {
          valid: false as const,
          reason: 'service_order_missing_customer',
          customerId,
        }
      }

      if (customerId && customerId !== serviceOrder.customerId) {
        return {
          valid: false as const,
          reason: 'service_order_customer_mismatch',
          customerId,
        }
      }

      return {
        valid: true as const,
        customerId: serviceOrder.customerId,
      }
    }

    if (candidate.entityType === 'charge') {
      const charge = await this.prisma.charge.findFirst({
        where: { id: candidate.entityId, orgId: candidate.orgId },
        select: { id: true, customerId: true },
      })

      if (!charge?.id) {
        return {
          valid: false as const,
          reason: 'charge_not_found_for_org',
          customerId,
        }
      }

      if (!charge.customerId) {
        return {
          valid: false as const,
          reason: 'charge_missing_customer',
          customerId,
        }
      }

      if (customerId && customerId !== charge.customerId) {
        return {
          valid: false as const,
          reason: 'charge_customer_mismatch',
          customerId,
        }
      }

      return {
        valid: true as const,
        customerId: charge.customerId,
      }
    }

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, orgId: candidate.orgId },
        select: { id: true },
      })
      if (!customer?.id) {
        return {
          valid: false as const,
          reason: 'customer_not_found_for_org',
          customerId,
        }
      }
    }

    return {
      valid: true as const,
      customerId,
    }
  }

  async runOnce(options?: { debugExecution?: boolean; overrideCooldown?: boolean }) {
    const debugExecution = this.isDebugExecutionEnabled(options)
    const correlationId = randomUUID()
    this.blockedReasonCounters.clear()
    const now = Date.now()
    if (now < this.nextCycleAt) {
      return {
        orgs: 0,
        totalCandidates: 0,
        executed: 0,
        delayed: true,
      }
    }

    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
      take: 200,
    })

    let totalCandidates = 0
    let executed = 0
    let blocked = 0
    let blockedRecent = 0
    let failed = 0
    let skipped = 0

    for (const org of orgs) {
      const candidates = this.sortCandidatesByPriority(await this.loadActionCandidates(org.id))
      totalCandidates += candidates.length

      for (const candidate of candidates) {
        if (executed >= this.config.getMaxExecutionsPerCycle()) break
        const result = await this.processCandidate(candidate, {
          debugExecution,
          overrideCooldown: options?.overrideCooldown === true,
          correlationId,
        })
        if (result === 'executed') executed += 1
        else if (result === 'failed') failed += 1
        else if (result === 'blocked' || result === 'requires_confirmation' || result === 'throttled') blocked += 1
        else if (result === 'blocked_recent_execution') blockedRecent += 1
      }

      if (executed >= this.config.getMaxExecutionsPerCycle()) break
    }

    const cycleDelayMs = this.config.getCycleDelayMs()
    this.nextCycleAt = Date.now() + cycleDelayMs
    await this.sleep(cycleDelayMs)

    this.logger.log(
      JSON.stringify({
        event: 'execution_runner_cycle',
        orgs: orgs.length,
        totalCandidates,
        executed,
        blocked,
        blockedRecent,
        failed,
        skipped,
        blockedByReason: Object.fromEntries(this.blockedReasonCounters.entries()),
        blockedRecentVsConfig: {
          blocked_recent: this.blockedReasonCounters.get('blocked_recent_execution') ?? 0,
          blocked_config:
            Array.from(this.blockedReasonCounters.entries())
              .filter(([reasonCode]) => reasonCode !== 'blocked_recent_execution')
              .reduce((total, [, count]) => total + count, 0),
        },
        debugExecution,
        overrideCooldown: options?.overrideCooldown === true,
        correlationId,
        orgsProcessed: orgs.length,
        maxExecutionsPerCycle: this.config.getMaxExecutionsPerCycle(),
        cycleDelayMs,
      }),
    )

    return {
      orgs: orgs.length,
      totalCandidates,
      executed,
      blocked,
      blockedRecent,
      failed,
      skipped,
      debugExecution,
      blockedByReason: Object.fromEntries(this.blockedReasonCounters.entries()),
      correlationId,
    }
  }

  private async loadActionCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const [
      chargeCandidates,
      linkCandidates,
      overdueReminderCandidates,
      operationalAlerts,
      financeTeamCandidates,
      operationalAttentionCandidates,
      chargeFollowupCandidates,
      riskEscalationCandidates,
    ] =
      await Promise.all([
      this.loadGenerateChargeCandidates(orgId),
      this.loadSendPaymentLinkCandidates(orgId),
      this.loadOverdueReminderCandidates(orgId),
      this.loadOperationalAlertCandidates(orgId),
      this.loadNotifyFinanceTeamCandidates(orgId),
      this.loadOperationalAttentionCandidates(orgId),
      this.loadCreateChargeFollowupCandidates(orgId),
      this.loadEscalateRiskReviewCandidates(orgId),
    ])

    return [
      ...chargeCandidates,
      ...linkCandidates,
      ...overdueReminderCandidates,
      ...operationalAlerts,
      ...financeTeamCandidates,
      ...operationalAttentionCandidates,
      ...chargeFollowupCandidates,
      ...riskEscalationCandidates,
    ]
  }

  private async loadGenerateChargeCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const doneWithoutCharge = await this.prisma.serviceOrder.findMany({
      where: {
        orgId,
        status: 'DONE',
        amountCents: { gt: 0 },
        charges: { none: {} },
      },
      select: {
        id: true,
        customerId: true,
        amountCents: true,
        dueDate: true,
      },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    })

    return doneWithoutCharge.map((item) => ({
      actionId: 'action-generate-charge',
      decisionId: 'decision-done-without-charge',
      entityType: 'serviceOrder',
      entityId: item.id,
      orgId,
      priority: 'critical',
      intent: 'recover_revenue',
      metadata: {
        customerId: item.customerId,
        amountCents: item.amountCents,
        dueDate: item.dueDate ? item.dueDate.toISOString() : null,
      },
    }))
  }

  private async loadSendPaymentLinkCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const charges = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      select: {
        id: true,
        customerId: true,
        customer: {
          select: {
            phone: true,
          },
        },
        amountCents: true,
        dueDate: true,
        status: true,
      },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    })

    if (charges.length === 0) return []

    const chargeIds = charges.map((item) => item.id)
    const sent = await this.prisma.whatsAppMessage.findMany({
      where: {
        orgId,
        entityType: 'CHARGE',
        entityId: { in: chargeIds },
        messageType: WhatsAppMessageType.PAYMENT_LINK,
      },
      select: { entityId: true },
      distinct: ['entityId'],
    })

    const alreadySent = new Set(sent.map((item) => item.entityId))

    return charges
      .filter((item) => this.hasUsablePhone(item.customer.phone))
      .filter((item) => !alreadySent.has(item.id))
      .map((item) => ({
        actionId: 'action-send-whatsapp-payment-link',
        decisionId: 'decision-pending-charge-without-payment-link',
        entityType: 'charge',
        entityId: item.id,
        orgId,
        priority: 'high',
        intent: 'customer_engagement',
        metadata: {
          customerId: item.customerId,
          amountCents: item.amountCents,
          dueDate: item.dueDate ? item.dueDate.toISOString() : null,
          chargeStatus: item.status,
        },
      }))
  }

  private async loadOperationalAlertCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const [overdueCount, stalledServiceOrders] = await Promise.all([
      this.prisma.charge.count({ where: { orgId, status: 'OVERDUE' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
    ])

    if (overdueCount < 3 && stalledServiceOrders < 8) {
      return []
    }

    return [
      {
        actionId: 'action-notify-operational-alert',
        decisionId: 'decision-operational-risk-threshold',
        entityType: 'system',
        entityId: `org:${orgId}`,
        orgId,
        priority: 'high',
        intent: 'reduce_risk',
        metadata: {
          overdueCount,
          stalledServiceOrders,
          thresholdOverdue: 3,
          thresholdStalledServiceOrders: 8,
        },
      },
    ]
  }

  private async loadOverdueReminderCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const overdueCharges = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: 'OVERDUE',
      },
      select: {
        id: true,
        customerId: true,
        customer: {
          select: {
            phone: true,
          },
        },
        amountCents: true,
        dueDate: true,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    return overdueCharges
      .filter((item) => this.hasUsablePhone(item.customer.phone))
      .map((item) => ({
        actionId: 'action-send-overdue-charge-reminder',
        decisionId: 'decision-overdue-charge-reminder',
        entityType: 'charge',
        entityId: item.id,
        orgId,
        priority: 'high',
        intent: 'recover_revenue',
        metadata: {
          customerId: item.customerId,
          amountCents: item.amountCents,
          dueDate: item.dueDate?.toISOString() ?? null,
          chargeStatus: 'OVERDUE',
        },
      }))
  }

  private async loadNotifyFinanceTeamCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const overdueCount = await this.prisma.charge.count({
      where: { orgId, status: 'OVERDUE' },
    })

    if (overdueCount < 5) return []

    return [
      {
        actionId: 'action-notify-finance-team',
        decisionId: 'decision-finance-overdue-threshold',
        entityType: 'system',
        entityId: `org:${orgId}`,
        orgId,
        priority: 'medium',
        intent: 'operational_followup',
        metadata: {
          overdueCount,
          thresholdOverdue: 5,
        },
      },
    ]
  }

  private async loadOperationalAttentionCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const stalledServiceOrders = await this.prisma.serviceOrder.count({
      where: { orgId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
    })

    if (stalledServiceOrders < 10) return []

    return [
      {
        actionId: 'action-mark-operational-attention',
        decisionId: 'decision-stalled-service-orders-attention-threshold',
        entityType: 'system',
        entityId: `org:${orgId}`,
        orgId,
        priority: 'medium',
        intent: 'operational_followup',
        metadata: {
          stalledServiceOrders,
          thresholdStalledServiceOrders: 10,
        },
      },
    ]
  }
  private async loadCreateChargeFollowupCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const thresholdDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const charges = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: 'OVERDUE',
        dueDate: { lte: thresholdDate },
      },
      select: {
        id: true,
        customerId: true,
        amountCents: true,
        dueDate: true,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    return charges.map((item) => ({
      actionId: 'action-create-charge-followup',
      decisionId: 'decision-overdue-charge-followup-threshold',
      entityType: 'charge',
      entityId: item.id,
      orgId,
      priority: 'critical',
      intent: 'recover_revenue',
      metadata: {
        customerId: item.customerId,
        amountCents: item.amountCents,
        dueDate: item.dueDate?.toISOString() ?? null,
        overdueDaysThreshold: 7,
      },
    }))
  }

  private async loadEscalateRiskReviewCandidates(orgId: string): Promise<ExecutionActionCandidate[]> {
    const [overdueCount, stalledServiceOrders] = await Promise.all([
      this.prisma.charge.count({ where: { orgId, status: 'OVERDUE' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
    ])

    if (overdueCount < 8 || stalledServiceOrders < 12) return []

    return [
      {
        actionId: 'action-escalate-risk-review',
        decisionId: 'decision-escalate-risk-review-threshold',
        entityType: 'system',
        entityId: `org:${orgId}`,
        orgId,
        priority: 'critical',
        intent: 'reduce_risk',
        metadata: {
          overdueCount,
          stalledServiceOrders,
          thresholdOverdue: 8,
          thresholdStalledServiceOrders: 12,
        },
      },
    ]
  }

  private async processCandidate(
    candidate: ExecutionActionCandidate,
    options?: { debugExecution?: boolean; overrideCooldown?: boolean; correlationId?: string },
  ) {
    const debugExecution = options?.debugExecution === true
    const correlationId = options?.correlationId ?? randomUUID()
    const executionContext = this.buildExecutionContext(candidate, correlationId)
    const recordBlockedWithContext = (
      executionKey: string,
      mode: 'manual' | 'semi_automatic' | 'automatic',
      reasonCode: string,
      status: 'blocked' | 'requires_confirmation' | 'throttled',
      explanation?: {
        ruleId?: string
        ruleReason?: string
        eligibility?: string
        policyKey?: string
        policyValue?: unknown
        governanceReason?: string
        cooldownUntil?: string
      },
      eventType: 'EXECUTION_BLOCKED' | 'AUTH_BLOCKED_EXECUTION' = 'EXECUTION_BLOCKED',
    ) => this.recordBlocked(candidate, executionKey, mode, reasonCode, status, explanation, eventType, correlationId)
    const mode = await this.config.getExecutionMode({ orgId: candidate.orgId })
    const policy = await this.config.getPolicyConfig({ orgId: candidate.orgId })

    const executionKey = buildExecutionKey({
      action: candidate,
      context: {
        orgId: candidate.orgId,
        mode,
        scope: 'runner_v5',
        payload: candidate.metadata ?? null,
      },
    })

    const contextValidation = await this.validateCandidateContext(candidate)
    if (!contextValidation.valid) {
      const detail = {
        event: 'execution_runner_invalid_context',
        reason: contextValidation.reason,
        origin: 'ExecutionRunner.processCandidate',
        orgId: candidate.orgId,
        actionId: candidate.actionId,
        decisionId: candidate.decisionId,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        customerId: contextValidation.customerId ?? null,
      }
      this.logger.error(JSON.stringify(detail))
      await this.events.recordEvent(candidate.orgId, {
        eventType: 'EXECUTION_FAILED',
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        actionId: candidate.actionId,
        decisionId: candidate.decisionId,
        executionKey,
        mode,
        status: 'failed',
        intent: executionContext.intent,
        priority: executionContext.priority,
        correlationId: executionContext.correlationId,
        reasonCode: 'invalid_execution_context',
        timestamp: new Date().toISOString(),
        result: { outcome: 'failed' },
        metadata: detail,
        reasonDetail: contextValidation.reason,
        explanation: {
          ruleId: candidate.decisionId,
          eligibility: 'failed',
          ruleReason: contextValidation.reason,
          trigger: candidate.metadata ?? {},
        },
      })
      this.countOperationalStatus('failed')
      return 'failed'
    }

    const blockedUntil = this.isCandidateInRecentCooldown(candidate)
    if (blockedUntil && options?.overrideCooldown !== true) {
      await recordBlockedWithContext(executionKey, mode, 'blocked_recent_execution', 'blocked', {
        ruleId: candidate.decisionId,
        ruleReason: 'cooldown local ativo por execução recente',
        eligibility: 'blocked',
        cooldownUntil: new Date(blockedUntil).toISOString(),
      })
      this.countOperationalStatus('blocked')
      return 'blocked_recent_execution'
    }
    if (blockedUntil && options?.overrideCooldown === true && debugExecution) {
      this.logger.debug(
        JSON.stringify({
          event: 'execution_runner_debug_cooldown_override',
          orgId: candidate.orgId,
          actionId: candidate.actionId,
          decisionId: candidate.decisionId,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          executionKey,
          reasonCode: 'blocked_recent_execution',
          cooldownUntil: new Date(blockedUntil).toISOString(),
        }),
      )
    }

    const requireInteractiveAuth = this.requiresInteractiveAuthForAutomation()
    if (requireInteractiveAuth) {
      this.logger.warn(
        JSON.stringify({
          event: 'execution_runner_interactive_auth_required',
          executionKey,
          orgId: candidate.orgId,
          actionId: candidate.actionId,
          decisionId: candidate.decisionId,
          detail:
            'EXECUTION_REQUIRE_INTERACTIVE_AUTH=true ativo, mas automação segue com contexto técnico (sem dependência de sessão).',
        }),
      )
    }

    if (mode === 'manual') {
      await recordBlockedWithContext(executionKey, mode, 'mode_manual_explicit_configuration', 'blocked', {
        ruleId: candidate.decisionId,
        ruleReason: 'runner mode em manual por configuração explícita',
        eligibility: 'blocked',
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }

    if (mode === 'semi_automatic') {
      await recordBlockedWithContext(
        executionKey,
        mode,
        'mode_semi_automatic_requires_confirmation',
        'requires_confirmation',
        {
          ruleId: candidate.decisionId,
          ruleReason: 'runner mode em semi_automatic',
          eligibility: 'requires_confirmation',
        },
      )
      this.countOperationalStatus('requires_confirmation')
      return 'requires_confirmation'
    }

    if (candidate.actionId === 'action-generate-charge' && !policy.allowAutomaticCharge) {
      await recordBlockedWithContext(executionKey, mode, 'policy_automatic_charge_disabled', 'blocked', {
        ruleId: candidate.decisionId,
        policyKey: 'allowAutomaticCharge',
        policyValue: policy.allowAutomaticCharge,
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }

    if (candidate.actionId === 'action-notify-finance-team' && !policy.allowFinanceTeamNotifications) {
      await recordBlockedWithContext(executionKey, mode, 'policy_finance_team_notification_disabled', 'blocked', {
        ruleId: candidate.decisionId,
        policyKey: 'allowFinanceTeamNotifications',
        policyValue: policy.allowFinanceTeamNotifications,
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }
    if (candidate.actionId === 'action-mark-operational-attention' && !policy.allowGovernanceFollowup) {
      await recordBlockedWithContext(executionKey, mode, 'policy_operational_attention_disabled', 'blocked', {
        ruleId: candidate.decisionId,
        policyKey: 'allowGovernanceFollowup',
        policyValue: policy.allowGovernanceFollowup,
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }
    if (candidate.actionId === 'action-create-charge-followup' && !policy.allowChargeFollowupCreation) {
      await recordBlockedWithContext(executionKey, mode, 'policy_charge_followup_creation_disabled', 'blocked', {
        ruleId: candidate.decisionId,
        policyKey: 'allowChargeFollowupCreation',
        policyValue: policy.allowChargeFollowupCreation,
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }
    if (candidate.actionId === 'action-escalate-risk-review' && !policy.allowRiskReviewEscalation) {
      await recordBlockedWithContext(executionKey, mode, 'policy_risk_review_escalation_disabled', 'blocked', {
        ruleId: candidate.decisionId,
        policyKey: 'allowRiskReviewEscalation',
        policyValue: policy.allowRiskReviewEscalation,
      })
      this.countOperationalStatus('blocked')
      return 'blocked'
    }

    const governance = this.governance.evaluate(candidate)
    if (governance.status !== 'allowed') {
      await recordBlockedWithContext(
        executionKey,
        mode,
        governance.reasonCode ?? 'governance_blocked',
        governance.status === 'blocked' ? 'blocked' : 'requires_confirmation',
        {
          ruleId: candidate.decisionId,
          governanceReason: governance.reasonCode ?? 'governance_blocked',
        },
      )
      this.countOperationalStatus(governance.status)
      return governance.status
    }

    const alreadyExecuted = await this.events.hasRecentExecution({
      orgId: candidate.orgId,
      executionKey,
      withinMs: policy.throttleWindowMs,
    })

    if (alreadyExecuted) {
      const cooldownMs = this.config.getBlockedRecentCooldownMs()
      const blockedUntil = Date.now() + cooldownMs
      this.markCandidateRecentCooldown(candidate, blockedUntil)
      await recordBlockedWithContext(executionKey, mode, 'blocked_recent_execution', 'blocked', {
        ruleId: candidate.decisionId,
        ruleReason: 'idempotency',
        cooldownUntil: new Date(blockedUntil).toISOString(),
      })
      this.countOperationalStatus('blocked')
      return 'blocked_recent_execution'
    }

    const failureCount = await this.events.countRecentFailures({
      orgId: candidate.orgId,
      executionKey,
      withinMs: policy.throttleWindowMs,
    })

    if (failureCount >= policy.maxRetries) {
      await recordBlockedWithContext(executionKey, mode, 'retry_limit_reached', 'throttled', {
        ruleId: candidate.decisionId,
        ruleReason: 'retry limit reached',
      })
      this.countOperationalStatus('throttled')
      this.tenantOps.increment(candidate.orgId, 'automation_throttled')
      return 'throttled'
    }

    const featureAccess = await this.commercial.canUseFeature(candidate.orgId, 'advanced_automation')
    if (isCommercialBlocked(featureAccess)) {
      await recordBlockedWithContext(executionKey, mode, featureAccess.reasonCode, 'blocked', {
        ruleId: candidate.decisionId,
        ruleReason: featureAccess.reasonMessage,
      })
      this.countOperationalStatus('blocked')
      this.tenantOps.increment(candidate.orgId, 'automation_blocked')
      return 'blocked'
    }

    const commercialLimit = await this.commercial.enforceMeter(candidate.orgId, 'automation_executions')
    if (isCommercialBlocked(commercialLimit)) {
      await recordBlockedWithContext(executionKey, mode, commercialLimit.reasonCode, 'blocked', {
        ruleId: candidate.decisionId,
        ruleReason: commercialLimit.reasonMessage,
      })
      this.countOperationalStatus('blocked')
      this.tenantOps.increment(candidate.orgId, 'automation_blocked')
      return 'blocked'
    }

      const reservation =
      await this.reserveExecutionStart({
        candidate,
        executionKey,
        mode,
        executionContext,
        throttleWindowMs: policy.throttleWindowMs,
        policySnapshot: policy,
        customerId:
          contextValidation.customerId ?? undefined,
      })

      if (reservation.status === 'recent') {
      const cooldownMs =
        this.config.getBlockedRecentCooldownMs()
      const blockedUntil = Date.now() + cooldownMs

      this.markCandidateRecentCooldown(
        candidate,
        blockedUntil,
      )

      await recordBlockedWithContext(
        executionKey,
        mode,
        'blocked_recent_execution',
        'blocked',
        {
          ruleId: candidate.decisionId,
          ruleReason: 'idempotency',
          cooldownUntil:
            new Date(blockedUntil).toISOString(),
        },
      )

      this.countOperationalStatus('blocked')
      return 'blocked_recent_execution'
      }

      if (reservation.status === 'throttled') {
      const tenantLimit = reservation.tenantLimit

      await recordBlockedWithContext(
        executionKey,
        mode,
        tenantLimit.reason
          ?? 'tenant_execution_rate_limit_reached',
        'throttled',
        {
          ruleId: candidate.decisionId,
          ruleReason:
            'tenant fairness limit reached',
        },
      )

      this.countOperationalStatus('throttled')

      this.tenantOps.increment(
        candidate.orgId,
        'automation_throttled',
      )

      this.tenantOps.recordCriticalEvent(
        candidate.orgId,
        'execution_throttled',
        {
          actionId: candidate.actionId,
          used: tenantLimit.used,
          limit: tenantLimit.limit,
        },
      )

      return 'throttled'
      }

    try {
      const executionResult = await this.executeCandidate(candidate, executionContext)

      await this.events.recordEvent(candidate.orgId, {
        eventType: 'EXECUTION_EXECUTED',
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        actionId: candidate.actionId,
        decisionId: candidate.decisionId,
        executionKey,
        mode,
        status: 'executed',
        intent: executionContext.intent,
        priority: executionContext.priority,
        correlationId: executionContext.correlationId,
        reasonCode: 'runner_executed',
        result: executionResult,
        reasonDetail: 'ação executada com sucesso',
        timestamp: new Date().toISOString(),
        customerId: contextValidation.customerId ?? undefined,
        explanation: {
          ruleId: candidate.decisionId,
          eligibility: 'executed',
          trigger: candidate.metadata ?? {},
        },
      })

      this.logger.log(
        JSON.stringify({
          event: 'execution_runner_executed',
          orgId: candidate.orgId,
          actionId: candidate.actionId,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          decisionId: candidate.decisionId,
          result: 'success',
          executionKey,
        }),
      )
      this.countOperationalStatus('executed')
      this.tenantOps.increment(candidate.orgId, 'automation_execution')

      return 'executed'
    } catch (error) {
      const expectedReason = this.mapExpectedReasonFromError(error)
      if (expectedReason) {
        await recordBlockedWithContext(executionKey, mode, expectedReason, 'blocked', {
          ruleId: candidate.decisionId,
          ruleReason: 'expected_non_failure',
        })
        this.countOperationalStatus('blocked')
        return 'blocked'
      }

      await this.events.recordEvent(candidate.orgId, {
        eventType: 'EXECUTION_FAILED',
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        actionId: candidate.actionId,
        decisionId: candidate.decisionId,
        executionKey,
        mode,
        status: 'failed',
        intent: executionContext.intent,
        priority: executionContext.priority,
        correlationId: executionContext.correlationId,
        reasonCode: 'runner_execution_failed',
        result: { outcome: 'failed' },
        reasonDetail: 'falha inesperada durante execução',
        timestamp: new Date().toISOString(),
        customerId: contextValidation.customerId ?? undefined,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          trigger: candidate.metadata ?? {},
        },
        explanation: {
          ruleId: candidate.decisionId,
          eligibility: 'failed',
          trigger: candidate.metadata ?? {},
        },
      })

      this.logger.error(
        JSON.stringify({
          ...buildOperationalLogContext({
            event: 'execution_runner_failed',
            orgId: candidate.orgId,
            correlationId: executionContext.correlationId,
            actionId: candidate.actionId,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            error,
          }),
          decisionId: candidate.decisionId,
          executionKey,
        }),
      )
      this.countOperationalStatus('failed')
      this.tenantOps.recordCriticalEvent(candidate.orgId, 'execution_failed', {
        actionId: candidate.actionId,
        error: error instanceof Error ? error.message : String(error),
      })

      return 'failed'
    }
  }

  private async recordBlocked(
    candidate: ExecutionActionCandidate,
    executionKey: string,
    mode: 'manual' | 'semi_automatic' | 'automatic',
    reasonCode: string,
    status: 'blocked' | 'requires_confirmation' | 'throttled',
    explanation?: {
      ruleId?: string
      ruleReason?: string
      eligibility?: string
      policyKey?: string
      policyValue?: unknown
      governanceReason?: string
      cooldownUntil?: string
    },
    eventType: 'EXECUTION_BLOCKED' | 'AUTH_BLOCKED_EXECUTION' = 'EXECUTION_BLOCKED',
    correlationId?: string,
  ) {
    this.incrementBlockedReason(reasonCode)
    this.maybeLogManualModeBlockedSummary(candidate.orgId, reasonCode)
    await this.events.recordEvent(candidate.orgId, {
      eventType,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      actionId: candidate.actionId,
      decisionId: candidate.decisionId,
      executionKey,
      mode,
      status,
      intent: candidate.intent,
      priority: candidate.priority,
      correlationId: correlationId ?? randomUUID(),
      reasonCode,
      result: { outcome: status },
      reasonDetail: explanation?.ruleReason,
      cooldownUntil: explanation?.cooldownUntil,
      timestamp: new Date().toISOString(),
      explanation,
    })

    const suppressionWindowMs = this.config.getBlockedRecentCooldownMs()
    const suppression = this.shouldSuppressBlockedLog({
      candidate,
      reasonCode,
      status,
      suppressionWindowMs,
    })
    if (!suppression.suppressed) {
      this.logger.debug(
        JSON.stringify({
          event: 'execution_runner_blocked',
          orgId: candidate.orgId,
          actionId: candidate.actionId,
          decisionId: candidate.decisionId,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          reasonCode,
          status,
          executionKey,
          suppressedCountFromPreviousWindow: suppression.previousSuppressedCount,
          cooldownUntil: explanation?.cooldownUntil ?? null,
          reasonDetail: explanation?.ruleReason ?? null,
        }),
      )
    }
  }

  private async executeCandidate(
    candidate: ExecutionActionCandidate,
    executionContext: ExecutionContext,
  ): Promise<ExecutionResult> {
    if (candidate.actionId === 'action-generate-charge') {
      const amountCents = Number(candidate.metadata?.amountCents ?? 0)
      const customerId = String(candidate.metadata?.customerId ?? '')
      const dueDateRaw = candidate.metadata?.dueDate
      const dueDate = typeof dueDateRaw === 'string' && dueDateRaw ? new Date(dueDateRaw) : null

      await this.finance.ensureChargeForServiceOrderDone({
        orgId: candidate.orgId,
        serviceOrderId: candidate.entityId,
        customerId,
        amountCents,
        dueDate,
        actorUserId: null,
      })
      return {
        outcome: 'success',
        revenueRecoveredCents: amountCents > 0 ? amountCents : undefined,
      }
    }

    if (candidate.actionId === 'action-send-whatsapp-payment-link') {
      const charge = await this.prisma.charge.findFirst({
        where: {
          id: candidate.entityId,
          orgId: candidate.orgId,
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        select: {
          id: true,
          customer: {
            select: {
              phone: true,
            },
          },
        },
      })

      if (!charge || !this.hasUsablePhone(charge.customer.phone)) {
        throw new Error('charge_not_eligible_for_payment_link')
      }

      await this.finance.sendChargeWhatsApp(charge.id)
      return { outcome: 'success' }
    }

    if (candidate.actionId === 'action-notify-operational-alert') {
      await this.prisma.timelineEvent.create({
        data: {
          orgId: candidate.orgId,
          action: 'OPERATIONAL_ALERT',
          description: 'Alerta operacional automático da execution v5',
          metadata: {
            source: 'execution_runner_v5',
            decisionId: candidate.decisionId,
            correlationId: executionContext.correlationId,
            ...candidate.metadata,
          },
        },
      })
      return { outcome: 'success', riskReducedScore: 1 }
    }

    if (candidate.actionId === 'action-send-overdue-charge-reminder') {
      const charge = await this.prisma.charge.findFirst({
        where: {
          id: candidate.entityId,
          orgId: candidate.orgId,
          status: 'OVERDUE',
        },
        select: {
          id: true,
          customer: {
            select: {
              phone: true,
            },
          },
        },
      })

      if (!charge || !this.hasUsablePhone(charge.customer.phone)) {
        throw new Error('charge_not_eligible_for_overdue_reminder')
      }

      await this.finance.sendPaymentReminderWhatsApp(charge.id)
      return {
        outcome: 'success',
        revenueRecoveredCents: Number(candidate.metadata?.amountCents ?? 0) || undefined,
      }
    }

    if (candidate.actionId === 'action-notify-finance-team') {
      await this.prisma.timelineEvent.create({
        data: {
          orgId: candidate.orgId,
          action: 'FINANCE_TEAM_NOTIFICATION',
          description: 'Notificação para equipe financeira criada automaticamente',
          metadata: {
            source: 'execution_runner_v5',
            decisionId: candidate.decisionId,
            correlationId: executionContext.correlationId,
            ...candidate.metadata,
          },
        },
      })
      return { outcome: 'success' }
    }

    if (candidate.actionId === 'action-mark-operational-attention') {
      await this.prisma.timelineEvent.create({
        data: {
          orgId: candidate.orgId,
          action: 'OPERATIONAL_ATTENTION_MARKED',
          description: 'Sinal operacional de atenção marcado automaticamente',
          metadata: {
            source: 'execution_runner_v5',
            decisionId: candidate.decisionId,
            correlationId: executionContext.correlationId,
            ...candidate.metadata,
          },
        },
      })
      return { outcome: 'success', riskReducedScore: 1 }
    }
    if (candidate.actionId === 'action-create-charge-followup') {
      const charge = await this.prisma.charge.findFirst({
        where: {
          id: candidate.entityId,
          orgId: candidate.orgId,
          status: 'OVERDUE',
        },
        select: {
          id: true,
          dueDate: true,
        },
      })
      if (!charge?.dueDate) throw new Error('charge_not_eligible_for_followup')

      const overdueDays = Math.floor((Date.now() - charge.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      if (overdueDays < 7) throw new Error('charge_not_overdue_enough_for_followup')

      const existing = await this.prisma.timelineEvent.findFirst({
        where: {
          orgId: candidate.orgId,
          action: 'CHARGE_FOLLOWUP_CREATED',
          chargeId: charge.id,
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
        },
        select: { id: true },
      })
      if (existing?.id) throw new Error('charge_followup_already_exists')

      await this.prisma.timelineEvent.create({
        data: {
          orgId: candidate.orgId,
          action: 'CHARGE_FOLLOWUP_CREATED',
          chargeId: charge.id,
          description: 'Follow-up de cobrança criado automaticamente',
          metadata: {
            source: 'execution_runner_v5',
            decisionId: candidate.decisionId,
            correlationId: executionContext.correlationId,
            ...candidate.metadata,
          },
        },
      })
      return {
        outcome: 'success',
        revenueRecoveredCents: Number(candidate.metadata?.amountCents ?? 0) || undefined,
      }
    }

    if (candidate.actionId === 'action-escalate-risk-review') {
      const existing = await this.prisma.timelineEvent.findFirst({
        where: {
          orgId: candidate.orgId,
          action: 'RISK_REVIEW_ESCALATED',
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
        },
        select: { id: true },
      })
      if (existing?.id) throw new Error('risk_review_already_escalated_recently')

      await this.prisma.timelineEvent.create({
        data: {
          orgId: candidate.orgId,
          action: 'RISK_REVIEW_ESCALATED',
          description: 'Escalada automática para revisão de risco operacional/financeiro',
          metadata: {
            source: 'execution_runner_v5',
            decisionId: candidate.decisionId,
            correlationId: executionContext.correlationId,
            ...candidate.metadata,
          },
        },
      })
      return { outcome: 'success', riskReducedScore: 2 }
    }

    throw new Error(`unsupported_action:${candidate.actionId}`)
  }
}

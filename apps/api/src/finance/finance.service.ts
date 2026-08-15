import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { $Enums, Prisma, WhatsAppEntityType, WhatsAppMessageType } from '@prisma/client'
import { IdempotencyService } from '../common/idempotency/idempotency.service'
import { ensureChargeTransition } from '../common/domain/state-transitions'
import {
  WhatsAppService,
  buildDeterministicMessageKey,
} from '../whatsapp/whatsapp.service'
import { TimelineService } from '../timeline/timeline.service'
import { AuditService } from '../audit/audit.service'
import { ChargesQueryDto } from './dto/charges-query.dto'
import { AnalyticsService, UsageMetricEvent } from '../analytics/analytics.service'
import { RequestContextService } from '../common/context/request-context.service'
import { MetricsService } from '../common/metrics/metrics.service'
import {
  OperationalExecutionStatus,
  buildOperationalResult,
} from '../common/operations/operational-result'


type CollectionPriority = 'HIGH' | 'MEDIUM' | 'LOW'
type CollectionAction =
  | 'SEND_PAYMENT_LINK'
  | 'SEND_REMINDER'
  | 'CALL_CUSTOMER'
  | 'REVIEW_CHARGE'
  | 'WAIT_FOR_DUE_DATE'
type CollectionRiskLevel = 'NORMAL' | 'WARNING' | 'RESTRICTED' | 'SUSPENDED'

function daysBetweenUtc(from: Date, to: Date) {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(0, Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / dayMs))
}

function asRiskLevel(value: unknown): CollectionRiskLevel {
  return value === 'WARNING' || value === 'RESTRICTED' || value === 'SUSPENDED' ? value : 'NORMAL'
}

function metadataValue(metadata: unknown, key: string): unknown {
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[key] : undefined
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly timeline: TimelineService,
    private readonly analytics: AnalyticsService,
    private readonly requestContext: RequestContextService,
    private readonly idempotency: IdempotencyService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  private logCritical(params: {
    level: 'log' | 'warn' | 'error'
    action: string
    entityId?: string | null
    message: string
    extra?: Record<string, unknown>
  }) {
    const payload = {
      requestId: this.requestContext.requestId,
      action: params.action,
      entityId: params.entityId ?? null,
      ...params.extra,
      message: params.message,
    }

    const line = JSON.stringify(payload)
    if (params.level === 'error') {
      this.logger.error(line)
      return
    }
    if (params.level === 'warn') {
      this.logger.warn(line)
      return
    }
    this.logger.log(line)
  }

  private async safeTimelineLog(input: Parameters<TimelineService['log']>[0]) {
    try {
      await this.timeline.log(input)
    } catch (error) {
      this.logCritical({
        level: 'error',
        action: input.action,
        entityId:
          input.chargeId ??
          input.serviceOrderId ??
          input.customerId ??
          null,
        message: 'Falha ao registrar timeline',
        extra: {
          orgId: input.orgId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  private buildOperationStatus(params: {
    status: OperationalExecutionStatus
    reason?: string | null
    idempotencyKey?: string | null
    executionKey?: string | null
  }) {
    this.metrics.increment(`financeOperationStatus:${params.status}`)
    return buildOperationalResult({
      status: params.status,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      executionKey: params.executionKey,
      requestId: this.requestContext.requestId,
      correlationId: this.requestContext.correlationId,
    })
  }

  private buildChargeCreateIdempotencyKey(input: {
    orgId: string
    customerId: string
    serviceOrderId?: string | null
    amountCents: number
    dueDate: Date
    notes?: string | null
  }): string {
    return [
      'charge-create',
      input.orgId,
      input.customerId,
      input.serviceOrderId ?? '-',
      String(input.amountCents),
      input.dueDate.toISOString(),
      (input.notes ?? '').trim().toLowerCase() || '-',
    ].join(':')
  }

  private async assertServiceOrderEligibleForCharge(params: {
    orgId: string
    serviceOrderId: string
    customerId?: string
  }) {
    const serviceOrder = await this.prisma.serviceOrder.findFirst({
      where: { id: params.serviceOrderId, orgId: params.orgId },
      select: { id: true, customerId: true, status: true },
    })

    if (!serviceOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada para a organização')
    }

    if (params.customerId && serviceOrder.customerId !== params.customerId) {
      throw new BadRequestException('Ordem de serviço não pertence ao cliente informado')
    }

    if (serviceOrder.status === 'CANCELED') {
      throw new BadRequestException('Não é permitido gerar cobrança para O.S. cancelada')
    }

    if (serviceOrder.status !== 'DONE') {
      throw new BadRequestException(
        `Cobrança só pode ser gerada para O.S. finalizada (status atual: ${serviceOrder.status})`,
      )
    }

    return serviceOrder
  }

  private assertChargeStatusTransition(
    from: $Enums.ChargeStatus,
    to: $Enums.ChargeStatus,
  ) {
    ensureChargeTransition(from, to)
  }

  private parseExpectedUpdatedAt(value?: string | null): Date | null {
    if (!value) {
      throw new BadRequestException({
        code: 'EXPECTED_UPDATED_AT_REQUIRED',
        message: 'expectedUpdatedAt é obrigatório para atualizar cobrança.',
      })
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('expectedUpdatedAt inválido (use ISO)')
    }
    return parsed
  }

  // =========================
  // OVERVIEW
  // =========================
  async overview(orgId: string) {
    const [openAgg, overdueAgg, paidAgg] = await Promise.all([
      this.prisma.charge.aggregate({
        where: { orgId, status: 'PENDING' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.aggregate({
        where: { orgId, status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.payment.aggregate({
        where: { orgId },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ])

    return {
      openCount: openAgg._count._all ?? 0,
      openAmountCents: openAgg._sum.amountCents ?? 0,
      overdueCount: overdueAgg._count._all ?? 0,
      overdueAmountCents: overdueAgg._sum.amountCents ?? 0,
      paidCount: paidAgg._count._all ?? 0,
      paidAmountCents: paidAgg._sum.amountCents ?? 0,
    }
  }


  // =========================
  // OPERATIONAL COLLECTION QUEUE
  // =========================
  async getOperationalQueue(orgId: string, input?: { limit?: number }) {
    const limit = Math.min(Math.max(Number(input?.limit) || 50, 1), 50)
    const now = new Date()

    const charges = await this.prisma.charge.findMany({
      where: { orgId, status: { in: ['PENDING', 'OVERDUE'] } },
      include: {
        customer: true,
        serviceOrder: true,
        payments: { orderBy: { paidAt: 'desc' }, take: 5 },
      },
      orderBy: [{ dueDate: 'asc' }, { amountCents: 'desc' }],
      take: 200,
    })

    const customerIds = [...new Set(charges.map((item) => item.customerId).filter(Boolean))]
    const chargeIds = charges.map((item) => item.id)

    const [timelineEvents, whatsappMessages, riskEvents] = await Promise.all([
      this.prisma.timelineEvent.findMany({
        where: { orgId, OR: [{ customerId: { in: customerIds } }, { chargeId: { in: chargeIds } }] },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.whatsAppMessage.findMany({
        where: { orgId, customerId: { in: customerIds } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.timelineEvent.findMany({
        where: { orgId, customerId: { in: customerIds }, action: { in: ['RISK_UPDATED', 'CUSTOMER_OPERATIONAL_RISK_UPDATED'] } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const lastTimelineByCustomer = new Map<string, any>()
    const lastReminderByCharge = new Map<string, any>()
    const lastRecommendationByCharge = new Map<string, any>()
    for (const event of timelineEvents as any[]) {
      const isSystemCollectionEvent = String(event.action ?? '').startsWith('COLLECTION_') || ['RISK_UPDATED', 'CUSTOMER_OPERATIONAL_RISK_UPDATED'].includes(String(event.action ?? ''))
      if (event.customerId && !isSystemCollectionEvent && !lastTimelineByCustomer.has(event.customerId)) lastTimelineByCustomer.set(event.customerId, event)
      if (event.chargeId && ['CHARGE_REMINDER_SENT', 'COLLECTION_REMINDER_SENT'].includes(event.action) && !lastReminderByCharge.has(event.chargeId)) lastReminderByCharge.set(event.chargeId, event)
      if (event.chargeId && event.action === 'COLLECTION_ACTION_RECOMMENDED' && !lastRecommendationByCharge.has(event.chargeId)) lastRecommendationByCharge.set(event.chargeId, event)
    }

    const lastWhatsappByCustomer = new Map<string, any>()
    for (const message of whatsappMessages as any[]) {
      if (message.customerId && !lastWhatsappByCustomer.has(message.customerId)) lastWhatsappByCustomer.set(message.customerId, message)
    }

    const riskByCustomer = new Map<string, CollectionRiskLevel>()
    for (const event of riskEvents as any[]) {
      if (!event.customerId || riskByCustomer.has(event.customerId)) continue
      riskByCustomer.set(event.customerId, asRiskLevel(metadataValue(event.metadata, 'nextState') ?? metadataValue(event.metadata, 'riskLevel')))
    }

    const riskWeight: Record<CollectionRiskLevel, number> = { NORMAL: 0, WARNING: 1, RESTRICTED: 2, SUSPENDED: 3 }
    const priorityWeight: Record<CollectionPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }

    const items = charges.map((charge: any) => {
      const dueDate = new Date(charge.dueDate)
      const isOverdue = dueDate.getTime() < now.getTime() || charge.status === 'OVERDUE'
      const daysOverdue = isOverdue ? daysBetweenUtc(dueDate, now) : 0
      const lastPaymentDate = charge.payments?.[0]?.paidAt ?? charge.paidAt ?? null
      const lastTimelineDate = lastTimelineByCustomer.get(charge.customerId)?.createdAt ?? null
      const lastWhatsappDate = lastWhatsappByCustomer.get(charge.customerId)?.createdAt ?? lastWhatsappByCustomer.get(charge.customerId)?.sentAt ?? null
      const lastContactDate = [lastTimelineDate, lastWhatsappDate].filter(Boolean).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null
      const lastChargeReminderDate = lastReminderByCharge.get(charge.id)?.createdAt ?? null
      const riskLevel = riskByCustomer.get(charge.customerId) ?? 'NORMAL'
      const noRecentContact = !lastContactDate || daysBetweenUtc(new Date(lastContactDate), now) >= 3

      let recommendedAction: CollectionAction = 'WAIT_FOR_DUE_DATE'
      if (charge.amountCents <= 0 || !charge.customerId) recommendedAction = 'REVIEW_CHARGE'
      else if (isOverdue && (daysOverdue >= 7 || riskWeight[riskLevel] >= 2)) recommendedAction = 'CALL_CUSTOMER'
      else if (isOverdue && !lastChargeReminderDate) recommendedAction = 'SEND_PAYMENT_LINK'
      else if (isOverdue && noRecentContact) recommendedAction = 'SEND_REMINDER'
      else if (daysOverdue === 0 && dueDate.getTime() <= now.getTime() + 2 * 24 * 60 * 60 * 1000) recommendedAction = 'SEND_REMINDER'

      const priority: CollectionPriority = isOverdue && (charge.amountCents >= 100000 || daysOverdue >= 7 || riskWeight[riskLevel] >= 2) ? 'HIGH' : isOverdue || riskLevel === 'WARNING' ? 'MEDIUM' : 'LOW'
      const priorityReason = isOverdue
        ? `${daysOverdue} dia(s) de atraso, ${charge.amountCents} centavos em aberto, risco ${riskLevel}`
        : `Cobrança a vencer em ${Math.max(0, daysBetweenUtc(now, dueDate))} dia(s), risco ${riskLevel}`
      const recommendedActionTarget = recommendedAction === 'CALL_CUSTOMER' || recommendedAction === 'SEND_REMINDER' || recommendedAction === 'SEND_PAYMENT_LINK' ? 'CUSTOMER' : 'CHARGE'
      const summary = { priority, priorityReason, daysOverdue, lastPaymentDate, lastContactDate, lastChargeReminderDate, riskLevel, recommendedAction, recommendedActionTarget }
      return { ...charge, financialOperationalSummary: summary, nextBestCollectionAction: recommendedAction }
    }).sort((a: any, b: any) => {
      const sa = a.financialOperationalSummary
      const sb = b.financialOperationalSummary
      return (sb.daysOverdue > 0 ? 1 : 0) - (sa.daysOverdue > 0 ? 1 : 0)
        || b.amountCents - a.amountCents
        || riskWeight[sb.riskLevel as CollectionRiskLevel] - riskWeight[sa.riskLevel as CollectionRiskLevel]
        || (sa.lastContactDate ? 1 : 0) - (sb.lastContactDate ? 1 : 0)
        || priorityWeight[sb.priority as CollectionPriority] - priorityWeight[sa.priority as CollectionPriority]
    }).slice(0, limit)

    await Promise.all(items.map(async (item: any) => {
      const previous = lastRecommendationByCharge.get(item.id)
      const previousPriority = metadataValue(previous?.metadata, 'priority')
      const previousAction = metadataValue(previous?.metadata, 'recommendedAction')
      const summary = item.financialOperationalSummary
      if (previousPriority === summary.priority && previousAction === summary.recommendedAction) return
      await this.safeTimelineLog({
        orgId,
        action: 'COLLECTION_ACTION_RECOMMENDED',
        description: `Ação de cobrança recomendada: ${summary.recommendedAction}`,
        customerId: item.customerId,
        chargeId: item.id,
        serviceOrderId: item.serviceOrderId ?? undefined,
        metadata: { priority: summary.priority, recommendedAction: summary.recommendedAction, riskLevel: summary.riskLevel, daysOverdue: summary.daysOverdue },
      })
      if (previousPriority && previousPriority !== summary.priority) {
        await this.safeTimelineLog({
          orgId,
          action: 'COLLECTION_PRIORITY_CHANGED',
          description: `Prioridade de cobrança alterada para ${summary.priority}`,
          customerId: item.customerId,
          chargeId: item.id,
          serviceOrderId: item.serviceOrderId ?? undefined,
          metadata: { previousPriority, priority: summary.priority, recommendedAction: summary.recommendedAction },
        })
      }
    }))

    return { items, meta: { limit, total: items.length } }
  }

  // =========================
  // LIST
  // =========================
  async listCharges(orgId: string, query?: ChargesQueryDto) {
    const page = Number(query?.page) || 1
    const limit = Number(query?.limit) || 20
    const skip = (page - 1) * limit

    const where: Prisma.ChargeWhereInput = { orgId }

    if (query?.status) {
      where.status = query.status
    }

    if (query?.serviceOrderId) {
      where.serviceOrderId = query.serviceOrderId
    }

    if (query?.q) {
      const q = String(query.q)
      where.OR = [
        { notes: { contains: q, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ]
    }

    const [items, total] = await Promise.all([
      this.prisma.charge.findMany({
        where,
        include: {
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.charge.count({ where }),
    ])

    return {
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  async getCharge(orgId: string, id: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id, orgId },
      include: { customer: true, payments: true },
    })

    if (!charge) throw new NotFoundException('Charge não encontrada')
    return charge
  }

  async getPayment(orgId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, orgId },
      include: {
        charge: {
          include: { customer: true },
        },
      },
    })

    if (!payment) throw new NotFoundException('Pagamento não encontrado')
    return payment
  }

  // =========================
  // CREATE
  // =========================
  async createCharge(input: {
    orgId: string
    customerId: string
    amountCents: number
    dueDate: Date
    actorUserId?: string | null
    notes?: string | null
    serviceOrderId?: string | null
    idempotencyKey?: string | null
  }) {
    if (input.amountCents <= 0) {
      throw new BadRequestException('amountCents deve ser maior que zero')
    }
    this.logCritical({
      level: 'log',
      action: 'CREATE_CHARGE_START',
      entityId: input.serviceOrderId ?? input.customerId,
      message: 'Iniciando createCharge',
      extra: { orgId: input.orgId, customerId: input.customerId },
    })

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, orgId: input.orgId },
      select: { id: true },
    })
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado para a organização')
    }

    if (input.serviceOrderId) {
      const serviceOrder = await this.assertServiceOrderEligibleForCharge({
        orgId: input.orgId,
        serviceOrderId: input.serviceOrderId,
        customerId: input.customerId,
      })
      if (serviceOrder.customerId !== input.customerId) {
        throw new BadRequestException('serviceOrderId deve pertencer ao mesmo customerId')
      }
    }

    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      this.buildChargeCreateIdempotencyKey(input)
    const idemScope = 'finance.create_charge'
    const idemPayload = {
      customerId: input.customerId,
      amountCents: input.amountCents,
      dueDate: input.dueDate.toISOString(),
      notes: input.notes ?? null,
      serviceOrderId: input.serviceOrderId ?? null,
    }
    const idem = await this.idempotency.begin({
      orgId: input.orgId,
      scope: idemScope,
      idempotencyKey,
      payload: idemPayload,
    })
    if (idem.mode === 'replay') {
      return {
        ...(idem.response as any),
        operation: this.buildOperationStatus({
          status: 'duplicate',
          reason: 'idempotency_replay',
          idempotencyKey,
        }),
      }
    }
    const idemRecordId = idem.recordId
    try {
      let charge: any = null
      try {
        charge = await this.prisma.charge.create({
          data: {
            orgId: input.orgId,
            customerId: input.customerId,
            idempotencyKey,
            amountCents: input.amountCents,
            dueDate: input.dueDate,
            status: 'PENDING',
            notes: input.notes ?? null,
            serviceOrderId: input.serviceOrderId ?? null,
          },
          include: { customer: true },
        })
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err
        const existing = await this.prisma.charge.findFirst({
          where: { orgId: input.orgId, idempotencyKey },
          include: { customer: true },
        })
        if (!existing) throw err
        const replayPayload = {
          ...existing,
          idempotent: true,
          operation: this.buildOperationStatus({
            status: 'duplicate',
            reason: 'duplicate_charge_prevented',
            idempotencyKey,
          }),
        }
        await this.idempotency.complete(idemRecordId, replayPayload)
        return replayPayload
      }

      let whatsappFallbackUsed = false
      if (charge.customer?.phone) {
        await this.sendChargeWhatsApp(charge.id).catch((err) => {
          whatsappFallbackUsed = true
          this.metrics.increment('integrationTemporaryFailures')
          this.logCritical({
            level: 'warn',
            action: 'WHATSAPP_SEND_CHARGE',
            entityId: charge.id,
            message: 'Falha de integração no envio de cobrança. Fluxo seguirá em modo degradado',
            extra: { error: err?.message ?? String(err) },
          })
        })
      }

      await this.safeTimelineLog({
        orgId: input.orgId,
        action: 'CHARGE_CREATED',
        description: `Cobrança criada para ${charge.customer?.name ?? 'cliente'}`,
        customerId: charge.customerId,
        serviceOrderId: charge.serviceOrderId,
        chargeId: charge.id,
        metadata: {
          actorUserId: input.actorUserId ?? null,
          customerId: charge.customerId,
          serviceOrderId: charge.serviceOrderId,
          chargeId: charge.id,
          amountCents: charge.amountCents,
          dueDate: charge.dueDate.toISOString(),
        },
      })

      this.logCritical({
        level: whatsappFallbackUsed ? 'warn' : 'log',
        action: 'CREATE_CHARGE_RESULT',
        entityId: charge.id,
        message: whatsappFallbackUsed
          ? 'Cobrança criada com fallback de WhatsApp (mensagem em fila/pendente)'
          : 'Cobrança criada com sucesso',
        extra: { chargeId: charge.id, orgId: input.orgId },
      })

      void this.analytics.track({
        orgId: input.orgId,
        userId: input.actorUserId ?? undefined,
        event:
          (UsageMetricEvent as any)?.CHARGE_CREATED ??
          (UsageMetricEvent as any)?.LOGIN,
        metadata: {
          source: 'finance_create_charge',
          chargeId: charge.id,
          customerId: charge.customerId,
          serviceOrderId: charge.serviceOrderId,
        },
      })
      const result = {
        ...charge,
        idempotent: false,
        operation: this.buildOperationStatus({
          status: 'executed',
          reason: whatsappFallbackUsed ? 'charge_created_with_retry_scheduled' : 'charge_created',
          idempotencyKey,
        }),
        degraded: whatsappFallbackUsed
          ? {
              channel: 'whatsapp',
              reason: 'whatsapp_send_failed',
              fallback: 'message_queued',
              status: 'retry_scheduled' as OperationalExecutionStatus,
            }
          : null,
      }
      await this.idempotency.complete(idemRecordId, result)
      return result
    } catch (error: any) {
      await this.idempotency.fail(idemRecordId, error?.code)
      throw error
    }
  }

  async updateCharge(input: {
    orgId: string
    id: string
    amountCents?: number
    dueDate?: Date
    status?: $Enums.ChargeStatus
    notes?: string | null
    actorUserId?: string | null
    expectedUpdatedAt?: string | null
  }) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: input.id, orgId: input.orgId },
      select: { id: true, status: true, paidAt: true, updatedAt: true },
    })

    if (!charge) throw new NotFoundException('Charge não encontrada')

    if (input.status) {
      this.assertChargeStatusTransition(charge.status, input.status)
    }
    if (charge.status === 'PAID' && input.status === 'CANCELED') {
      throw new BadRequestException('Cobrança paga não pode ser cancelada')
    }

    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    )

    const mutation = await this.prisma.charge.updateMany({
      where: {
        id: charge.id,
        orgId: input.orgId,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: input.status,
        paidAt:
          input.status === 'PAID'
            ? (charge.paidAt ?? new Date())
            : input.status === 'PENDING' || input.status === 'OVERDUE'
              ? null
              : undefined,
        notes: input.notes,
      },
    })
    if (mutation.count !== 1) {
      const latest = await this.prisma.charge.findFirst({
        where: { id: charge.id, orgId: input.orgId },
        select: { id: true, status: true, updatedAt: true },
      })
      throw new ConflictException({
        code: 'CHARGE_CONCURRENT_MODIFICATION',
        message:
          'Cobrança foi alterada por outra operação. Recarregue antes de salvar.',
        details: latest ?? { chargeId: input.id },
      })
    }

    const updated = await this.prisma.charge.findFirst({
      where: { id: charge.id, orgId: input.orgId },
    })
    await this.safeTimelineLog({
      orgId: input.orgId,
      action: input.status === 'CANCELED' ? 'CHARGE_CANCELED' : 'CHARGE_UPDATED',
      description:
        input.status === 'CANCELED'
          ? `Cobrança ${charge.id} cancelada`
          : `Cobrança ${charge.id} atualizada`,
      chargeId: charge.id,
      metadata: {
        actorUserId: input.actorUserId ?? null,
        chargeId: charge.id,
        previousStatus: charge.status,
        nextStatus: input.status ?? charge.status,
        amountCents: input.amountCents,
        dueDate: input.dueDate?.toISOString() ?? null,
      },
    })
    return updated
  }

  private normalizeCancellationReason(reason: string) {
    const normalized = String(reason ?? '').trim()
    if (normalized.length < 3) {
      throw new BadRequestException('Motivo do cancelamento é obrigatório')
    }
    if (normalized.length > 1000) {
      throw new BadRequestException(
        'Motivo do cancelamento deve ter no máximo 1000 caracteres',
      )
    }
    return normalized
  }

  async cancelCharge(input: {
    orgId: string
    id: string
    actorUserId?: string | null
    cancellationReason: string
    expectedUpdatedAt?: string | null
  }) {
    const reason = this.normalizeCancellationReason(input.cancellationReason)
    const charge = await this.prisma.charge.findFirst({
      where: { id: input.id, orgId: input.orgId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        customerId: true,
        serviceOrderId: true,
        amountCents: true,
        canceledAt: true,
        canceledByUserId: true,
        cancellationReason: true,
      },
    })

    if (!charge) throw new NotFoundException('Charge não encontrada')
    if (charge.status === 'PAID') {
      throw new BadRequestException('Cobrança paga não pode ser cancelada')
    }
    if (charge.status === 'CANCELED') {
      return { ...charge, idempotent: true }
    }

    this.assertChargeStatusTransition(charge.status, 'CANCELED')
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      input.expectedUpdatedAt,
    )
    const canceledAt = new Date()

    const mutation = await this.prisma.charge.updateMany({
      where: {
        id: charge.id,
        orgId: input.orgId,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        status: 'CANCELED',
        canceledAt,
        canceledByUserId: input.actorUserId ?? null,
        cancellationReason: reason,
      },
    })

    if (mutation.count !== 1) {
      const latest = await this.prisma.charge.findFirst({
        where: { id: charge.id, orgId: input.orgId },
        select: { id: true, status: true, updatedAt: true },
      })
      throw new ConflictException({
        code: 'CHARGE_CONCURRENT_MODIFICATION',
        message:
          'Cobrança foi alterada por outra operação. Recarregue antes de cancelar.',
        details: latest ?? { chargeId: input.id },
      })
    }

    const metadata = {
      chargeId: charge.id,
      customerId: charge.customerId,
      serviceOrderId: charge.serviceOrderId ?? null,
      amountCents: charge.amountCents,
      previousStatus: charge.status,
      nextStatus: 'CANCELED',
      cancellationReason: reason,
      canceledByUserId: input.actorUserId ?? null,
      canceledAt: canceledAt.toISOString(),
      actorUserId: input.actorUserId ?? null,
    }

    await this.safeTimelineLog({
      orgId: input.orgId,
      action: 'CHARGE_CANCELED',
      description: `Cobrança ${charge.id} cancelada`,
      customerId: charge.customerId,
      serviceOrderId: charge.serviceOrderId ?? null,
      chargeId: charge.id,
      metadata,
    })

    try {
      await this.audit.log({
        orgId: input.orgId,
        action: 'CHARGE_CANCELED',
        actorUserId: input.actorUserId ?? null,
        entityType: 'Charge',
        entityId: charge.id,
        context: 'Cobrança cancelada sem exclusão física',
        metadata,
      })
    } catch (error) {
      this.logCritical({
        level: 'error',
        action: 'CHARGE_CANCELED_AUDIT_FAILED',
        entityId: charge.id,
        message: 'Falha ao registrar auditoria de cancelamento de cobrança',
        extra: {
          orgId: input.orgId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }

    return this.prisma.charge.findFirst({
      where: { id: charge.id, orgId: input.orgId },
    })
  }

  private parseManualPaymentDate(value?: string | null): Date {
    if (!value) return new Date()

    const paidAt = new Date(value)
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('paidAt inválido')
    }
    if (paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('paidAt não pode estar no futuro')
    }

    return paidAt
  }

  // =========================
  // PAYMENT
  // =========================
  async payCharge(input: {
    orgId: string
    chargeId: string
    amountCents: number
    method: $Enums.PaymentMethod
    actorUserId?: string | null
    idempotencyKey?: string | null
    paidAt?: string | null
    notes?: string | null
  }) {
    const paidAt = this.parseManualPaymentDate(input.paidAt)
    const notes = input.notes?.trim() || null
    if (notes && notes.length > 2000) {
      throw new BadRequestException('notes deve ter no máximo 2000 caracteres')
    }

    this.logCritical({
      level: 'log',
      action: 'PAY_CHARGE_START',
      entityId: input.chargeId,
      message: 'Iniciando payCharge',
      extra: { orgId: input.orgId, amountCents: input.amountCents, method: input.method },
    })

    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      ['charge-pay', input.orgId, input.chargeId, input.method, String(input.amountCents)].join(':')
    const idem = await this.idempotency.begin({
      orgId: input.orgId,
      scope: 'finance.pay_charge',
      idempotencyKey,
      payload: {
        chargeId: input.chargeId,
        amountCents: input.amountCents,
        method: input.method,
        paidAt: input.paidAt ?? null,
        notes,
      },
    })
    if (idem.mode === 'replay') {
      return {
        ...(idem.response as any),
        operation: this.buildOperationStatus({
          status: 'duplicate',
          reason: 'idempotency_replay',
          idempotencyKey,
        }),
      }
    }

    const idemRecordId = idem.recordId

    try {
      const { charge, payment, idempotent } = await this.prisma.$transaction(
        async (tx) => {
      const charge = await tx.charge.findFirst({
        where: { id: input.chargeId, orgId: input.orgId },
      })

      if (!charge) throw new NotFoundException('Charge não encontrada')
      if (charge.status === 'CANCELED') {
        throw new BadRequestException({
          code: 'CHARGE_STATE_INVALID_FOR_PAYMENT',
          message: 'Cobrança cancelada não pode receber novo pagamento.',
          details: { chargeId: input.chargeId, status: charge.status },
        })
      }
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
        throw new BadRequestException({
          code: 'PAYMENT_AMOUNT_INVALID',
          message: 'O valor do pagamento deve ser um inteiro positivo em centavos.',
        })
      }
      // amountCents is the canonical integer-cent representation in this schema.
      // Integer equality preserves every cent and performs no floating-point conversion.
      if (input.amountCents !== charge.amountCents) {
        throw new BadRequestException({
          code: 'PAYMENT_AMOUNT_MISMATCH',
          message: 'O valor do pagamento deve corresponder exatamente ao valor da cobrança.',
          details: { chargeId: charge.id },
        })
      }

      const mutation = await tx.charge.updateMany({
        where: {
          id: charge.id,
          orgId: input.orgId,
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        data: { status: 'PAID', paidAt },
      })

      if (mutation.count !== 1) {
        const alreadyPaid = await tx.charge.findFirst({
          where: { id: charge.id, orgId: input.orgId, status: 'PAID' },
        })

        if (!alreadyPaid) {
          throw new BadRequestException(
            'Charge já foi processada por outra operação',
          )
        }

        const latestPayment = await tx.payment.findFirst({
          where: { orgId: input.orgId, chargeId: charge.id },
          orderBy: { createdAt: 'desc' },
        })

        if (!latestPayment) {
          throw new BadRequestException({
            code: 'CHARGE_ALREADY_PAID',
            message: 'Cobrança já está paga.',
            details: { chargeId: charge.id },
          })
        }

        return { charge: alreadyPaid, payment: latestPayment, idempotent: true }
      }

      const payment = await tx.payment.create({
        data: {
          orgId: input.orgId,
          chargeId: charge.id,
          amountCents: input.amountCents,
          method: input.method,
          paidAt,
          notes,
        },
      })

      await this.timeline.logInTransaction(
        {
          orgId: input.orgId,
          action: 'PAYMENT_RECEIVED',
          description: `Pagamento recebido para cobrança ${charge.id}`,
          customerId: charge.customerId,
          serviceOrderId: charge.serviceOrderId,
          chargeId: charge.id,
          metadata: {
            actorUserId: input.actorUserId ?? null,
            customerId: charge.customerId,
            serviceOrderId: charge.serviceOrderId,
            chargeId: charge.id,
            paymentId: payment.id,
            amountCents: input.amountCents,
            method: input.method,
            paidAt: paidAt.toISOString(),
            notes,
          },
        },
        tx,
      )

          return { charge, payment, idempotent: false }
      },
      )

      if (payment == null) {
        throw new BadRequestException('Pagamento não registrado')
      }

      if (idempotent) {
        const replayed = {
          ok: true,
          paymentId: payment.id,
          idempotent: true,
          operation: this.buildOperationStatus({
            status: 'duplicate',
            reason: 'payment_already_processed',
            idempotencyKey,
          }),
        }
        await this.idempotency.complete(idemRecordId, replayed)
        return replayed
      }

    let whatsappFallbackUsed = false
    await this.sendPaymentConfirmationWhatsApp(charge.id).catch((err) => {
      whatsappFallbackUsed = true
      this.metrics.increment('integrationTemporaryFailures')
      this.logCritical({
        level: 'warn',
        action: 'WHATSAPP_SEND_PAYMENT_CONFIRMATION',
        entityId: charge.id,
        message: 'Falha de integração no envio do recibo. Fluxo principal seguirá',
        extra: { error: err?.message ?? String(err) },
      })
    })

    this.logCritical({
      level: whatsappFallbackUsed ? 'warn' : 'log',
      action: 'PAY_CHARGE_RESULT',
      entityId: charge.id,
      message: whatsappFallbackUsed
        ? 'Pagamento registrado com fallback de notificação WhatsApp'
        : 'Pagamento registrado com sucesso',
      extra: { paymentId: payment.id, orgId: input.orgId },
    })

    void this.analytics.track({
      orgId: input.orgId,
      userId: input.actorUserId ?? undefined,
      event:
        (UsageMetricEvent as any)?.CHARGE_PAID ??
        (UsageMetricEvent as any)?.LOGIN,
      metadata: {
        source: 'finance_pay_charge',
        chargeId: charge.id,
        paymentId: payment.id,
        customerId: charge.customerId,
      },
    })

      const result = {
        ok: true,
        paymentId: payment.id,
        idempotent: false,
        operation: this.buildOperationStatus({
          status: 'executed',
          reason: whatsappFallbackUsed
            ? 'payment_recorded_with_retry_scheduled'
            : 'payment_recorded',
          idempotencyKey,
        }),
        degraded: whatsappFallbackUsed
          ? {
              channel: 'whatsapp',
              reason: 'whatsapp_send_failed',
              fallback: 'message_queued',
              status: 'retry_scheduled' as OperationalExecutionStatus,
            }
          : null,
      }
      await this.idempotency.complete(idemRecordId, result)
      return result
    } catch (error: any) {
      await this.idempotency.fail(idemRecordId, error?.code)
      throw error
    }
  }

  // =========================
  // SERVICE ORDER LINK
  // =========================
  async ensureChargeForServiceOrderDone(input: {
    orgId: string
    serviceOrderId: string
    customerId: string
    amountCents: number
    dueDate?: Date | null
    actorUserId?: string | null
  }) {
    if (!input.serviceOrderId) {
      throw new BadRequestException('serviceOrderId é obrigatório para vincular cobrança')
    }

    if (!input.amountCents || input.amountCents <= 0) {
      throw new BadRequestException('Valor da cobrança inválido para a O.S.')
    }

    const idemKey = [
      'service-order-charge-link',
      input.orgId,
      input.serviceOrderId,
      String(input.amountCents),
      input.dueDate?.toISOString() ?? '-',
    ].join(':')

    const idem = await this.idempotency.begin({
      orgId: input.orgId,
      scope: 'finance.ensure_charge_for_service_order_done',
      idempotencyKey: idemKey,
      payload: {
        serviceOrderId: input.serviceOrderId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        dueDate: input.dueDate?.toISOString() ?? null,
      },
    })
    if (idem.mode === 'replay') {
      return idem.response as any
    }

    try {
      const serviceOrder = await this.assertServiceOrderEligibleForCharge({
      orgId: input.orgId,
      serviceOrderId: input.serviceOrderId,
      customerId: input.customerId,
    })

    const existing = await this.prisma.charge.findFirst({
      where: {
        orgId: input.orgId,
        serviceOrderId: input.serviceOrderId,
      },
    })

      if (existing) {
        const result = { created: false, chargeId: existing.id }
        await this.idempotency.complete(idem.recordId, result)
        return result
      }

      const created = await this.prisma.charge.create({
        data: {
          orgId: input.orgId,
          serviceOrderId: input.serviceOrderId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          status: 'PENDING',
          dueDate: input.dueDate ?? new Date(),
        },
      })
      const timelineMetadata = {
        actorUserId: input.actorUserId ?? null,
        serviceOrderId: created.serviceOrderId,
        chargeId: created.id,
        customerId: created.customerId,
        amountCents: created.amountCents,
      }

      await this.safeTimelineLog({
        orgId: input.orgId,
        action: 'CHARGE_CREATED',
        description: `Cobrança ${created.id} gerada para O.S. ${input.serviceOrderId}`,
        customerId: created.customerId,
        serviceOrderId: created.serviceOrderId,
        chargeId: created.id,
        metadata: timelineMetadata,
      })

      await this.safeTimelineLog({
        orgId: input.orgId,
        action: 'SERVICE_ORDER_CHARGE_CREATED',
        description: `Cobrança ${created.id} gerada para O.S. ${input.serviceOrderId}`,
        customerId: created.customerId,
        serviceOrderId: created.serviceOrderId,
        chargeId: created.id,
        metadata: timelineMetadata,
      })

      const result = { created: true, chargeId: created.id }
      await this.idempotency.complete(idem.recordId, result)
      return result
    } catch (error: any) {
      await this.idempotency.fail(idem.recordId, error?.code)
      throw error
    }
  }

  // =========================
  // CRON SUPPORT
  // =========================
  async getAllOrgIds() {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    })
    return orgs.map((o) => o.id)
  }

  async automateOverdueLifecycle(orgId: string) {
    const now = new Date()

    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    const dueToday = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: 'PENDING',
        dueDate: { gte: todayStart, lte: todayEnd },
      },
    })

    for (const charge of dueToday) {
      await this.sendPaymentReminderWhatsApp(charge.id).catch((err) =>
        this.logger.error(`Erro ao enviar lembrete WhatsApp: ${err.message}`),
      )
    }

      const result = await this.prisma.charge.updateMany({
      where: {
        orgId,
        status: 'PENDING',
        dueDate: { lt: todayStart },
      },
      data: { status: 'OVERDUE' },
    })

    const overdue = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: 'OVERDUE',
      },
    })

    for (const charge of overdue) {
      await this.safeTimelineLog({
        orgId,
        action: 'CHARGE_OVERDUE',
        description: `Cobrança ${charge.id} vencida`,
        customerId: charge.customerId,
        serviceOrderId: charge.serviceOrderId,
        chargeId: charge.id,
        metadata: {
          chargeId: charge.id,
          customerId: charge.customerId,
          serviceOrderId: charge.serviceOrderId,
          amountCents: charge.amountCents,
          dueDate: charge.dueDate.toISOString(),
          previousStatus: 'PENDING',
          nextStatus: 'OVERDUE',
        },
      })
      await this.sendPaymentReminderWhatsApp(charge.id).catch((err) =>
        this.logger.error(`Erro overdue WhatsApp: ${err.message}`),
      )
    }

    return { ok: true, updated: result.count }
  }

  // =========================
  // STATS & REPORTS
  // =========================
  async exportChargesCsv(orgId: string) {
    const charges = await this.prisma.charge.findMany({
      where: { orgId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    })

    let csv = 'ID,Cliente,Valor,Vencimento,Status,Criado Em\n'
    for (const c of charges) {
      csv += `${c.id},"${c.customer?.name ?? ''}",${c.amountCents / 100},${c.dueDate.toISOString()},${c.status},${c.createdAt.toISOString()}\n`
    }
    return csv
  }

  async getChargeStats(orgId: string) {
    const [pending, overdue, paid] = await Promise.all([
      this.prisma.charge.aggregate({
        where: { orgId, status: 'PENDING' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.aggregate({
        where: { orgId, status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.aggregate({
        where: { orgId, status: 'PAID' },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ])

    return {
      pending: {
        count: pending._count._all ?? 0,
        amountCents: pending._sum.amountCents ?? 0,
      },
      overdue: {
        count: overdue._count._all ?? 0,
        amountCents: overdue._sum.amountCents ?? 0,
      },
      paid: {
        count: paid._count._all ?? 0,
        amountCents: paid._sum.amountCents ?? 0,
      },
    }
  }

  async getRevenueByMonth(orgId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { orgId },
      select: { amountCents: true, paidAt: true },
    })

    const months: Record<string, number> = {}
    for (const p of payments) {
      const month = p.paidAt.toISOString().slice(0, 7)
      months[month] = (months[month] || 0) + p.amountCents
    }

    return Object.entries(months)
      .map(([month, amountCents]) => ({ month, amountCents }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  async createAutomationCharge(data: Record<string, string | number | boolean | null>) {
    return { ok: true }
  }

  async sendPaymentReminder(data: Record<string, string | number | boolean | null>) {
    return { ok: true }
  }

  // =========================
  // WHATSAPP INTEGRATION
  // =========================
  private formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100)
  }

  private formatDate(date: Date) {
    return new Intl.DateTimeFormat('pt-BR').format(date)
  }

  async sendChargeWhatsApp(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { customer: true },
    })

    if (!charge || !charge.customer?.phone) return

    const amount = this.formatCurrency(charge.amountCents)
    const dueDate = this.formatDate(charge.dueDate)
    const text = `Olá, ${charge.customer.name}! Segue a sua cobrança no valor de ${amount}, com vencimento em ${dueDate}.`

    await this.whatsapp.enqueueMessage({
      orgId: charge.orgId,
      customerId: charge.customerId,
      toPhone: charge.customer.phone,
      entityType: WhatsAppEntityType.CHARGE,
      entityId: charge.id,
      messageType: WhatsAppMessageType.PAYMENT_LINK,
      messageKey: buildDeterministicMessageKey({
        entityType: WhatsAppEntityType.CHARGE,
        entityId: charge.id,
        messageType: WhatsAppMessageType.PAYMENT_LINK,
      }),
      renderedText: text,
    })
  }

  async sendPaymentConfirmationWhatsApp(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { customer: true },
    })

    if (!charge || !charge.customer?.phone) return

    const amount = this.formatCurrency(charge.amountCents)
    const text = `Olá, ${charge.customer.name}! Recebemos o seu pagamento no valor de ${amount}. Obrigado!`

    await this.whatsapp.enqueueMessage({
      orgId: charge.orgId,
      customerId: charge.customerId,
      toPhone: charge.customer.phone,
      entityType: WhatsAppEntityType.CHARGE,
      entityId: charge.id,
      messageType: WhatsAppMessageType.RECEIPT,
      messageKey: buildDeterministicMessageKey({
        entityType: WhatsAppEntityType.CHARGE,
        entityId: charge.id,
        messageType: WhatsAppMessageType.RECEIPT,
      }),
      renderedText: text,
    })
  }

  async sendPaymentReminderWhatsApp(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { customer: true },
    })

    if (!charge || !charge.customer?.phone) return

    const amount = this.formatCurrency(charge.amountCents)
    const dueDate = this.formatDate(charge.dueDate)
    const text = `Olá, ${charge.customer.name}! Lembramos que sua cobrança de ${amount} vence em ${dueDate}.`

    await this.whatsapp.enqueueMessage({
      orgId: charge.orgId,
      customerId: charge.customerId,
      toPhone: charge.customer.phone,
      entityType: WhatsAppEntityType.CHARGE,
      entityId: charge.id,
      messageType: WhatsAppMessageType.PAYMENT_REMINDER,
      messageKey: buildDeterministicMessageKey({
        entityType: WhatsAppEntityType.CHARGE,
        entityId: charge.id,
        messageType: WhatsAppMessageType.PAYMENT_REMINDER,
      }),
      renderedText: text,
    })
  }

  async remindChargeInOrg(orgId: string, chargeId: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      select: { id: true, status: true },
    })
    if (!charge) throw new NotFoundException('Charge não encontrada')
    if (charge.status === 'PAID') {
      throw new BadRequestException({
        code: 'CHARGE_STATE_INVALID_FOR_REMINDER',
        message: 'Cobrança paga não deve receber lembrete de cobrança.',
        details: { chargeId: charge.id, status: charge.status },
      })
    }
    await this.sendPaymentReminderWhatsApp(charge.id)
  }
}

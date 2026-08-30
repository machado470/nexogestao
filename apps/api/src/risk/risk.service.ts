import { Injectable } from '@nestjs/common'
import { OperationalStateValue } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import {
  normalizeTimelineEventType,
  timelineEventFilterValues,
} from '../timeline/timeline-events'
import { TemporalRiskService } from './temporal-risk.service'
import {
  OperationalStateRepository,
} from '../people/operational-state.repository'
import {
  persistOperationalStateTransition,
} from '../people/operational-state.transition'
import {
  evaluateCustomerOperationalRisk,
} from './customer-risk-policy'

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 30
const TIMELINE_WINDOW_DAYS = 90
const OLD_OPEN_SERVICE_ORDER_DAYS = 7
const STUCK_EXECUTION_DAYS = 2

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporalRisk: TemporalRiskService,
    private readonly timeline: TimelineService,
  ) {}

  /**
   * 🔹 Apenas cálculo simples (compatível com o que já existia)
   */
  async calculatePersonRisk(personId: string, orgId?: string) {
    return this.temporalRisk.calculate(personId, orgId)
  }

  /**
   * 🔥 NOVO: cálculo completo com explicação (base do frontend inteligente)
   */
  async getPersonRiskExplanation(personId: string, orgId?: string) {
    const detailed = await this.temporalRisk.calculateDetailed(personId, orgId)

    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...(orgId ? { orgId } : {}) },
      select: {
        id: true,
        name: true,
        riskScore: true,
        operationalRiskScore: true,
        operationalState: true,
      },
    })

    if (!person) {
      throw new Error('Pessoa não encontrada')
    }

    return {
      person,
      risk: detailed,
    }
  }

  /**
   * 🔹 Recalcula + persiste
   */
  async recalculatePersonRisk(personId: string, reason?: string, orgId?: string) {
    /*
     * Capturamos o snapshot antes do cálculo.
     * Esse é o estado que originou a decisão
     * e precisa ser o mesmo usado no CAS.
     */
    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...(orgId ? { orgId } : {}) },
      select: {
        id: true,
        orgId: true,
        riskScore: true,
        operationalRiskScore: true,
        operationalState: true,
        operationalStateUpdatedAt: true,
      },
    })

    if (!person) {
      throw new Error('Pessoa não encontrada')
    }

    const detailed =
      await this.temporalRisk.calculateDetailed(
        personId,
        orgId,
      )

    const previousScore = Number(
      person.operationalRiskScore
        ?? person.riskScore
        ?? 0,
    )

    const previousState =
      person.operationalState ?? 'NORMAL'

    const riskChanged =
      previousScore !== detailed.score
      || previousState !== detailed.state

    const legacyRiskChanged =
      person.riskScore !== detailed.score

    const finalReason =
      reason?.trim()
        ? reason.trim()
        : 'Reavaliação automática'

    /*
     * O repository depende somente do Prisma.
     * Assim o RiskModule não precisa importar
     * OperationalStateModule e não cria ciclo.
     */
    const repository =
      new OperationalStateRepository(
        this.prisma,
      )

    const transition =
      await persistOperationalStateTransition({
        prisma: this.prisma,
        repository,
        timeline: this.timeline,
        snapshot: {
          id: person.id,
          orgId: person.orgId,
          operationalState:
            person.operationalState,
          operationalRiskScore:
            Number(
              person.operationalRiskScore
                ?? person.riskScore
                ?? 0,
            ),
          operationalStateUpdatedAt:
            person.operationalStateUpdatedAt,
          legacyRiskScore:
            person.riskScore,
        },
        nextState:
          detailed.state,
        riskScore:
          detailed.score,
        nextLegacyRiskScore:
          detailed.score,
        source:
          'RISK_SERVICE',
        reason:
          finalReason,
        metadata: {
          previousRisk:
            previousScore,
          nextRisk:
            detailed.score,
          previousState,
          nextState:
            detailed.state,
        },
      })

    /*
     * Se havia mudança e perdemos o CAS,
     * a decisão ficou stale.
     *
     * Não emitimos snapshot/RISK_UPDATED
     * baseado em uma decisão derrotada.
     */
    const decisionAlreadyCurrent =
      !riskChanged
      && !legacyRiskChanged

    if (
      transition.claimed
      || decisionAlreadyCurrent
    ) {
      await this.snapshot(
        personId,
        detailed.score,
        finalReason,
        person.orgId,
        {
          previousScore,
          previousState,
          nextState:
            detailed.state,
          emitRiskUpdated:
            riskChanged,
          detailed,
        },
      )

      return detailed
    }

    /*
     * Se perdemos o CAS, a decisão calculada
     * ficou stale.
     *
     * O caller não pode receber WARNING/60
     * enquanto o estado autoritativo já é,
     * por exemplo, RESTRICTED/80.
     */
    const authoritativePerson =
      await this.prisma.person.findFirst({
        where: {
          id: personId,
          orgId: person.orgId,
        },
        select: {
          riskScore: true,
          operationalRiskScore: true,
          operationalState: true,
        },
      })

    if (!authoritativePerson) {
      throw new Error(
        'Pessoa não encontrada após disputa de estado operacional',
      )
    }

    return {
      ...detailed,
      score: Number(
        authoritativePerson
          .operationalRiskScore
          ?? authoritativePerson
            .riskScore
          ?? detailed.score,
      ),
      state:
        authoritativePerson
          .operationalState
        ?? detailed.state,
    }
  }

  /**
   * 🔹 Snapshot + timeline
   */
  async snapshot(
    personId: string,
    score: number,
    reason?: string,
    orgId?: string,
    options?: {
      previousScore?: number | null
      previousState?: OperationalStateValue | null
      nextState?: OperationalStateValue | null
      emitRiskUpdated?: boolean
      detailed?: { state?: OperationalStateValue; contributors?: string[]; breakdown?: unknown[]; factors?: unknown }
    },
  ) {
    const finalReason = reason?.trim()
      ? reason.trim()
      : 'Reavaliação automática'

    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...(orgId ? { orgId } : {}) },
      select: {
        orgId: true,
        riskScore: true,
        operationalRiskScore: true,
        operationalState: true,
      },
    })

    if (!person) {
      throw new Error('RiskService.snapshot(): person não encontrado')
    }

    await this.prisma.riskSnapshot.create({
      data: {
        personId,
        score,
        reason: finalReason,
      },
    })

    const previousScore = options?.previousScore ?? person.operationalRiskScore ?? person.riskScore ?? null
    const nextState = options?.nextState ?? options?.detailed?.state ?? person.operationalState ?? null
    const previousState = options?.previousState ?? person.operationalState ?? null
    const metadata = {
      previousRisk: previousScore,
      nextRisk: score,
      previousScore,
      nextScore: score,
      previousState,
      nextState,
      riskLevel: nextState,
      score,
      reasons: options?.detailed?.contributors ?? [],
      signals: options?.detailed?.factors ?? null,
      breakdown: options?.detailed?.breakdown ?? [],
      reason: finalReason,
      evaluatedAt: new Date().toISOString(),
      entityType: 'Person',
      entityId: personId,
      orgId: person.orgId,
    }

    await this.timeline.log({
      orgId: person.orgId,
      personId,
      action: 'RISK_SNAPSHOT_CREATED',
      metadata,
    })

    if (options?.emitRiskUpdated ?? true) {
      await this.timeline.log({
        orgId: person.orgId,
        personId,
        action: 'RISK_UPDATED',
        description: `Risco operacional recalculado (${score})`,
        metadata,
      })
    }
  }

  /**
   * 🔥 MELHORADO: risco operacional do cliente com explicação
   */
  async getCustomerOperationalRisk(orgId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, orgId },
      select: { id: true, orgId: true },
    })

    if (!customer) {
      throw new Error('Cliente não encontrado')
    }

    const now = new Date()
    const recentSince = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS)
    const timelineSince = new Date(now.getTime() - TIMELINE_WINDOW_DAYS * DAY_MS)
    const oldOpenBefore = new Date(now.getTime() - OLD_OPEN_SERVICE_ORDER_DAYS * DAY_MS)
    const stuckExecutionBefore = new Date(now.getTime() - STUCK_EXECUTION_DAYS * DAY_MS)
    const tomorrowEnd = new Date(now.getTime() + DAY_MS)

    const serviceOrderOpenStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as const
    const [
      overdueCharges,
      overdueChargesAgg,
      pendingChargesWithoutPayment,
      recentPaymentsReceived,
      overdueServiceOrders,
      oldOpenServiceOrders,
      completedServiceOrdersWithoutCharge,
      cancelledServiceOrders,
      stuckServiceOrderExecutions,
      cancelledAppointments,
      noShowAppointments,
      unconfirmedAppointments,
      overdueAppointmentsWithoutExecution,
      failedMessagesByRow,
      failedMessagesByTimeline,
      awaitingResponseConversations,
      canonicalTimelineEvents,
    ] = await Promise.all([
      this.prisma.charge.count({ where: { orgId, customerId, status: 'OVERDUE' } }),
      this.prisma.charge.aggregate({
        where: { orgId, customerId, status: 'OVERDUE' },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.count({
        where: { orgId, customerId, status: 'PENDING', payments: { none: {} } },
      }),
      this.prisma.payment.count({
        where: {
          orgId,
          paidAt: { gte: recentSince },
          charge: { customerId },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId,
          customerId,
          status: { in: [...serviceOrderOpenStatuses] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId,
          customerId,
          status: { in: [...serviceOrderOpenStatuses] },
          createdAt: { lt: oldOpenBefore },
        },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, customerId, status: 'DONE', charges: { none: {} } },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, customerId, status: 'CANCELED', updatedAt: { gte: recentSince } },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId,
          customerId,
          status: 'IN_PROGRESS',
          startedAt: { lt: stuckExecutionBefore },
          finishedAt: null,
        },
      }),
      this.prisma.appointment.count({
        where: { orgId, customerId, status: 'CANCELED', startsAt: { gte: recentSince } },
      }),
      this.prisma.appointment.count({
        where: { orgId, customerId, status: 'NO_SHOW', startsAt: { gte: recentSince } },
      }),
      this.prisma.appointment.count({
        where: { orgId, customerId, status: 'SCHEDULED', startsAt: { gte: now, lte: tomorrowEnd } },
      }),
      this.prisma.appointment.count({
        where: { orgId, customerId, status: 'SCHEDULED', startsAt: { lt: now }, serviceOrder: null },
      }),
      this.prisma.whatsAppMessage.count({ where: { orgId, customerId, status: 'FAILED' } }),
      this.prisma.timelineEvent.count({
        where: {
          orgId,
          customerId,
          action: { in: timelineEventFilterValues('MESSAGE_FAILED') },
          createdAt: { gte: timelineSince },
        },
      }),
      this.prisma.whatsAppConversation.count({
        where: { orgId, customerId, status: 'WAITING_OPERATOR', responseDueAt: { lt: now } },
      }),
      this.prisma.timelineEvent.findMany({
        where: {
          orgId,
          customerId,
          action: {
            in: [
              ...timelineEventFilterValues('APPOINTMENT_CANCELLED'),
              ...timelineEventFilterValues('SERVICE_ORDER_STARTED'),
              ...timelineEventFilterValues('SERVICE_ORDER_COMPLETED'),
              ...timelineEventFilterValues('CHARGE_CREATED'),
              ...timelineEventFilterValues('PAYMENT_RECEIVED'),
              ...timelineEventFilterValues('MESSAGE_FAILED'),
              ...timelineEventFilterValues('GOVERNANCE_RUN_COMPLETED'),
              ...timelineEventFilterValues('OPERATIONAL_STATE_CHANGED'),
            ],
          },
          createdAt: { gte: timelineSince },
        },
        select: { action: true },
      }),
    ])

    const failedMessages = Math.max(failedMessagesByRow, failedMessagesByTimeline)
    const overdueAmountCents = overdueChargesAgg._sum.amountCents ?? 0
    const normalizedTimelineEvents = canonicalTimelineEvents.map((event) =>
      normalizeTimelineEventType(event.action),
    )
    return evaluateCustomerOperationalRisk({
      overdueCharges,
      overdueAmountCents,
      pendingChargesWithoutPayment,
      recentPaymentsReceived,
      overdueServiceOrders,
      oldOpenServiceOrders,
      completedServiceOrdersWithoutCharge,
      cancelledServiceOrders,
      stuckServiceOrderExecutions,
      cancelledAppointments,
      noShowAppointments,
      unconfirmedAppointments,
      overdueAppointmentsWithoutExecution,
      failedMessages,
      awaitingResponseConversations,
      canonicalTimelineEvents: normalizedTimelineEvents,
    })

  }

  /**
   * 🔹 Mantido (compatibilidade com fluxo atual)
   */
  async recalculateCustomerOperationalRisk(
    orgId: string,
    customerId: string,
    reason?: string,
  ) {
    const result = await this.getCustomerOperationalRisk(orgId, customerId)
    const lastRiskEvent = await this.prisma.timelineEvent.findFirst({
      where: {
        orgId,
        customerId,
        action: { in: timelineEventFilterValues('RISK_UPDATED') },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    })

    const previousScore = this.extractPreviousScore(lastRiskEvent?.metadata)
    const previousState = this.extractPreviousState(lastRiskEvent?.metadata)
    const changed = previousScore !== result.score || previousState !== result.state

    const metadata = {
      customerId,
      reason: reason ?? 'OPERATIONAL_EVENT',
      previousRisk: previousScore,
      nextRisk: result.score,
      previousScore,
      nextScore: result.score,
      previousState,
      nextState: result.state,
      riskLevel: result.state,
      score: result.score,
      reasons: result.contributors,
      signals: result.factors,
      evaluatedAt: new Date().toISOString(),
      entityType: 'Customer',
      entityId: customerId,
      orgId,
      ...result,
    }

    if (changed) {
      await this.timeline.log({
        orgId,
        action: 'CUSTOMER_OPERATIONAL_RISK_UPDATED',
        description: `Risco operacional do cliente recalculado (${result.score})`,
        customerId,
        metadata,
      })

      await this.timeline.log({
        orgId,
        action: 'RISK_UPDATED',
        description: `Risco operacional do cliente recalculado (${result.score})`,
        customerId,
        metadata,
      })
    }

    return result
  }

  private extractPreviousScore(metadata: unknown): number | null {
    if (!metadata || typeof metadata !== 'object') return null
    const value = (metadata as { nextScore?: unknown; score?: unknown; nextRisk?: unknown }).nextScore ??
      (metadata as { score?: unknown }).score ??
      (metadata as { nextRisk?: unknown }).nextRisk
    return typeof value === 'number' ? value : null
  }

  private extractPreviousState(metadata: unknown): OperationalStateValue | null {
    if (!metadata || typeof metadata !== 'object') return null
    const value = (metadata as { nextState?: unknown; riskLevel?: unknown }).nextState ??
      (metadata as { riskLevel?: unknown }).riskLevel
    if (value === 'NORMAL' || value === 'WARNING' || value === 'RESTRICTED' || value === 'SUSPENDED') {
      return value
    }
    return null
  }
}

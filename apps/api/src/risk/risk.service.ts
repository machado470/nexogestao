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
  deriveOperationalStateFromRiskScore,
} from '../common/domain/operational-state-policy'

type CustomerRiskContributor =
  | 'OVERDUE_CHARGES'
  | 'HIGH_OVERDUE_AMOUNT'
  | 'PENDING_CHARGES_WITHOUT_PAYMENT'
  | 'RECENT_PAYMENTS_RECEIVED'
  | 'OVERDUE_SERVICE_ORDERS'
  | 'OLD_OPEN_SERVICE_ORDERS'
  | 'COMPLETED_SERVICE_ORDERS_WITHOUT_CHARGE'
  | 'CANCELLED_SERVICE_ORDERS'
  | 'STUCK_SERVICE_ORDER_EXECUTION'
  | 'APPOINTMENT_CANCELLATIONS'
  | 'APPOINTMENT_NO_SHOWS'
  | 'UNCONFIRMED_APPOINTMENTS'
  | 'OVERDUE_APPOINTMENTS_WITHOUT_EXECUTION'
  | 'MESSAGE_FAILURES'
  | 'CUSTOMER_AWAITING_RESPONSE'
  | 'CANONICAL_CRITICAL_TIMELINE_EVENTS'

type CustomerRiskBreakdown = {
  code: CustomerRiskContributor
  label: string
  description: string
  points: number
  value: number
  threshold?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 30
const TIMELINE_WINDOW_DAYS = 90
const OLD_OPEN_SERVICE_ORDER_DAYS = 7
const STUCK_EXECUTION_DAYS = 2
const HIGH_OVERDUE_AMOUNT_CENTS = 100_000

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
    const criticalTimelineEventCount = normalizedTimelineEvents.filter((action) =>
      ['APPOINTMENT_CANCELLED', 'MESSAGE_FAILED', 'OPERATIONAL_STATE_CHANGED'].includes(
        String(action),
      ),
    ).length

    let score = 0
    const contributors: CustomerRiskContributor[] = []
    const breakdown: CustomerRiskBreakdown[] = []
    const addFactor = (factor: CustomerRiskBreakdown) => {
      score += factor.points
      contributors.push(factor.code)
      breakdown.push(factor)
    }

    if (overdueCharges > 0) {
      addFactor({ code: 'OVERDUE_CHARGES', label: 'Cobranças vencidas', description: 'Cobranças vencidas do cliente elevam risco financeiro.', points: Math.min(60, 50 + Math.max(0, overdueCharges - 1) * 5), value: overdueCharges, threshold: 1 })
    }
    if (overdueAmountCents >= HIGH_OVERDUE_AMOUNT_CENTS) {
      addFactor({ code: 'HIGH_OVERDUE_AMOUNT', label: 'Valor financeiro relevante em atraso', description: 'O total vencido ultrapassou o limite operacional definido para restrição.', points: 25, value: overdueAmountCents, threshold: HIGH_OVERDUE_AMOUNT_CENTS })
    }
    if (pendingChargesWithoutPayment > 0) {
      addFactor({ code: 'PENDING_CHARGES_WITHOUT_PAYMENT', label: 'Cobranças pendentes sem pagamento', description: 'Há cobranças pendentes sem nenhum pagamento registrado.', points: Math.min(20, pendingChargesWithoutPayment * 5), value: pendingChargesWithoutPayment, threshold: 1 })
    }
    if (recentPaymentsReceived > 0) {
      addFactor({ code: 'RECENT_PAYMENTS_RECEIVED', label: 'Pagamentos recentes mitigam risco', description: 'Pagamentos recebidos recentemente reduzem o risco financeiro.', points: -Math.min(20, recentPaymentsReceived * 5), value: recentPaymentsReceived, threshold: 1 })
    }
    if (overdueServiceOrders > 0) {
      addFactor({ code: 'OVERDUE_SERVICE_ORDERS', label: 'Ordens de serviço atrasadas', description: 'Há O.S. abertas com prazo operacional vencido.', points: Math.min(60, 50 + Math.max(0, overdueServiceOrders - 1) * 5), value: overdueServiceOrders, threshold: 1 })
    }
    if (oldOpenServiceOrders > 0) {
      addFactor({ code: 'OLD_OPEN_SERVICE_ORDERS', label: 'Ordens abertas há muito tempo', description: 'Há O.S. abertas há mais tempo que a janela operacional esperada.', points: Math.min(20, oldOpenServiceOrders * 10), value: oldOpenServiceOrders, threshold: 1 })
    }
    if (completedServiceOrdersWithoutCharge > 0) {
      addFactor({ code: 'COMPLETED_SERVICE_ORDERS_WITHOUT_CHARGE', label: 'O.S. concluídas sem cobrança', description: 'Há O.S. concluídas sem cobrança associada.', points: Math.min(20, completedServiceOrdersWithoutCharge * 10), value: completedServiceOrdersWithoutCharge, threshold: 1 })
    }
    if (cancelledServiceOrders > 0) {
      addFactor({ code: 'CANCELLED_SERVICE_ORDERS', label: 'O.S. canceladas recentemente', description: 'Cancelamentos recentes de O.S. elevam risco operacional.', points: Math.min(15, cancelledServiceOrders * 5), value: cancelledServiceOrders, threshold: 1 })
    }
    if (stuckServiceOrderExecutions > 0) {
      addFactor({ code: 'STUCK_SERVICE_ORDER_EXECUTION', label: 'Execução iniciada e não concluída', description: 'Há O.S. em execução parada além da janela esperada.', points: Math.min(30, stuckServiceOrderExecutions * 20), value: stuckServiceOrderExecutions, threshold: 1 })
    }
    if (cancelledAppointments > 1) {
      addFactor({ code: 'APPOINTMENT_CANCELLATIONS', label: 'Cancelamentos recorrentes de agendamento', description: 'Cancelamentos recorrentes recentes impactam risco.', points: Math.min(50, 40 + Math.max(0, cancelledAppointments - 2) * 5), value: cancelledAppointments, threshold: 2 })
    }
    if (noShowAppointments > 0) {
      addFactor({ code: 'APPOINTMENT_NO_SHOWS', label: 'No-show em agendamentos', description: 'Há faltas registradas em agendamentos recentes.', points: Math.min(25, noShowAppointments * 15), value: noShowAppointments, threshold: 1 })
    }
    if (unconfirmedAppointments > 0) {
      addFactor({ code: 'UNCONFIRMED_APPOINTMENTS', label: 'Agendamentos próximos sem confirmação', description: 'Há agendamentos próximos ainda não confirmados.', points: Math.min(15, unconfirmedAppointments * 5), value: unconfirmedAppointments, threshold: 1 })
    }
    if (overdueAppointmentsWithoutExecution > 0) {
      addFactor({ code: 'OVERDUE_APPOINTMENTS_WITHOUT_EXECUTION', label: 'Agendamentos vencidos sem execução', description: 'Há agendamentos vencidos sem O.S. vinculada.', points: Math.min(25, overdueAppointmentsWithoutExecution * 15), value: overdueAppointmentsWithoutExecution, threshold: 1 })
    }
    if (failedMessages > 0) {
      addFactor({ code: 'MESSAGE_FAILURES', label: 'Falhas de WhatsApp', description: 'Falhas MESSAGE_FAILED/mensagens FAILED foram registradas.', points: Math.min(60, 50 + Math.max(0, failedMessages - 1) * 5), value: failedMessages, threshold: 1 })
    }
    if (awaitingResponseConversations > 0) {
      addFactor({ code: 'CUSTOMER_AWAITING_RESPONSE', label: 'Cliente sem resposta operacional', description: 'Há conversa com SLA de resposta vencido para o cliente.', points: Math.min(15, awaitingResponseConversations * 10), value: awaitingResponseConversations, threshold: 1 })
    }
    if (criticalTimelineEventCount > 0) {
      addFactor({ code: 'CANONICAL_CRITICAL_TIMELINE_EVENTS', label: 'Eventos canônicos críticos na Timeline', description: 'A Timeline contém eventos canônicos críticos aceitos pelo Risk Engine.', points: Math.min(20, criticalTimelineEventCount * 5), value: criticalTimelineEventCount, threshold: 1 })
    }

    const finalScore = Math.min(100, Math.max(0, Math.round(score)))
    const state =
      deriveOperationalStateFromRiskScore(
        finalScore,
      )
    const factors = {
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
      canonicalCriticalTimelineEvents: criticalTimelineEventCount,
      canonicalTimelineEvents: normalizedTimelineEvents,
    }

    const explanation = [
      `Score final ${finalScore}, estado operacional ${state}.`,
      ...breakdown.map((item) => `${item.label}: ${item.points >= 0 ? '+' : ''}${item.points} pontos.`),
    ]

    if (breakdown.length === 0) {
      explanation.push('Nenhum fator de risco relevante foi identificado no cálculo atual.')
    }

    return {
      score: finalScore,
      state,
      factors,
      contributors,
      breakdown,
      explanation,
    }
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

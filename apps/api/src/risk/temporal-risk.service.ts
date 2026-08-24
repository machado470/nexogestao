import { Injectable } from '@nestjs/common'
import { OperationalStateValue } from '@prisma/client'
import {
  deriveOperationalStateFromRiskScore,
} from '../common/domain/operational-state-policy'
import { PrismaService } from '../prisma/prisma.service'
import {
  normalizeTimelineEventType,
  timelineEventFilterValues,
} from '../timeline/timeline-events'

export type RiskContributor =
  | 'LOW_AVG_PROGRESS'
  | 'VERY_LOW_AVG_PROGRESS'
  | 'HAS_OPEN_CORRECTIVES'
  | 'HAS_MANY_OPEN_CORRECTIVES'
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
  | 'HIGH_WORKLOAD'
  | 'NO_RECENT_ACTIVITY'

export type TemporalRiskFactorBreakdown = {
  code: RiskContributor
  label: string
  description: string
  points: number
  value: number
  threshold?: number
}

export type TemporalRiskResult = {
  score: number
  state: OperationalStateValue
  factors: {
    avgProgress: number
    openCorrectives: number
    overdueCharges: number
    overdueAmountCents: number
    pendingChargesWithoutPayment: number
    recentPaymentsReceived: number
    overdueServiceOrders: number
    oldOpenServiceOrders: number
    completedServiceOrdersWithoutCharge: number
    cancelledServiceOrders: number
    stuckServiceOrderExecutions: number
    cancelledAppointments: number
    noShowAppointments: number
    unconfirmedAppointments: number
    overdueAppointmentsWithoutExecution: number
    failedMessages: number
    awaitingResponseConversations: number
    canonicalCriticalTimelineEvents: number
    workloadRatio: number
    daysSinceLastActivity: number | null
  }
  contributors: RiskContributor[]
  breakdown: TemporalRiskFactorBreakdown[]
  explanation: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 30
const TIMELINE_WINDOW_DAYS = 90
const OLD_OPEN_SERVICE_ORDER_DAYS = 7
const STUCK_EXECUTION_DAYS = 2
const NO_RECENT_ACTIVITY_DAYS = 14
const HIGH_OVERDUE_AMOUNT_CENTS = 100_000
const HIGH_WORKLOAD_RATIO = 1.2

@Injectable()
export class TemporalRiskService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(personId: string, orgId?: string): Promise<number> {
    const detailed = await this.calculateDetailed(personId, orgId)
    return detailed.score
  }

  async calculateDetailed(personId: string, orgId?: string): Promise<TemporalRiskResult> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...(orgId ? { orgId } : {}) },
      select: {
        id: true,
        orgId: true,
        dailyServiceOrderCapacity: true,
        dailyAppointmentCapacity: true,
        updatedAt: true,
      },
    })

    if (!person) {
      throw new Error('Pessoa não encontrada')
    }

    const resolvedOrgId = person.orgId
    const now = new Date()
    const recentSince = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS)
    const timelineSince = new Date(now.getTime() - TIMELINE_WINDOW_DAYS * DAY_MS)
    const oldOpenBefore = new Date(now.getTime() - OLD_OPEN_SERVICE_ORDER_DAYS * DAY_MS)
    const stuckExecutionBefore = new Date(now.getTime() - STUCK_EXECUTION_DAYS * DAY_MS)
    const staleActivityBefore = new Date(now.getTime() - NO_RECENT_ACTIVITY_DAYS * DAY_MS)
    const tomorrowEnd = new Date(now.getTime() + DAY_MS)
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    const [openCorrectives, assignments] = await Promise.all([
      this.prisma.correctiveAction.count({
        where: {
          personId,
          status: 'OPEN',
          person: { orgId: resolvedOrgId },
        },
      }),
      this.prisma.assignment.findMany({
        where: { personId, person: { orgId: resolvedOrgId } },
        select: { progress: true },
      }),
    ])

    const avgProgress =
      assignments.length === 0
        ? 100
        : assignments.reduce((sum, assignment) => sum + assignment.progress, 0) /
          assignments.length

    const roundedAvgProgress = Math.round(avgProgress)

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
      failedMessages,
      awaitingResponseConversations,
      canonicalCriticalTimelineEvents,
      todaysAssignedServiceOrders,
      todaysAssignedAppointments,
      latestTimelineEvent,
      latestServiceOrder,
      latestAppointment,
    ] = await Promise.all([
      this.prisma.charge.count({
        where: {
          orgId: resolvedOrgId,
          status: 'OVERDUE',
          serviceOrder: { assignedToPersonId: personId },
        },
      }),
      this.prisma.charge.aggregate({
        where: {
          orgId: resolvedOrgId,
          status: 'OVERDUE',
          serviceOrder: { assignedToPersonId: personId },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.count({
        where: {
          orgId: resolvedOrgId,
          status: 'PENDING',
          serviceOrder: { assignedToPersonId: personId },
          payments: { none: {} },
        },
      }),
      this.prisma.payment.count({
        where: {
          orgId: resolvedOrgId,
          paidAt: { gte: recentSince },
          charge: { serviceOrder: { assignedToPersonId: personId } },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: { in: [...serviceOrderOpenStatuses] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: { in: [...serviceOrderOpenStatuses] },
          createdAt: { lt: oldOpenBefore },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'DONE',
          charges: { none: {} },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'CANCELED',
          updatedAt: { gte: recentSince },
        },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'IN_PROGRESS',
          startedAt: { lt: stuckExecutionBefore },
          finishedAt: null,
        },
      }),
      this.prisma.appointment.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'CANCELED',
          startsAt: { gte: recentSince },
        },
      }),
      this.prisma.appointment.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'NO_SHOW',
          startsAt: { gte: recentSince },
        },
      }),
      this.prisma.appointment.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'SCHEDULED',
          startsAt: { gte: now, lte: tomorrowEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: 'SCHEDULED',
          startsAt: { lt: now },
          serviceOrder: null,
        },
      }),
      this.prisma.timelineEvent.count({
        where: {
          orgId: resolvedOrgId,
          personId,
          action: { in: timelineEventFilterValues('MESSAGE_FAILED') },
          createdAt: { gte: timelineSince },
        },
      }),
      this.prisma.whatsAppConversation.count({
        where: {
          orgId: resolvedOrgId,
          status: 'WAITING_OPERATOR',
          responseDueAt: { lt: now },
          customer: {
            serviceOrders: { some: { orgId: resolvedOrgId, assignedToPersonId: personId } },
          },
        },
      }),
      this.prisma.timelineEvent.findMany({
        where: {
          orgId: resolvedOrgId,
          personId,
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
      this.prisma.serviceOrder.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          status: { in: [...serviceOrderOpenStatuses] },
          scheduledFor: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          orgId: resolvedOrgId,
          assignedToPersonId: personId,
          startsAt: { gte: todayStart, lte: todayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
      this.prisma.timelineEvent.findFirst({
        where: { orgId: resolvedOrgId, personId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.serviceOrder.findFirst({
        where: { orgId: resolvedOrgId, assignedToPersonId: personId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.appointment.findFirst({
        where: { orgId: resolvedOrgId, assignedToPersonId: personId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    const overdueAmountCents = overdueChargesAgg._sum.amountCents ?? 0
    const normalizedTimelineEvents = canonicalCriticalTimelineEvents.map((event) =>
      normalizeTimelineEventType(event.action),
    )
    const criticalTimelineEventCount = normalizedTimelineEvents.filter((action) =>
      ['APPOINTMENT_CANCELLED', 'MESSAGE_FAILED', 'OPERATIONAL_STATE_CHANGED'].includes(
        String(action),
      ),
    ).length

    const dailyCapacity =
      Number(person.dailyServiceOrderCapacity ?? 0) +
      Number(person.dailyAppointmentCapacity ?? 0)
    const todaysLoad = todaysAssignedServiceOrders + todaysAssignedAppointments
    const workloadRatio = dailyCapacity > 0 ? Number((todaysLoad / dailyCapacity).toFixed(2)) : 0

    const lastActivityAt = [
      person.updatedAt,
      latestTimelineEvent?.createdAt,
      latestServiceOrder?.updatedAt,
      latestAppointment?.updatedAt,
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const daysSinceLastActivity = lastActivityAt
      ? Math.floor((Date.now() - lastActivityAt.getTime()) / DAY_MS)
      : null

    let score = 0
    const contributors: RiskContributor[] = []
    const breakdown: TemporalRiskFactorBreakdown[] = []

    const addFactor = (factor: TemporalRiskFactorBreakdown) => {
      score += factor.points
      contributors.push(factor.code)
      breakdown.push(factor)
    }

    if (roundedAvgProgress < 80) {
      addFactor({
        code: 'LOW_AVG_PROGRESS',
        label: 'Progresso médio abaixo do esperado',
        description: 'A média de progresso dos assignments ficou abaixo de 80%.',
        points: 30,
        value: roundedAvgProgress,
        threshold: 80,
      })
    }

    if (roundedAvgProgress < 50) {
      addFactor({
        code: 'VERY_LOW_AVG_PROGRESS',
        label: 'Progresso médio criticamente baixo',
        description: 'A média de progresso dos assignments ficou abaixo de 50%.',
        points: 30,
        value: roundedAvgProgress,
        threshold: 50,
      })
    }

    if (openCorrectives > 0) {
      addFactor({
        code: 'HAS_OPEN_CORRECTIVES',
        label: 'Há ações corretivas em aberto',
        description: 'Existe pelo menos uma ação corretiva aberta para a pessoa.',
        points: 20,
        value: openCorrectives,
        threshold: 1,
      })
    }

    if (openCorrectives > 2) {
      addFactor({
        code: 'HAS_MANY_OPEN_CORRECTIVES',
        label: 'Há muitas ações corretivas em aberto',
        description: 'A pessoa possui mais de 2 ações corretivas abertas.',
        points: 20,
        value: openCorrectives,
        threshold: 3,
      })
    }

    if (overdueCharges > 0) {
      addFactor({ code: 'OVERDUE_CHARGES', label: 'Cobranças vencidas', description: 'Há cobranças vencidas vinculadas a O.S. atribuídas à pessoa.', points: Math.min(60, 50 + Math.max(0, overdueCharges - 1) * 5), value: overdueCharges, threshold: 1 })
    }

    if (overdueAmountCents >= HIGH_OVERDUE_AMOUNT_CENTS) {
      addFactor({ code: 'HIGH_OVERDUE_AMOUNT', label: 'Valor financeiro relevante em atraso', description: 'O total vencido ultrapassou o limite operacional definido para restrição.', points: 25, value: overdueAmountCents, threshold: HIGH_OVERDUE_AMOUNT_CENTS })
    }

    if (pendingChargesWithoutPayment > 0) {
      addFactor({ code: 'PENDING_CHARGES_WITHOUT_PAYMENT', label: 'Cobranças pendentes sem pagamento', description: 'Há cobranças pendentes sem nenhum pagamento registrado.', points: Math.min(20, pendingChargesWithoutPayment * 5), value: pendingChargesWithoutPayment, threshold: 1 })
    }

    if (recentPaymentsReceived > 0) {
      addFactor({ code: 'RECENT_PAYMENTS_RECEIVED', label: 'Pagamentos recentes mitigam risco', description: 'Pagamentos recebidos recentemente reduzem o risco operacional financeiro.', points: -Math.min(20, recentPaymentsReceived * 5), value: recentPaymentsReceived, threshold: 1 })
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
      addFactor({ code: 'MESSAGE_FAILURES', label: 'Falhas de WhatsApp', description: 'Eventos canônicos MESSAGE_FAILED foram registrados para a pessoa.', points: Math.min(60, 50 + Math.max(0, failedMessages - 1) * 5), value: failedMessages, threshold: 1 })
    }

    if (awaitingResponseConversations > 0) {
      addFactor({ code: 'CUSTOMER_AWAITING_RESPONSE', label: 'Conversas vencidas aguardando operação', description: 'Há conversas WhatsApp com SLA de resposta vencido na organização.', points: Math.min(10, awaitingResponseConversations * 2), value: awaitingResponseConversations, threshold: 1 })
    }

    if (criticalTimelineEventCount > 0) {
      addFactor({ code: 'CANONICAL_CRITICAL_TIMELINE_EVENTS', label: 'Eventos canônicos críticos na Timeline', description: 'A Timeline contém eventos canônicos críticos aceitos pelo Risk Engine.', points: Math.min(20, criticalTimelineEventCount * 5), value: criticalTimelineEventCount, threshold: 1 })
    }

    if (workloadRatio > HIGH_WORKLOAD_RATIO) {
      addFactor({ code: 'HIGH_WORKLOAD', label: 'Carga operacional acima da capacidade', description: 'A carga diária atribuída excede a capacidade cadastrada da pessoa.', points: 15, value: workloadRatio, threshold: HIGH_WORKLOAD_RATIO })
    }

    if (daysSinceLastActivity !== null && person.updatedAt < staleActivityBefore && daysSinceLastActivity >= NO_RECENT_ACTIVITY_DAYS) {
      addFactor({ code: 'NO_RECENT_ACTIVITY', label: 'Sem atividade recente', description: 'Não há atividade recente registrada para a pessoa.', points: 10, value: daysSinceLastActivity, threshold: NO_RECENT_ACTIVITY_DAYS })
    }

    const finalScore = Math.min(100, Math.max(0, Math.round(score)))
    const state = this.deriveOperationalState(finalScore)

    return {
      score: finalScore,
      state,
      factors: {
        avgProgress: roundedAvgProgress,
        openCorrectives,
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
        workloadRatio,
        daysSinceLastActivity,
      },
      contributors,
      breakdown,
      explanation: this.buildExplanation({
        score: finalScore,
        state,
        avgProgress: roundedAvgProgress,
        openCorrectives,
        breakdown,
      }),
    }
  }

  deriveOperationalState(
    score: number,
  ): OperationalStateValue {
    return deriveOperationalStateFromRiskScore(
      score,
    )
  }

  private buildExplanation(params: {
    score: number
    state: OperationalStateValue
    avgProgress: number
    openCorrectives: number
    breakdown: TemporalRiskFactorBreakdown[]
  }): string[] {
    const lines: string[] = [
      `Score final ${params.score}, estado operacional ${params.state}.`,
      `Progresso médio atual: ${params.avgProgress}%.`,
      `Ações corretivas abertas: ${params.openCorrectives}.`,
    ]

    if (params.breakdown.length === 0) {
      lines.push('Nenhum fator de risco relevante foi identificado no cálculo atual.')
      return lines
    }

    for (const item of params.breakdown) {
      const sign = item.points >= 0 ? '+' : ''
      lines.push(`${item.label}: ${sign}${item.points} pontos.`)
    }

    return lines
  }
}

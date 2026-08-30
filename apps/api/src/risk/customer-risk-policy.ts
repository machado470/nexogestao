import { deriveOperationalStateFromRiskScore } from '../common/domain/operational-state-policy'

export type CustomerRiskContributor =
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

export type CustomerRiskBreakdown = {
  code: CustomerRiskContributor
  label: string
  description: string
  points: number
  value: number
  threshold?: number
}

export type CustomerRiskInput = {
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
  canonicalTimelineEvents: string[]
}

export const HIGH_OVERDUE_AMOUNT_CENTS = 100_000

export function evaluateCustomerOperationalRisk(input: CustomerRiskInput) {
  const criticalTimelineEventCount = input.canonicalTimelineEvents.filter(
    action =>
      [
        'APPOINTMENT_CANCELLED',
        'MESSAGE_FAILED',
        'OPERATIONAL_STATE_CHANGED',
      ].includes(String(action))
  ).length

  let score = 0
  const contributors: CustomerRiskContributor[] = []
  const breakdown: CustomerRiskBreakdown[] = []

  const addFactor = (factor: CustomerRiskBreakdown) => {
    score += factor.points
    contributors.push(factor.code)
    breakdown.push(factor)
  }

  if (input.overdueCharges > 0) {
    addFactor({
      code: 'OVERDUE_CHARGES',
      label: 'Cobranças vencidas',
      description: 'Cobranças vencidas do cliente elevam risco financeiro.',
      points: Math.min(
        60,
        50 + Math.max(0, input.overdueCharges - 1) * 5
      ),
      value: input.overdueCharges,
      threshold: 1,
    })
  }

  if (input.overdueAmountCents >= HIGH_OVERDUE_AMOUNT_CENTS) {
    addFactor({
      code: 'HIGH_OVERDUE_AMOUNT',
      label: 'Valor financeiro relevante em atraso',
      description:
        'O total vencido ultrapassou o limite operacional definido para restrição.',
      points: 25,
      value: input.overdueAmountCents,
      threshold: HIGH_OVERDUE_AMOUNT_CENTS,
    })
  }

  if (input.pendingChargesWithoutPayment > 0) {
    addFactor({
      code: 'PENDING_CHARGES_WITHOUT_PAYMENT',
      label: 'Cobranças pendentes sem pagamento',
      description:
        'Há cobranças pendentes sem nenhum pagamento registrado.',
      points: Math.min(20, input.pendingChargesWithoutPayment * 5),
      value: input.pendingChargesWithoutPayment,
      threshold: 1,
    })
  }

  if (input.recentPaymentsReceived > 0) {
    addFactor({
      code: 'RECENT_PAYMENTS_RECEIVED',
      label: 'Pagamentos recentes mitigam risco',
      description:
        'Pagamentos recebidos recentemente reduzem o risco financeiro.',
      points: -Math.min(20, input.recentPaymentsReceived * 5),
      value: input.recentPaymentsReceived,
      threshold: 1,
    })
  }

  if (input.overdueServiceOrders > 0) {
    addFactor({
      code: 'OVERDUE_SERVICE_ORDERS',
      label: 'Ordens de serviço atrasadas',
      description: 'Há O.S. abertas com prazo operacional vencido.',
      points: Math.min(
        60,
        50 + Math.max(0, input.overdueServiceOrders - 1) * 5
      ),
      value: input.overdueServiceOrders,
      threshold: 1,
    })
  }

  if (input.oldOpenServiceOrders > 0) {
    addFactor({
      code: 'OLD_OPEN_SERVICE_ORDERS',
      label: 'Ordens abertas há muito tempo',
      description:
        'Há O.S. abertas há mais tempo que a janela operacional esperada.',
      points: Math.min(20, input.oldOpenServiceOrders * 10),
      value: input.oldOpenServiceOrders,
      threshold: 1,
    })
  }

  if (input.completedServiceOrdersWithoutCharge > 0) {
    addFactor({
      code: 'COMPLETED_SERVICE_ORDERS_WITHOUT_CHARGE',
      label: 'O.S. concluídas sem cobrança',
      description: 'Há O.S. concluídas sem cobrança associada.',
      points: Math.min(
        20,
        input.completedServiceOrdersWithoutCharge * 10
      ),
      value: input.completedServiceOrdersWithoutCharge,
      threshold: 1,
    })
  }

  if (input.cancelledServiceOrders > 0) {
    addFactor({
      code: 'CANCELLED_SERVICE_ORDERS',
      label: 'O.S. canceladas recentemente',
      description:
        'Cancelamentos recentes de O.S. elevam risco operacional.',
      points: Math.min(15, input.cancelledServiceOrders * 5),
      value: input.cancelledServiceOrders,
      threshold: 1,
    })
  }

  if (input.stuckServiceOrderExecutions > 0) {
    addFactor({
      code: 'STUCK_SERVICE_ORDER_EXECUTION',
      label: 'Execução iniciada e não concluída',
      description:
        'Há O.S. em execução parada além da janela esperada.',
      points: Math.min(30, input.stuckServiceOrderExecutions * 20),
      value: input.stuckServiceOrderExecutions,
      threshold: 1,
    })
  }

  if (input.cancelledAppointments > 1) {
    addFactor({
      code: 'APPOINTMENT_CANCELLATIONS',
      label: 'Cancelamentos recorrentes de agendamento',
      description:
        'Cancelamentos recorrentes recentes impactam risco.',
      points: Math.min(
        50,
        40 + Math.max(0, input.cancelledAppointments - 2) * 5
      ),
      value: input.cancelledAppointments,
      threshold: 2,
    })
  }

  if (input.noShowAppointments > 0) {
    addFactor({
      code: 'APPOINTMENT_NO_SHOWS',
      label: 'No-show em agendamentos',
      description:
        'Há faltas registradas em agendamentos recentes.',
      points: Math.min(25, input.noShowAppointments * 15),
      value: input.noShowAppointments,
      threshold: 1,
    })
  }

  if (input.unconfirmedAppointments > 0) {
    addFactor({
      code: 'UNCONFIRMED_APPOINTMENTS',
      label: 'Agendamentos próximos sem confirmação',
      description:
        'Há agendamentos próximos ainda não confirmados.',
      points: Math.min(15, input.unconfirmedAppointments * 5),
      value: input.unconfirmedAppointments,
      threshold: 1,
    })
  }

  if (input.overdueAppointmentsWithoutExecution > 0) {
    addFactor({
      code: 'OVERDUE_APPOINTMENTS_WITHOUT_EXECUTION',
      label: 'Agendamentos vencidos sem execução',
      description:
        'Há agendamentos vencidos sem O.S. vinculada.',
      points: Math.min(
        25,
        input.overdueAppointmentsWithoutExecution * 15
      ),
      value: input.overdueAppointmentsWithoutExecution,
      threshold: 1,
    })
  }

  if (input.failedMessages > 0) {
    addFactor({
      code: 'MESSAGE_FAILURES',
      label: 'Falhas de WhatsApp',
      description:
        'Falhas MESSAGE_FAILED/mensagens FAILED foram registradas.',
      points: Math.min(
        60,
        50 + Math.max(0, input.failedMessages - 1) * 5
      ),
      value: input.failedMessages,
      threshold: 1,
    })
  }

  if (input.awaitingResponseConversations > 0) {
    addFactor({
      code: 'CUSTOMER_AWAITING_RESPONSE',
      label: 'Cliente sem resposta operacional',
      description:
        'Há conversa com SLA de resposta vencido para o cliente.',
      points: Math.min(
        15,
        input.awaitingResponseConversations * 10
      ),
      value: input.awaitingResponseConversations,
      threshold: 1,
    })
  }

  if (criticalTimelineEventCount > 0) {
    addFactor({
      code: 'CANONICAL_CRITICAL_TIMELINE_EVENTS',
      label: 'Eventos canônicos críticos na Timeline',
      description:
        'A Timeline contém eventos canônicos críticos aceitos pelo Risk Engine.',
      points: Math.min(20, criticalTimelineEventCount * 5),
      value: criticalTimelineEventCount,
      threshold: 1,
    })
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)))
  const state = deriveOperationalStateFromRiskScore(finalScore)

  const factors = {
    ...input,
    canonicalCriticalTimelineEvents: criticalTimelineEventCount,
  }

  const explanation = [
    `Score final ${finalScore}, estado operacional ${state}.`,
    ...breakdown.map(
      item =>
        `${item.label}: ${item.points >= 0 ? '+' : ''}${item.points} pontos.`
    ),
  ]

  if (breakdown.length === 0) {
    explanation.push(
      'Nenhum fator de risco relevante foi identificado no cálculo atual.'
    )
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

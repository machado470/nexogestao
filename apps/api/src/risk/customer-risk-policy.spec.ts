import { evaluateCustomerOperationalRisk } from './customer-risk-policy'

function baseInput() {
  return {
    overdueCharges: 0,
    overdueAmountCents: 0,
    pendingChargesWithoutPayment: 0,
    recentPaymentsReceived: 0,
    overdueServiceOrders: 0,
    oldOpenServiceOrders: 0,
    completedServiceOrdersWithoutCharge: 0,
    cancelledServiceOrders: 0,
    stuckServiceOrderExecutions: 0,
    cancelledAppointments: 0,
    noShowAppointments: 0,
    unconfirmedAppointments: 0,
    overdueAppointmentsWithoutExecution: 0,
    failedMessages: 0,
    awaitingResponseConversations: 0,
    canonicalTimelineEvents: [] as string[],
  }
}

describe('customer risk policy', () => {
  it('classifica cliente sem sinais como NORMAL', () => {
    const result = evaluateCustomerOperationalRisk(baseInput())

    expect(result.score).toBe(0)
    expect(result.state).toBe('NORMAL')
    expect(result.contributors).toEqual([])
  })

  it('classifica cobrança vencida pela política canônica', () => {
    const result = evaluateCustomerOperationalRisk({
      ...baseInput(),
      overdueCharges: 1,
    })

    expect(result.score).toBe(50)
    expect(result.state).toBe('WARNING')
    expect(result.contributors).toContain('OVERDUE_CHARGES')
  })

  it('eleva risco quando atraso financeiro tem valor relevante', () => {
    const result = evaluateCustomerOperationalRisk({
      ...baseInput(),
      overdueCharges: 1,
      overdueAmountCents: 100_000,
    })

    expect(result.score).toBe(75)
    expect(result.state).toBe('RESTRICTED')
    expect(result.contributors).toEqual(
      expect.arrayContaining([
        'OVERDUE_CHARGES',
        'HIGH_OVERDUE_AMOUNT',
      ])
    )
  })

  it('considera falhas canônicas da timeline', () => {
    const result = evaluateCustomerOperationalRisk({
      ...baseInput(),
      canonicalTimelineEvents: ['MESSAGE_FAILED'],
    })

    expect(result.score).toBe(5)
    expect(result.contributors).toContain(
      'CANONICAL_CRITICAL_TIMELINE_EVENTS'
    )
    expect(result.factors.canonicalCriticalTimelineEvents).toBe(1)
  })
})

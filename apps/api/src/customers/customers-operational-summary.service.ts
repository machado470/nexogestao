import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  evaluateCustomerOperationalRisk,
  type CustomerRiskInput,
} from '../risk/customer-risk-policy'
import {
  normalizeTimelineEventType,
  timelineEventFilterValues,
} from '../timeline/timeline-events'

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 30
const TIMELINE_WINDOW_DAYS = 90
const OLD_OPEN_SERVICE_ORDER_DAYS = 7
const STUCK_EXECUTION_DAYS = 2
const MAX_CUSTOMERS = 500

export type CustomerOperationalStatus =
  | 'NORMAL'
  | 'ATENÇÃO'
  | 'RISCO'
  | 'CRÍTICO'

export type CustomerOperationalPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CustomerRecommendedActionTarget =
  | 'FINANCES'
  | 'SERVICE_ORDERS'
  | 'APPOINTMENTS'
  | 'WHATSAPP'
  | null

type CustomerRiskResult = ReturnType<typeof evaluateCustomerOperationalRisk>

function createRiskInput(): CustomerRiskInput {
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
    canonicalTimelineEvents: [],
  }
}

function deriveOperationalStatus(
  risk: CustomerRiskResult,
): CustomerOperationalStatus {
  if (risk.state === 'SUSPENDED') return 'CRÍTICO'
  if (risk.state === 'RESTRICTED') return 'RISCO'
  if (risk.state === 'WARNING' || risk.contributors.length > 0) {
    return 'ATENÇÃO'
  }
  return 'NORMAL'
}

function derivePriority(
  risk: CustomerRiskResult,
): CustomerOperationalPriority {
  if (risk.state === 'SUSPENDED' || risk.state === 'RESTRICTED') return 'P0'
  if (risk.state === 'WARNING') return 'P1'
  if (risk.contributors.length > 0) return 'P2'
  return 'P3'
}

function deriveRecommendedAction(risk: CustomerRiskResult): {
  label: string | null
  target: CustomerRecommendedActionTarget
  reason: string | null
} {
  const contributors = new Set(risk.contributors)
  const firstReason =
    risk.breakdown[0]?.description ??
    risk.explanation[0] ??
    null

  if (
    contributors.has('OVERDUE_CHARGES') ||
    contributors.has('HIGH_OVERDUE_AMOUNT') ||
    contributors.has('PENDING_CHARGES_WITHOUT_PAYMENT')
  ) {
    return {
      label: 'Revisar cobrança',
      target: 'FINANCES',
      reason: firstReason,
    }
  }

  if (
    contributors.has('OVERDUE_SERVICE_ORDERS') ||
    contributors.has('OLD_OPEN_SERVICE_ORDERS') ||
    contributors.has('COMPLETED_SERVICE_ORDERS_WITHOUT_CHARGE') ||
    contributors.has('CANCELLED_SERVICE_ORDERS') ||
    contributors.has('STUCK_SERVICE_ORDER_EXECUTION')
  ) {
    return {
      label: 'Revisar ordens de serviço',
      target: 'SERVICE_ORDERS',
      reason: firstReason,
    }
  }

  if (
    contributors.has('UNCONFIRMED_APPOINTMENTS') ||
    contributors.has('OVERDUE_APPOINTMENTS_WITHOUT_EXECUTION') ||
    contributors.has('APPOINTMENT_NO_SHOWS') ||
    contributors.has('APPOINTMENT_CANCELLATIONS')
  ) {
    return {
      label: 'Revisar agenda',
      target: 'APPOINTMENTS',
      reason: firstReason,
    }
  }

  if (
    contributors.has('MESSAGE_FAILURES') ||
    contributors.has('CUSTOMER_AWAITING_RESPONSE')
  ) {
    return {
      label: 'Revisar atendimento',
      target: 'WHATSAPP',
      reason: firstReason,
    }
  }

  if (risk.contributors.length > 0) {
    return {
      label: 'Revisar cliente',
      target: null,
      reason: firstReason,
    }
  }

  return {
    label: null,
    target: null,
    reason: null,
  }
}

function highestPortfolioStatus(
  statuses: CustomerOperationalStatus[],
): CustomerOperationalStatus {
  if (statuses.includes('CRÍTICO')) return 'CRÍTICO'
  if (statuses.includes('RISCO')) return 'RISCO'
  if (statuses.includes('ATENÇÃO')) return 'ATENÇÃO'
  return 'NORMAL'
}

@Injectable()
export class CustomersOperationalSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(orgId: string, now = new Date()) {
    const recentSince = new Date(
      now.getTime() - RECENT_WINDOW_DAYS * DAY_MS,
    )
    const timelineSince = new Date(
      now.getTime() - TIMELINE_WINDOW_DAYS * DAY_MS,
    )
    const oldOpenBefore = new Date(
      now.getTime() - OLD_OPEN_SERVICE_ORDER_DAYS * DAY_MS,
    )
    const stuckExecutionBefore = new Date(
      now.getTime() - STUCK_EXECUTION_DAYS * DAY_MS,
    )
    const tomorrowEnd = new Date(now.getTime() + DAY_MS)

    const customers = await this.prisma.customer.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_CUSTOMERS,
    })

    const customerIds = customers.map((customer) => customer.id)
    const evaluatedAt = now.toISOString()

    if (customerIds.length === 0) {
      return {
        evaluatedAt,
        portfolio: {
          operationalStatus: 'NORMAL' as const,
          totalCustomers: 0,
          normalCustomers: 0,
          attentionCustomers: 0,
          riskCustomers: 0,
          criticalCustomers: 0,
        },
        customers: [],
      }
    }

    const [
      charges,
      recentPayments,
      serviceOrders,
      appointments,
      failedMessages,
      waitingConversations,
      timelineEvents,
    ] = await Promise.all([
      this.prisma.charge.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          amountCents: true,
          payments: {
            select: { id: true },
          },
        },
      }),

      this.prisma.payment.findMany({
        where: {
          orgId,
          paidAt: { gte: recentSince },
          charge: {
            orgId,
            customerId: { in: customerIds },
          },
        },
        select: {
          paidAt: true,
          charge: {
            select: { customerId: true },
          },
        },
      }),

      this.prisma.serviceOrder.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          startedAt: true,
          finishedAt: true,
          charges: {
            select: { id: true },
          },
        },
      }),

      this.prisma.appointment.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          startsAt: true,
          createdAt: true,
          updatedAt: true,
          serviceOrder: {
            select: { id: true },
          },
        },
      }),

      this.prisma.whatsAppMessage.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
          status: 'FAILED',
        },
        select: {
          customerId: true,
        },
      }),

      this.prisma.whatsAppConversation.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
          status: 'WAITING_OPERATOR',
          responseDueAt: { lt: now },
        },
        select: {
          customerId: true,
        },
      }),

      this.prisma.timelineEvent.findMany({
        where: {
          orgId,
          customerId: { in: customerIds },
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
        select: {
          customerId: true,
          action: true,
          createdAt: true,
        },
      }),
    ])

    const signals = new Map<string, CustomerRiskInput>(
      customerIds.map((id) => [id, createRiskInput()]),
    )

    for (const charge of charges) {
      const customerId = charge.customerId
      if (!customerId) continue

      const current = signals.get(customerId)
      if (!current) continue

      if (charge.status === 'OVERDUE') {
        current.overdueCharges += 1
        current.overdueAmountCents += charge.amountCents
      }

      if (
        charge.status === 'PENDING' &&
        charge.payments.length === 0
      ) {
        current.pendingChargesWithoutPayment += 1
      }
    }

    for (const payment of recentPayments) {
      const customerId = payment.charge.customerId
      if (!customerId) continue
      const current = signals.get(customerId)
      if (current) current.recentPaymentsReceived += 1
    }

    const activeServiceOrderStatuses = new Set([
      'OPEN',
      'ASSIGNED',
      'IN_PROGRESS',
    ])

    for (const order of serviceOrders) {
      const customerId = order.customerId
      if (!customerId) continue

      const current = signals.get(customerId)
      if (!current) continue

      const status = String(order.status)
      const active = activeServiceOrderStatuses.has(status)

      if (
        active &&
        order.dueDate &&
        order.dueDate.getTime() < now.getTime()
      ) {
        current.overdueServiceOrders += 1
      }

      if (
        active &&
        order.createdAt.getTime() < oldOpenBefore.getTime()
      ) {
        current.oldOpenServiceOrders += 1
      }

      if (status === 'DONE' && order.charges.length === 0) {
        current.completedServiceOrdersWithoutCharge += 1
      }

      if (
        status === 'CANCELED' &&
        order.updatedAt.getTime() >= recentSince.getTime()
      ) {
        current.cancelledServiceOrders += 1
      }

      if (
        status === 'IN_PROGRESS' &&
        order.startedAt &&
        order.startedAt.getTime() < stuckExecutionBefore.getTime() &&
        !order.finishedAt
      ) {
        current.stuckServiceOrderExecutions += 1
      }
    }

    for (const appointment of appointments) {
      const customerId = appointment.customerId
      if (!customerId) continue

      const current = signals.get(customerId)
      if (!current) continue

      const status = String(appointment.status)

      if (
        status === 'CANCELED' &&
        appointment.startsAt.getTime() >= recentSince.getTime()
      ) {
        current.cancelledAppointments += 1
      }

      if (
        status === 'NO_SHOW' &&
        appointment.startsAt.getTime() >= recentSince.getTime()
      ) {
        current.noShowAppointments += 1
      }

      if (
        status === 'SCHEDULED' &&
        appointment.startsAt.getTime() >= now.getTime() &&
        appointment.startsAt.getTime() <= tomorrowEnd.getTime()
      ) {
        current.unconfirmedAppointments += 1
      }

      if (
        status === 'SCHEDULED' &&
        appointment.startsAt.getTime() < now.getTime() &&
        !appointment.serviceOrder
      ) {
        current.overdueAppointmentsWithoutExecution += 1
      }
    }

    for (const message of failedMessages) {
      if (!message.customerId) continue
      const current = signals.get(message.customerId)
      if (current) current.failedMessages += 1
    }

    for (const conversation of waitingConversations) {
      if (!conversation.customerId) continue
      const current = signals.get(conversation.customerId)
      if (current) current.awaitingResponseConversations += 1
    }

    for (const event of timelineEvents) {
      if (!event.customerId) continue
      const current = signals.get(event.customerId)
      if (!current) continue

      const normalized = normalizeTimelineEventType(event.action)
      if (normalized) {
        current.canonicalTimelineEvents.push(String(normalized))
      }
    }

    const summaries = customers.map((customer) => {
      const risk = evaluateCustomerOperationalRisk(
        signals.get(customer.id) ?? createRiskInput(),
      )
      const operationalStatus = deriveOperationalStatus(risk)
      const priority = derivePriority(risk)
      const action = deriveRecommendedAction(risk)

      return {
        customerId: customer.id,
        customerName: customer.name,
        active: customer.active,
        operationalStatus,
        priority,
        riskScore: risk.score,
        riskState: risk.state,
        riskSignal:
          risk.breakdown[0]?.label ??
          'Sem bloqueio operacional detectado',
        interventionReason: action.reason,
        recommendedActionLabel: action.label,
        recommendedActionTarget: action.target,
        contributors: risk.contributors,
        breakdown: risk.breakdown,
        factors: risk.factors,
        explanation: risk.explanation,
        evaluatedAt,
      }
    })

    const statuses = summaries.map(
      (summary) => summary.operationalStatus,
    )

    return {
      evaluatedAt,
      portfolio: {
        operationalStatus: highestPortfolioStatus(statuses),
        totalCustomers: summaries.length,
        normalCustomers: summaries.filter(
          (item) => item.operationalStatus === 'NORMAL',
        ).length,
        attentionCustomers: summaries.filter(
          (item) => item.operationalStatus === 'ATENÇÃO',
        ).length,
        riskCustomers: summaries.filter(
          (item) => item.operationalStatus === 'RISCO',
        ).length,
        criticalCustomers: summaries.filter(
          (item) => item.operationalStatus === 'CRÍTICO',
        ).length,
      },
      customers: summaries,
    }
  }
}

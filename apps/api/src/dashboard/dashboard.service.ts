import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MemoryCacheService } from '../common/cache/memory-cache.service'
import { GovernanceReadService } from '../governance/governance-read.service'
import type { ExecutivePipelineContract, ExecutivePipelineStage } from './executive-pipeline.contract'

const CACHE_TTL_METRICS = 300_000 // 5 minutos
const CACHE_TTL_CHARTS = 900_000 // 15 minutos

function calculatePercentageChange(current: number, previous: number) {
  if (previous === 0) return null

  return Number((((current - previous) / previous) * 100).toFixed(1))
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MemoryCacheService,
    private readonly governanceRead: GovernanceReadService,
  ) {}

  /**
   * Returns facts and decisions separately. Entity records provide authoritative
   * volumes, but the domain currently has no policy that classifies the health
   * of an aggregate pipeline stage. Consequently every decision is explicitly
   * unavailable instead of being reconstructed from counts or entity statuses.
   */
  async getExecutivePipeline(orgId: string): Promise<ExecutivePipelineContract> {
    const [customers, appointments, serviceOrders, charges, payments] = await Promise.all([
      this.prisma.customer.aggregate({
        where: { orgId, active: true },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.appointment.aggregate({
        where: { orgId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.serviceOrder.aggregate({
        where: { orgId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.charge.aggregate({
        where: { orgId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.payment.aggregate({
        where: { orgId },
        _count: { _all: true },
        _max: { paidAt: true },
      }),
    ])

    const unavailableReason =
      'Não existe política canônica para classificar o estado agregado desta etapa; o volume factual não determina normalidade, risco, bloqueio ou conclusão.'
    const stage = (
      input: Omit<ExecutivePipelineStage, 'state' | 'reason'>,
    ): ExecutivePipelineStage => ({ ...input, state: 'unavailable', reason: unavailableReason })
    const timestamp = (value: Date | null) => value?.toISOString() ?? null

    return {
      generatedAt: new Date().toISOString(),
      stages: [
        stage({ key: 'customers', label: 'Cliente', volume: customers._count._all, evidence: { source: 'CUSTOMER', description: 'Clientes ativos armazenados para o tenant autenticado.' }, referenceTimestamp: timestamp(customers._max.updatedAt), navigationTarget: '/customers' }),
        stage({ key: 'appointments', label: 'Agendamento', volume: appointments._count._all, evidence: { source: 'APPOINTMENT', description: 'Agendamentos armazenados para o tenant autenticado.' }, referenceTimestamp: timestamp(appointments._max.updatedAt), navigationTarget: '/appointments' }),
        stage({ key: 'service-orders', label: 'O.S.', volume: serviceOrders._count._all, evidence: { source: 'SERVICE_ORDER', description: 'Ordens de serviço armazenadas para o tenant autenticado.' }, referenceTimestamp: timestamp(serviceOrders._max.updatedAt), navigationTarget: '/service-orders' }),
        stage({ key: 'charges', label: 'Cobrança', volume: charges._count._all, evidence: { source: 'CHARGE', description: 'Cobranças armazenadas para o tenant autenticado.' }, referenceTimestamp: timestamp(charges._max.updatedAt), navigationTarget: '/finances?view=charges' }),
        stage({ key: 'payments', label: 'Pagamento', volume: payments._count._all, evidence: { source: 'PAYMENT', description: 'Pagamentos armazenados para o tenant autenticado.' }, referenceTimestamp: timestamp(payments._max.paidAt), navigationTarget: '/finances?view=paid' }),
      ],
    }
  }

  async getMetrics(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:metrics:${orgId}`,
      () => this.fetchMetrics(orgId),
      CACHE_TTL_METRICS,
    )
  }

  private async fetchMetrics(orgId: string) {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfPreviousWeek = new Date(startOfWeek)
    startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7)
    const endOfPreviousComparablePeriod = new Date(now)
    endOfPreviousComparablePeriod.setDate(endOfPreviousComparablePeriod.getDate() - 7)
    const currentPeriod = { gte: startOfWeek, lte: now }
    const previousPeriod = {
      gte: startOfPreviousWeek,
      lte: endOfPreviousComparablePeriod,
    }

    // Executa as consultas em lotes menores para não sobrecarregar a conexão com o banco
    const batch1 = await Promise.all([
      this.prisma.customer.count({ where: { orgId, active: true } }),
      this.prisma.customer.count({ where: { orgId } }),
      this.prisma.serviceOrder.count({ where: { orgId } }),
      this.prisma.serviceOrder.count({
        where: { orgId, status: { in: ['OPEN', 'ASSIGNED'] } },
      }),
      this.prisma.serviceOrder.count({
        where: {
          orgId,
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.payment.aggregate({
        where: { orgId, paidAt: currentPeriod },
        _sum: { amountCents: true },
      }),
    ])

    const batch2 = await Promise.all([
      this.prisma.charge.aggregate({
        where: { orgId, status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { amountCents: true },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, status: 'IN_PROGRESS' },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, status: 'DONE' },
      }),
      this.prisma.correctiveAction.count({
        where: { person: { orgId }, status: 'OPEN' },
      }),
      this.prisma.charge.count({ where: { orgId } }),
    ])

    const batch3 = await Promise.all([
      this.prisma.charge.aggregate({
        where: { orgId },
        _sum: { amountCents: true },
      }),
      this.prisma.charge.aggregate({
        where: { orgId, status: 'PAID' },
        _sum: { amountCents: true },
      }),
      this.governanceRead.getAutoScore(orgId),
      this.prisma.whatsAppMessage.count({ where: { orgId, status: 'FAILED' } }),
      this.prisma.whatsAppConversation.count({ where: { orgId, status: 'WAITING_OPERATOR' } }),
      this.prisma.charge.count({ where: { orgId, status: 'OVERDUE' } }),
    ])

    const comparisonBatch = await Promise.all([
      this.prisma.payment.count({ where: { orgId, paidAt: currentPeriod } }),
      this.prisma.payment.aggregate({
        where: { orgId, paidAt: previousPeriod },
        _sum: { amountCents: true },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, status: 'DONE', finishedAt: currentPeriod },
      }),
      this.prisma.serviceOrder.count({
        where: { orgId, status: 'DONE', finishedAt: previousPeriod },
      }),
      this.prisma.charge.count({
        where: {
          orgId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: currentPeriod,
        },
      }),
      this.prisma.charge.count({
        where: {
          orgId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: previousPeriod,
        },
      }),
      this.prisma.whatsAppMessage.count({
        where: { orgId, status: 'FAILED', failedAt: currentPeriod },
      }),
      this.prisma.whatsAppMessage.count({
        where: { orgId, status: 'FAILED', failedAt: previousPeriod },
      }),
    ])

    const [totalCustomers, createdCustomers, totalServiceOrders, openServiceOrders, overdueServiceOrders, weeklyRevenueAgg] = batch1
    const [pendingPaymentsAgg, inProgressOrders, completedOrders, riskTickets, chargesGenerated] = batch2
    const [totalRevenue, paidRevenue, autoScore, failedMessagesCount, customersNoResponseCount, ignoredChargesCount] = batch3
    const [paymentsReceivedCount, previousRevenueAgg, currentCompletedOrders, previousCompletedOrders, currentOverdueCharges, previousOverdueCharges, currentFailedMessages, previousFailedMessages] = comparisonBatch

    // Reutiliza valores já calculados para evitar redundância
    const delayedOrders = overdueServiceOrders
    const pendingRevenue = pendingPaymentsAgg

    return {
      totalCustomers,
      createdCustomers,
      totalServiceOrders,
      openServiceOrders,
      overdueServiceOrders,
      weeklyRevenueInCents: weeklyRevenueAgg._sum.amountCents ?? 0,
      paymentsReceivedCount,
      comparison: {
        revenueReceivedPct: calculatePercentageChange(
          weeklyRevenueAgg._sum.amountCents ?? 0,
          previousRevenueAgg._sum.amountCents ?? 0,
        ),
        completedServiceOrdersPct: calculatePercentageChange(
          currentCompletedOrders,
          previousCompletedOrders,
        ),
        overdueChargesPct: calculatePercentageChange(
          currentOverdueCharges,
          previousOverdueCharges,
        ),
        failedMessagesPct: calculatePercentageChange(
          currentFailedMessages,
          previousFailedMessages,
        ),
      },
      pendingPaymentsInCents: pendingPaymentsAgg._sum.amountCents ?? 0,
      inProgressOrders,
      completedOrders,
      completedServices: completedOrders,
      chargesGenerated,
      delayedOrders,
      riskTickets,
      totalRevenueInCents: totalRevenue._sum.amountCents ?? 0,
      paidRevenueInCents: paidRevenue._sum.amountCents ?? 0,
      pendingRevenueInCents: pendingRevenue._sum.amountCents ?? 0,
      governance: autoScore,
      whatsappSignals: {
        failedMessages: failedMessagesCount,
        customersNoResponse: customersNoResponseCount,
        ignoredCharges: ignoredChargesCount,
      },
    }
  }

  async getAlerts(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:alerts:${orgId}`,
      () => this.fetchAlerts(orgId),
      CACHE_TTL_METRICS,
    )
  }

  private async fetchAlerts(orgId: string) {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const unconfirmedAppointmentWindowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    const [
      overdueOrders,
      overdueCharges,
      todayAppointments,
      customersWithPending,
      doneOrdersWithoutCharge,
      failedMessages,
      awaitingResponseConversations,
      unconfirmedAppointments,
    ] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where: {
          orgId,
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      this.prisma.charge.findMany({
        where: {
          orgId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          amountCents: true,
          dueDate: true,
          status: true,
          customer: { select: { id: true, name: true } },
          serviceOrderId: true,
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      this.prisma.appointment.findMany({
        where: {
          orgId,
          startsAt: { gte: todayStart, lte: todayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          status: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 10,
      }),
      this.prisma.customer.findMany({
        where: {
          orgId,
          active: true,
          charges: {
            some: {
              status: { in: ['PENDING', 'OVERDUE'] },
            },
          },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          charges: {
            where: { status: { in: ['PENDING', 'OVERDUE'] } },
            select: { amountCents: true, dueDate: true, status: true },
          },
        },
        take: 10,
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          orgId,
          status: 'DONE',
          charges: {
            none: {},
          },
        },
        select: {
          id: true,
          title: true,
          amountCents: true,
          scheduledFor: true,
          finishedAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.whatsAppMessage.findMany({
        where: { orgId, status: 'FAILED' },
        select: {
          id: true,
          errorMessage: true,
          failedAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ failedAt: 'desc' }, { createdAt: 'desc' }],
        take: 2,
      }),
      this.prisma.whatsAppConversation.findMany({
        where: { orgId, status: 'WAITING_OPERATOR' },
        select: {
          id: true,
          title: true,
          phone: true,
          waitingSince: true,
          lastInboundAt: true,
          lastMessageAt: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: [
          { waitingSince: 'asc' },
          { lastInboundAt: 'asc' },
          { lastMessageAt: 'asc' },
        ],
        take: 6,
      }),
      this.prisma.appointment.findMany({
        where: {
          orgId,
          status: 'SCHEDULED',
          startsAt: { gte: now, lte: unconfirmedAppointmentWindowEnd },
        },
        select: {
          id: true,
          startsAt: true,
          notes: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 6,
      }),
    ])

    const operationalQueue = [
      ...overdueOrders.slice(0, 2).map((order) => ({
        id: order.id,
        type: 'OVERDUE_SERVICE_ORDER',
        title: order.title,
        context: 'Prazo operacional vencido',
        serviceOrderId: order.id,
      })),
      ...overdueCharges.slice(0, 2).map((charge) => ({
        id: charge.id,
        type: 'OVERDUE_CHARGE',
        title: charge.customer.name,
        context: `${charge.amountCents} centavos pendentes`,
        chargeId: charge.id,
        amountCents: charge.amountCents,
      })),
      ...failedMessages.slice(0, 2).map((message) => ({
        id: message.id,
        type: 'FAILED_MESSAGE',
        title: message.customer?.name ?? 'Mensagem WhatsApp',
        context: message.errorMessage ?? 'Falha retornada pelo backend',
        messageId: message.id,
      })),
      ...awaitingResponseConversations.slice(0, 2).map((conversation) => ({
        id: conversation.id,
        type: 'CUSTOMER_AWAITING_RESPONSE',
        title:
          conversation.customer?.name ||
          conversation.title?.trim() ||
          conversation.phone,
        context: 'Conversa aguardando resposta da operação',
        customerId: conversation.customer?.id,
        conversationId: conversation.id,
        lastMessageAt: conversation.lastMessageAt,
      })),
      ...unconfirmedAppointments.slice(0, 2).map((appointment) => ({
        id: appointment.id,
        type: 'UNCONFIRMED_APPOINTMENT',
        title:
          appointment.notes?.trim() ||
          `Agendamento com ${appointment.customer.name}`,
        context: 'Confirmação pendente nas próximas 48 horas',
        appointmentId: appointment.id,
        customerId: appointment.customer.id,
        startsAt: appointment.startsAt,
      })),
    ].slice(0, 6)

    return {
      operationalQueue,
      overdueOrders: {
        count: overdueOrders.length,
        items: overdueOrders,
      },
      overdueCharges: {
        count: overdueCharges.length,
        totalAmountCents: overdueCharges.reduce(
          (sum, c) => sum + (c.amountCents ?? 0),
          0,
        ),
        items: overdueCharges,
      },
      todayServices: {
        count: todayAppointments.length,
        items: todayAppointments.map((appointment) => ({
          id: appointment.id,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          status: appointment.status,
          notes: appointment.notes,
          customer: appointment.customer,
          label:
            appointment.notes?.trim() ||
            `Agendamento com ${appointment.customer.name}`,
        })),
      },
      customersWithPending: {
        count: customersWithPending.length,
        items: customersWithPending.map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          pendingCharges: customer.charges.length,
          totalPendingCents: customer.charges.reduce(
            (sum, charge) => sum + (charge.amountCents ?? 0),
            0,
          ),
        })),
      },
      doneOrdersWithoutCharge: {
        count: doneOrdersWithoutCharge.length,
        totalAmountCents: doneOrdersWithoutCharge.reduce(
          (sum, order) => sum + (order.amountCents ?? 0),
          0,
        ),
        items: doneOrdersWithoutCharge.map((order) => {
          const referenceDate = order.finishedAt ?? order.createdAt
          const diffMs = now.getTime() - referenceDate.getTime()
          const daysWithoutCharge = Math.max(
            0,
            Math.floor(diffMs / (1000 * 60 * 60 * 24)),
          )

          return {
            id: order.id,
            title: order.title,
            amountCents: order.amountCents ?? 0,
            scheduledFor: order.scheduledFor,
            finishedAt: order.finishedAt,
            createdAt: order.createdAt,
            daysWithoutCharge,
            customer: order.customer,
          }
        }),
      },
    }
  }

  async getRevenueData(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:revenue:${orgId}`,
      () => this.fetchRevenueData(orgId),
      CACHE_TTL_CHARTS,
    )
  }

  private async fetchRevenueData(orgId: string) {
    const now = new Date()
    const months: Array<{ month: string; date: Date; revenue: number }> = []

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const month = date.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
      })
      months.push({ month, date, revenue: 0 })
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        orgId,
        createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
      },
      select: { amountCents: true, createdAt: true },
    })

    for (const payment of payments) {
      const paymentMonth = new Date(
        payment.createdAt.getFullYear(),
        payment.createdAt.getMonth(),
        1,
      )

      const monthIndex = months.findIndex(
        entry =>
          entry.date.getFullYear() === paymentMonth.getFullYear() &&
          entry.date.getMonth() === paymentMonth.getMonth(),
      )

      if (monthIndex !== -1) {
        months[monthIndex].revenue += payment.amountCents
      }
    }

    return months.map(entry => ({
      month: entry.month,
      revenue: entry.revenue / 100,
    }))
  }

  async getCustomerGrowth(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:growth:${orgId}`,
      () => this.fetchCustomerGrowth(orgId),
      CACHE_TTL_CHARTS,
    )
  }

  private async fetchCustomerGrowth(orgId: string) {
    const now = new Date()
    const months: Array<{
      month: string
      date: Date
      newCustomers: number
      totalCustomers: number
    }> = []

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const month = date.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
      })
      months.push({ month, date, newCustomers: 0, totalCustomers: 0 })
    }

    const customers = await this.prisma.customer.findMany({
      where: {
        orgId,
        createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    for (const customer of customers) {
      const customerMonth = new Date(
        customer.createdAt.getFullYear(),
        customer.createdAt.getMonth(),
        1,
      )

      const monthIndex = months.findIndex(
        entry =>
          entry.date.getFullYear() === customerMonth.getFullYear() &&
          entry.date.getMonth() === customerMonth.getMonth(),
      )

      if (monthIndex !== -1) {
        months[monthIndex].newCustomers += 1
      }
    }

    let cumulative = 0

    for (const month of months) {
      cumulative += month.newCustomers
      month.totalCustomers = cumulative
    }

    return months.map(month => ({
      month: month.month,
      newCustomers: month.newCustomers,
      totalCustomers: month.totalCustomers,
    }))
  }

  async getServiceOrdersStatus(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:so-status:${orgId}`,
      () => this.fetchServiceOrdersStatus(orgId),
      CACHE_TTL_METRICS,
    )
  }

  private async fetchServiceOrdersStatus(orgId: string) {
    const [open, assigned, inProgress, completed, cancelled] = await Promise.all([
      this.prisma.serviceOrder.count({ where: { orgId, status: 'OPEN' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: 'ASSIGNED' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: 'IN_PROGRESS' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: 'DONE' } }),
      this.prisma.serviceOrder.count({ where: { orgId, status: 'CANCELED' } }),
    ])

    return {
      open,
      assigned,
      inProgress,
      completed,
      cancelled,
    }
  }

  async getChargesStatus(orgId: string) {
    return this.cache.getOrSet(
      `dashboard:charges-status:${orgId}`,
      () => this.fetchChargesStatus(orgId),
      CACHE_TTL_METRICS,
    )
  }

  private async fetchChargesStatus(orgId: string) {
    const [pending, paid, overdue, cancelled] = await Promise.all([
      this.prisma.charge.count({ where: { orgId, status: 'PENDING' } }),
      this.prisma.charge.count({ where: { orgId, status: 'PAID' } }),
      this.prisma.charge.count({ where: { orgId, status: 'OVERDUE' } }),
      this.prisma.charge.count({ where: { orgId, status: 'CANCELED' } }),
    ])

    return {
      pending,
      paid,
      overdue,
      cancelled,
    }
  }

  invalidateCache(orgId: string): void {
    this.cache.deleteByPrefix(`dashboard:metrics:${orgId}`)
    this.cache.deleteByPrefix(`dashboard:alerts:${orgId}`)
    this.cache.deleteByPrefix(`dashboard:revenue:${orgId}`)
    this.cache.deleteByPrefix(`dashboard:growth:${orgId}`)
    this.cache.deleteByPrefix(`dashboard:so-status:${orgId}`)
    this.cache.deleteByPrefix(`dashboard:charges-status:${orgId}`)
  }
}

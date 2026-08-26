import { Injectable, Logger, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SubscriptionStatus } from '@prisma/client'

export interface QuotaLimits {
  customers: number
  appointments: number
  messages: number
  serviceOrders: number
  users: number
  storage: number
}

export const PLAN_LIMITS: Record<string, QuotaLimits> = {
  FREE: {
    customers: 5,
    appointments: 20,
    messages: 50,
    serviceOrders: 10,
    users: 2,
    storage: 100,
  },
  STARTER: {
    customers: 30,
    appointments: 200,
    messages: 500,
    serviceOrders: 100,
    users: 5,
    storage: 500,
  },
  PRO: {
    customers: 100,
    appointments: 2000,
    messages: 5000,
    serviceOrders: 1000,
    users: 10,
    storage: 5000,
  },
  BUSINESS: {
    customers: 999999,
    appointments: 999999,
    messages: 999999,
    serviceOrders: 999999,
    users: 999999,
    storage: 999999,
  },
}

@Injectable()
export class QuotasService {
  private readonly logger = new Logger(QuotasService.name)

  constructor(private prisma: PrismaService) {}

  private normalizePlan(plan: string): string {
    if (plan === 'SCALE') return 'BUSINESS'
    return plan
  }

  async getOrgPlan(orgId: string): Promise<string> {
    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { orgId },
        include: { plan: true },
      })

      if (!subscription) return 'FREE'

      if (subscription.status === SubscriptionStatus.CANCELED) {
        return 'FREE'
      }

      if (
        subscription.status === SubscriptionStatus.TRIALING &&
        subscription.currentPeriodEnd < new Date()
      ) {
        return 'FREE'
      }

      return this.normalizePlan(subscription.plan.name)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'erro desconhecido'

      this.logger.warn(
        `Erro ao obter plano da org ${orgId}: ${message} — usando FREE`,
      )

      return 'FREE'
    }
  }

  getQuotaLimits(plan: string): QuotaLimits {
    const normalizedPlan = this.normalizePlan(plan)
    return PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS['FREE']
  }

  async canCreateCustomer(orgId: string): Promise<boolean> {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    if (limits.customers >= 999999) return true

    const count = await this.prisma.customer.count({ where: { orgId } })

    return count < limits.customers
  }

  async canCreateAppointment(orgId: string): Promise<boolean> {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    if (limits.appointments >= 999999) return true

    const count = await this.prisma.appointment.count({
      where: { orgId },
    })

    return count < limits.appointments
  }

  async canCreateServiceOrder(orgId: string): Promise<boolean> {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    if (limits.serviceOrders >= 999999) return true

    const count = await this.prisma.serviceOrder.count({
      where: { orgId },
    })

    return count < limits.serviceOrders
  }

  async canSendMessage(orgId: string): Promise<boolean> {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    if (limits.messages >= 999999) return true

    const count = await this.prisma.whatsAppMessage.count({
      where: { orgId },
    })

    return count < limits.messages
  }

  async canAddStaffMember(orgId: string): Promise<boolean> {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    if (limits.users >= 999999) return true

    const count = await this.prisma.user.count({
      where: { orgId },
    })

    return count < limits.users
  }

  async getQuotaUsage(orgId: string) {
    const plan = await this.getOrgPlan(orgId)
    const limits = this.getQuotaLimits(plan)

    const [
      customerCount,
      appointmentCount,
      messageCount,
      serviceOrderCount,
      userCount,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { orgId } }),
      this.prisma.appointment.count({ where: { orgId } }),
      this.prisma.whatsAppMessage.count({ where: { orgId } }),
      this.prisma.serviceOrder.count({ where: { orgId } }),
      this.prisma.user.count({ where: { orgId } }),
    ])

    const pct = (used: number, limit: number) =>
      limit >= 999999 ? 0 : Math.min(100, Math.round((used / limit) * 100))

    const trialEndsAt = await this.prisma.subscription.findUnique({
      where: { orgId },
      select: {
        status: true,
        currentPeriodEnd: true,
      },
    })

    return {
      plan,
      trial:
        trialEndsAt?.status === SubscriptionStatus.TRIALING
          ? {
              isTrial: true,
              endsAt: trialEndsAt.currentPeriodEnd,
            }
          : { isTrial: false, endsAt: null },
      limits,
      usage: {
        customers: {
          used: customerCount,
          limit: limits.customers,
          percentage: pct(customerCount, limits.customers),
          unlimited: limits.customers >= 999999,
        },
        appointments: {
          used: appointmentCount,
          limit: limits.appointments,
          percentage: pct(appointmentCount, limits.appointments),
          unlimited: limits.appointments >= 999999,
        },
        messages: {
          used: messageCount,
          limit: limits.messages,
          percentage: pct(messageCount, limits.messages),
          unlimited: limits.messages >= 999999,
        },
        serviceOrders: {
          used: serviceOrderCount,
          limit: limits.serviceOrders,
          percentage: pct(serviceOrderCount, limits.serviceOrders),
          unlimited: limits.serviceOrders >= 999999,
        },
        users: {
          used: userCount,
          limit: limits.users,
          percentage: pct(userCount, limits.users),
          unlimited: limits.users >= 999999,
        },
      },
    }
  }

  async validateQuota(
    orgId: string,
    action:
      | 'CREATE_CUSTOMER'
      | 'CREATE_APPOINTMENT'
      | 'SEND_MESSAGE'
      | 'CREATE_SERVICE_ORDER'
      | 'ADD_STAFF_MEMBER',
  ): Promise<void> {
    const plan = await this.getOrgPlan(orgId)

    let canProceed = false
    let resourceName = ''

    switch (action) {
      case 'CREATE_CUSTOMER':
        canProceed = await this.canCreateCustomer(orgId)
        resourceName = 'cliente'
        break

      case 'CREATE_APPOINTMENT':
        canProceed = await this.canCreateAppointment(orgId)
        resourceName = 'agendamento'
        break

      case 'SEND_MESSAGE':
        canProceed = await this.canSendMessage(orgId)
        resourceName = 'mensagem'
        break

      case 'CREATE_SERVICE_ORDER':
        canProceed = await this.canCreateServiceOrder(orgId)
        resourceName = 'ordem de serviço'
        break

      case 'ADD_STAFF_MEMBER':
        canProceed = await this.canAddStaffMember(orgId)
        resourceName = 'membro da equipe'
        break
    }

    if (!canProceed) {
      this.logger.warn(
        `Quota excedida: ${action} | org=${orgId} | plano=${plan}`,
      )

      throw new ForbiddenException(
        `Limite de ${resourceName}s atingido para o plano ${plan}. ` +
          `Faça upgrade para continuar em /billing/plans.`,
      )
    }
  }
}

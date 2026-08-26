import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import {
  PlanName,
  SubscriptionStatus,
  BillingEventType,
  BillingEventStatus,
  BillingProvider,
  Prisma,
} from '@prisma/client'
import Stripe from 'stripe'
import { QuotasService } from '../quotas/quotas.service'

export const PLAN_LIMITS: Record<
  string,
  {
    customers: number
    users: number
    serviceOrders: number
    appointments: number
    messages: number
    label: string
  }
> = {
  FREE: {
    customers: 5,
    users: 2,
    serviceOrders: 10,
    appointments: 20,
    messages: 50,
    label: 'Free',
  },
  STARTER: {
    customers: 30,
    users: 5,
    serviceOrders: 100,
    appointments: 200,
    messages: 500,
    label: 'Starter',
  },
  PRO: {
    customers: 100,
    users: 10,
    serviceOrders: 1000,
    appointments: 2000,
    messages: 5000,
    label: 'Pro',
  },
  SCALE: {
    customers: 999999,
    users: 999999,
    serviceOrders: 999999,
    appointments: 999999,
    messages: 999999,
    label: 'Scale',
  },
  BUSINESS: {
    customers: 999999,
    users: 999999,
    serviceOrders: 999999,
    appointments: 999999,
    messages: 999999,
    label: 'Scale',
  },
}

@Injectable()
export class BillingService {

  private readonly logger = new Logger(BillingService.name)
  private stripe: Stripe | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly quotasService: QuotasService,
  ) {

    const secretKey =
      this.config.get<string>('STRIPE_SECRET_KEY') ||
      this.config.get<string>('STRIPE_KEY') ||
      ''
    const isProduction =
      (this.config.get<string>('NODE_ENV') || process.env.NODE_ENV || '')
        .toLowerCase()
        .trim() === 'production'

    if (isProduction && this.isSimulatedCheckoutEnabled()) {
      throw new Error('[Billing] BILLING_ENABLE_SIMULATED_CHECKOUT não é permitido em produção')
    }

    if (!secretKey && isProduction) {
      throw new Error('[Billing] STRIPE_SECRET_KEY/STRIPE_KEY é obrigatório em produção')
    }

    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })
      this.logger.log('[BOOT][Billing] Stripe inicializado')
    } else {
      this.logger.warn('[BOOT][Billing][disabled] Stripe não configurado — checkout online desabilitado')
    }

  }

  get isStripeConfigured(): boolean {
    return this.stripe !== null
  }

  private getPlanPriceMap(): Record<string, string> {
    const starter = this.config.get<string>('STRIPE_PRICE_STARTER')?.trim() ?? ''
    const pro = this.config.get<string>('STRIPE_PRICE_PRO')?.trim() ?? ''
    const business = this.config.get<string>('STRIPE_PRICE_BUSINESS')?.trim() ?? ''

    return {
      FREE: '',
      STARTER: starter,
      PRO: pro,
      BUSINESS: business,
      SCALE: business,
    }
  }

  private normalizePlanName(planName: string): string {
    if (planName === 'BUSINESS') return 'SCALE'
    return planName
  }

  private isSimulatedCheckoutEnabled(): boolean {
    const value = (this.config.get<string>('BILLING_ENABLE_SIMULATED_CHECKOUT') ?? '')
      .trim()
      .toLowerCase()
    return value === '1' || value === 'true' || value === 'yes'
  }

  private assertStripeAvailable(operation: string) {
    if (this.stripe) return
    throw new ServiceUnavailableException({
      code: 'INTEGRATION_NOT_CONFIGURED',
      integration: 'stripe',
      operation,
      message:
        'Integração Stripe não configurada. Defina STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET para habilitar cobrança online.',
    })
  }

  private assertCheckoutRedirectUrl(url?: string, kind: 'successUrl' | 'cancelUrl' = 'successUrl') {
    if (!url) return

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new BadRequestException(`${kind} inválida`)
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(`${kind} deve usar http(s)`)
    }
  }

  /*
  ========================================
  CHECKOUT
  ========================================
  */

  async createCheckoutSession(
    orgId: string,
    planName: PlanName,
    successUrl?: string,
    cancelUrl?: string,
  ) {
    this.assertCheckoutRedirectUrl(successUrl, 'successUrl')
    this.assertCheckoutRedirectUrl(cancelUrl, 'cancelUrl')

    if (!this.stripe && this.isSimulatedCheckoutEnabled()) {
      return this.simulateCheckoutSession(orgId, planName)
    }
    this.assertStripeAvailable('create_checkout_session')

    const normalizedPlanName = this.normalizePlanName(planName)
    const priceId = this.getPlanPriceMap()[normalizedPlanName]

    if (!priceId) {
      throw new ServiceUnavailableException(
        `priceId do Stripe ausente para o plano ${planName}. Verifique STRIPE_PRICE_* no ambiente.`,
      )
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl ?? 'http://localhost:5173/billing/success',
      cancel_url: cancelUrl ?? 'http://localhost:5173/billing/cancel',
      metadata: { orgId, planName: normalizedPlanName },
    })

    return {
      url: session.url,
      sessionId: session.id,
    }

  }

  /*
  ========================================
  WEBHOOK
  ========================================
  */

  async handleWebhook(rawBody: Buffer, signature: string) {
    this.assertStripeAvailable('webhook')

    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')

    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET não configurado',
      )
    }

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret)
    this.logger.log(`Webhook recebido: ${event.type}`)

    const processed = await this.prisma.$transaction(async tx => {
      const duplicate = await tx.billingEvent.findUnique({
        where: { providerEventId: event.id },
      })
      if (duplicate) return false

      return this.processWebhookEvent(tx, event)
    })

    return { received: true, processed }
  }

  private async processWebhookEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.processCheckoutCompleted(tx, event)
      case 'invoice.paid':
        return this.processInvoice(tx, event, SubscriptionStatus.ACTIVE, BillingEventStatus.COMPLETED)
      case 'invoice.payment_failed':
        return this.processInvoice(tx, event, SubscriptionStatus.PAST_DUE, BillingEventStatus.FAILED)
      case 'customer.subscription.updated':
        return this.processStripeSubscription(tx, event)
      case 'customer.subscription.deleted':
        return this.processStripeSubscription(tx, event, SubscriptionStatus.CANCELED)
      default:
        this.logger.log(`Webhook ignorado: ${event.type}`)
        return false
    }
  }

  private async processCheckoutCompleted(
    tx: Prisma.TransactionClient,
    event: Stripe.CheckoutSessionCompletedEvent,
  ) {
    const session = event.data.object
    const orgId = session.metadata?.orgId
    const planName = this.toPlanName(session.metadata?.planName)
    const externalRef = this.stripeId(session.subscription)

    if (!orgId || !planName || !externalRef) {
      throw new BadRequestException('checkout.session.completed sem metadata orgId/planName ou subscription id')
    }

    const plan = await tx.plan.findUnique({ where: { name: planName } })
    if (!plan) throw new NotFoundException(`Plano ${planName} não encontrado`)

    const now = new Date()
    const subscription = await tx.subscription.upsert({
      where: { orgId },
      create: {
        orgId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        billingProvider: BillingProvider.STRIPE,
        billingCustomerRef: this.stripeId(session.customer),
        billingExternalRef: externalRef,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        billingProvider: BillingProvider.STRIPE,
        billingCustomerRef: this.stripeId(session.customer),
        billingExternalRef: externalRef,
        canceledAt: null,
      },
    })

    await this.createProviderEvent(tx, subscription.id, event, BillingEventType.PAYMENT, BillingEventStatus.COMPLETED, plan.priceCents, 'Stripe checkout concluído')
    return true
  }

  private async processInvoice(
    tx: Prisma.TransactionClient,
    event: Stripe.InvoicePaidEvent | Stripe.InvoicePaymentFailedEvent,
    status: SubscriptionStatus,
    eventStatus: BillingEventStatus,
  ) {
    const invoice = event.data.object
    const externalRef = this.stripeId(invoice.subscription)
    if (!externalRef) return this.ignoreWebhook(event, 'invoice sem subscription id')

    const current = await tx.subscription.findFirst({ where: { billingExternalRef: externalRef } })
    if (!current) return this.ignoreWebhook(event, `assinatura ${externalRef} não encontrada`)

    const subscription = await tx.subscription.update({
      where: { id: current.id },
      data: {
        status,
        currentPeriodStart: this.fromUnix(invoice.period_start) ?? current.currentPeriodStart,
        currentPeriodEnd: this.fromUnix(invoice.period_end) ?? current.currentPeriodEnd,
        canceledAt: status === SubscriptionStatus.ACTIVE ? null : undefined,
      },
    })
    const amount = event.type === 'invoice.paid' ? invoice.amount_paid : invoice.amount_due
    await this.createProviderEvent(tx, subscription.id, event, BillingEventType.PAYMENT, eventStatus, amount, `Stripe ${event.type}`)
    return true
  }

  private async processStripeSubscription(
    tx: Prisma.TransactionClient,
    event: Stripe.CustomerSubscriptionUpdatedEvent | Stripe.CustomerSubscriptionDeletedEvent,
    forcedStatus?: SubscriptionStatus,
  ) {
    const stripeSubscription = event.data.object
    const current = await tx.subscription.findFirst({ where: { billingExternalRef: stripeSubscription.id } })
    if (!current) return this.ignoreWebhook(event, `assinatura ${stripeSubscription.id} não encontrada`)

    const planName = this.planFromStripeSubscription(stripeSubscription)
    const plan = planName ? await tx.plan.findUnique({ where: { name: planName } }) : null
    const status = forcedStatus ?? this.fromStripeSubscriptionStatus(stripeSubscription.status)
    const subscription = await tx.subscription.update({
      where: { id: current.id },
      data: {
        status,
        planId: plan?.id ?? current.planId,
        billingProvider: BillingProvider.STRIPE,
        billingCustomerRef: this.stripeId(stripeSubscription.customer) ?? current.billingCustomerRef,
        currentPeriodStart: this.fromUnix(stripeSubscription.current_period_start) ?? current.currentPeriodStart,
        currentPeriodEnd: this.fromUnix(stripeSubscription.current_period_end) ?? current.currentPeriodEnd,
        canceledAt: status === SubscriptionStatus.CANCELED
          ? this.fromUnix(stripeSubscription.canceled_at) ?? new Date()
          : null,
      },
    })

    await this.createProviderEvent(tx, subscription.id, event, BillingEventType.ADJUSTMENT, BillingEventStatus.COMPLETED, 0, `Stripe ${event.type}`)
    return true
  }

  private async createProviderEvent(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    event: Stripe.Event,
    type: BillingEventType,
    status: BillingEventStatus,
    amountCents: number,
    description: string,
  ) {
    await tx.billingEvent.create({
      data: { subscriptionId, providerEventId: event.id, type, status, amountCents, description },
    })
  }

  private ignoreWebhook(event: Stripe.Event, reason: string) {
    this.logger.warn(`Webhook ${event.type} ignorado: ${reason}`)
    return false
  }

  private stripeId(value: string | { id: string } | null | undefined) {
    return typeof value === 'string' ? value : value?.id
  }

  private fromUnix(value?: number | null) {
    return value ? new Date(value * 1000) : undefined
  }

  private toPlanName(value?: string | null): PlanName | undefined {
    const normalized = value === 'SCALE' ? 'BUSINESS' : value
    return normalized && ['FREE', 'STARTER', 'PRO', 'BUSINESS'].includes(normalized)
      ? normalized as PlanName
      : undefined
  }

  private planFromStripeSubscription(subscription: Stripe.Subscription) {
    const priceId = subscription.items.data[0]?.price.id
    const entry = Object.entries(this.getPlanPriceMap()).find(([, configuredPrice]) => configuredPrice && configuredPrice === priceId)
    return this.toPlanName(entry?.[0] ?? subscription.metadata?.planName)
  }

  private fromStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
    if (status === 'active') return SubscriptionStatus.ACTIVE
    if (status === 'trialing') return SubscriptionStatus.TRIALING
    if (status === 'past_due' || status === 'unpaid') return SubscriptionStatus.PAST_DUE
    if (status === 'canceled') return SubscriptionStatus.CANCELED
    return SubscriptionStatus.SUSPENDED
  }

  /*
  ========================================
  SUBSCRIPTION
  ========================================
  */

  async getSubscription(orgId: string) {

    const subscription = await this.prisma.subscription.findUnique({
      where: { orgId },
      include: { plan: true },
    })

    if (!subscription) {
      return {
        status: 'NO_SUBSCRIPTION',
        plan: null,
        limits: PLAN_LIMITS.FREE,
      }
    }

    const planName = this.normalizePlanName(subscription.plan.name)

    return {
      ...subscription,
      limits: PLAN_LIMITS[planName] ?? PLAN_LIMITS.FREE,
    }

  }

  async getBillingStatus(orgId: string) {

    const subscription = await this.prisma.subscription.findUnique({
      where: { orgId },
      include: { plan: true },
    })

    if (!subscription) {
      return {
        status: 'NO_SUBSCRIPTION',
        plan: 'FREE',
        isActive: false,
      }
    }

    const planName = this.normalizePlanName(subscription.plan.name)

    return {
      status: subscription.status,
      plan: planName,
      isActive:
        subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIALING,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }

  }

  async cancelSubscription(orgId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { orgId } })
    if (!subscription) throw new NotFoundException('Nenhuma assinatura encontrada')

    if (subscription.billingProvider === BillingProvider.STRIPE) {
      if (!subscription.billingExternalRef) {
        throw new ServiceUnavailableException('Assinatura Stripe sem billingExternalRef; cancelamento local bloqueado')
      }
      this.assertStripeAvailable('cancel_subscription')

      const canceled = await this.stripe.subscriptions.cancel(subscription.billingExternalRef)
      const canceledAt = this.fromUnix(canceled.canceled_at) ?? new Date()
      return this.prisma.$transaction(async tx => {
        const updated = await tx.subscription.update({
          where: { orgId },
          data: { status: SubscriptionStatus.CANCELED, canceledAt },
        })
        await tx.billingEvent.create({
          data: {
            subscriptionId: subscription.id,
            type: BillingEventType.ADJUSTMENT,
            amountCents: 0,
            status: BillingEventStatus.COMPLETED,
            description: 'Stripe subscription cancelada imediatamente',
          },
        })
        return updated
      })
    }

    return this.prisma.$transaction(async tx => {
      const updated = await tx.subscription.update({
        where: { orgId },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
      })
      await tx.billingEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: BillingEventType.ADJUSTMENT,
          amountCents: 0,
          status: BillingEventStatus.COMPLETED,
          description: '[SIMULADO] cancelamento local',
        },
      })
      return updated
    })
  }

  /*
  ========================================
  SIMULATED CHECKOUT
  ========================================
  */

  async simulateCheckoutSession(orgId: string, planName: PlanName) {

    const isProduction =
      (this.config.get<string>('NODE_ENV') || process.env.NODE_ENV || '')
        .toLowerCase()
        .trim() === 'production'
    if (isProduction) {
      throw new ServiceUnavailableException('Checkout simulado não é permitido em produção')
    }

    this.logger.warn(`Checkout simulado para ${orgId} (${planName})`)

    const plan = await this.prisma.plan.findUnique({
      where: { name: planName },
    })

    if (!plan) {
      throw new NotFoundException(`Plano ${planName} não encontrado`)
    }

    const subscription = await this.prisma.subscription.upsert({
      where: { orgId },
      create: {
        orgId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
      },
    })

    await this.prisma.billingEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: BillingEventType.PAYMENT,
        amountCents: plan.priceCents,
        status: BillingEventStatus.COMPLETED,
        description: '[SIMULADO] checkout',
      },
    })

    return {
      simulated: true,
      sessionId: `sim_${Date.now()}`,
    }

  }

  /*
  ========================================
  LIMITES
  ========================================
  */

  async getPlanCatalog() {
    const plans = await this.prisma.plan.findMany()

    const planOrder: Record<string, number> = {
      FREE: 0,
      STARTER: 1,
      PRO: 2,
      BUSINESS: 3,
    }

    return plans
      .filter(plan => plan.name in planOrder)
      .sort((a, b) => planOrder[a.name] - planOrder[b.name])
      .map(plan => ({
        name: plan.name,
        displayName: plan.displayName,
        priceCents: plan.priceCents,
        quotas: this.quotasService.getQuotaLimits(plan.name),
        commercialLimits: plan.limitsJson,
        features: plan.featuresJson,
      }))
  }

  async getBillingLimits(orgId: string) {
    return this.quotasService.getQuotaUsage(orgId)
  }

}

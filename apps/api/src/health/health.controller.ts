import { Controller, Get, Optional, Request, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { isGoogleOAuthConfigured } from '../common/config/google-oauth-env'
import { getWhatsAppProviderReadiness } from '../whatsapp/providers/provider.factory'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  private hasValue(name: string): boolean {
    return (this.config.get<string>(name) ?? '').trim().length > 0
  }

  @Get()
  health(@Request() req: any) {
    if (Object.keys(req.query ?? {}).some((key) => key.toLowerCase() === 'details')) {
      throw new UnauthorizedException('Use /v1/health/details com autenticação administrativa.')
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('details')
  async details(@Request() req: any) {
    const tenant = await this.prisma.organization.findUnique({
      where: { id: req.user.orgId },
      select: { id: true },
    })
    return {
      status: tenant ? 'ok' : 'degraded',
      mode: 'detailed',
      timestamp: new Date().toISOString(),
      orgId: req.user.orgId,
      checks: { tenant: { ok: Boolean(tenant) } },
      globalInfrastructure: { available: false, reason: 'not_available_for_tenant_scope' },
    }
  }

  @Get('readiness')
  async readiness() {
    const startedAt = Date.now()
    const checks = await this.collectCriticalChecks()
    const ok = checks.database.ok && checks.prismaClient.ok && checks.queue.ok

    const body = {
      status: ok ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      checks,
      notes: [
        '[READY] /health/readiness valida dependências críticas de operação.',
        '[OPTIONAL] Stripe/Google OAuth/Resend/WhatsApp/Sentry ausentes não impedem startup local.',
      ],
      integrations: this.optionalIntegrations(),
    }

    if (!ok) {
      throw new ServiceUnavailableException(body)
    }

    return body
  }

  @Get('liveness')
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }

  private async collectCriticalChecks() {
    const databaseStartedAt = Date.now()
    let database = { ok: false as boolean, latencyMs: 0 }
    let prismaClient = { ok: false as boolean }

    try {
      await this.prisma.$queryRaw`SELECT 1`
      database = { ok: true, latencyMs: Date.now() - databaseStartedAt }
      prismaClient = { ok: true }
    } catch {
      database = { ok: false, latencyMs: Date.now() - databaseStartedAt }
      prismaClient = { ok: false }
    }

    const queueStartedAt = Date.now()
    const queueSummary = this.queueService
      ? await this.queueService.getQueueStatus().catch((error: unknown) => ({
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        }))
      : { ok: false, reason: 'queue_service_not_bound' }

    const queue = {
      ok: (queueSummary as any)?.ok === false ? false : true,
      provider: 'bullmq',
      enabled: this.queueService?.isEnabled() ?? false,
      latencyMs: Date.now() - queueStartedAt,
      summary: queueSummary,
    }

    return { database, prismaClient, queue }
  }

  private optionalIntegrations() {
    const stripeConfigured =
      this.hasValue('STRIPE_SECRET_KEY')
      && this.hasValue('STRIPE_WEBHOOK_SECRET')
      && this.hasValue('STRIPE_PRICE_STARTER')
      && this.hasValue('STRIPE_PRICE_PRO')
      && this.hasValue('STRIPE_PRICE_BUSINESS')

    const googleAuthConfigured = isGoogleOAuthConfigured(this.config)

    const emailConfigured = this.hasValue('RESEND_API_KEY')
    const whatsappReadiness = getWhatsAppProviderReadiness(process.env)

    const whatsappIntegrationStatus = whatsappReadiness.mode === 'mock'
      ? 'configured_mock'
      : whatsappReadiness.isReady
        ? 'configured'
        : 'misconfigured'

    return {
      stripe: stripeConfigured ? 'configured' : 'missing',
      googleAuth: googleAuthConfigured ? 'configured' : 'missing',
      email: emailConfigured ? 'configured' : 'missing',
      whatsapp: whatsappIntegrationStatus,
      whatsappDetails: {
        providerRequested: whatsappReadiness.providerRequested,
        providerResolved: whatsappReadiness.providerResolved,
        isProviderKnown: whatsappReadiness.isProviderKnown,
        mode: whatsappReadiness.mode,
        credentialsReady: whatsappReadiness.credentialsReady,
        missingEnv: whatsappReadiness.missingEnv,
        queueAvailable: this.queueService?.isEnabled() ?? false,
      },
    }
  }
}

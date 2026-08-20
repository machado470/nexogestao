import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateWebhookDto } from './dto/create-webhook.dto'
import { UpdateWebhookDto } from './dto/update-webhook.dto'
import { randomBytes } from 'crypto'
import { QueueService } from '../queue/queue.service'
import { QUEUE_NAMES, WEBHOOK_QUEUE_JOB_NAMES } from '../queue/queue.constants'
import { buildOperationalLogContext } from '../common/logging/operational-log-context'

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  private get webhookEndpointDelegate(): any | null {
    const prismaAny = this.prisma as any
    return prismaAny.webhookEndpoint ?? null
  }

  private get webhookDeliveryDelegate(): any | null {
    const prismaAny = this.prisma as any
    return prismaAny.webhookDelivery ?? null
  }

  async createEndpoint(orgId: string, dto: CreateWebhookDto) {
    const delegate = this.webhookEndpointDelegate
    if (!delegate) {
      return {
        disabled: true,
        reason: 'WebhookEndpoint model não está disponível no Prisma atual.',
      }
    }

    return delegate.create({
      data: {
        orgId,
        url: dto.url,
        secret: randomBytes(32).toString('hex'),
        active: dto.active ?? true,
        events: dto.events,
      },
      select: {
        id: true,
        url: true,
        active: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async listEndpoints(orgId: string) {
    const delegate = this.webhookEndpointDelegate
    if (!delegate) return []

    return delegate.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        active: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async updateEndpoint(orgId: string, id: string, dto: UpdateWebhookDto) {
    const delegate = this.webhookEndpointDelegate
    if (!delegate) {
      throw new NotFoundException('Webhook endpoint não disponível neste ambiente')
    }

    const existing = await delegate.findFirst({
      where: { id, orgId },
      select: { id: true },
    })

    if (!existing) throw new NotFoundException('Webhook endpoint não encontrado')

    return delegate.update({
      where: { id },
      data: {
        url: dto.url,
        events: dto.events,
        active: dto.active,
      },
      select: {
        id: true,
        url: true,
        active: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async deleteEndpoint(orgId: string, id: string) {
    const delegate = this.webhookEndpointDelegate
    if (!delegate) {
      return { deleted: false, disabled: true }
    }

    const existing = await delegate.findFirst({
      where: { id, orgId },
      select: { id: true },
    })

    if (!existing) throw new NotFoundException('Webhook endpoint não encontrado')

    await delegate.delete({ where: { id } })
    return { deleted: true }
  }

  async listDeliveries(orgId: string, query?: { eventType?: string; status?: string }) {
    const delegate = this.webhookDeliveryDelegate
    if (!delegate) return []

    return delegate.findMany({
      where: {
        endpoint: { orgId },
        ...(query?.eventType ? { eventType: query.eventType } : {}),
        ...(query?.status && ['PENDING', 'SUCCESS', 'FAILED'].includes(query.status)
          ? { status: query.status as 'PENDING' | 'SUCCESS' | 'FAILED' }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        endpoint: {
          select: {
            id: true,
            url: true,
          },
        },
      },
    })
  }

  async createPendingDelivery(input: {
    endpointId: string
    eventType: string
    payload: Record<string, any>
    idempotencyKey?: string
  }) {
    const delegate = this.webhookDeliveryDelegate
    if (!delegate) {
      return {
        id: `disabled-${Date.now()}`,
        endpointId: input.endpointId,
        eventType: input.eventType,
        payload: input.payload,
        status: 'FAILED',
        attempts: 0,
        disabled: true,
      }
    }

    if (input.idempotencyKey) return delegate.upsert({
      where: { endpointId_idempotencyKey: { endpointId: input.endpointId, idempotencyKey: input.idempotencyKey } },
      create: {
        endpointId: input.endpointId,
        eventType: input.eventType,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        status: 'PENDING',
      },
      update: {},
    })

    return delegate.create({
      data: {
        endpointId: input.endpointId,
        eventType: input.eventType,
        payload: input.payload,
        status: 'PENDING',
      },
    })
  }

  async markDeliveryAttempt(input: {
    deliveryId: string
    attempts: number
    status: 'PENDING' | 'SUCCESS' | 'FAILED'
  }) {
    const delegate = this.webhookDeliveryDelegate
    if (!delegate) {
      return {
        id: input.deliveryId,
        attempts: input.attempts,
        status: input.status,
        disabled: true,
      }
    }

    return delegate.update({
      where: { id: input.deliveryId },
      data: {
        attempts: input.attempts,
        status: input.status,
        lastAttemptAt: new Date(),
      },
    })
  }

  async getDeliveryContext(deliveryId: string) {
    const delegate = this.webhookDeliveryDelegate
    if (!delegate) return null

    return delegate.findUnique({
      where: { id: deliveryId },
      include: {
        endpoint: true,
      },
    })
  }

  async getActiveEndpointsByEvent(orgId: string, eventType: string) {
    const delegate = this.webhookEndpointDelegate
    if (!delegate) return []

    const endpoints = await delegate.findMany({
      where: {
        orgId,
        active: true,
      },
      select: {
        id: true,
        events: true,
      },
    })

    return endpoints.filter((endpoint: any) => {
      const events = Array.isArray(endpoint.events) ? endpoint.events : []
      return events.includes(eventType)
    })
  }

  async replayFailedDelivery(input: {
    orgId: string
    deliveryId: string
    actorUserId: string
  }) {
    const delivery = await this.getDeliveryContext(input.deliveryId)

    if (!delivery || delivery.endpoint?.orgId !== input.orgId) {
      throw new NotFoundException('Webhook delivery não encontrado')
    }

    if (delivery.status === 'SUCCESS') {
      this.logger.warn(JSON.stringify(buildOperationalLogContext({
        event: 'webhook.delivery.replay_blocked',
        orgId: input.orgId,
        deliveryId: delivery.id,
        webhookId: delivery.endpointId,
        errorCode: 'INVALID_STATUS',
        errorMessage: 'Webhook delivery em SUCCESS não permite replay',
      })))
      throw new BadRequestException('Webhook delivery em SUCCESS não permite replay')
    }

    if (delivery.status !== 'FAILED') {
      this.logger.warn(JSON.stringify(buildOperationalLogContext({
        event: 'webhook.delivery.replay_blocked',
        orgId: input.orgId,
        deliveryId: delivery.id,
        webhookId: delivery.endpointId,
        errorCode: 'INVALID_STATUS',
        errorMessage: `Webhook delivery com status=${delivery.status} não permite replay`,
      })))
      throw new BadRequestException(`Webhook delivery com status=${delivery.status} não permite replay`)
    }

    const queueEnabled = await this.queueService.ensureEnabled()
    if (!queueEnabled) {
      throw new ServiceUnavailableException(
        'Fila de webhooks indisponível para replay',
      )
    }

    const jobId = `webhook:dispatch:${delivery.id}`
    const queue = this.queueService.getQueue(QUEUE_NAMES.WEBHOOKS)
    const existingJob = await queue.getJob(jobId)
    const existingState = existingJob ? await existingJob.getState() : null
    if (existingState && ['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(existingState)) {
      throw new ConflictException('Webhook delivery já possui replay/dispatch em andamento')
    }

    await this.markDeliveryAttempt({ deliveryId: delivery.id, attempts: delivery.attempts, status: 'PENDING' })

    try {
      await this.queueService.addJob(
        QUEUE_NAMES.WEBHOOKS,
        WEBHOOK_QUEUE_JOB_NAMES.DISPATCH,
        { deliveryId: delivery.id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000, jitter: 0.3 },
          jobId,
        },
      )
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        await this.markDeliveryAttempt({
          deliveryId: delivery.id,
          attempts: delivery.attempts,
          status: 'FAILED',
        })
      }

      throw error
    }

    this.logger.log(JSON.stringify({
      ...buildOperationalLogContext({
        event: 'webhook.delivery.replay_requested',
        orgId: input.orgId,
        jobId,
        deliveryId: delivery.id,
        webhookId: delivery.endpointId,
      }),
      actorUserId: input.actorUserId,
      previousStatus: 'FAILED',
      nextStatus: 'PENDING',
    }))

    return { ok: true, deliveryId: delivery.id, jobId, previousStatus: 'FAILED', nextStatus: 'PENDING' as const }
  }
}

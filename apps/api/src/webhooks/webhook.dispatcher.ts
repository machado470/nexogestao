import { Injectable } from '@nestjs/common'
import { QueueService } from '../queue/queue.service'
import { QUEUE_NAMES, WEBHOOK_QUEUE_JOB_NAMES } from '../queue/queue.constants'
import { WebhookService } from './webhook.service'

@Injectable()
export class WebhookDispatcher {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly queueService: QueueService,
  ) {}

  normalizeEventType(action: string) {
    return String(action || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '.')
  }

  async dispatchTimelineEvent(input: {
    outboxEventId?: string
    orgId: string
    action: string
    timelineEventId: string
    data?: Record<string, any> | null
  }) {
    const eventType = this.normalizeEventType(input.action)
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: {
        timelineEventId: input.timelineEventId,
        ...(input.data ?? {}),
      },
    }

    const endpoints = await this.webhookService.getActiveEndpointsByEvent(input.orgId, eventType)

    for (const endpoint of endpoints) {
      const delivery = await this.webhookService.createPendingDelivery({
        endpointId: endpoint.id,
        eventType,
        payload,
        idempotencyKey: input.outboxEventId
          ? `outbox:${input.outboxEventId}:endpoint:${endpoint.id}`
          : `timeline:${input.timelineEventId}:endpoint:${endpoint.id}`,
      })

      await this.queueService.addJob(
        QUEUE_NAMES.WEBHOOKS,
        WEBHOOK_QUEUE_JOB_NAMES.DISPATCH,
        {
          deliveryId: delivery.id,
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000, jitter: 0.3 },
          jobId: `webhook:dispatch:${delivery.id}`,
        },
      )
    }
  }
}

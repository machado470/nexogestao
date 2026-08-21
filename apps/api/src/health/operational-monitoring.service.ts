import { Injectable } from '@nestjs/common'
import { QueueService } from '../queue/queue.service'
import { WhatsAppObservabilityService } from '../common/metrics/whatsapp-observability.service'
import { QUEUE_NAMES } from '../queue/queue.constants'
import { OperationalDlqStatus, OperationalQueueStatus, OperationalRecoveryAction } from './operational-monitoring.types'

@Injectable()
export class OperationalMonitoringService {
  constructor(
    private readonly queueService: QueueService,
    private readonly waMetrics: WhatsAppObservabilityService,
  ) {}

  async queues(): Promise<OperationalQueueStatus[]> {
    const raw = await this.queueService.getQueueStatus() as Record<string, any>

    if (raw?.ok === false) {
      return [{
        queue: 'queue-service',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        degraded: true,
        degradedReasons: ['queue_service_unavailable'],
      }]
    }

    const queues = raw.queues ?? raw
    return Object.entries(queues).map(([queue, counts]) => {
      const c = counts as Record<string, number>
      const reasons: string[] = []
      if ((c.failed ?? 0) > 0) reasons.push('failed_jobs_present')
      if ((c.waiting ?? 0) > 25) reasons.push('backlog_waiting_threshold')
      return {
        queue,
        waiting: Number(c.waiting ?? 0),
        active: Number(c.active ?? 0),
        completed: Number(c.completed ?? 0),
        failed: Number(c.failed ?? 0),
        delayed: Number(c.delayed ?? 0),
        degraded: reasons.length > 0,
        degradedReasons: reasons,
      }
    })
  }

  async dlq(): Promise<OperationalDlqStatus[]> {
    const queueStatuses = await this.queues()
    const map = new Map(queueStatuses.map((q) => [q.queue, q]))
    const wa = this.waMetrics.snapshot()
    const webhookFailed = map.get(QUEUE_NAMES.WEBHOOKS)?.failed ?? 0
    const waFailed = Number(wa.whatsapp_inbound_webhook_failed_total ?? 0)
    return [
      { queue: QUEUE_NAMES.WEBHOOKS_DLQ, backlog: map.get(QUEUE_NAMES.WEBHOOKS_DLQ)?.waiting ?? 0, failed: webhookFailed, lastFailureAt: null },
      { queue: QUEUE_NAMES.WHATSAPP_DLQ, backlog: map.get(QUEUE_NAMES.WHATSAPP_DLQ)?.waiting ?? 0, failed: waFailed, lastFailureAt: null },
    ]
  }

  recoveryActions(): OperationalRecoveryAction[] {
    return [
      { id: 'replay_failed_webhook', label: 'Replay failed webhook delivery', endpoint: '/webhooks/deliveries/:deliveryId/replay', method: 'POST', available: true },
      { id: 'retry_failed_message', label: 'Retry failed WhatsApp message', endpoint: '/whatsapp/messages/:messageId/retry', method: 'POST', available: true },
    ]
  }

  async summary() {
    const [queues, dlq] = await Promise.all([this.queues(), this.dlq()])
    const wa = this.waMetrics.snapshot()
    return {
      status: queues.some((q) => q.degraded) || dlq.some((d) => d.backlog > 0) ? 'degraded' : 'ok',
      degradedReasons: [
        ...queues.filter((q) => q.degraded).map((q) => `queue_degraded:${q.queue}`),
        ...dlq.filter((d) => d.backlog > 0).map((d) => `dlq_backlog:${d.queue}`),
      ],
      healthTimeline: { timestamp: new Date().toISOString(), latencyMs: 0 },
      metrics: {
        retries: wa.whatsapp_retry_total,
        failedJobs: wa.whatsapp_failed_jobs_total,
        failedWebhooks: wa.whatsapp_failed_webhook_total,
      },
      queues,
      dlq,
      recoveryActions: this.recoveryActions(),
    }
  }
}

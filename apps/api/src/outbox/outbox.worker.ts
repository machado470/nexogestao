import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { OutboxRepository } from './outbox.repository'
import { WebhookDispatcher } from '../webhooks/webhook.dispatcher'

function sanitizeError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return value
    .replace(/(authorization|token|secret|password|api[-_]?key)\s*[:=]\s*\S+/gi, '$1=<redacted>')
    .replace(/https?:\/\/[^\s@]+@/gi, '<redacted-url>')
    .slice(0, 1000)
}

@Injectable()
export class OutboxWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxWorker.name)
  private readonly workerId = `${process.pid}-${randomUUID()}`
  private timer?: NodeJS.Timeout
  private stopping = false

  constructor(
    private readonly repository: OutboxRepository,
    private readonly webhooks: WebhookDispatcher,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('OUTBOX_WORKER_ENABLED') === 'false' || process.env.NODE_ENV === 'test') return
    this.schedule(0)
  }

  async onApplicationShutdown() {
    this.stopping = true
    if (this.timer) clearTimeout(this.timer)
  }

  private schedule(delay: number) {
    if (this.stopping) return
    this.timer = setTimeout(() => void this.tick(), delay)
    this.timer.unref()
  }

  async tick() {
    const lockTimeoutMs = Number(this.config.get('OUTBOX_LOCK_TIMEOUT_MS') ?? 60_000)
    const batchSize = Math.min(50, Math.max(1, Number(this.config.get('OUTBOX_BATCH_SIZE') ?? 10)))
    const events = await this.repository.claimBatch({
      workerId: this.workerId,
      batchSize,
      staleBefore: new Date(Date.now() - lockTimeoutMs),
    }).catch(error => {
      this.logger.warn(`Claim da Outbox indisponível: ${sanitizeError(error)}`)
      return []
    })

    for (const event of events) {
      const context = { eventId: event.id, orgId: event.orgId, eventType: event.eventType, correlationId: event.correlationId }
      try {
        const payload = event.payload as Record<string, unknown>
        const timelineEventId = typeof payload.timelineEventId === 'string' ? payload.timelineEventId : null
        if (!timelineEventId) throw new Error('payload sem timelineEventId persistido')
        await this.webhooks.dispatchTimelineEvent({
          orgId: event.orgId,
          action: event.eventType,
          timelineEventId,
          data: payload,
        })
        await this.repository.markProcessed(event.id, this.workerId)
        this.logger.log(JSON.stringify({ ...context, status: 'processed' }))
      } catch (error) {
        const message = sanitizeError(error)
        await this.repository.markFailed({ id: event.id, workerId: this.workerId, attempts: event.attempts, maxAttempts: Number(this.config.get('OUTBOX_MAX_ATTEMPTS') ?? 8), error: message })
        this.logger.warn(JSON.stringify({ ...context, status: 'retry_or_failed', error: message }))
      }
    }
    this.schedule(events.length ? 50 : Number(this.config.get('OUTBOX_POLL_INTERVAL_MS') ?? 1_000))
  }
}

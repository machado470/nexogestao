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
    .replace(/https?:\/\/\S+/gi, '<redacted-url>')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '<redacted-number>')
    .slice(0, 1000)
}

function positiveInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

@Injectable()
export class OutboxWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxWorker.name)
  private readonly workerId: string
  private timer?: NodeJS.Timeout
  private stopping = false

  constructor(
    private readonly repository: OutboxRepository,
    private readonly webhooks: WebhookDispatcher,
    private readonly config: ConfigService,
  ) {
    this.workerId = this.config.get('OUTBOX_WORKER_ID') || `${process.pid}-${randomUUID()}`
  }

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
    if (this.stopping) return
    const lockTimeoutMs = positiveInteger(this.config.get('OUTBOX_LOCK_TIMEOUT_MS'), 60_000)
    const batchSize = positiveInteger(this.config.get('OUTBOX_BATCH_SIZE'), 10, 50)
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
          outboxEventId: event.id,
          orgId: event.orgId,
          action: event.eventType,
          timelineEventId,
          data: payload,
        })
        const result = await this.repository.markProcessed(event.id, this.workerId)
        this.logger.log(JSON.stringify({ ...context, status: result.count === 1 ? 'processed' : 'lock_lost' }))
      } catch (error) {
        const message = sanitizeError(error)
        const maxAttempts = positiveInteger(this.config.get('OUTBOX_MAX_ATTEMPTS'), 8)
        const result = event.attempts >= maxAttempts
          ? await this.repository.markFailed({ id: event.id, workerId: this.workerId, error: message })
          : await this.repository.markRetry({ id: event.id, workerId: this.workerId, attempts: event.attempts, error: message, backoffBaseMs: positiveInteger(this.config.get('OUTBOX_BACKOFF_BASE_MS'), 1_000) })
        if (result.count !== 1) this.logger.warn(JSON.stringify({ ...context, status: 'lock_lost' }))
        this.logger.warn(JSON.stringify({ ...context, status: 'retry_or_failed', error: message }))
      }
    }
    this.schedule(events.length ? 50 : positiveInteger(this.config.get('OUTBOX_POLL_INTERVAL_MS'), 1_000))
  }
}

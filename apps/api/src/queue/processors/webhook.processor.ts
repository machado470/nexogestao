import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { createHmac } from 'crypto'
import { QUEUE_CONNECTION, QUEUE_DEFAULT_WORKER_OPTIONS, QUEUE_NAMES, WEBHOOK_QUEUE_JOB_NAMES } from '../queue.constants'
import { QueueService } from '../queue.service'
import { WebhookService } from '../../webhooks/webhook.service'
import { QueueObservabilityService } from '../../common/metrics/queue-observability.service'
import { buildOperationalLogContext } from '../../common/logging/operational-log-context'

@Injectable()
export class WebhookProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookProcessor.name)
  private worker?: Worker

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly queueService: QueueService,
    private readonly webhookService: WebhookService,
    private readonly queueMetrics: QueueObservabilityService,
  ) {}

  async onModuleInit() {
    try {
      this.worker = new Worker(
        QUEUE_NAMES.WEBHOOKS,
        async (job: Job<any>) => {
          await this.queueService.updateJobStatus({ queue: QUEUE_NAMES.WEBHOOKS, jobId: job.id?.toString() ?? '', status: 'ACTIVE' })
          if (job.name !== WEBHOOK_QUEUE_JOB_NAMES.DISPATCH) return

          const delivery = await this.webhookService.getDeliveryContext(job.data.deliveryId)
          if (!delivery || !delivery.endpoint?.active) return
          const correlationId = job.data?.meta?.correlationId ?? job.data?.correlationId ?? null

          const payloadText = JSON.stringify(delivery.payload)
          const signature = createHmac('sha256', delivery.endpoint.secret).update(payloadText).digest('hex')
          const webhookStartedAt = Date.now()
          const response = await fetch(delivery.endpoint.url, {
            signal: AbortSignal.timeout(15_000), method: 'POST', headers: { 'content-type': 'application/json', 'x-nexo-signature': signature, ...(correlationId ? { 'x-correlation-id': String(correlationId) } : {}) }, body: payloadText,
          })

          const webhookLatencyMs = Date.now() - webhookStartedAt
          this.queueMetrics.observeDuration('webhook.dispatch.latency_ms', webhookLatencyMs)
          if (!response.ok) throw new Error(`Webhook HTTP error status=${response.status}`)

          await this.webhookService.markDeliveryAttempt({ deliveryId: delivery.id, attempts: job.attemptsMade + 1, status: 'SUCCESS' })
          await this.queueService.updateJobStatus({ queue: QUEUE_NAMES.WEBHOOKS, jobId: job.id?.toString() ?? '', status: 'COMPLETED', completed: true })
        },
        { connection: this.connection, ...QUEUE_DEFAULT_WORKER_OPTIONS },
      )

      this.worker.on('failed', async (job, error) => {
        await this.handleFailedJob(job, error)
      })
      this.worker.on('stalled', (jobId) => this.logger.warn(JSON.stringify(buildOperationalLogContext({ event: 'webhook.dispatch.job_stalled', jobId: jobId?.toString() ?? null }))))
      this.worker.on('error', (error) => {
        this.logger.error(`Webhook worker error: ${error.message}`)
      })

      this.logger.log('Webhook worker iniciado')
    } catch (err) {
      const error = err as Error
      this.logger.error(`Falha ao iniciar webhook worker: ${error.message}`)
    }
  }

  async handleFailedJob(job: Job<any> | undefined, err: Error) {
    const attemptsMade = job?.attemptsMade ?? 0
    const maxAttempts = job?.opts.attempts ?? 1
    const finalFailure = !!job && attemptsMade >= maxAttempts
    const deliveryId = job?.data?.deliveryId ?? null
    const delivery = deliveryId ? await this.webhookService.getDeliveryContext(deliveryId) : null

    this.queueMetrics.increment('webhook.dispatch.failed.total')
    if (!finalFailure) this.queueMetrics.increment('webhook.dispatch.retry.total')
    this.logger.warn(JSON.stringify({
      ...buildOperationalLogContext({
        event: 'webhook.dispatch.job_failed',
        orgId: delivery?.endpoint?.orgId ?? null,
        requestId: job?.data?.meta?.requestId ?? job?.data?.requestId ?? null,
        correlationId: job?.data?.meta?.correlationId ?? job?.data?.correlationId ?? null,
        jobId: job?.id?.toString() ?? null,
        deliveryId,
        webhookId: delivery?.endpointId ?? null,
        attempt: attemptsMade,
        error: err,
      }),
      queue: QUEUE_NAMES.WEBHOOKS,
      maxAttempts,
      finalFailure,
    }))

    if (!job || !deliveryId) return

    await this.webhookService.markDeliveryAttempt({ deliveryId, attempts: attemptsMade, status: finalFailure ? 'FAILED' : 'PENDING' })

    if (!finalFailure) return

    await this.queueService.addJob(QUEUE_NAMES.WEBHOOKS_DLQ, WEBHOOK_QUEUE_JOB_NAMES.DISPATCH_DLQ, {
      deliveryId,
      orgId: delivery?.endpoint?.orgId ?? null,
      webhookId: delivery?.endpointId ?? null,
      failedReason: err.message,
      attemptsMade,
      jobId: job.id?.toString() ?? null,
    }, { jobId: `webhook:dispatch:dlq:${deliveryId}` })

    this.queueMetrics.increment('webhook.dispatch.dlq.total')
    this.logger.error(JSON.stringify({
      ...buildOperationalLogContext({
        event: 'webhook.dispatch.job_dead_lettered',
        orgId: delivery?.endpoint?.orgId ?? null,
        requestId: job?.data?.meta?.requestId ?? job?.data?.requestId ?? null,
        correlationId: job?.data?.meta?.correlationId ?? job?.data?.correlationId ?? null,
        jobId: job.id?.toString() ?? null,
        deliveryId,
        webhookId: delivery?.endpointId ?? null,
        attempt: attemptsMade,
        error: err,
      }),
      queue: QUEUE_NAMES.WEBHOOKS_DLQ,
    }))
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close()
    } catch (err) {
      const error = err as Error
      this.logger.error(`Erro ao fechar webhook worker: ${error.message}`)
    }
  }
}

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { WhatsAppService } from '../../whatsapp/whatsapp.service'
import {
  isFatalWhatsAppSendError,
  isWhatsAppSendError,
} from '../../whatsapp/providers/whatsapp.provider'
import { createWhatsAppProvider } from '../../whatsapp/providers/provider.factory'
import {
  QUEUE_CONNECTION,
  QUEUE_DEFAULT_WORKER_OPTIONS,
  QUEUE_NAMES,
  WHATSAPP_QUEUE_JOB_NAMES,
} from '../queue.constants'
import { QueueService } from '../queue.service'
import { WhatsAppObservabilityService } from '../../common/metrics/whatsapp-observability.service'
import { QueueObservabilityService } from '../../common/metrics/queue-observability.service'

@Injectable()
export class WhatsAppProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppProcessor.name)
  private readonly provider = createWhatsAppProvider()
  private worker?: Worker

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly whatsApp: WhatsAppService,
    private readonly queueService: QueueService,
    private readonly waMetrics: WhatsAppObservabilityService,
    private readonly queueMetrics: QueueObservabilityService,
  ) {}

  async process(job: Job<any>) {
    if (job.name === WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK) {
      return this.processInboundWebhookJob(job)
    }

    if (job.name !== WHATSAPP_QUEUE_JOB_NAMES.DISPATCH_MESSAGE) {
      this.logger.warn(
        `whatsapp job ignorado jobId=${job.id?.toString() ?? ''} name=${job.name}`,
      )
      return
    }

    return this.processDispatchMessageJob(job)
  }

  private async processInboundWebhookJob(job: Job<any>) {
    const startedAt = Date.now()
    const data = job.data ?? {}
    this.waMetrics.incInboundWebhookStarted()
    this.logger.log(
      JSON.stringify({
        action: 'whatsapp.inbound_webhook.job_started',
        jobId: job.id?.toString() ?? null,
        attempt: job.attemptsMade + 1,
        webhookEventId: data.webhookEventId,
        orgId: data.orgId,
        provider: data.provider,
        traceId: data.traceId ?? null,
        requestId: data.meta?.requestId ?? data.requestId ?? null,
        correlationId: data.meta?.correlationId ?? data.correlationId ?? null,
      }),
    )

    await this.queueService.updateJobStatus({
      queue: QUEUE_NAMES.WHATSAPP,
      jobId: job.id?.toString() ?? '',
      status: 'ACTIVE',
    })

    try {
      const result = await this.whatsApp.processPersistedInboundWebhook({
        webhookEventId: data.webhookEventId,
        orgId: data.orgId,
        provider: data.provider,
        traceId: data.traceId ?? null,
        receivedAt: data.receivedAt ?? null,
      })

      const latencyMs = Date.now() - startedAt
      this.waMetrics.incInboundWebhookCompleted()
      this.waMetrics.observeProcessingDuration(latencyMs)
      this.queueMetrics.observeDuration('whatsapp.inbound_webhook.latency_ms', latencyMs)
      this.logger.log(
        JSON.stringify({
          action: 'whatsapp.inbound_webhook.job_completed',
          jobId: job.id?.toString() ?? null,
          attempt: job.attemptsMade + 1,
          webhookEventId: data.webhookEventId,
          orgId: data.orgId,
          provider: data.provider,
          traceId: data.traceId ?? null,
          requestId: data.meta?.requestId ?? data.requestId ?? null,
          correlationId: data.meta?.correlationId ?? data.correlationId ?? null,
          processed: result?.processed ?? 0,
          latencyMs,
        }),
      )

      await this.queueService.updateJobStatus({
        queue: QUEUE_NAMES.WHATSAPP,
        jobId: job.id?.toString() ?? '',
        status: 'COMPLETED',
        completed: true,
      })

      return result
    } catch (error) {
      const err = error as Error
      await this.whatsApp.recordWebhookEventAttempt(
        data.webhookEventId,
        err.message,
      )
      this.waMetrics.incInboundWebhookFailed()
      this.logger.error(
        JSON.stringify({
          action: 'whatsapp.inbound_webhook.job_failed',
          jobId: job.id?.toString() ?? null,
          attempt: job.attemptsMade + 1,
          webhookEventId: data.webhookEventId,
          orgId: data.orgId,
          provider: data.provider,
          traceId: data.traceId ?? null,
          requestId: data.meta?.requestId ?? data.requestId ?? null,
          correlationId: data.meta?.correlationId ?? data.correlationId ?? null,
          error: err.message,
          latencyMs: Date.now() - startedAt,
        }),
      )
      throw error
    }
  }

  private async processDispatchMessageJob(job: Job<any>) {
    const requestId = job.data?.requestId ?? 'n/a'
    const userId = job.data?.userId ?? 'n/a'
    const orgId = job.data?.orgId ?? 'n/a'

    await this.queueService.updateJobStatus({
      queue: QUEUE_NAMES.WHATSAPP,
      jobId: job.id?.toString() ?? '',
      status: 'ACTIVE',
    })

    const workerId = `bullmq-${process.pid}-${job.id?.toString() ?? job.data.messageId}-${job.attemptsMade + 1}`

    const message = await this.whatsApp.claimMessageForDispatch({
      id: job.data.messageId,
      orgId,
      workerId,
    })

    if (!message) {
      await this.queueService.updateJobStatus({
        queue: QUEUE_NAMES.WHATSAPP,
        jobId: job.id?.toString() ?? '',
        status: 'COMPLETED',
        completed: true,
      })
      return
    }

    const result = await this.provider.sendText({
      toPhone: message.toPhone,
      text: message.content ?? message.renderedText,
    })

    if (!isWhatsAppSendError(result)) {
      await this.whatsApp.markSent({
        id: message.id,
          orgId,
          workerId,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      })

      await this.queueService.updateJobStatus({
        queue: QUEUE_NAMES.WHATSAPP,
        jobId: job.id?.toString() ?? '',
        status: 'COMPLETED',
        completed: true,
      })

      return
    }

    if (isFatalWhatsAppSendError(result)) {
      await this.whatsApp.markFailedTerminal({
        id: message.id,
          orgId,
          workerId,
        provider: result.provider,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      })

      await this.queueService.updateJobStatus({
        queue: QUEUE_NAMES.WHATSAPP,
        jobId: job.id?.toString() ?? '',
        status: 'COMPLETED',
        completed: true,
      })

      await this.queueService.addJob(
        QUEUE_NAMES.WHATSAPP_DLQ,
        WHATSAPP_QUEUE_JOB_NAMES.SEND_DLQ,
        {
          payload: job.data,
          error: result.errorMessage,
          attemptsMade: job.attemptsMade,
          requestId,
          userId,
          orgId,
        },
      )

      throw new Error(`UNRECOVERABLE_WHATSAPP_ERROR:${result.errorCode}`)
    }

    await this.whatsApp.markFailedAndRequeue({
      id: message.id,
        orgId,
        workerId,
      provider: result.provider,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    })

    throw new Error(result.errorMessage)
  }

  async handleFailedJob(job: Job<any> | undefined, err: Error) {
    const attemptsMade = job?.attemptsMade ?? 0
    const maxAttempts = job?.opts.attempts ?? 1
    const finalFailure = !!job && attemptsMade >= maxAttempts
    const nextAttempt = attemptsMade + 1
    const baseDelay = 1000
    const retryDelayMs = baseDelay * 2 ** Math.max(0, nextAttempt - 1)
    const isInboundWebhook =
      job?.name === WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK
    this.waMetrics.incRetry()
    this.queueMetrics.increment('whatsapp.job.retry.total')
    this.logger.warn(
      JSON.stringify({
        action: isInboundWebhook
          ? 'whatsapp.inbound_webhook.job_retry'
          : 'whatsapp.job_retry',
        jobId: job?.id?.toString() ?? null,
        jobName: job?.name ?? null,
        attempt: attemptsMade,
        nextAttempt: finalFailure ? null : nextAttempt,
        maxAttempts,
        delayMs: finalFailure ? null : retryDelayMs,
        requestId: job?.data?.requestId ?? 'n/a',
        userId: job?.data?.userId ?? 'n/a',
        orgId: job?.data?.orgId ?? 'n/a',
        webhookEventId: job?.data?.webhookEventId ?? null,
        provider: job?.data?.provider ?? null,
        traceId: job?.data?.traceId ?? null,
        error: err.message,
      }),
    )

    if (job && finalFailure) {
      this.waMetrics.incFailedJobs()
      this.queueMetrics.increment('whatsapp.job.failed.total')
      if (isInboundWebhook) {
        this.waMetrics.incInboundWebhookDeadLettered()
        this.queueMetrics.increment('whatsapp.inbound_webhook.dlq.total')
        await this.whatsApp.deadLetterWebhookEvent({
          id: job.data?.webhookEventId,
          orgId: job.data?.orgId,
          errorMessage: err.message,
          attemptsMade,
        })
        this.logger.error(
          JSON.stringify({
            action: 'whatsapp.inbound_webhook.job_dead_lettered',
            jobId: job.id?.toString() ?? null,
            webhookEventId: job.data?.webhookEventId,
            orgId: job.data?.orgId,
            provider: job.data?.provider,
            traceId: job.data?.traceId ?? null,
            attemptsMade,
            error: err.message,
          }),
        )
      }

      await this.queueService.addJob(
        QUEUE_NAMES.WHATSAPP_DLQ,
        isInboundWebhook
          ? WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK_DLQ
          : WHATSAPP_QUEUE_JOB_NAMES.SEND_DLQ,
        {
          payload: job.data,
          error: err.message,
          attemptsMade,
          requestId: job.data?.requestId,
          userId: job.data?.userId,
          orgId: job.data?.orgId,
          traceId: job.data?.traceId,
          webhookEventId: job.data?.webhookEventId,
        },
      )
    }
  }

  async onModuleInit() {
    if (!(await this.queueService.ensureEnabled())) {
      this.logger.warn('WhatsApp worker não iniciado: Redis/fila em modo degradado')
      return
    }

    try {
      this.worker = new Worker(
        QUEUE_NAMES.WHATSAPP,
        async (job: Job<any>) => this.process(job),
        {
          connection: this.connection,
          ...QUEUE_DEFAULT_WORKER_OPTIONS,
          concurrency: 5,
          limiter: { max: 10, duration: 1000 },
        },
      )

      this.worker.on('error', (error) => {
        this.logger.error(`WhatsApp worker error: ${error.message}`)
      })

      this.worker.on('failed', async (job, err) =>
        this.handleFailedJob(job ?? undefined, err),
      )

      this.logger.log('WhatsApp worker iniciado')
    } catch (error) {
      const err = error as Error
      this.logger.error(`Falha ao iniciar whatsapp worker: ${err.message}`)
    }
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close()
    } catch (error) {
      const err = error as Error
      this.logger.error(`Erro ao fechar whatsapp worker: ${err.message}`)
    }
  }
}

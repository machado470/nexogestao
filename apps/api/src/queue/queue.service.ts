import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Job, JobsOptions, JobScheduler, Queue, QueueOptions, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaService } from '../prisma/prisma.service'
import { QUEUE_CONNECTION, QUEUE_DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QueueName } from './queue.constants'
import { QueueObservabilityService } from '../common/metrics/queue-observability.service'
import { RequestContextService } from '../common/context/request-context.service'
import { sanitizeTracingId } from '../common/context/request-tracing.util'

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name)
  private readonly queueMap = new Map<QueueName, Queue>()
  private readonly queueEventsMap = new Map<QueueName, QueueEvents>()
  private readonly schedulerMap = new Map<QueueName, JobScheduler>()
  private connectionInitPromise?: Promise<void>
  private hasLoggedAlreadyConnecting = false
  private hasLoggedActive = false
  private redisEnabled = true

  constructor(
    @Inject(QUEUE_CONNECTION)
    private readonly connection: IORedis,
    private readonly prisma: PrismaService,
    private readonly queueMetrics: QueueObservabilityService,
    private readonly requestContext: RequestContextService,
  ) {}

  private withRequestTracing<T>(payload: T): T {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
    const data = payload as Record<string, unknown>
    const currentMeta = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta))
      ? data.meta as Record<string, unknown>
      : {}
    const requestId = sanitizeTracingId(currentMeta.requestId) ?? sanitizeTracingId(data.requestId) ?? this.requestContext.requestId
    const correlationId = sanitizeTracingId(currentMeta.correlationId) ?? sanitizeTracingId(data.correlationId) ?? this.requestContext.correlationId ?? requestId
    return {
      ...data,
      meta: {
        ...currentMeta,
        ...(requestId ? { requestId } : {}),
        ...(correlationId ? { correlationId } : {}),
      },
      ...(requestId ? { requestId } : {}),
      ...(correlationId ? { correlationId } : {}),
    } as T
  }

  async onModuleInit() {
    await this.ensureEnabled()
  }

  isEnabled() {
    return this.redisEnabled && (this.connection.status === 'ready' || this.connection.status === 'connect')
  }

  async ensureEnabled() {
    try {
      await this.ensureRedisReady()
      this.registerQueuesOnce()
      this.redisEnabled = true
      if (!this.hasLoggedActive) {
        this.hasLoggedActive = true
        this.logger.log(`Queue ativa: ${Object.values(QUEUE_NAMES).join(', ')}`)
      }
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.redisEnabled = false
      this.logger.error(`Redis indisponível no bootstrap da fila: ${msg}`)
      this.logger.warn(
        'Fila em modo degradado: novos enqueues falharão até o Redis se recuperar.',
      )
      this.queueMetrics.increment('queue.degraded.total')
      return false
    }
  }

  private async ensureRedisReady() {
    if (this.connectionInitPromise) {
      return this.connectionInitPromise
    }

    const connectionInitPromise = this.ensureRedisReadyInternal()
    this.connectionInitPromise = connectionInitPromise

    try {
      await connectionInitPromise
    } finally {
      if (this.connectionInitPromise === connectionInitPromise) {
        this.connectionInitPromise = undefined
      }
    }
  }

  private async ensureRedisReadyInternal() {
    const status = this.connection.status

    if (status === 'ready' || status === 'connect') {
      return
    }

    if (status === 'connecting' || status === 'reconnecting') {
      if (!this.hasLoggedAlreadyConnecting) {
        this.hasLoggedAlreadyConnecting = true
        this.logger.debug(`Redis já está ${status}; aguardando estado ready`)
      }
      await this.waitForReady()
      return
    }

    const maxAttempts = 10

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.connection.connect()
        await this.waitForReady()
        const ping = await this.connection.ping()
        this.logger.log(`Redis conectado (tentativa ${attempt}/${maxAttempts}) ping=${ping}`)
        return
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        const isAlreadyConnecting = msg.includes('already connecting') || msg.includes('already connected')

        if (isAlreadyConnecting) {
          if (!this.hasLoggedAlreadyConnecting) {
            this.hasLoggedAlreadyConnecting = true
            this.logger.debug(`Redis já está em conexão ativa (${msg}); aguardando estado ready`)
          }
          await this.waitForReady()
          return
        }

        this.logger.error(`Falha ao conectar no Redis (tentativa ${attempt}/${maxAttempts}): ${msg}`)

        if (attempt === maxAttempts) {
          throw new Error(`Não foi possível conectar no Redis após ${maxAttempts} tentativas: ${msg}`)
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }
  }

  private waitForReady() {
    if (this.connection.status === 'ready' || this.connection.status === 'connect') {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.connection.off('ready', onReady)
        this.connection.off('error', onError)
        this.connection.off('end', onEnd)
      }

      const onReady = () => {
        cleanup()
        resolve()
      }

      const onError = (error: unknown) => {
        cleanup()
        reject(error)
      }

      const onEnd = () => {
        cleanup()
        reject(new Error('Conexão Redis finalizada antes de ficar ready'))
      }

      this.connection.once('ready', onReady)
      this.connection.once('error', onError)
      this.connection.once('end', onEnd)
    })
  }

  private registerQueuesOnce() {
    if (this.queueMap.size > 0) return

    for (const queueName of Object.values(QUEUE_NAMES)) {
      const opts: QueueOptions = {
        connection: this.connection,
        defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS,
      }
      const queue = new Queue(queueName, opts)
      const events = new QueueEvents(queueName, { connection: this.connection })
      const scheduler = new JobScheduler(queueName, { connection: this.connection })

      this.queueMap.set(queueName, queue)
      this.queueEventsMap.set(queueName, events)
      this.schedulerMap.set(queueName, scheduler)
    }
  }

  getQueue(queueName: QueueName) {
    const queue = this.queueMap.get(queueName)
    if (!queue) throw new Error(`Queue not registered: ${queueName}`)
    return queue
  }

  async addJob<T = Record<string, any>>(
    queueName: QueueName,
    name: string,
    payload: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    if (!(await this.ensureEnabled())) {
      const message =
        `Fila indisponível: Redis não conectado (${queueName}:${name})`

      this.logger.error(message)
      this.queueMetrics.increment(`queue.job.enqueue.failed.${queueName}`)

      throw new ServiceUnavailableException(message)
    }

    const queue = this.getQueue(queueName)
    let job: Job<T>

    try {
      const payloadWithTracing = this.withRequestTracing(payload)
      job = await queue.add(name, payloadWithTracing, {
        ...QUEUE_DEFAULT_JOB_OPTIONS,
        ...options,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Falha ao enfileirar job (${queueName}:${name}): ${msg}`)
      this.queueMetrics.increment(`queue.job.enqueue.failed.${queueName}`)
      throw error
    }

    // await this.prisma.queueJob.create({
    //   data: {
    //     queue: queueName,
    //     jobId: job.id?.toString() ?? '',
    //     status: 'QUEUED',
    //     payload: payload as any,
    //   },
    // })

    return job
  }

  async updateJobStatus(input: {
    queue: QueueName
    jobId: string
    status: string
    error?: string | null
    completed?: boolean
  }) {
    // await this.prisma.queueJob.updateMany({
    //   where: { queue: input.queue, jobId: input.jobId },
    //   data: {
    //     status: input.status,
    //     error: input.error ?? null,
    //     completedAt: input.completed ? new Date() : null,
    //   },
    // })
  }

  async getQueueStatus() {
    if (!this.isEnabled()) {
      return {
        ok: false,
        redisEnabled: false,
        reason: 'Redis indisponível no ambiente atual',
        status: this.connection.status,
      }
    }

    const result: Record<string, any> = {}

    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = this.getQueue(queueName)
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      )
      result[queueName] = counts
    }

    for (const [queueName, counts] of Object.entries(result)) {
      const sample = counts as Record<string, number>
      this.queueMetrics.setGauge(`queue.backlog.waiting.${queueName}`, Number(sample.waiting ?? 0))
      this.queueMetrics.setGauge(`queue.backlog.failed.${queueName}`, Number(sample.failed ?? 0))
      this.queueMetrics.setGauge(`queue.backlog.active.${queueName}`, Number(sample.active ?? 0))
    }

    const webhookFailed = Number(result[QUEUE_NAMES.WEBHOOKS]?.failed ?? 0)
    const webhookDlqWaiting = Number(result[QUEUE_NAMES.WEBHOOKS_DLQ]?.waiting ?? 0)
    const degraded = webhookFailed > 0 || webhookDlqWaiting > 0

    if (degraded) {
      this.queueMetrics.increment('queue.degraded.total')
      return {
        ok: false,
        reason: 'queue_degraded_webhook_failures',
        details: {
          webhookFailed,
          webhookDlqWaiting,
        },
        queues: result,
      }
    }

    return result
  }

  async onModuleDestroy() {
    for (const events of this.queueEventsMap.values()) {
      try {
        await events.close()
      } catch {
        // noop (modo degradado pode não abrir conexões)
      }
    }
    for (const queue of this.queueMap.values()) {
      try {
        await queue.close()
      } catch {
        // noop (modo degradado pode não abrir conexões)
      }
    }
    for (const scheduler of this.schedulerMap.values()) {
      try {
        await scheduler.close()
      } catch {
        // noop
      }
    }

    try {
      if (this.connection.status === 'connecting' || this.connection.status === 'reconnecting') {
        await this.connection.disconnect(false)
      } else if (this.connection.status !== 'end') {
        await this.connection.quit()
      }
    } catch {
      // noop
    }

    this.logger.log('Queues closed')
  }
}

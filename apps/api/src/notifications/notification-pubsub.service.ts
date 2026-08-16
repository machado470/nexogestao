import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import IORedis from 'ioredis'
import { QUEUE_CONNECTION } from '../queue/queue.constants'
import { NotificationStreamHub } from './notification-stream-hub.service'
import { NotificationTransportEvent, parseNotificationTransportEvent } from './notification-transport'

export type NotificationPubSubReadiness = {
  publisherReady: boolean
  subscriberReady: boolean
  subscribed: boolean
  shuttingDown: boolean
}

export type NotificationPublishResult =
  | { status: 'published'; subscriberCount: number }
  | { status: 'no-subscribers'; subscriberCount: 0 }
  | { status: 'timeout' | 'unavailable' | 'shutting-down'; subscriberCount: null }

const DEFAULT_READY_TIMEOUT_MS = 5_000
const DEFAULT_PUBLISH_TIMEOUT_MS = 1_000

@Injectable()
export class NotificationPubSubService implements OnModuleInit, OnModuleDestroy {
  // Redis Pub/Sub is deliberately at-most-once. PostgreSQL replay by recipient is
  // the recovery contract for events created while a browser or API instance is disconnected.
  private readonly logger = new Logger(NotificationPubSubService.name)
  private readonly channel = `nexogestao:${process.env.NODE_ENV ?? 'development'}:notifications:v1`
  private publisher?: IORedis
  private subscriber?: IORedis
  private publisherInitialization?: Promise<void>
  private subscriberInitialization?: Promise<void>
  private publisherReady = false
  private subscriberReady = false
  private subscribed = false
  private shuttingDown = false
  private readonly cancelPending = new Set<() => void>()

  constructor(@Inject(QUEUE_CONNECTION) private readonly redis: IORedis, private readonly hub: NotificationStreamHub) {}

  onModuleInit() {
    const options = {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt: number) => Math.min(250 * 2 ** Math.min(attempt, 5), 10_000),
    }
    this.publisher = this.redis.duplicate(options)
    this.subscriber = this.redis.duplicate(options)
    this.publisher.on('ready', () => { this.publisherReady = true })
    this.publisher.on('close', () => { this.publisherReady = false })
    this.publisher.on('reconnecting', () => { this.publisherReady = false })
    this.publisher.on('end', () => { this.publisherReady = false })
    this.subscriber.on('ready', () => {
      this.subscriberReady = true
      this.logger.log('Redis Pub/Sub conectado')
    })
    this.subscriber.on('close', () => {
      this.subscriberReady = false; this.subscribed = false; this.logger.warn('Redis Pub/Sub desconectado')
    })
    this.subscriber.on('reconnecting', () => {
      this.subscriberReady = false; this.subscribed = false; this.logger.warn('Redis Pub/Sub reconectando')
    })
    this.subscriber.on('end', () => { this.subscriberReady = false; this.subscribed = false })
    this.subscriber.on('message', (_channel, raw) => {
      const event = parseNotificationTransportEvent(raw)
      if (!event) { this.logger.warn('Envelope de notificação inválido ignorado'); return }
      this.hub.deliver(event)
    })
    // Eagerly start both roles. publish() and waitUntilReady() share these exact
    // operations, so concurrent bootstrap never calls connect() twice.
    void this.initializePublisher(DEFAULT_READY_TIMEOUT_MS).catch(() => {
      this.logger.warn('Publisher indisponível; persistência permanece ativa')
    })
    void this.initializeSubscriber(DEFAULT_READY_TIMEOUT_MS).catch(() => {
      this.logger.warn('Subscriber indisponível; consultas persistentes permanecem ativas')
    })
  }

  readiness(): NotificationPubSubReadiness {
    return {
      publisherReady: this.publisherReady && this.publisher?.status === 'ready',
      subscriberReady: this.subscriberReady && this.subscriber?.status === 'ready',
      subscribed: this.subscribed,
      shuttingDown: this.shuttingDown,
    }
  }

  async waitUntilReady(timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<NotificationPubSubReadiness> {
    const deadline = Date.now() + timeoutMs
    try {
      await Promise.all([
        this.initializePublisher(this.remaining(deadline)),
        this.initializeSubscriber(this.remaining(deadline)),
      ])
    } catch { /* the structured state below explains which readiness condition failed */ }
    return this.readiness()
  }

  async publish(event: NotificationTransportEvent, timeoutMs = DEFAULT_PUBLISH_TIMEOUT_MS): Promise<NotificationPublishResult> {
    if (this.shuttingDown) return { status: 'shutting-down', subscriberCount: null }
    const deadline = Date.now() + timeoutMs
    try {
      await this.initializePublisher(this.remaining(deadline))
      if (!this.publisher || !this.publisherReady || this.publisher.status !== 'ready') {
        return this.publishFailure('unavailable')
      }
      const subscriberCount = await this.withTimeout(
        this.publisher.publish(this.channel, JSON.stringify(event)),
        this.remaining(deadline),
      )
      if (subscriberCount === 0) {
        this.logger.warn('Publish de notificação sem subscribers; persistência preservada')
        return { status: 'no-subscribers', subscriberCount: 0 }
      }
      return { status: 'published', subscriberCount }
    } catch (error) {
      return this.publishFailure(error instanceof RedisOperationTimeout ? 'timeout' : 'unavailable')
    }
  }

  async onModuleDestroy() {
    if (this.shuttingDown) return
    this.shuttingDown = true
    this.publisherReady = false
    this.subscriberReady = false
    this.subscribed = false
    for (const cancel of [...this.cancelPending]) cancel()
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()])
  }

  private initializePublisher(timeoutMs: number) {
    if (this.shuttingDown) return Promise.reject(new Error('Redis Pub/Sub is shutting down'))
    if (this.publisherReady && this.publisher?.status === 'ready') return Promise.resolve()
    if (!this.publisherInitialization) {
      this.publisherInitialization = this.connectAndWait(this.publisher, timeoutMs)
        .finally(() => { this.publisherInitialization = undefined })
    }
    return this.withTimeout(this.publisherInitialization, timeoutMs)
  }

  private initializeSubscriber(timeoutMs: number) {
    if (this.shuttingDown) return Promise.reject(new Error('Redis Pub/Sub is shutting down'))
    if (this.subscriberReady && this.subscribed && this.subscriber?.status === 'ready') return Promise.resolve()
    if (!this.subscriberInitialization) {
      this.subscriberInitialization = (async () => {
        await this.connectAndWait(this.subscriber, timeoutMs)
        if (!this.subscriber || this.shuttingDown) throw new Error('Subscriber unavailable')
        await this.withTimeout(this.subscriber.subscribe(this.channel), timeoutMs)
        this.subscribed = true
      })().finally(() => { this.subscriberInitialization = undefined })
    }
    return this.withTimeout(this.subscriberInitialization, timeoutMs)
  }

  private async connectAndWait(client: IORedis | undefined, timeoutMs: number) {
    if (!client) throw new Error('Redis client not initialized')
    if (client.status === 'ready') {
      if (client === this.publisher) this.publisherReady = true
      if (client === this.subscriber) this.subscriberReady = true
      return
    }
    if (client.status === 'wait') await this.withTimeout(client.connect(), timeoutMs)
    else if (client.status === 'end') throw new Error('Redis client ended')
    else await this.waitForReadyEvent(client, timeoutMs)
    if (client === this.publisher) this.publisherReady = true
    if (client === this.subscriber) this.subscriberReady = true
  }

  private waitForReadyEvent(client: IORedis, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        this.cancelPending.delete(onCancel)
        client.removeListener('ready', onReady)
        client.removeListener('end', onEnd)
        error ? reject(error) : resolve()
      }
      const onReady = () => finish()
      const onEnd = () => finish(new Error('Redis client ended before ready'))
      const onCancel = () => finish(new Error('Redis Pub/Sub is shutting down'))
      const timer = setTimeout(() => finish(new RedisOperationTimeout()), Math.max(0, timeoutMs))
      this.cancelPending.add(onCancel)
      client.once('ready', onReady)
      client.once('end', onEnd)
    })
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const finish = (settle: () => void) => {
        clearTimeout(timer); this.cancelPending.delete(onCancel); settle()
      }
      const onCancel = () => finish(() => reject(new Error('Redis Pub/Sub is shutting down')))
      const timer = setTimeout(() => finish(() => reject(new RedisOperationTimeout())), Math.max(0, timeoutMs))
      this.cancelPending.add(onCancel)
      operation.then(
        value => finish(() => resolve(value)),
        error => finish(() => reject(error)),
      )
    })
  }

  private remaining(deadline: number) { return Math.max(0, deadline - Date.now()) }

  private publishFailure(status: 'timeout' | 'unavailable'): NotificationPublishResult {
    this.logger.warn(`Falha no publish de notificação (${status}); persistência preservada`)
    return { status, subscriberCount: null }
  }
}

class RedisOperationTimeout extends Error {
  constructor() { super('Redis Pub/Sub operation timed out') }
}

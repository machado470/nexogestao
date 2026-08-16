import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import IORedis from 'ioredis'
import { QUEUE_CONNECTION } from '../queue/queue.constants'
import { NotificationStreamHub } from './notification-stream-hub.service'
import { NotificationTransportEvent, parseNotificationTransportEvent } from './notification-transport'

@Injectable()
export class NotificationPubSubService implements OnModuleInit, OnModuleDestroy {
  // Redis Pub/Sub is deliberately at-most-once. PostgreSQL replay by recipient is
  // the recovery contract for events created while a browser or API instance is disconnected.
  private readonly logger = new Logger(NotificationPubSubService.name)
  private readonly channel = `nexogestao:${process.env.NODE_ENV ?? 'development'}:notifications:v1`
  private publisher?: IORedis
  private subscriber?: IORedis
  constructor(@Inject(QUEUE_CONNECTION) private readonly redis: IORedis, private readonly hub: NotificationStreamHub) {}

  onModuleInit() {
    const options = { lazyConnect: true, maxRetriesPerRequest: null, retryStrategy: (attempt: number) => Math.min(250 * 2 ** Math.min(attempt, 5), 10_000) }
    this.publisher = this.redis.duplicate(options)
    this.subscriber = this.redis.duplicate(options)
    this.subscriber.on('ready', () => this.logger.log('Redis Pub/Sub conectado'))
    this.subscriber.on('close', () => this.logger.warn('Redis Pub/Sub desconectado'))
    this.subscriber.on('reconnecting', () => this.logger.warn('Redis Pub/Sub reconectando'))
    this.subscriber.on('message', (_channel, raw) => {
      const event = parseNotificationTransportEvent(raw)
      if (!event) { this.logger.warn('Envelope de notificação inválido ignorado'); return }
      this.hub.deliver(event)
    })
    void this.subscriber.connect()
      .then(() => this.subscriber?.subscribe(this.channel))
      .catch(() => this.logger.warn('Subscriber indisponível; consultas persistentes permanecem ativas'))
  }

  async publish(event: NotificationTransportEvent) {
    try {
      if (!this.publisher) return false
      if (this.publisher.status === 'wait') void this.publisher.connect().catch(() => undefined)
      const operation = this.publisher.publish(this.channel, JSON.stringify(event))
      const result = await Promise.race([
        operation.then(() => true).catch(() => false),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 1_000)),
      ])
      if (!result) this.logger.warn('Falha no publish de notificação; persistência preservada')
      return result
    } catch { this.logger.warn('Falha no publish de notificação; persistência preservada'); return false }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()])
  }
}

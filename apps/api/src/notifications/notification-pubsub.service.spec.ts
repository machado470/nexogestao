import { EventEmitter } from 'node:events'
import { NotificationPubSubService } from './notification-pubsub.service'
import { NOTIFICATION_TRANSPORT_KIND, NOTIFICATION_TRANSPORT_VERSION } from './notification-transport'

const event = {
  version: NOTIFICATION_TRANSPORT_VERSION,
  kind: NOTIFICATION_TRANSPORT_KIND,
  eventId: 'recipient-1', orgId: 'org-1', userId: 'user-1', notificationId: 'notification-1',
  createdAt: '2026-08-16T00:00:00.000Z',
} as const

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

class RedisMock extends EventEmitter {
  status = 'wait'
  connect = jest.fn(async () => { this.status = 'ready'; this.emit('ready') })
  subscribe = jest.fn(async () => 1)
  publish = jest.fn(async () => 1)
  quit = jest.fn(async () => { this.status = 'end'; this.emit('end'); return 'OK' })
}

function setup(configure?: (publisher: RedisMock, subscriber: RedisMock) => void) {
  const publisher = new RedisMock(); const subscriber = new RedisMock()
  configure?.(publisher, subscriber)
  const redis = { duplicate: jest.fn().mockReturnValueOnce(publisher).mockReturnValueOnce(subscriber) }
  const hub = { deliver: jest.fn() }
  const service = new NotificationPubSubService(redis as never, hub as never)
  service.onModuleInit()
  return { service, publisher, subscriber }
}

describe('NotificationPubSubService lifecycle', () => {
  it('inicializa publisher e subscriber concorrentemente e só fica pronto após o ack de subscribe', async () => {
    const publisherConnect = deferred<void>(); const subscriberConnect = deferred<void>(); const subscribe = deferred<number>()
    const { service, publisher, subscriber } = setup((configuredPublisher, configuredSubscriber) => {
      configuredPublisher.connect.mockImplementation(() => publisherConnect.promise.then(() => {
        configuredPublisher.status = 'ready'; configuredPublisher.emit('ready')
      }))
      configuredSubscriber.connect.mockImplementation(() => subscriberConnect.promise.then(() => {
        configuredSubscriber.status = 'ready'; configuredSubscriber.emit('ready')
      }))
      configuredSubscriber.subscribe.mockReturnValue(subscribe.promise)
    })

    const readiness = service.waitUntilReady(1_000)
    expect(publisher.connect).toHaveBeenCalledTimes(1); expect(subscriber.connect).toHaveBeenCalledTimes(1)
    publisherConnect.resolve(); subscriberConnect.resolve()
    await Promise.resolve(); await Promise.resolve()
    expect(service.readiness()).toMatchObject({ publisherReady: true, subscriberReady: true, subscribed: false })
    subscribe.resolve(1)
    await expect(readiness).resolves.toMatchObject({ publisherReady: true, subscriberReady: true, subscribed: true })
    await service.onModuleDestroy()
  })

  it('conecta o publisher lazy no primeiro publish sem connect concorrente', async () => {
    const { service, publisher } = setup()
    const results = await Promise.all([service.publish(event), service.publish(event)])
    expect(publisher.connect).toHaveBeenCalledTimes(1)
    expect(results).toEqual([
      { status: 'published', subscriberCount: 1 }, { status: 'published', subscriberCount: 1 },
    ])
    await service.onModuleDestroy()
  })

  it('aguarda publisher que já está connecting antes de publicar', async () => {
    const { service, publisher } = setup((configuredPublisher) => { configuredPublisher.status = 'connecting' })
    const result = service.publish(event, 1_000)
    expect(publisher.connect).not.toHaveBeenCalled()
    publisher.status = 'ready'; publisher.emit('ready')
    await expect(result).resolves.toEqual({ status: 'published', subscriberCount: 1 })
    await service.onModuleDestroy()
  })

  it('limita readiness e distingue timeout de publish', async () => {
    const { service } = setup((publisher, subscriber) => {
      publisher.connect.mockImplementation(() => new Promise(() => undefined))
      subscriber.connect.mockImplementation(() => new Promise(() => undefined))
    })
    await expect(service.waitUntilReady(5)).resolves.toEqual({
      publisherReady: false, subscriberReady: false, subscribed: false, shuttingDown: false,
    })
    await expect(service.publish(event, 5)).resolves.toEqual({ status: 'timeout', subscriberCount: null })
    await service.onModuleDestroy()
  })

  it('torna subscriberCount zero observável', async () => {
    const { service, publisher } = setup(); publisher.publish.mockResolvedValue(0)
    await expect(service.publish(event)).resolves.toEqual({ status: 'no-subscribers', subscriberCount: 0 })
    await service.onModuleDestroy()
  })

  it('reflete reconnect e executa shutdown idempotente', async () => {
    const { service, publisher, subscriber } = setup()
    await expect(service.waitUntilReady()).resolves.toMatchObject({ publisherReady: true, subscribed: true })
    publisher.status = 'reconnecting'; publisher.emit('reconnecting')
    subscriber.status = 'reconnecting'; subscriber.emit('reconnecting')
    expect(service.readiness()).toMatchObject({ publisherReady: false, subscriberReady: false, subscribed: false })
    await service.onModuleDestroy(); await service.onModuleDestroy()
    expect(publisher.quit).toHaveBeenCalledTimes(1); expect(subscriber.quit).toHaveBeenCalledTimes(1)
    await expect(service.publish(event)).resolves.toEqual({ status: 'shutting-down', subscriberCount: null })
  })
})

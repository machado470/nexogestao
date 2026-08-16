import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { NotificationStreamHub } from '../../src/notifications/notification-stream-hub.service'
import { NotificationPubSubService } from '../../src/notifications/notification-pubsub.service'
import { NotificationsService } from '../../src/notifications/notifications.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { describeRealIntegration, REAL_INTEGRATION_ENABLED_MESSAGE, REAL_INTEGRATION_SKIP_REASON, RUN_REAL_INTEGRATION } from './infra-guards'

if (!RUN_REAL_INTEGRATION) console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
else console.info(`[integration-run] ${REAL_INTEGRATION_ENABLED_MESSAGE}`)

describeRealIntegration('Notifications SSE multi-instance (real PostgreSQL + Redis)', () => {
  jest.setTimeout(90_000)
  let appA: INestApplication; let appB: INestApplication; let prisma: PrismaService
  let serviceA: NotificationsService; let baseB: string
  const orgA = randomUUID(), orgB = randomUUID(), userA = randomUUID(), userAOther = randomUUID(), userB = randomUUID()
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const token = (userId: string, orgId: string) => jwt.sign({ sub: userId, orgId, role: 'ADMIN' }, { expiresIn: '5m' })

  async function createApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const app = module.createNestApplication()
    app.setGlobalPrefix('v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init(); await app.listen(0, '127.0.0.1'); return app
  }

  function openSse(authToken: string, lastEventId?: string) {
    const abort = new AbortController(); let buffer = ''; let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let pump: Promise<void> | undefined; let closed = false
    type Waiter = { value: string; resolve: (text: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
    const waiters = new Set<Waiter>(); const decoder = new TextDecoder()
    const settleWaiters = (error?: Error) => {
      for (const waiter of [...waiters]) {
        if (!error && !buffer.includes(waiter.value)) continue
        clearTimeout(waiter.timer); waiters.delete(waiter)
        error ? waiter.reject(error) : waiter.resolve(buffer)
      }
    }
    const connection = fetch(`${baseB}/v1/notifications/stream`, { signal: abort.signal, headers: {
        Authorization: `Bearer ${authToken}`, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      } }).then(async response => {
      expect(response.status).toBe(200)
      reader = response.body!.getReader()
      pump = (async () => {
        try {
          while (true) {
            const chunk = await reader!.read()
            if (chunk.done) {
              buffer += decoder.decode()
              if (!closed) settleWaiters(new Error(`SSE stream ended prematurely; buffer=${buffer}`))
              break
            }
            buffer += decoder.decode(chunk.value, { stream: true }); settleWaiters()
          }
        } catch (error) {
          if (!closed && !abort.signal.aborted) {
            settleWaiters(error instanceof Error ? error : new Error('SSE read failed'))
          }
        }
      })()
      return response
    })
    const waitForEvent = (value: string, timeoutMs = 8_000) => new Promise<string>((resolve, reject) => {
      if (buffer.includes(value)) { resolve(buffer); return }
      if (closed) { reject(new Error(`SSE closed while waiting for ${value}; buffer=${buffer}`)); return }
      const waiter = { value, resolve, reject, timer: undefined as unknown as NodeJS.Timeout }
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter); reject(new Error(`SSE timeout waiting for ${value}; buffer=${buffer}`))
      }, timeoutMs)
      waiters.add(waiter); settleWaiters()
    })
    return {
      connection, waitForEvent, waitUntilReady: () => waitForEvent('event: ready'), get buffer() { return buffer },
      close: async () => {
        if (closed) return
        closed = true
        const error = new Error(`SSE closed; buffer=${buffer}`)
        settleWaiters(error)
        abort.abort()
        await reader?.cancel().catch(() => undefined)
        await pump
      },
      cleanup: async () => {
        const hub = appB.get(NotificationStreamHub); const deadline = Date.now() + 5_000
        while (hub.count() !== 0 && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve))
        expect(hub.count()).toBe(0)
      },
    }
  }

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be explicitly configured for integration tests')
    appA = await createApp(); appB = await createApp()
    prisma = appA.get(PrismaService); serviceA = appA.get(NotificationsService)
    const address = appB.getHttpServer().address(); baseB = `http://127.0.0.1:${address.port}`
    await prisma.organization.createMany({ data: [
      { id: orgA, name: 'SSE tenant A', slug: `sse-${orgA}` }, { id: orgB, name: 'SSE tenant B', slug: `sse-${orgB}` },
    ] })
    await prisma.user.createMany({ data: [
      { id: userA, orgId: orgA, email: `${userA}@test.invalid`, role: 'ADMIN', active: true },
      { id: userAOther, orgId: orgA, email: `${userAOther}@test.invalid`, role: 'STAFF', active: true },
      { id: userB, orgId: orgB, email: `${userB}@test.invalid`, role: 'ADMIN', active: true },
    ] })
    expect(await appA.get(NotificationPubSubService).waitUntilReady()).toEqual({
      publisherReady: true, subscriberReady: true, subscribed: true, shuttingDown: false,
    })
    expect(await appB.get(NotificationPubSubService).waitUntilReady()).toEqual({
      publisherReady: true, subscriberReady: true, subscribed: true, shuttingDown: false,
    })
  })

  afterAll(async () => {
    await prisma?.notification.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.user.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await Promise.allSettled([appA?.close(), appB?.close()])
  })

  const create = (eventKey: string, target = userA, tenant = orgA) => serviceA.createNotificationNow({
    orgId: tenant, eventKey, type: 'CUSTOMER_CREATED', title: 'SSE', message: 'event', severity: 'INFO',
    source: 'notifications-sse-e2e', audience: { kind: 'user', userId: target }, occurredAt: new Date(),
  })

  it('exige autenticação real e não aceita identidade por URL', async () => {
    await request(appB.getHttpServer()).get(`/v1/notifications/stream?token=${token(userA, orgA)}&orgId=${orgA}&userId=${userA}`).expect(401)
    await request(appB.getHttpServer()).get('/v1/notifications/stream').set('Authorization', 'Bearer invalid').expect(401)
    await prisma.user.update({ where: { id: userAOther }, data: { active: false } })
    await request(appB.getHttpServer()).get('/v1/notifications/stream').set('Authorization', `Bearer ${token(userAOther, orgA)}`).expect(403)
    await prisma.user.update({ where: { id: userAOther }, data: { active: true } })
  })

  it('entrega via Redis da instância A para stream na instância B e limpa a conexão', async () => {
    const pubSubA = appA.get(NotificationPubSubService); const pubSubB = appB.get(NotificationPubSubService)
    expect(await pubSubA.waitUntilReady()).toEqual({ publisherReady: true, subscriberReady: true, subscribed: true, shuttingDown: false })
    expect(await pubSubB.waitUntilReady()).toEqual({ publisherReady: true, subscriberReady: true, subscribed: true, shuttingDown: false })
    expect(pubSubA.diagnostics().channel).toBe(pubSubB.diagnostics().channel)
    const publish = jest.spyOn(pubSubA, 'publish')
    const hubB = appB.get(NotificationStreamHub); const deliver = jest.spyOn(hubB, 'deliver')
    const stream = openSse(token(userA, orgA))
    const resultForEvent = <T extends { mock: { calls: unknown[][]; results: Array<{ type: string; value: unknown }> } }>(spy: T, eventId: string) => {
      const index = spy.mock.calls.findIndex(call => (call[0] as { eventId?: string })?.eventId === eventId)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(spy.mock.results[index].type).toBe('return')
      return spy.mock.results[index].value as Promise<unknown>
    }
    const occurrences = (text: string, eventId: string) => text.split(`id: ${eventId}\n`).length - 1
    try {
      await stream.connection; await stream.waitUntilReady()
      expect(hubB.count()).toBe(1)

      const notification = await create('cross-instance-transition')
      const recipient = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: notification.id, userId: userA } })
      const envelope = publish.mock.calls.find(call => call[0].eventId === recipient.id)?.[0]
      expect(envelope).toEqual({
        version: 1, kind: 'notification.created', eventId: recipient.id, orgId: orgA, userId: userA,
        notificationId: notification.id, createdAt: recipient.createdAt.toISOString(),
      })
      const published = await resultForEvent(publish, recipient.id) as { status: string; subscriberCount: number }
      expect(published).toEqual({ status: 'published', subscriberCount: expect.any(Number) })
      expect(published.subscriberCount).toBeGreaterThanOrEqual(2)
      expect(deliver).toHaveBeenCalledWith(envelope)
      const firstDelivery = await resultForEvent(deliver, recipient.id)
      // [] significa que o evento chegou durante replay -> live e foi buffered; o frame abaixo prova o flush.
      expect([[], [true]]).toContainEqual(firstDelivery)
      const firstText = await stream.waitForEvent(`id: ${recipient.id}`)
      expect(firstText).toContain(`id: ${recipient.id}\nevent: notification.created`)
      expect(occurrences(firstText, recipient.id)).toBe(1)
      expect(firstText).not.toContain(orgA); expect(firstText).not.toContain(userA); expect(firstText).not.toContain(notification.id)
      expect(hubB.count()).toBe(1)

      const liveNotification = await create('cross-instance-definitely-live')
      const liveRecipient = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: liveNotification.id, userId: userA } })
      const liveEnvelope = publish.mock.calls.find(call => call[0].eventId === liveRecipient.id)?.[0]
      expect(liveEnvelope).toEqual({
        version: 1, kind: 'notification.created', eventId: liveRecipient.id, orgId: orgA, userId: userA,
        notificationId: liveNotification.id, createdAt: liveRecipient.createdAt.toISOString(),
      })
      const livePublished = await resultForEvent(publish, liveRecipient.id) as { status: string; subscriberCount: number }
      expect(livePublished.status).toBe('published'); expect(livePublished.subscriberCount).toBeGreaterThanOrEqual(2)
      expect(deliver).toHaveBeenCalledWith(liveEnvelope)
      await expect(resultForEvent(deliver, liveRecipient.id)).resolves.toEqual([true])
      const liveText = await stream.waitForEvent(`id: ${liveRecipient.id}`)
      expect(liveText).toContain(`id: ${liveRecipient.id}\nevent: notification.created`)
      expect(occurrences(liveText, recipient.id)).toBe(1); expect(occurrences(liveText, liveRecipient.id)).toBe(1)
      expect(hubB.count()).toBe(1)
    } finally {
      publish.mockRestore(); deliver.mockRestore()
      await stream.close(); await stream.cleanup()
    }
  })

  it('isola usuário e tenant e recupera por replay persistido', async () => {
    const cursorNotification = await create('cursor')
    const cursor = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: cursorNotification.id, userId: userA } })
    const foreign = await create('foreign-user', userAOther)
    const foreignRecipient = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: foreign.id } })
    const foreignTenant = await create('foreign-tenant', userB, orgB)
    const foreignTenantRecipient = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: foreignTenant.id } })
    const expected = await create('replayed')
    const expectedRecipient = await prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: expected.id, userId: userA } })
    const stream = openSse(token(userA, orgA), cursor.id); await stream.connection
    const text = await stream.waitForEvent(`id: ${expectedRecipient.id}`)
    expect(text).toContain(`id: ${expectedRecipient.id}`)
    expect(text).not.toContain(`id: ${foreignRecipient.id}`); expect(text).not.toContain(`id: ${foreignTenantRecipient.id}`)
    expect(text).not.toContain(userAOther); expect(text).not.toContain(orgB)
    await stream.close(); await stream.cleanup()
  })

  it('emite resync para cursor ausente sem vazar dados', async () => {
    const stream = openSse(token(userA, orgA), randomUUID()); await stream.connection
    const text = await stream.waitForEvent('event: resync')
    expect(text).toContain('event: resync'); expect(text).not.toContain(orgA); expect(text).not.toContain(userA)
    await stream.close(); await stream.cleanup()
  })
})

import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { NotificationStreamHub } from '../../src/notifications/notification-stream-hub.service'
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

  async function readUntil(authToken: string, match: (text: string) => boolean, lastEventId?: string) {
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 8_000)
    try {
      const response = await fetch(`${baseB}/v1/notifications/stream`, { signal: abort.signal, headers: {
        Authorization: `Bearer ${authToken}`, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      } })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader(); const decoder = new TextDecoder(); let text = ''
      while (!match(text)) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true }) }
      await reader.cancel(); return text
    } finally { clearTimeout(timeout); abort.abort() }
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
    await new Promise(resolve => setTimeout(resolve, 500))
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
  })

  it('entrega via Redis da instância A para stream na instância B e limpa a conexão', async () => {
    const pending = readUntil(token(userA, orgA), text => text.includes('event: notification.created'))
    await new Promise(resolve => setTimeout(resolve, 100)); const notification = await create('cross-instance')
    const text = await pending
    expect(text).toContain('event: notification.created'); expect(text).not.toContain(orgA); expect(text).not.toContain(notification.id)
    await new Promise(resolve => setTimeout(resolve, 50)); expect(appB.get(NotificationStreamHub).count()).toBe(0)
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
    const text = await readUntil(token(userA, orgA), value => value.includes(`id: ${expectedRecipient.id}`), cursor.id)
    expect(text).toContain(`id: ${expectedRecipient.id}`)
    expect(text).not.toContain(`id: ${foreignRecipient.id}`); expect(text).not.toContain(`id: ${foreignTenantRecipient.id}`)
    expect(text).not.toContain(userAOther); expect(text).not.toContain(orgB)
  })

  it('emite resync para cursor ausente sem vazar dados', async () => {
    const text = await readUntil(token(userA, orgA), value => value.includes('event: resync'), randomUUID())
    expect(text).toContain('event: resync'); expect(text).not.toContain(orgA); expect(text).not.toContain(userA)
  })
})

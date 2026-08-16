import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { CreateNotificationInput, notificationJobId, NotificationsService } from '../../src/notifications/notifications.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { describeRealIntegration, REAL_INTEGRATION_ENABLED_MESSAGE, REAL_INTEGRATION_SKIP_REASON, RUN_REAL_INTEGRATION } from './infra-guards'

if (!RUN_REAL_INTEGRATION) console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
else console.info(`[integration-run] ${REAL_INTEGRATION_ENABLED_MESSAGE}`)

describeRealIntegration('Notifications persistence and authorization (e2e)', () => {
  jest.setTimeout(90_000)
  let app: INestApplication
  let prisma: PrismaService
  let service: NotificationsService
  const orgA = randomUUID(), orgB = randomUUID()
  const userA1 = randomUUID(), userA2 = randomUUID(), userA3 = randomUUID(), userB1 = randomUUID()
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const auth = (userId: string, orgId: string, role = 'ADMIN') => ({
    Authorization: `Bearer ${jwt.sign({ sub: userId, orgId, role })}`,
  })
  const input = (eventKey: string, audience: CreateNotificationInput['audience'], overrides: Partial<CreateNotificationInput> = {}): CreateNotificationInput => ({
    orgId: orgA, eventKey, type: 'CUSTOMER_CREATED', title: 'Novo cliente', message: 'Cliente criado.',
    severity: 'INFO', source: 'notifications-e2e', audience, routeHint: '/customers?customerId=c1',
    occurredAt: new Date('2026-08-16T10:00:00.000Z'), ...overrides,
  })

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be explicitly configured for integration tests')
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()
    prisma = app.get(PrismaService)
    service = app.get(NotificationsService)
    await prisma.organization.createMany({ data: [
      { id: orgA, name: 'Notifications A', slug: `notifications-${orgA}` },
      { id: orgB, name: 'Notifications B', slug: `notifications-${orgB}` },
    ] })
    await prisma.user.createMany({ data: [
      { id: userA1, orgId: orgA, email: `${userA1}@test.invalid`, role: 'ADMIN', active: true },
      { id: userA2, orgId: orgA, email: `${userA2}@test.invalid`, role: 'STAFF', active: true },
      { id: userA3, orgId: orgA, email: `${userA3}@test.invalid`, role: 'STAFF', active: false },
      { id: userB1, orgId: orgB, email: `${userB1}@test.invalid`, role: 'ADMIN', active: true },
    ] })
  })

  afterAll(async () => {
    await prisma?.notification.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.user.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await app?.close()
  })

  it('uses real JWT and ActiveUserGuard without allowing the request to select a tenant', async () => {
    await request(app.getHttpServer()).get('/v1/notifications').expect(401)
    await request(app.getHttpServer()).get('/v1/notifications').set('Authorization', 'Bearer invalid').expect(401)
    await request(app.getHttpServer()).get('/v1/notifications').set(auth(userA3, orgA)).expect(403)
    await request(app.getHttpServer()).get('/v1/notifications?orgId=' + orgB).set(auth(userA1, orgA)).set('x-org-id', orgB).expect(200)
    await request(app.getHttpServer()).get('/v1/notifications').set(auth(userB1, orgB)).expect(200)
  })

  it('proves individual reads, unread counts, and tenant isolation over authenticated HTTP', async () => {
    const individual = await service.createNotificationNow(input('individual-read', { kind: 'user', userId: userA1 }))
    expect(await prisma.notificationRecipient.count({ where: { notificationId: individual.id } })).toBe(1)
    const a1 = await request(app.getHttpServer()).get('/v1/notifications').set(auth(userA1, orgA)).expect(200)
    expect(a1.body.items.some((item: any) => item.id === individual.id)).toBe(true)
    const a2 = await request(app.getHttpServer()).get('/v1/notifications').set(auth(userA2, orgA)).expect(200)
    expect(a2.body.items.some((item: any) => item.id === individual.id)).toBe(false)
    await request(app.getHttpServer()).patch(`/v1/notifications/${individual.id}/read`).set(auth(userB1, orgB)).expect(404)

    const organizational = await service.createNotificationNow(input('organization-read', { kind: 'organization' }))
    expect(await prisma.notificationRecipient.findMany({ where: { notificationId: organizational.id }, orderBy: { userId: 'asc' }, select: { userId: true } }))
      .toEqual([{ userId: userA1 }, { userId: userA2 }].sort((a, b) => a.userId.localeCompare(b.userId)))
    expect(await service.getUnreadCount(orgA, userA1)).toBe(await prisma.notificationRecipient.count({ where: { userId: userA1, readAt: null, notification: { orgId: orgA } } }))
    expect(await service.getUnreadCount(orgA, userA2)).toBe(1)
    await request(app.getHttpServer()).patch(`/v1/notifications/${organizational.id}/read`).set(auth(userA1, orgA)).expect(200)
    expect(await service.getUnreadCount(orgA, userA2)).toBe(1)
    await request(app.getHttpServer()).post('/v1/notifications/read-all').set(auth(userA1, orgA)).expect(201)
    expect(await service.getUnreadCount(orgA, userA2)).toBe(1)
    expect(await service.getUnreadCount(orgB, userB1)).toBe(0)
  })

  it('proves idempotency, semantic conflicts, concurrency, and per-tenant event keys', async () => {
    const base = input('idempotent', { kind: 'user', userId: userA1 })
    const first = await service.createNotificationNow(base)
    await expect(service.createNotificationNow(base)).resolves.toMatchObject({ id: first.id })
    expect(await prisma.notification.count({ where: { orgId: orgA, eventKey: 'idempotent' } })).toBe(1)
    expect(await prisma.notificationRecipient.count({ where: { notificationId: first.id } })).toBe(1)
    await expect(service.createNotificationNow({ ...base, audience: { kind: 'user', userId: userA2 } })).rejects.toMatchObject({ status: 409 })
    await expect(service.createNotificationNow({ ...base, audience: { kind: 'organization' } })).rejects.toMatchObject({ status: 409 })
    await expect(service.createNotificationNow({ ...base, message: 'Materialmente diferente' })).rejects.toMatchObject({ status: 409 })

    const concurrent = input('concurrent', { kind: 'organization' })
    const attempts = await Promise.all(Array.from({ length: 8 }, () => service.createNotificationNow(concurrent)))
    expect(new Set(attempts.map(item => item.id)).size).toBe(1)
    expect(await prisma.notificationRecipient.count({ where: { notificationId: attempts[0].id } })).toBe(2)
    await expect(service.createNotificationNow({ ...base, orgId: orgB, audience: { kind: 'user', userId: userB1 } })).resolves.toBeTruthy()
  })

  it('keeps organizational delivery as a historical snapshot', async () => {
    const created = await service.createNotificationNow(input('snapshot', { kind: 'organization' }))
    const lateUser = randomUUID()
    await prisma.user.create({ data: { id: lateUser, orgId: orgA, email: `${lateUser}@test.invalid`, role: 'STAFF', active: true } })
    await prisma.user.update({ where: { id: userA2 }, data: { active: false } })
    await expect(service.createNotificationNow(input('snapshot', { kind: 'organization' }))).resolves.toMatchObject({ id: created.id })
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: created.id }, select: { userId: true } })
    expect(recipients.map(item => item.userId).sort()).toEqual([userA1, userA2].sort())
  })

  it('uses deterministic opaque SHA-256 job IDs accepted by real BullMQ/Redis', async () => {
    const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
    const queue = new Queue(`notifications-e2e-${randomUUID()}`, { connection })
    try {
      const id = notificationJobId(orgA, 'redis-job')
      expect(id).toMatch(/^[a-f0-9]{64}$/)
      expect(id).not.toContain(':')
      expect(id).not.toContain(orgA)
      expect(id).not.toContain('redis-job')
      expect((await queue.add('create-notification', {}, { jobId: id })).id).toBe(id)
      expect((await queue.add('create-notification', {}, { jobId: id })).id).toBe(id)
      expect(notificationJobId(orgB, 'redis-job')).not.toBe(id)
      expect(notificationJobId(orgA, 'other-job')).not.toBe(id)
    } finally {
      await queue.obliterate({ force: true }); await queue.close(); await connection.quit()
    }
  })
})

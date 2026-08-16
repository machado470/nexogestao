import { CanActivate, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import request from 'supertest'
import { ActiveUserGuard } from '../../src/auth/guards/active-user.guard'
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard'
import { NotificationsController } from '../../src/notifications/notifications.controller'
import {
  CreateNotificationInput,
  notificationJobId,
  NotificationsService,
} from '../../src/notifications/notifications.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import {
  describeRealIntegration,
  REAL_INTEGRATION_ENABLED_MESSAGE,
  REAL_INTEGRATION_SKIP_REASON,
  RUN_REAL_INTEGRATION,
} from './infra-guards'

if (!RUN_REAL_INTEGRATION) console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
else console.info(`[integration-run] ${REAL_INTEGRATION_ENABLED_MESSAGE}`)

const allow: CanActivate = { canActivate: () => true }

describeRealIntegration('Notifications persistence (e2e)', () => {
  jest.setTimeout(60_000)
  let app: INestApplication
  let prisma: PrismaService
  let service: NotificationsService
  const orgA = randomUUID()
  const orgB = randomUUID()
  const userA = randomUUID()
  const userA2 = randomUUID()
  const userB = randomUUID()

  const input = (eventKey: string, audience: CreateNotificationInput['audience']): CreateNotificationInput => ({
    orgId: orgA,
    eventKey,
    type: 'CUSTOMER_CREATED',
    title: 'Novo cliente',
    message: 'Cliente criado.',
    severity: 'INFO',
    source: 'notifications-e2e',
    audience,
    routeHint: '/customers?customerId=c1',
    occurredAt: new Date('2026-08-16T10:00:00.000Z'),
  })

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        PrismaService,
        NotificationsService,
      ],
    })
      .overrideProvider(NotificationsService)
      .useFactory({
        inject: [PrismaService],
        factory: (database: PrismaService) => new NotificationsService(database, { addJob: jest.fn() } as never),
      })
      .overrideGuard(JwtAuthGuard).useValue(allow)
      .overrideGuard(ActiveUserGuard).useValue(allow)
      .compile()

    app = module.createNestApplication()
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { orgId: req.headers['x-org-id'], sub: req.headers['x-user-id'] }
      next()
    })
    await app.init()
    prisma = app.get(PrismaService)
    service = app.get(NotificationsService)
    await prisma.organization.createMany({ data: [
      { id: orgA, name: 'Notifications A', slug: `notifications-${orgA}` },
      { id: orgB, name: 'Notifications B', slug: `notifications-${orgB}` },
    ] })
    await prisma.user.createMany({ data: [
      { id: userA, orgId: orgA, email: `${userA}@test.invalid`, role: 'ADMIN', active: true },
      { id: userA2, orgId: orgA, email: `${userA2}@test.invalid`, role: 'STAFF', active: true },
      { id: userB, orgId: orgB, email: `${userB}@test.invalid`, role: 'ADMIN', active: true },
    ] })
  })

  afterAll(async () => {
    await prisma?.notification.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.user.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await prisma?.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await app?.close()
  })

  it('prova leitura individual e isolamento multi-tenant por HTTP', async () => {
    const created = await service.createNotificationNow(input('individual-read', { kind: 'user', userId: userA }))

    await request(app.getHttpServer()).get('/notifications')
      .set('x-org-id', orgA).set('x-user-id', userA)
      .expect(200).expect(({ body }) => expect(body.items.some((item: any) => item.id === created.id)).toBe(true))
    await request(app.getHttpServer()).get('/notifications')
      .set('x-org-id', orgA).set('x-user-id', userA2)
      .expect(200).expect(({ body }) => expect(body.items.some((item: any) => item.id === created.id)).toBe(false))
    await request(app.getHttpServer()).patch(`/notifications/${created.id}/read`)
      .set('x-org-id', orgB).set('x-user-id', userB).expect(404)
    await request(app.getHttpServer()).patch(`/notifications/${created.id}/read`)
      .set('x-org-id', orgA).set('x-user-id', userA).expect(200)
  })

  it('prova concorrência idempotente e uma única materialização', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => service.createNotificationNow(input('concurrent', { kind: 'user', userId: userA }))),
    )
    expect(new Set(attempts.map(({ id }) => id)).size).toBe(1)
    expect(await prisma.notification.count({ where: { orgId: orgA, eventKey: 'concurrent' } })).toBe(1)
    expect(await prisma.notificationRecipient.count({ where: { notificationId: attempts[0].id } })).toBe(1)
  })

  it('mantém o snapshot organizacional ao repetir o evento', async () => {
    const organizational = input('organization-snapshot', { kind: 'organization' })
    const created = await service.createNotificationNow(organizational)
    await prisma.user.update({ where: { id: userA2 }, data: { active: false } })
    await expect(service.createNotificationNow(organizational)).resolves.toMatchObject({ id: created.id })
    expect(await prisma.notificationRecipient.count({ where: { notificationId: created.id } })).toBe(2)
  })

  it('aceita o jobId SHA-256 em Redis/BullMQ real', async () => {
    const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
    const queue = new Queue(`notifications-e2e-${randomUUID()}`, { connection })
    try {
      const id = notificationJobId(orgA, 'redis-job')
      const job = await queue.add('create-notification', {}, { jobId: id })
      expect(job.id).toBe(id)
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
      await connection.quit()
    }
  })
})

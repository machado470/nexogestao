import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import {
  describeRealIntegration,
  REAL_INTEGRATION_ENABLED_MESSAGE,
  REAL_INTEGRATION_SKIP_REASON,
  RUN_REAL_INTEGRATION,
} from './infra-guards'

if (!RUN_REAL_INTEGRATION) console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
else console.info(`[integration-run] ${REAL_INTEGRATION_ENABLED_MESSAGE}`)

describeRealIntegration('Phase 2 Execution tenant isolation (Postgres e2e)', () => {
  jest.setTimeout(90000)
  let app: INestApplication
  let prisma: PrismaService

  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be explicitly configured for integration tests')
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const orgA = randomUUID()
  const orgB = randomUUID()
  const userA = randomUUID()
  const userB = randomUUID()
  const personA = randomUUID()
  const personB = randomUUID()
  const customerA = randomUUID()
  const customerB = randomUUID()
  const serviceOrderA = randomUUID()
  const serviceOrderB = randomUUID()
  const auth = (orgId: string, userId: string, personId: string) => ({
    Authorization: `Bearer ${jwt.sign({ sub: userId, role: 'ADMIN', orgId, personId })}`,
  })

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()
    prisma = app.get(PrismaService)

    await prisma.organization.createMany({ data: [
      { id: orgA, name: 'Phase 2 Org A', slug: `p2-a-${orgA}` },
      { id: orgB, name: 'Phase 2 Org B', slug: `p2-b-${orgB}` },
    ] })
    await prisma.user.createMany({ data: [
      { id: userA, orgId: orgA, email: `${userA}@test.invalid`, role: 'ADMIN', active: true },
      { id: userB, orgId: orgB, email: `${userB}@test.invalid`, role: 'ADMIN', active: true },
    ] })
    await prisma.person.createMany({ data: [
      { id: personA, orgId: orgA, userId: userA, name: 'Operator A', role: 'TECH' },
      { id: personB, orgId: orgB, userId: userB, name: 'Operator B', role: 'TECH' },
    ] })
    await prisma.customer.createMany({ data: [
      { id: customerA, orgId: orgA, name: 'Customer A', phone: '+5511999990001' },
      { id: customerB, orgId: orgB, name: 'Customer B', phone: '+5511999990002' },
    ] })
    await prisma.serviceOrder.createMany({ data: [
      { id: serviceOrderA, orgId: orgA, customerId: customerA, title: 'Service A', assignedToPersonId: personA },
      { id: serviceOrderB, orgId: orgB, customerId: customerB, title: 'Service B', assignedToPersonId: personB },
    ] })
  })

  afterAll(async () => {
    if (prisma) {
      const orgIds = [orgA, orgB]
      await prisma.timelineEvent.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.auditEvent.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.charge.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.serviceOrder.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.customer.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.person.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.user.deleteMany({ where: { orgId: { in: orgIds } } })
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    }
    await app?.close()
  })

  it('nega start cross-tenant sem criar execução, Timeline ou efeito na O.S. alheia', async () => {
    const timelineBefore = await prisma.timelineEvent.count({ where: { orgId: { in: [orgA, orgB] } } })
    await request(app.getHttpServer()).post('/executions/start').set(auth(orgA, userA, personA))
      .send({ serviceOrderId: serviceOrderB }).expect(404)

    expect(await prisma.serviceOrder.findUnique({ where: { id: serviceOrderB } })).toMatchObject({ status: 'OPEN', startedAt: null })
    expect(await prisma.timelineEvent.count({ where: { orgId: { in: [orgA, orgB] } } })).toBe(timelineBefore)
  })

  it('não aceita orgId como autoridade tenant', async () => {
    await request(app.getHttpServer()).post('/executions/start').set(auth(orgA, userA, personA))
      .send({ serviceOrderId: serviceOrderA, orgId: orgB }).expect(400)
    expect(await prisma.serviceOrder.findUnique({ where: { id: serviceOrderA } })).toMatchObject({ status: 'OPEN', startedAt: null })

    await request(app.getHttpServer()).post('/executions/start').set(auth(orgA, userA, personA))
      .send({ serviceOrderId: serviceOrderA }).expect(201)
    await request(app.getHttpServer()).post(`/executions/${serviceOrderA}/complete`).set(auth(orgA, userA, personA))
      .send({ notes: 'forged tenant', orgId: orgB }).expect(400)
    expect(await prisma.serviceOrder.findUnique({ where: { id: serviceOrderA } })).toMatchObject({ status: 'IN_PROGRESS', finishedAt: null })
  })

  it('nega complete cross-tenant sem Timeline nem alteração na organização errada', async () => {
    await request(app.getHttpServer()).post('/executions/start').set(auth(orgB, userB, personB))
      .send({ serviceOrderId: serviceOrderB }).expect(201)
    const timelineBefore = await prisma.timelineEvent.count({ where: { orgId: { in: [orgA, orgB] } } })

    await request(app.getHttpServer()).post(`/executions/${serviceOrderB}/complete`).set(auth(orgA, userA, personA))
      .send({ notes: 'forged completion' }).expect(404)

    expect(await prisma.serviceOrder.findUnique({ where: { id: serviceOrderB } })).toMatchObject({ status: 'IN_PROGRESS', finishedAt: null })
    expect(await prisma.timelineEvent.count({ where: { orgId: { in: [orgA, orgB] } } })).toBe(timelineBefore)
  })
})

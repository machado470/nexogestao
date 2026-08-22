import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import request from 'supertest'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import { TimelineService } from '../../src/timeline/timeline.service'
import {
  describeRealIntegration,
  REAL_INTEGRATION_SKIP_REASON,
  RUN_REAL_INTEGRATION,
} from './infra-guards'

if (!RUN_REAL_INTEGRATION) {
  console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
}

describeRealIntegration('POST /admin/operational-state/:personId/force-normal', () => {
  jest.setTimeout(90000)
  let app: INestApplication
  let prisma: PrismaService
  let timeline: TimelineService

  const orgA = randomUUID()
  const orgB = randomUUID()
  const adminA = randomUUID()
  const operatorA = randomUUID()
  const adminB = randomUUID()
  const personA = randomUUID()
  const inactiveA = randomUUID()
  const personB = randomUUID()

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be explicitly configured for integration tests')
  }
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const auth = (sub: string, orgId: string, role: string) => ({
    Authorization: `Bearer ${jwt.sign({ sub, orgId, role })}`,
  })

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
    prisma = app.get(PrismaService)
    timeline = app.get(TimelineService)

    await prisma.organization.createMany({ data: [
      { id: orgA, name: 'Force Normal A', slug: `force-a-${orgA}` },
      { id: orgB, name: 'Force Normal B', slug: `force-b-${orgB}` },
    ] })
    await prisma.user.createMany({ data: [
      { id: adminA, orgId: orgA, email: `${adminA}@test.invalid`, role: 'ADMIN', active: true },
      { id: operatorA, orgId: orgA, email: `${operatorA}@test.invalid`, role: 'STAFF', active: true },
      { id: adminB, orgId: orgB, email: `${adminB}@test.invalid`, role: 'ADMIN', active: true },
    ] })
    await prisma.person.createMany({ data: [
      { id: personA, orgId: orgA, name: 'Active A', role: 'TECH', riskScore: 81, operationalState: 'RESTRICTED', operationalRiskScore: 74, operationalStateUpdatedAt: new Date('2026-01-01') },
      { id: inactiveA, orgId: orgA, name: 'Inactive A', role: 'TECH', active: false, riskScore: 55 },
      { id: personB, orgId: orgB, name: 'Active B', role: 'TECH', riskScore: 92, operationalState: 'SUSPENDED', operationalRiskScore: 96, operationalStateUpdatedAt: new Date('2026-02-01') },
    ] })
    await prisma.correctiveAction.createMany({ data: [
      { personId: personA, reason: 'A1' },
      { personId: personA, reason: 'A2' },
      { personId: inactiveA, reason: 'inactive' },
      { personId: personB, reason: 'B1' },
    ] })
  })

  afterAll(async () => {
    try {
      await prisma.timelineEvent.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
      await prisma.correctiveAction.deleteMany({ where: { personId: { in: [personA, inactiveA, personB] } } })
      await prisma.person.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
      await prisma.user.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    } finally {
      await app?.close()
    }
  })

  it('retorna 401 sem autenticação e 403 para OPERADOR', async () => {
    await request(app.getHttpServer()).post(`/admin/operational-state/${personA}/force-normal`).expect(401)
    await request(app.getHttpServer()).post(`/admin/operational-state/${personA}/force-normal`)
      .set(auth(operatorA, orgA, 'OPERADOR')).expect(403)
  })

  it('não revela nem altera pessoa de outro tenant ou pessoa inativa', async () => {
    const beforeB = await prisma.person.findUnique({ where: { id: personB } })
    await request(app.getHttpServer()).post(`/admin/operational-state/${personB}/force-normal`)
      .set(auth(adminA, orgA, 'ADMIN')).send({ orgId: orgB }).expect(404)
    await request(app.getHttpServer()).post(`/admin/operational-state/${inactiveA}/force-normal`)
      .set(auth(adminA, orgA, 'ADMIN')).expect(404)

    expect(await prisma.person.findUnique({ where: { id: personB } })).toMatchObject({ riskScore: beforeB?.riskScore })
    expect(await prisma.correctiveAction.count({ where: { personId: personB, status: 'OPEN' } })).toBe(1)
    expect(await prisma.correctiveAction.count({ where: { personId: inactiveA, status: 'OPEN' } })).toBe(1)
    expect(await prisma.timelineEvent.count({ where: { orgId: orgA } })).toBe(0)
  })

  it('ADMIN corrige apenas o legado, registra ator do JWT e repetição é no-op', async () => {
    const before = await prisma.person.findUniqueOrThrow({ where: { id: personA } })
    const url = `/admin/operational-state/${personA}/force-normal`
    await request(app.getHttpServer()).post(url).set(auth(adminA, orgA, 'ADMIN'))
      .send({ orgId: orgB, actorUserId: adminB }).expect(201)
    await request(app.getHttpServer()).post(url).set(auth(adminA, orgA, 'ADMIN')).expect(201)

    const after = await prisma.person.findUniqueOrThrow({ where: { id: personA } })
    expect(after).toMatchObject({
      riskScore: 0,
      operationalState: before.operationalState,
      operationalRiskScore: before.operationalRiskScore,
      operationalStateUpdatedAt: before.operationalStateUpdatedAt,
    })
    expect(await prisma.correctiveAction.count({ where: { personId: personA, status: 'DONE' } })).toBe(2)
    const events = await prisma.timelineEvent.findMany({ where: { orgId: orgA, personId: personA, action: 'ADMIN_FORCE_OPERATIONAL_STATE_NORMAL' } })
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({
      actorUserId: adminA,
      affectedPersonId: personA,
      previousRiskScore: 81,
      newRiskScore: 0,
      correctedActionsCount: 2,
    })
  })

  it('reverte pessoa e corretivas quando a Timeline falha', async () => {
    await prisma.person.update({ where: { id: personA }, data: { riskScore: 44 } })
    await prisma.correctiveAction.create({ data: { personId: personA, reason: 'rollback' } })
    const spy = jest.spyOn(timeline, 'logInTransaction').mockRejectedValueOnce(new Error('forced timeline failure'))

    await request(app.getHttpServer()).post(`/admin/operational-state/${personA}/force-normal`)
      .set(auth(adminA, orgA, 'ADMIN')).expect(500)

    expect((await prisma.person.findUniqueOrThrow({ where: { id: personA } })).riskScore).toBe(44)
    expect(await prisma.correctiveAction.count({ where: { personId: personA, status: 'OPEN' } })).toBe(1)
    spy.mockRestore()
  })

  it('serializa chamadas concorrentes e gera uma única evidência', async () => {
    const url = `/admin/operational-state/${personA}/force-normal`
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(url).set(auth(adminA, orgA, 'ADMIN')),
      request(app.getHttpServer()).post(url).set(auth(adminA, orgA, 'ADMIN')),
    ])
    expect([first.status, second.status]).toEqual([201, 201])
    expect(await prisma.timelineEvent.count({ where: { orgId: orgA, personId: personA, action: 'ADMIN_FORCE_OPERATIONAL_STATE_NORMAL' } })).toBe(2)
    expect(await prisma.correctiveAction.count({ where: { personId: personA, status: 'OPEN' } })).toBe(0)
  })
})

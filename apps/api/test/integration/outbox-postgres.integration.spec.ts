import { PrismaClient } from '@prisma/client'
import { OutboxRepository } from '../../src/outbox/outbox.repository'

const runReal = process.env.RUN_REAL_OUTBOX_INTEGRATION === 'true'
const databaseUrl = process.env.DATABASE_URL ?? ''

if (runReal && !/(outbox[_-]test|test[_-]outbox)/i.test(databaseUrl)) {
  throw new Error('Teste real da Outbox exige DATABASE_URL de banco isolado contendo outbox_test ou test_outbox')
}

const describeReal = runReal ? describe : describe.skip

describeReal('Outbox PostgreSQL real com dois workers', () => {
  const prismaA = new PrismaClient()
  const prismaB = new PrismaClient()
  const repositoryA = new OutboxRepository(prismaA as any)
  const repositoryB = new OutboxRepository(prismaB as any)
  const orgIds = ['outbox-real-org-a', 'outbox-real-org-b']

  const createEvent = (orgId: string, key: string, availableAt = new Date()) =>
    prismaA.operationalOutboxEvent.create({ data: {
      orgId, eventType: 'TEST_EVENT', aggregateType: 'Test', aggregateId: key,
      correlationId: key, idempotencyKey: key, payload: { timelineEventId: key, orgId: 'forjado' }, availableAt,
    } })

  beforeAll(async () => {
    await Promise.all(orgIds.map((id, index) => prismaA.organization.upsert({
      where: { slug: `outbox-real-${index}` }, update: {}, create: { id, slug: `outbox-real-${index}`, name: `Outbox Real ${index}` },
    })))
  })

  beforeEach(async () => {
    await prismaA.operationalOutboxEvent.deleteMany({ where: { orgId: { in: orgIds } } })
  })

  afterAll(async () => {
    await prismaA.operationalOutboxEvent.deleteMany({ where: { orgId: { in: orgIds } } })
    await prismaA.organization.deleteMany({ where: { id: { in: orgIds } } })
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()])
  })

  it('divide um lote simultâneo sem sobreposição', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => createEvent(orgIds[0], `batch-${i}`)))
    const staleBefore = new Date(Date.now() - 60_000)
    const [claimedA, claimedB] = await Promise.all([
      repositoryA.claimBatch({ workerId: 'worker-a', batchSize: 6, staleBefore }),
      repositoryB.claimBatch({ workerId: 'worker-b', batchSize: 6, staleBefore }),
    ])
    expect(claimedA).toHaveLength(6)
    expect(claimedB).toHaveLength(6)
    expect(claimedA.filter(a => claimedB.some(b => b.id === a.id))).toHaveLength(0)
    expect(new Set([...claimedA, ...claimedB].map(event => event.id)).size).toBe(12)
  })

  it('protege propriedade, recupera lock abandonado e respeita retry/backoff', async () => {
    const event = await createEvent(orgIds[0], 'abandoned')
    const [claimed] = await repositoryA.claimBatch({ workerId: 'worker-a', batchSize: 1, staleBefore: new Date(0) })
    expect(claimed.id).toBe(event.id)
    expect(await repositoryB.markProcessed(event.id, 'worker-b')).toEqual({ count: 0 })
    expect(await repositoryB.markRetry({ id: event.id, workerId: 'worker-b', attempts: 1, error: 'x' })).toEqual({ count: 0 })
    expect(await repositoryB.markFailed({ id: event.id, workerId: 'worker-b', error: 'x' })).toEqual({ count: 0 })
    expect(await repositoryB.claimBatch({ workerId: 'worker-b', batchSize: 1, staleBefore: new Date(0) })).toHaveLength(0)

    await prismaA.operationalOutboxEvent.update({ where: { id: event.id }, data: { lockedAt: new Date(Date.now() - 120_000) } })
    const [recovered] = await repositoryB.claimBatch({ workerId: 'worker-b', batchSize: 1, staleBefore: new Date(Date.now() - 60_000) })
    expect(recovered.id).toBe(event.id)
    expect(recovered.attempts).toBe(2)

    expect(await repositoryB.markRetry({ id: event.id, workerId: 'worker-b', attempts: 2, error: 'temporário', backoffBaseMs: 100 })).toEqual({ count: 1 })
    const retry = await prismaA.operationalOutboxEvent.findUniqueOrThrow({ where: { id: event.id } })
    expect(retry.status).toBe('RETRY')
    expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now())
    expect(await repositoryA.claimBatch({ workerId: 'worker-a', batchSize: 1, staleBefore: new Date(0) })).toHaveLength(0)
    await prismaA.operationalOutboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(0) } })
    const [last] = await repositoryA.claimBatch({ workerId: 'worker-a', batchSize: 1, staleBefore: new Date(0) })
    expect(last.attempts).toBe(3)
    expect(await repositoryA.markFailed({ id: event.id, workerId: 'worker-a', error: 'definitivo' })).toEqual({ count: 1 })
    expect(await prismaA.operationalOutboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'FAILED', lastError: 'definitivo' })
  })

  it('aplica idempotência por tenant e ignora orgId forjado no payload', async () => {
    await createEvent(orgIds[0], 'same-key')
    await expect(createEvent(orgIds[0], 'same-key')).rejects.toMatchObject({ code: 'P2002' })
    await expect(createEvent(orgIds[1], 'same-key')).resolves.toMatchObject({ orgId: orgIds[1] })
    const [claimed] = await repositoryA.claimBatch({ workerId: 'tenant-worker', batchSize: 1, staleBefore: new Date(0) })
    expect(claimed.orgId).toBe(orgIds[0])
    expect((claimed.payload as any).orgId).toBe('forjado')
  })
})

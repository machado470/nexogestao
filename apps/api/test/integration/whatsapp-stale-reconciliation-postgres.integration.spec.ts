import { PrismaClient } from '@prisma/client'
import { WhatsAppService } from '../../src/whatsapp/whatsapp.service'
import { TimelineService } from '../../src/timeline/timeline.service'

const runReal =
  process.env.RUN_REAL_WHATSAPP_RECONCILIATION_INTEGRATION === 'true'

const databaseUrl = process.env.DATABASE_URL ?? ''

if (
  runReal &&
  !/(outbox[_-]test|whatsapp[_-]test|test[_-]whatsapp)/i.test(databaseUrl)
) {
  throw new Error(
    'Teste real de reconciliação WhatsApp exige DATABASE_URL de banco isolado',
  )
}

const describeReal = runReal ? describe : describe.skip

describeReal('WhatsApp stale SENDING reconciliation PostgreSQL real', () => {
  const prismaA = new PrismaClient()
  const prismaB = new PrismaClient()

  const orgId = 'whatsapp-reconcile-real-org'
  const orgSlug = 'whatsapp-reconcile-real'

  function makeTimeline(prisma: PrismaClient) {
    return new TimelineService(
      prisma as any,
      { requestId: null } as any,
      {} as any,
    )
  }

  function makeService(prisma: PrismaClient, timeline: any) {
    return new WhatsAppService(
      prisma as any,
      { addJob: jest.fn() } as any,
      {
        incOutbound: jest.fn(),
        incInbound: jest.fn(),
        incFailed: jest.fn(),
        incFailedWebhook: jest.fn(),
        incQueuedJobs: jest.fn(),
        observeProcessingDuration: jest.fn(),
      } as any,
      timeline,
      {
        orgId: null,
        userId: null,
        requestId: null,
      } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any,
    {} as any,
    )
  }

  async function createStaleMessage(suffix: string) {
    return prismaA.whatsAppMessage.create({
      data: {
        orgId,
        entityType: 'GENERAL',
        entityId: `entity-${suffix}`,
        messageType: 'MANUAL',
        status: 'SENDING',
        toPhone: '+5548999999999',
        renderedText: `teste ${suffix}`,
        content: `teste ${suffix}`,
        lockedAt: new Date(Date.now() - 10 * 60_000),
        lockedBy: `dead-worker-${suffix}`,
      } as any,
    })
  }

  beforeAll(async () => {
    await prismaA.organization.upsert({
      where: { slug: orgSlug },
      update: {},
      create: {
        id: orgId,
        slug: orgSlug,
        name: 'WhatsApp Reconciliation Real',
      },
    })
  })

  beforeEach(async () => {
    await prismaA.timelineEvent.deleteMany({
      where: { orgId },
    })

    await prismaA.whatsAppMessage.deleteMany({
      where: { orgId },
    })
  })

  afterAll(async () => {
    await prismaA.timelineEvent.deleteMany({
      where: { orgId },
    })

    await prismaA.whatsAppMessage.deleteMany({
      where: { orgId },
    })

    await prismaA.organization.deleteMany({
      where: { id: orgId },
    })

    await Promise.all([
      prismaA.$disconnect(),
      prismaB.$disconnect(),
    ])
  })

  it('commita UNCERTAIN e MESSAGE_SEND_UNCERTAIN juntos', async () => {
    const message = await createStaleMessage('commit')

    const service = makeService(
      prismaA,
      makeTimeline(prismaA),
    )

    const result = await service.reconcileStaleSending({
      limit: 10,
    })

    expect(result.map(row => row.id)).toContain(message.id)

    const persisted =
      await prismaA.whatsAppMessage.findUniqueOrThrow({
        where: { id: message.id },
      })

    expect(persisted).toMatchObject({
      status: 'UNCERTAIN',
      lockedAt: null,
      lockedBy: null,
      errorCode: 'STALE_SENDING_TIMEOUT',
    })

    const events = await prismaA.timelineEvent.findMany({
      where: {
        orgId,
        action: 'MESSAGE_SEND_UNCERTAIN',
      },
    })

    expect(events).toHaveLength(1)
    expect((events[0].metadata as any)?.messageId).toBe(message.id)
    expect((events[0].metadata as any)?.status).toBe('UNCERTAIN')
  })

  it('faz rollback real se a Timeline falhar', async () => {
    const message = await createStaleMessage('rollback')

    const failingTimeline = {
      logInTransaction: jest.fn().mockRejectedValue(
        new Error('forced timeline failure'),
      ),
    }

    const service = makeService(
      prismaA,
      failingTimeline,
    )

    await expect(
      service.reconcileStaleSending({
        limit: 10,
      }),
    ).rejects.toThrow('forced timeline failure')

    const persisted =
      await prismaA.whatsAppMessage.findUniqueOrThrow({
        where: { id: message.id },
      })

    expect(persisted.status).toBe('SENDING')
    expect(persisted.lockedAt).not.toBeNull()
    expect(persisted.lockedBy).toBe('dead-worker-rollback')
    expect(persisted.errorCode).toBeNull()

    const events = await prismaA.timelineEvent.count({
      where: {
        orgId,
        action: 'MESSAGE_SEND_UNCERTAIN',
      },
    })

    expect(events).toBe(0)
  })

  it('duas instâncias reconciliam a mesma mensagem apenas uma vez', async () => {
    const message = await createStaleMessage('concurrent')

    const serviceA = makeService(
      prismaA,
      makeTimeline(prismaA),
    )

    const serviceB = makeService(
      prismaB,
      makeTimeline(prismaB),
    )

    const [resultA, resultB] = await Promise.all([
      serviceA.reconcileStaleSending({ limit: 10 }),
      serviceB.reconcileStaleSending({ limit: 10 }),
    ])

    const reconciledIds = [
      ...resultA.map(row => row.id),
      ...resultB.map(row => row.id),
    ]

    expect(
      reconciledIds.filter(id => id === message.id),
    ).toHaveLength(1)

    const persisted =
      await prismaA.whatsAppMessage.findUniqueOrThrow({
        where: { id: message.id },
      })

    expect(persisted.status).toBe('UNCERTAIN')

    const events = await prismaA.timelineEvent.findMany({
      where: {
        orgId,
        action: 'MESSAGE_SEND_UNCERTAIN',
      },
    })

    expect(events).toHaveLength(1)
    expect((events[0].metadata as any)?.messageId).toBe(message.id)
  })
})

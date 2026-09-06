import { WhatsAppService } from './whatsapp.service'

describe('WhatsAppService stale SENDING reconciliation', () => {
  function makeService(prisma: any) {
    const timeline = {
      log: jest.fn().mockResolvedValue({}),
      logInTransaction: jest.fn().mockResolvedValue({ id: 'timeline-1' }),
    }

    const service = new WhatsAppService(
      prisma,
      { addJob: jest.fn() } as any,
      {
        incOutbound: jest.fn(),
        incInbound: jest.fn(),
        incFailed: jest.fn(),
        incFailedWebhook: jest.fn(),
        incQueuedJobs: jest.fn(),
        observeProcessingDuration: jest.fn(),
      } as any,
      timeline as any,
      {
        orgId: 'test-org',
        userId: 'test-user',
        requestId: 'test-request',
      } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any,
    {} as any,
    )

    return { service, timeline }
  }

  function makePrisma(rows: any[] = []) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      whatsAppMessage: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      person: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      customer: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
          where?.id ? { id: where.id } : null,
        ),
      },
      timelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'timeline-1' }),
      },
    }

    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    }

    return { prisma, tx }
  }

  function reconciledMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'm1',
      orgId: 'org1',
      status: 'UNCERTAIN',
      messageType: 'MANUAL',
      customerId: null,
      providerMessageId: null,
      entityType: 'GENERAL',
      entityId: 'entity-1',
      conversationId: null,
      direction: 'OUTBOUND',
      errorCode: 'STALE_SENDING_TIMEOUT',
      errorMessage:
        'Envio permaneceu em SENDING além do tempo de ownership; resultado externo incerto',
      lockedAt: null,
      lockedBy: null,
      ...overrides,
    }
  }

  it('reconcilia somente SENDING com lockedAt antigo para UNCERTAIN', async () => {
    const { prisma, tx } = makePrisma()
    const { service } = makeService(prisma)

    await (service as any).reconcileStaleSending({ limit: 25 })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)

    const sql = String(
      tx.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    expect(sql).toContain(
      'status = \'SENDING\'::"WhatsAppMessageStatus"',
    )
    expect(sql).toContain('"lockedAt" IS NOT NULL')
    expect(sql).toContain('"lockedAt" < NOW()')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain(
      'status = \'UNCERTAIN\'::"WhatsAppMessageStatus"',
    )
    expect(sql).toContain('"lockedAt" = NULL')
    expect(sql).toContain('"lockedBy" = NULL')
    expect(sql).not.toContain(
      'status = \'QUEUED\'::"WhatsAppMessageStatus"',
    )
  })

  it('usa lockedAt e não updatedAt como relógio de abandono', async () => {
    const { prisma, tx } = makePrisma()
    const { service } = makeService(prisma)

    await (service as any).reconcileStaleSending({ limit: 10 })

    const sql = String(
      tx.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    const selectionStart = sql.indexOf('FROM "WhatsAppMessage"')
    const selectionEnd = sql.indexOf('FOR UPDATE SKIP LOCKED')

    expect(selectionStart).toBeGreaterThanOrEqual(0)
    expect(selectionEnd).toBeGreaterThan(selectionStart)

    const selectionSql = sql.slice(selectionStart, selectionEnd)

    expect(selectionSql).toContain('"lockedAt" < NOW()')
    expect(selectionSql).not.toContain('"updatedAt" <')
  })

  it('não fabrica nem altera provider ou providerMessageId', async () => {
    const { prisma, tx } = makePrisma()
    const { service } = makeService(prisma)

    await (service as any).reconcileStaleSending({ limit: 10 })

    const sql = String(
      tx.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    const setStart = sql.indexOf('SET')
    const setEnd = sql.indexOf('FROM stale')
    const updateSql = sql.slice(setStart, setEnd)

    expect(updateSql).not.toContain('provider =')
    expect(updateSql).not.toContain('"providerMessageId" =')
  })

  it('persiste MESSAGE_SEND_UNCERTAIN e governanceSignal na mesma transação', async () => {
    const row = reconciledMessage({ customerId: 'customer-1' })
    const { prisma, tx } = makePrisma([row])
    const { service, timeline } = makeService(prisma)

    tx.whatsAppMessage.count.mockResolvedValue(2)
    tx.whatsAppMessage.findFirst.mockResolvedValue({
      failedAt: new Date('2026-08-18T20:00:00.000Z'),
    })

    const result = await (service as any).reconcileStaleSending({
      limit: 10,
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)

    expect(timeline.logInTransaction).toHaveBeenCalledTimes(1)
    expect(timeline.logInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org1',
        action: 'MESSAGE_SEND_UNCERTAIN',
        customerId: 'customer-1',
        metadata: expect.objectContaining({
          messageId: 'm1',
          status: 'UNCERTAIN',
          governanceSignal: {
            communicationFailure: true,
            failedMessageCount: 2,
            lastFailedAt: '2026-08-18T20:00:00.000Z',
          },
        }),
      }),
      tx,
    )

    expect(result).toEqual([row])
  })

  it('propaga falha da Timeline para abortar a transação', async () => {
    const row = reconciledMessage()
    const { prisma } = makePrisma([row])
    const { service, timeline } = makeService(prisma)

    timeline.logInTransaction.mockRejectedValueOnce(
      new Error('timeline unavailable'),
    )

    await expect(
      (service as any).reconcileStaleSending({ limit: 10 }),
    ).rejects.toThrow('timeline unavailable')
  })

  it('não registra Timeline quando nenhum SENDING stale foi encontrado', async () => {
    const { prisma } = makePrisma([])
    const { service, timeline } = makeService(prisma)

    const result = await (service as any).reconcileStaleSending({
      limit: 10,
    })

    expect(result).toEqual([])
    expect(timeline.logInTransaction).not.toHaveBeenCalled()
  })

  it('limita o lote de reconciliação', async () => {
    const { prisma, tx } = makePrisma()
    const { service } = makeService(prisma)

    await (service as any).reconcileStaleSending({ limit: 7 })

    const query = tx.$queryRaw.mock.calls[0][0]
    const values = Array.isArray(query?.values) ? query.values : []

    expect(values).toContain(7)
  })
})

import { WhatsAppService } from './whatsapp.service'

describe('WhatsAppService dispatch claim safety', () => {
  function makeService(prisma: any) {
    return new WhatsAppService(
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
      { log: jest.fn().mockResolvedValue({}) } as any,
      {
        orgId: 'test-org',
        userId: 'test-user',
        requestId: 'test-request',
      } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any,
    {} as any,
    )
  }

  it('claimMessageForDispatch somente torna QUEUED elegível', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    }

    const service = makeService(prisma)

    const result = await service.claimMessageForDispatch({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-b',
    })

    expect(result).toBeNull()

    const sql = String(
      prisma.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    const whereStart = sql.indexOf('WHERE id =')
    const whereEnd = sql.indexOf('RETURNING *')

    expect(whereStart).toBeGreaterThanOrEqual(0)
    expect(whereEnd).toBeGreaterThan(whereStart)

    const eligibilitySql = sql.slice(whereStart, whereEnd)

    expect(eligibilitySql).toContain(
      'status = \'QUEUED\'::"WhatsAppMessageStatus"',
    )

    expect(eligibilitySql).not.toContain(
      'status = \'SENDING\'::"WhatsAppMessageStatus"',
    )

    // SENDING continua correto como destino da transição.
    expect(sql.slice(0, whereStart)).toContain(
      'status = \'SENDING\'::"WhatsAppMessageStatus"',
    )
  })

  it('claimQueued somente seleciona QUEUED e preserva SKIP LOCKED', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    }

    const service = makeService(prisma)

    await service.claimQueued({
      workerId: 'worker-a',
      limit: 25,
    })

    const sql = String(
      prisma.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    const selectionStart = sql.indexOf('FROM "WhatsAppMessage"')
    const selectionEnd = sql.indexOf('ORDER BY "createdAt" ASC')

    expect(selectionStart).toBeGreaterThanOrEqual(0)
    expect(selectionEnd).toBeGreaterThan(selectionStart)

    const eligibilitySql = sql.slice(selectionStart, selectionEnd)

    expect(eligibilitySql).toContain(
      'status = \'QUEUED\'::"WhatsAppMessageStatus"',
    )

    expect(eligibilitySql).not.toContain(
      'status = \'SENDING\'::"WhatsAppMessageStatus"',
    )

    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('UPDATE "WhatsAppMessage" AS m')
  })
})

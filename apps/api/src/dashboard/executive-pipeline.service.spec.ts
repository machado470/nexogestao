import { DashboardService } from './dashboard.service'

describe('DashboardService executive pipeline authority', () => {
  const aggregate = (count: number, field: 'updatedAt' | 'paidAt', value: Date | null) => ({
    _count: { _all: count },
    _max: { [field]: value },
  })
  const prisma = {
    customer: { aggregate: jest.fn() },
    appointment: { aggregate: jest.fn() },
    serviceOrder: { aggregate: jest.fn() },
    charge: { aggregate: jest.fn() },
    payment: { aggregate: jest.fn() },
  }
  const service = new DashboardService(prisma as any, {} as any, {} as any)

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.customer.aggregate.mockResolvedValue(aggregate(4, 'updatedAt', new Date('2026-08-01T10:00:00Z')))
    prisma.appointment.aggregate.mockResolvedValue(aggregate(3, 'updatedAt', new Date('2026-08-02T10:00:00Z')))
    prisma.serviceOrder.aggregate.mockResolvedValue(aggregate(2, 'updatedAt', new Date('2026-08-03T10:00:00Z')))
    prisma.charge.aggregate.mockResolvedValue(aggregate(1, 'updatedAt', new Date('2026-08-04T10:00:00Z')))
    prisma.payment.aggregate.mockResolvedValue(aggregate(1, 'paidAt', new Date('2026-08-05T10:00:00Z')))
  })

  it('preserva ordem, fatos e indisponibilidade sem inferir decisão por volume', async () => {
    const result = await service.getExecutivePipeline('org-a')

    expect(result.stages.map(stage => stage.key)).toEqual([
      'customers', 'appointments', 'service-orders', 'charges', 'payments',
    ])
    expect(result.stages.map(stage => stage.volume)).toEqual([4, 3, 2, 1, 1])
    expect(result.stages.every(stage => stage.state === 'unavailable')).toBe(true)
    expect(result.stages.every(stage => stage.reason.includes('Não existe política canônica'))).toBe(true)
  })

  it('isola todas as fontes pelo tenant recebido da sessão', async () => {
    await service.getExecutivePipeline('org-session')

    for (const repository of Object.values(prisma)) {
      expect(repository.aggregate).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ orgId: 'org-session' }),
      }))
    }
  })

  it('mantém estado e timestamp indisponíveis quando não há evidência', async () => {
    prisma.customer.aggregate.mockResolvedValue(aggregate(0, 'updatedAt', null))

    const customer = (await service.getExecutivePipeline('org-empty')).stages[0]
    expect(customer).toEqual(expect.objectContaining({
      key: 'customers', volume: 0, state: 'unavailable', referenceTimestamp: null,
    }))
  })
})

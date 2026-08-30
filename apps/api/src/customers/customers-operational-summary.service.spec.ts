import { CustomersOperationalSummaryService } from './customers-operational-summary.service'

describe('CustomersOperationalSummaryService', () => {
  const now = new Date('2026-08-30T12:00:00.000Z')

  function buildPrisma() {
    return {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'customer-risk',
            name: 'Cliente em risco',
            active: true,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
          {
            id: 'customer-normal',
            name: 'Cliente normal',
            active: true,
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-20T00:00:00.000Z'),
          },
        ]),
      },
      charge: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'charge-overdue',
            customerId: 'customer-risk',
            status: 'OVERDUE',
            amountCents: 100_000,
            payments: [],
          },
        ]),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      whatsAppMessage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      whatsAppConversation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timelineEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
  }

  it('carrega os sinais da carteira em lote e retorna decisão autoritativa', async () => {
    const prisma = buildPrisma()
    const service = new CustomersOperationalSummaryService(
      prisma as any,
    )

    const result = await service.getSummary('org-1', now)

    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.charge.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.serviceOrder.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.appointment.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.timelineEvent.findMany).toHaveBeenCalledTimes(1)

    expect(result.customers).toHaveLength(2)

    expect(result.customers[0]).toEqual(
      expect.objectContaining({
        customerId: 'customer-risk',
        operationalStatus: 'RISCO',
        priority: 'P0',
        riskScore: 75,
        riskState: 'RESTRICTED',
        recommendedActionLabel: 'Revisar cobrança',
        recommendedActionTarget: 'FINANCES',
      }),
    )

    expect(result.customers[1]).toEqual(
      expect.objectContaining({
        customerId: 'customer-normal',
        operationalStatus: 'NORMAL',
        priority: 'P3',
        riskScore: 0,
        riskState: 'NORMAL',
        recommendedActionLabel: null,
        recommendedActionTarget: null,
      }),
    )

    expect(result.portfolio).toEqual(
      expect.objectContaining({
        operationalStatus: 'RISCO',
        totalCustomers: 2,
        normalCustomers: 1,
        riskCustomers: 1,
      }),
    )
  })

  it('retorna carteira NORMAL sem clientes', async () => {
    const prisma = buildPrisma()
    prisma.customer.findMany.mockResolvedValue([])

    const service = new CustomersOperationalSummaryService(
      prisma as any,
    )

    const result = await service.getSummary('org-1', now)

    expect(result).toEqual(
      expect.objectContaining({
        portfolio: expect.objectContaining({
          operationalStatus: 'NORMAL',
          totalCustomers: 0,
        }),
        customers: [],
      }),
    )

    expect(prisma.charge.findMany).not.toHaveBeenCalled()
  })
})

import { CustomersService } from './customers.service'

describe('CustomersService workspace financial summary', () => {
  it('calcula total gasto pela soma histórica de Payment do cliente', async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'customer-1',
          orgId: 'org-1',
          name: 'Cliente',
        }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      charge: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timelineEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amountCents: 3500 },
        }),
      },
    }

    const service = new CustomersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )

    const result = await service.workspace('org-1', 'customer-1')

    expect(prisma.payment.aggregate).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        charge: {
          orgId: 'org-1',
          customerId: 'customer-1',
        },
      },
      _sum: {
        amountCents: true,
      },
    })

    expect(result.totalSpentCents).toBe(3500)
  })

  it('retorna zero quando não existem pagamentos', async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'customer-1',
          orgId: 'org-1',
          name: 'Cliente',
        }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      charge: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timelineEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amountCents: null },
        }),
      },
    }

    const service = new CustomersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )

    const result = await service.workspace('org-1', 'customer-1')

    expect(result.totalSpentCents).toBe(0)
  })
})

import { BillingService } from './billing.service'

describe('BillingService canonical plan catalog', () => {
  it('expõe preço persistido e quotas efetivamente aplicadas', async () => {
    const prisma = {
      plan: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'PRO',
            displayName: 'Pro',
            priceCents: 19900,
            limitsJson: { automation_executions: 15000 },
            featuresJson: { advanced_automation: true },
          },
          {
            name: 'STARTER',
            displayName: 'Basic',
            priceCents: 9900,
            limitsJson: { automation_executions: 2500 },
            featuresJson: { advanced_automation: false },
          },
        ]),
      },
    }

    const quotas = {
      getQuotaLimits: jest.fn((plan: string) =>
        plan === 'STARTER'
          ? {
              customers: 30,
              appointments: 200,
              messages: 500,
              serviceOrders: 100,
              users: 5,
              storage: 500,
            }
          : {
              customers: 100,
              appointments: 2000,
              messages: 5000,
              serviceOrders: 1000,
              users: 10,
              storage: 5000,
            }
      ),
    }

    const service = new BillingService(
      prisma as any,
      { get: jest.fn().mockReturnValue('') } as any,
      quotas as any
    )

    await expect(service.getPlanCatalog()).resolves.toEqual([
      {
        name: 'STARTER',
        displayName: 'Basic',
        priceCents: 9900,
        quotas: {
          customers: 30,
          appointments: 200,
          messages: 500,
          serviceOrders: 100,
          users: 5,
          storage: 500,
        },
        commercialLimits: { automation_executions: 2500 },
        features: { advanced_automation: false },
      },
      {
        name: 'PRO',
        displayName: 'Pro',
        priceCents: 19900,
        quotas: {
          customers: 100,
          appointments: 2000,
          messages: 5000,
          serviceOrders: 1000,
          users: 10,
          storage: 5000,
        },
        commercialLimits: { automation_executions: 15000 },
        features: { advanced_automation: true },
      },
    ])

    expect(quotas.getQuotaLimits).toHaveBeenCalledWith('STARTER')
    expect(quotas.getQuotaLimits).toHaveBeenCalledWith('PRO')
  })

  it('não publica planos desconhecidos no catálogo comercial', async () => {
    const prisma = {
      plan: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'LEGACY',
            displayName: 'Legacy',
            priceCents: 12345,
            limitsJson: {},
            featuresJson: {},
          },
        ]),
      },
    }

    const quotas = {
      getQuotaLimits: jest.fn(),
    }

    const service = new BillingService(
      prisma as any,
      { get: jest.fn().mockReturnValue('') } as any,
      quotas as any
    )

    await expect(service.getPlanCatalog()).resolves.toEqual([])
    expect(quotas.getQuotaLimits).not.toHaveBeenCalled()
  })
})

import { BillingService } from './billing.service'

describe('BillingService quota authority', () => {
  const config = {
    get: jest.fn(() => ''),
  } as any

  function makeService(subscription: any) {
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
      },
    } as any

    const quotas = {
      getQuotaLimits: jest.fn((plan: string) => ({
        authority: 'QuotasService',
        plan,
      })),
    } as any

    return {
      service: new BillingService(prisma, config, quotas),
      quotas,
    }
  }

  it('usa FREE do QuotasService quando não existe assinatura', async () => {
    const { service, quotas } = makeService(null)

    await expect(service.getSubscription('org-1')).resolves.toEqual({
      status: 'NO_SUBSCRIPTION',
      plan: null,
      limits: {
        authority: 'QuotasService',
        plan: 'FREE',
      },
    })

    expect(quotas.getQuotaLimits).toHaveBeenCalledTimes(1)
    expect(quotas.getQuotaLimits).toHaveBeenCalledWith('FREE')
  })

  it('obtém limites do plano exclusivamente pelo QuotasService', async () => {
    const subscription = {
      id: 'sub-1',
      orgId: 'org-1',
      status: 'ACTIVE',
      plan: {
        name: 'PRO',
      },
    }

    const { service, quotas } = makeService(subscription)

    const result = await service.getSubscription('org-1')

    expect(result).toEqual({
      ...subscription,
      limits: {
        authority: 'QuotasService',
        plan: 'PRO',
      },
    })

    expect(quotas.getQuotaLimits).toHaveBeenCalledTimes(1)
    expect(quotas.getQuotaLimits).toHaveBeenCalledWith('PRO')
  })

  it('preserva o alias BUSINESS para SCALE antes de consultar quotas', async () => {
    const subscription = {
      id: 'sub-1',
      orgId: 'org-1',
      status: 'ACTIVE',
      plan: {
        name: 'BUSINESS',
      },
    }

    const { service, quotas } = makeService(subscription)

    await service.getSubscription('org-1')

    expect(quotas.getQuotaLimits).toHaveBeenCalledWith('SCALE')
  })
})

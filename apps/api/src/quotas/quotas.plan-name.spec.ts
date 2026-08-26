import { PLAN_LIMITS, QuotasService } from './quotas.service'

describe('QuotasService canonical plan identity', () => {
  const service = new QuotasService({} as any)

  it('mantém BUSINESS como plano canônico', () => {
    expect(service.getQuotaLimits('BUSINESS')).toBe(PLAN_LIMITS.BUSINESS)
  })

  it('aceita SCALE somente como alias legado de entrada', () => {
    expect(service.getQuotaLimits('SCALE')).toBe(PLAN_LIMITS.BUSINESS)
  })

  it('não mantém uma segunda tabela SCALE', () => {
    expect(Object.prototype.hasOwnProperty.call(PLAN_LIMITS, 'SCALE')).toBe(false)
  })
})

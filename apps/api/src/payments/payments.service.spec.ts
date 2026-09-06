import { PaymentsService } from './payments.service'

describe('PaymentsService production hardening', () => {
  it('falha rápido quando STRIPE_SECRET_KEY está ausente em produção', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production'
        if (key === 'STRIPE_SECRET_KEY') return ''
        return ''
      }),
    } as any

    expect(
      () => new PaymentsService(config, {} as any, {} as any),
    ).toThrow('STRIPE_SECRET_KEY/STRIPE_KEY é obrigatório em produção')
  })
})

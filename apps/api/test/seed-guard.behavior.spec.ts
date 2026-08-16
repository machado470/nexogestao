import { assertSeedAllowed, PRODUCTION_SEED_BREAK_GLASS } from '../../../prisma/seed-guard'

describe('proteção comportamental da seed', () => {
  it.each([undefined, '', 'incorreta', `${PRODUCTION_SEED_BREAK_GLASS} `])(
    'bloqueia produção com autorização %p',
    authorization => {
      expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_PRODUCTION_SEED: authorization } as any))
        .toThrow('Seed bloqueada em produção')
    },
  )

  it('exige a frase break-glass exata em produção', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_PRODUCTION_SEED: PRODUCTION_SEED_BREAK_GLASS } as any)).not.toThrow()
  })

  it.each(['development', 'pilot', 'test'] as const)('preserva o contrato em %s', NODE_ENV => {
    expect(() => assertSeedAllowed({ NODE_ENV } as any)).not.toThrow()
  })
})

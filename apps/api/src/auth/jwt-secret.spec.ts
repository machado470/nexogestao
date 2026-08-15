import { ConfigService } from '@nestjs/config'

import { createJwtModuleOptions } from './auth.module'
import { resolveJwtSecret } from './jwt-secret'
import { JwtStrategy } from './jwt.strategy'

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService
}

describe('JWT secret resolution', () => {
  it.each([
    ['an absent value', undefined],
    ['an empty value', '   '],
  ])('rejects %s in production', (_label, value) => {
    expect(() =>
      resolveJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: value })),
    ).toThrow('JWT_SECRET')
  })

  it('rejects the insecure legacy value in production', () => {
    expect(() =>
      resolveJwtSecret(
        config({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret' }),
      ),
    ).toThrow('JWT_SECRET')
  })

  it('accepts an explicitly configured value without exposing it', () => {
    const configuredSecret = 'unit-test-only-explicit-secret'

    expect(
      resolveJwtSecret(
        config({ NODE_ENV: 'production', JWT_SECRET: configuredSecret }),
      ),
    ).toBe(configuredSecret)
  })

  it('uses the same validated secret for signing and verification', (done) => {
    const configuredSecret = 'shared-unit-test-secret'
    const environment = config({
      NODE_ENV: 'test',
      JWT_SECRET: configuredSecret,
      JWT_EXPIRES_IN: '1h',
    })

    const signingOptions = createJwtModuleOptions(environment)
    const strategy = new JwtStrategy(environment)

    expect(signingOptions.secret).toBe(configuredSecret)
    ;(strategy as any)._secretOrKeyProvider(
      {},
      'irrelevant-test-token',
      (error: Error | null, verificationSecret: string) => {
        expect(error).toBeNull()
        expect(verificationSecret).toBe(signingOptions.secret)
        done()
      },
    )
  })
})

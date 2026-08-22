import { ConfigService } from '@nestjs/config'
import { JwtStrategy } from './jwt.strategy'

describe('JwtStrategy', () => {
  it('preserva exp para consumidores autenticados de longa duração', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret'
        if (key === 'NODE_ENV') return 'test'
        return undefined
      }),
    } as unknown as ConfigService

    const strategy = new JwtStrategy(config)

    await expect(strategy.validate({
      sub: 'user-a',
      orgId: 'org-a',
      role: 'ADMIN',
      personId: 'person-a',
      exp: 1_900_000_000,
    })).resolves.toEqual({
      sub: 'user-a',
      userId: 'user-a',
      role: 'ADMIN',
      orgId: 'org-a',
      personId: 'person-a',
      exp: 1_900_000_000,
    })
  })
})

import { UnauthorizedException } from '@nestjs/common'

import { AuthService } from './auth.service'

describe('AuthService Google OAuth', () => {
  const persistedUser = {
    id: 'user-persisted',
    email: 'existing@example.com',
    role: 'MEMBER',
    orgId: 'org-persisted',
    active: true,
    emailVerifiedAt: new Date(),
    person: { id: 'person-persisted', active: true },
  }

  function createSubject(foundUser: any = persistedUser) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(foundUser),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    }
    const jwt = { sign: jest.fn().mockReturnValue('signed-test-token') }
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const service = new AuthService(
      prisma as any,
      jwt as any,
      {} as any,
      config as any,
    )

    return { service, prisma, jwt }
  }

  it('authenticates an active existing user with persisted identity and tenant data', async () => {
    const { service, prisma, jwt } = createSubject()

    const result = await service.validateGoogleUser({
      email: ' Existing@Example.com ',
      role: 'ADMIN',
      orgId: 'org-from-client',
    })

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'existing@example.com' },
      include: { person: true },
    })
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: persistedUser.id,
      role: persistedUser.role,
      orgId: persistedUser.orgId,
      personId: persistedUser.person.id,
    })
    expect(result.user).toEqual({
      id: persistedUser.id,
      role: persistedUser.role,
      orgId: persistedUser.orgId,
      personId: persistedUser.person.id,
    })
  })

  it('denies an unknown user without creating identities, tenants, or a JWT', async () => {
    const { service, prisma, jwt } = createSubject(null)

    await expect(
      service.validateGoogleUser({ email: 'unknown@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
    expect(prisma.organization.create).not.toHaveBeenCalled()
    expect(jwt.sign).not.toHaveBeenCalled()
  })

  it.each([
    ['an inactive account', { ...persistedUser, active: false }],
    ['an account without a person', { ...persistedUser, person: null }],
    [
      'an account with an inactive person',
      { ...persistedUser, person: { ...persistedUser.person, active: false } },
    ],
  ])('denies %s before issuing a JWT', async (_label, user) => {
    const { service, jwt } = createSubject(user)

    await expect(
      service.validateGoogleUser({ email: persistedUser.email }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(jwt.sign).not.toHaveBeenCalled()
  })

  it('denies a Google profile without a valid email', async () => {
    const { service, prisma, jwt } = createSubject()

    await expect(service.validateGoogleUser({ email: '  ' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(jwt.sign).not.toHaveBeenCalled()
  })
})

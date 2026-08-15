import { ForbiddenException } from '@nestjs/common'
import { ActiveUserGuard } from './active-user.guard'

describe('ActiveUserGuard', () => {
  const context = (user: any) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any

  it('valida simultaneamente identidade, organização e estado ativo persistidos', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-a' }) } }
    const guard = new ActiveUserGuard(prisma as any)
    await expect(guard.canActivate(context({ sub: 'user-a', orgId: 'org-a' }))).resolves.toBe(true)
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-a', orgId: 'org-a', active: true },
      select: { id: true },
    })
  })

  it('rejeita usuário inativo ou de outra organização', async () => {
    const guard = new ActiveUserGuard({ user: { findFirst: jest.fn().mockResolvedValue(null) } } as any)
    await expect(guard.canActivate(context({ sub: 'user-a', orgId: 'org-b' }))).rejects.toBeInstanceOf(ForbiddenException)
  })
})

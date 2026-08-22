import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OperationalStateController } from './operational-state.controller'

describe('OperationalStateController', () => {
  it('exige autenticação ativa e papel ADMIN pela infraestrutura canônica', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OperationalStateController)).toEqual(['ADMIN'])
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalStateController)).toEqual([
      JwtAuthGuard,
      ActiveUserGuard,
      RolesGuard,
    ])
  })

  it('obtém tenant e ator apenas do usuário autenticado', async () => {
    const service = { execute: jest.fn().mockResolvedValue({ changed: true }) }
    const controller = new OperationalStateController(service as any)

    await controller.forceNormal(
      { user: { orgId: 'jwt-org', sub: 'jwt-user' } },
      'person-1',
    )

    expect(service.execute).toHaveBeenCalledWith({
      orgId: 'jwt-org',
      actorUserId: 'jwt-user',
      personId: 'person-1',
    })
  })
})

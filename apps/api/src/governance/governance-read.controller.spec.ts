import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { GovernanceReadController } from './governance-read.controller'
import { GovernanceReadService } from './governance-read.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { PrismaService } from '../prisma/prisma.service'

class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    const role = req.headers['x-test-role']
    if (!role) throw new UnauthorizedException()
    req.user = { sub: req.headers['x-test-active'] === 'false' ? 'inactive-user' : 'active-user', role, orgId: 'org-a' }
    return true
  }
}

const roles = ['ADMIN', 'OPERADOR', 'FINANCEIRO', 'MANAGER', 'STAFF', 'VIEWER']

describe('GovernanceReadController operational-state authorization', () => {
  let app: INestApplication
  const read = { getOperationalState: jest.fn().mockResolvedValue({ state: 'ok' }) }
  const prisma = { user: { findFirst: jest.fn(({ where }) => Promise.resolve(where.id === 'active-user' ? { id: where.id } : null)) } }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GovernanceReadController],
      providers: [RolesGuard, ActiveUserGuard, { provide: GovernanceReadService, useValue: read }, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useClass(TestJwtGuard).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterEach(() => jest.clearAllMocks())
  afterAll(() => app.close())

  it('rejeita visitante, role desconhecida e usuário inativo sem chamar o service', async () => {
    await request(app.getHttpServer()).get('/governance/operational-state').expect(401)
    await request(app.getHttpServer()).get('/governance/operational-state').set('x-test-role', 'UNKNOWN').expect(403)
    await request(app.getHttpServer()).get('/governance/operational-state').set('x-test-role', 'ADMIN').set('x-test-active', 'false').expect(403)
    expect(read.getOperationalState).not.toHaveBeenCalled()
  })

  it.each(roles)('permite %s e usa somente o orgId autenticado', async (role) => {
    await request(app.getHttpServer()).get('/governance/operational-state?orgId=org-b').set('x-test-role', role).expect(200)
    expect(read.getOperationalState).toHaveBeenCalledWith('org-a')
    expect(read.getOperationalState).not.toHaveBeenCalledWith('org-b')
  })
})

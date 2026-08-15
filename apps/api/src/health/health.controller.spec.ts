import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { HealthController } from './health.controller'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'

class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    const role = req.headers['x-test-role']
    if (!role) throw new UnauthorizedException()
    req.user = { sub: 'user-a', role, orgId: req.headers['x-test-org'] ?? 'org-a' }
    return true
  }
}

describe('HealthController authorization', () => {
  let app: INestApplication
  const prisma = { organization: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id === 'org-a' ? { id: 'org-a' } : null)) } }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: 'PrismaService', useValue: prisma },
        RolesGuard,
        { provide: ActiveUserGuard, useValue: { canActivate: () => true } },
      ],
    })
      .useMocker((token) => token?.toString().includes('PrismaService') ? prisma : {})
      .overrideGuard(JwtAuthGuard).useClass(TestJwtGuard)
      .overrideGuard(ActiveUserGuard).useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(() => app.close())

  it('mantém health público estritamente mínimo', async () => {
    const { body } = await request(app.getHttpServer()).get('/health').expect(200)
    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp'])
  })

  it.each(['1', 'true', 'TRUE', 'yes', '0'])('nega qualquer tentativa pública de details=%s', async (value) => {
    await request(app.getHttpServer()).get(`/health?DeTaIlS=${value}`).expect(401)
  })

  it('nega detalhes a visitante e usuário comum, sem executar consulta', async () => {
    prisma.organization.findUnique.mockClear()
    await request(app.getHttpServer()).get('/health/details').expect(401)
    await request(app.getHttpServer()).get('/health/details').set('x-test-role', 'OPERADOR').expect(403)
    expect(prisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it('isola detalhes administrativos pelo orgId autenticado e não vaza falhas', async () => {
    const { body } = await request(app.getHttpServer()).get('/health/details').set('x-test-role', 'ADMIN').set('x-test-org', 'org-a').expect(200)
    expect(body).toMatchObject({ orgId: 'org-a', checks: { tenant: { ok: true } } })
    expect(JSON.stringify(body)).not.toMatch(/org-b|stack|secret|password/i)
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: 'org-a' }, select: { id: true } })
  })
})

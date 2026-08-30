import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { PrismaService } from '../prisma/prisma.service'

class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    const role = req.headers['x-test-role']
    if (!role) throw new UnauthorizedException()
    req.user = {
      sub: req.headers['x-test-active'] === 'false' ? 'inactive-user' : 'active-user',
      role,
      orgId: 'org-a',
    }
    return true
  }
}

const roles = ['ADMIN', 'OPERADOR', 'FINANCEIRO', 'MANAGER', 'STAFF', 'VIEWER']

describe('DashboardController read authorization', () => {
  let app: INestApplication
  const dashboard = {
    getMetrics: jest.fn().mockResolvedValue({ ok: true }),
    getAlerts: jest.fn().mockResolvedValue({ ok: true }),
    getExecutivePipeline: jest.fn().mockResolvedValue({ generatedAt: new Date().toISOString(), stages: [] }),
  }
  const prisma = {
    user: {
      findFirst: jest.fn(({ where }) => Promise.resolve(where.id === 'active-user' ? { id: where.id } : null)),
    },
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        RolesGuard,
        ActiveUserGuard,
        { provide: DashboardService, useValue: dashboard },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard).useClass(TestJwtGuard)
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterEach(() => jest.clearAllMocks())
  afterAll(() => app.close())

  it.each(['/dashboard/metrics', '/dashboard/alerts', '/dashboard/executive-pipeline'])('%s rejeita visitante sem chamar o service', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401)
    expect(dashboard.getMetrics).not.toHaveBeenCalled()
    expect(dashboard.getAlerts).not.toHaveBeenCalled()
    expect(dashboard.getExecutivePipeline).not.toHaveBeenCalled()
  })

  it.each(['/dashboard/metrics', '/dashboard/alerts', '/dashboard/executive-pipeline'])('%s rejeita role desconhecida e usuário inativo', async (path) => {
    await request(app.getHttpServer()).get(path).set('x-test-role', 'UNKNOWN').expect(403)
    await request(app.getHttpServer()).get(path).set('x-test-role', 'ADMIN').set('x-test-active', 'false').expect(403)
    expect(dashboard.getMetrics).not.toHaveBeenCalled()
    expect(dashboard.getAlerts).not.toHaveBeenCalled()
    expect(dashboard.getExecutivePipeline).not.toHaveBeenCalled()
  })

  it.each(roles)('permite %s nas duas leituras e ignora orgId do navegador', async (role) => {
    await request(app.getHttpServer()).get('/dashboard/metrics?orgId=org-b').set('x-test-role', role).expect(200)
    await request(app.getHttpServer()).get('/dashboard/alerts?orgId=org-b').set('x-test-role', role).expect(200)
    await request(app.getHttpServer()).get('/dashboard/executive-pipeline?orgId=org-b&state=done').set('x-test-role', role).expect(200)
    expect(dashboard.getMetrics).toHaveBeenCalledWith('org-a')
    expect(dashboard.getAlerts).toHaveBeenCalledWith('org-a')
    expect(dashboard.getExecutivePipeline).toHaveBeenCalledWith('org-a')
    expect(dashboard.getMetrics).not.toHaveBeenCalledWith('org-b')
    expect(dashboard.getAlerts).not.toHaveBeenCalledWith('org-b')
    expect(dashboard.getExecutivePipeline).not.toHaveBeenCalledWith('org-b')
  })
})

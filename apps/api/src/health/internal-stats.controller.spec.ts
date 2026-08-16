import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { InternalStatsController } from './internal-stats.controller'
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

describe('InternalStatsController authorization', () => {
  let app: INestApplication
  const queueService = { getQueueStatus: jest.fn() }
  const waMetrics = { snapshot: jest.fn() }
  const queueObservability = { snapshot: jest.fn() }
  const nextBestAction = {
    signalId: 'signal-org-a',
    entityId: 'charge-org-a',
  }
  const operationalSignals = {
    listForOrg: jest.fn().mockResolvedValue({ signals: [], totalSignals: 0 }),
    getNextBestAction: jest.fn().mockResolvedValue(nextBestAction),
  }

  beforeAll(async () => {
    const mocks = [queueService, waMetrics, { runForOrg: jest.fn() }, operationalSignals, queueObservability, { exportJson: jest.fn() }]
    let index = 0
    const module = await Test.createTestingModule({
      controllers: [InternalStatsController],
      providers: [RolesGuard, { provide: ActiveUserGuard, useValue: { canActivate: () => true } }],
    })
      .useMocker(() => mocks[index++] ?? {})
      .overrideGuard(JwtAuthGuard).useClass(TestJwtGuard)
      .overrideGuard(ActiveUserGuard).useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterEach(() => jest.clearAllMocks())
  afterAll(() => app.close())

  it('retorna 401 ao visitante e 403 ao usuário comum sem chamar services', async () => {
    await request(app.getHttpServer()).get('/internal/stats').expect(401)
    await request(app.getHttpServer()).get('/internal/stats').set('x-test-role', 'OPERADOR').expect(403)
    expect(queueService.getQueueStatus).not.toHaveBeenCalled()
    expect(waMetrics.snapshot).not.toHaveBeenCalled()
    expect(queueObservability.snapshot).not.toHaveBeenCalled()
  })

  it('retorna somente escopo do tenant do ADMIN e não expõe métricas globais', async () => {
    const { body } = await request(app.getHttpServer()).get('/internal/stats').set('x-test-role', 'ADMIN').set('x-test-org', 'org-a').expect(200)
    expect(body).toEqual({
      orgId: 'org-a',
      scope: 'organization',
      infrastructureMetrics: {
        available: false,
        reason: 'Métricas globais não são disponibilizadas a administradores de organização.',
      },
    })
    expect(JSON.stringify(body)).not.toContain('org-b')
    expect(queueService.getQueueStatus).not.toHaveBeenCalled()
  })

  it('permite ao OPERADOR (STAFF) ler a próxima ação somente do orgId autenticado', async () => {
    await request(app.getHttpServer())
      .get('/internal/operational-signals?limit=8')
      .set('x-test-role', 'STAFF')
      .set('x-test-org', 'org-a')
      .expect(200)
    const response = await request(app.getHttpServer())
      .get('/internal/operational-signals/next-best-action')
      .set('x-test-role', 'STAFF')
      .set('x-test-org', 'org-a')
      .expect(200)
    expect(response.body).toEqual(nextBestAction)
    expect(operationalSignals.listForOrg).toHaveBeenCalledWith('org-a', 8)
    expect(operationalSignals.getNextBestAction).toHaveBeenCalledWith('org-a')
    expect(operationalSignals.getNextBestAction).not.toHaveBeenCalledWith('org-b')
  })
})

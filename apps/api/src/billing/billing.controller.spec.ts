import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'

class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    const role = req.headers['x-test-role']
    if (!role) throw new UnauthorizedException()
    req.user = { sub: `user-${role}`, role, orgId: req.headers['x-test-org'] ?? 'org-a' }
    return true
  }
}

describe('BillingController authorization', () => {
  let app: INestApplication
  const billing = {
    createCheckoutSession: jest.fn().mockResolvedValue({ sessionId: 'session' }),
    cancelSubscription: jest.fn().mockResolvedValue({ status: 'CANCELED' }),
    handleWebhook: jest.fn().mockResolvedValue({ received: true, processed: true }),
    getPlanCatalog: jest.fn().mockResolvedValue([
      {
        name: 'PRO',
        displayName: 'Pro',
        priceCents: 19900,
        quotas: { customers: 100, users: 10 },
        commercialLimits: {},
        features: { advanced_automation: true },
      },
    ]),
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: billing },
        RolesGuard,
        { provide: ActiveUserGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(JwtAuthGuard).useClass(TestJwtGuard)
      .overrideGuard(ActiveUserGuard).useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterEach(() => jest.clearAllMocks())
  afterAll(() => app.close())

  it.each([
    ['/billing/create-checkout-session', { planName: 'PRO' }],
    ['/billing/cancel', {}],
  ])('nega visitante e usuário comum sem chamar BillingService em %s', async (url, body) => {
    await request(app.getHttpServer()).post(url).send(body).expect(401)
    await request(app.getHttpServer()).post(url).set('x-test-role', 'OPERADOR').send(body).expect(403)
    expect(billing.createCheckoutSession).not.toHaveBeenCalled()
    expect(billing.cancelSubscription).not.toHaveBeenCalled()
  })

  it('usa exclusivamente o orgId autenticado no checkout administrativo', async () => {
    await request(app.getHttpServer())
      .post('/billing/create-checkout-session')
      .set('x-test-role', 'ADMIN')
      .set('x-test-org', 'org-a')
      .send({ planName: 'PRO', orgId: 'org-b' })
      .expect(201)
    expect(billing.createCheckoutSession).toHaveBeenCalledWith('org-a', 'PRO', undefined, undefined)
  })

  it('rejeita priceId do provedor e plano FREE no contrato público de checkout', async () => {
    await request(app.getHttpServer())
      .post('/billing/create-checkout-session')
      .set('x-test-role', 'ADMIN')
      .send({ priceId: 'price_pro' })
      .expect(400)

    await request(app.getHttpServer())
      .post('/billing/create-checkout-session')
      .set('x-test-role', 'ADMIN')
      .send({ planName: 'FREE' })
      .expect(400)

    expect(billing.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('mantém webhook público e delega validação de assinatura ao service', async () => {
    await request(app.getHttpServer()).post('/billing/webhook').set('stripe-signature', 'valid').send({}).expect(200)
    expect(billing.handleWebhook).toHaveBeenCalledWith(expect.any(Buffer), 'valid')
  })

  it('expõe somente o catálogo comercial público sem contexto de tenant', async () => {
    await request(app.getHttpServer())
      .get('/billing/plans')
      .expect(200)

    expect(billing.getPlanCatalog).toHaveBeenCalledTimes(1)
  })
})

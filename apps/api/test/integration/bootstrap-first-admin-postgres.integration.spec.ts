import {
  ForbiddenException,
} from '@nestjs/common'
import {
  PlanName,
  PrismaClient,
} from '@prisma/client'
import { BootstrapService } from '../../src/bootstrap/bootstrap.service'
import { PlansService } from '../../src/plans/plans.service'
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service'

const runReal =
  process.env.RUN_REAL_BOOTSTRAP_INTEGRATION === 'true'

const databaseUrl =
  process.env.DATABASE_URL ?? ''

if (runReal) {
  if (!/127\.0\.0\.1|localhost/i.test(databaseUrl)) {
    throw new Error(
      'Teste real exige PostgreSQL local isolado',
    )
  }

  if (!/bootstrap[_-]test/i.test(databaseUrl)) {
    throw new Error(
      'Teste real exige banco bootstrap_test',
    )
  }
}

const describeReal =
  runReal ? describe : describe.skip

describeReal(
  'BootstrapService PostgreSQL real',
  () => {
    const prismaA = new PrismaClient()
    const prismaB = new PrismaClient()

    const plansA =
      new PlansService(prismaA as any)

    const plansB =
      new PlansService(prismaB as any)

    const subscriptionsA =
      new SubscriptionsService(
        prismaA as any,
        plansA,
      )

    const subscriptionsB =
      new SubscriptionsService(
        prismaB as any,
        plansB,
      )

    const serviceA =
      new BootstrapService(
        prismaA as any,
        subscriptionsA,
      )

    const serviceB =
      new BootstrapService(
        prismaB as any,
        subscriptionsB,
      )

    const suffix =
      `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`

    const originalBootstrapSecret =
      process.env.BOOTSTRAP_SECRET

    const originalNodeEnv =
      process.env.NODE_ENV

    beforeAll(async () => {
      delete process.env.BOOTSTRAP_SECRET
      process.env.NODE_ENV = 'test'

      await Promise.all([
        prismaA.$connect(),
        prismaB.$connect(),
      ])

      /*
       * Banco dedicado: garantimos que a prova começa
       * sem tenant nem usuário, como uma instalação nova.
       */
      await prismaA.person.deleteMany()
      await prismaA.user.deleteMany()
      await prismaA.subscription.deleteMany()
      await prismaA.organization.deleteMany()
      await prismaA.plan.deleteMany()

      expect(
        await prismaA.plan.count(),
      ).toBe(0)

      /*
       * Reproduz o contrato real do boot Nest:
       * PlansService.onModuleInit() materializa
       * o catálogo comercial padrão sem depender de seed.
       */
      await plansA.onModuleInit()

      const starter =
        await prismaA.plan.findUnique({
          where: {
            name: PlanName.STARTER,
          },
        })

      expect(starter).not.toBeNull()
    })

    afterAll(async () => {
      await prismaA.person.deleteMany()
      await prismaA.user.deleteMany()
      await prismaA.subscription.deleteMany()
      await prismaA.organization.deleteMany()

      if (
        originalBootstrapSecret === undefined
      ) {
        delete process.env.BOOTSTRAP_SECRET
      } else {
        process.env.BOOTSTRAP_SECRET =
          originalBootstrapSecret
      }

      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV =
          originalNodeEnv
      }

      await Promise.all([
        prismaA.$disconnect(),
        prismaB.$disconnect(),
      ])
    })

    it('serializa duas instâncias numa instalação nova e cria tenant, admin e trial uma única vez', async () => {
      const results =
        await Promise.allSettled([
          serviceA.createFirstAdmin({
            orgName:
              `Bootstrap A ${suffix}`,
            adminName: 'Admin A',
            email:
              `admin-a-${suffix}@example.com`,
            password: 'Senha123',
          }),
          serviceB.createFirstAdmin({
            orgName:
              `Bootstrap B ${suffix}`,
            adminName: 'Admin B',
            email:
              `admin-b-${suffix}@example.com`,
            password: 'Senha123',
          }),
        ])

      const fulfilled =
        results.filter(
          result =>
            result.status === 'fulfilled',
        )

      const rejected =
        results.filter(
          result =>
            result.status === 'rejected',
        ) as PromiseRejectedResult[]

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      expect(
        rejected[0].reason,
      ).toBeInstanceOf(ForbiddenException)

      const users =
        await prismaA.user.findMany({
          include: {
            person: true,
            org: true,
          },
        })

      expect(users).toHaveLength(1)

      const user = users[0]

      expect(user).toMatchObject({
        role: 'ADMIN',
        active: true,
      })

      expect(
        user.emailVerifiedAt,
      ).toBeInstanceOf(Date)

      expect(user.person).toMatchObject({
        role: 'ADMIN',
        active: true,
        orgId: user.orgId,
      })

      expect(user.org).toMatchObject({
        requiresOnboarding: false,
      })

      const subscription =
        await prismaA.subscription.findUnique({
          where: {
            orgId: user.orgId,
          },
          include: {
            plan: true,
          },
        })

      expect(subscription).not.toBeNull()

      expect(subscription?.plan.name)
        .toBe(PlanName.STARTER)
    })
  },
)

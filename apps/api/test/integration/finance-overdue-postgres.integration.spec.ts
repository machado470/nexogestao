import { PrismaClient } from '@prisma/client'
import { FinanceService } from '../../src/finance/finance.service'
import { TimelineService } from '../../src/timeline/timeline.service'

const runReal =
  process.env.RUN_REAL_FINANCE_OVERDUE_INTEGRATION === 'true'

const databaseUrl = process.env.DATABASE_URL ?? ''

if (
  runReal &&
  !/(localhost|127\.0\.0\.1)/i.test(databaseUrl)
) {
  throw new Error(
    'Teste real de overdue exige DATABASE_URL local/isolada',
  )
}

const describeReal = runReal ? describe : describe.skip

describeReal(
  'Finance overdue PostgreSQL real com duas instâncias',
  () => {
    const prismaA = new PrismaClient()
    const prismaB = new PrismaClient()

    const orgId = 'finance-overdue-real-org'
    const orgSlug = 'finance-overdue-real'
    const customerId = 'finance-overdue-real-customer'
    const chargeId = 'finance-overdue-real-charge'

    function makeTimeline(prisma: PrismaClient) {
      return new TimelineService(
        prisma as any,
        { requestId: null } as any,
        { dispatchTimelineEvent: jest.fn() } as any,
      )
    }

    function makeService(prisma: PrismaClient) {
      const service = new FinanceService(
        prisma as any,
        {} as any,
        makeTimeline(prisma) as any,
        {} as any,
        {
          requestId: null,
          correlationId: null,
        } as any,
        {} as any,
        { increment: jest.fn() } as any,
        { log: jest.fn() } as any,
        { enqueue: jest.fn() } as any,
      )

      jest
        .spyOn(service, 'sendPaymentReminderWhatsApp')
        .mockResolvedValue(undefined)

      return service
    }

    beforeAll(async () => {
      await prismaA.organization.upsert({
        where: { slug: orgSlug },
        update: { name: 'Finance Overdue Real' },
        create: {
          id: orgId,
          slug: orgSlug,
          name: 'Finance Overdue Real',
        },
      })
    })

    beforeEach(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: { orgId },
      })

      await prismaA.charge.deleteMany({
        where: { orgId },
      })

      await prismaA.customer.deleteMany({
        where: { orgId },
      })

      await prismaA.customer.create({
        data: {
          id: customerId,
          orgId,
          name: 'Cliente Finance Overdue Real',
          phone: '+5548999999001',
        },
      })

      await prismaA.charge.create({
        data: {
          id: chargeId,
          orgId,
          customerId,
          amountCents: 2500,
          status: 'PENDING',
          dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      })
    })

    afterAll(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: { orgId },
      })

      await prismaA.charge.deleteMany({
        where: { orgId },
      })

      await prismaA.customer.deleteMany({
        where: { orgId },
      })

      await prismaA.organization.deleteMany({
        where: { id: orgId },
      })

      await Promise.all([
        prismaA.$disconnect(),
        prismaB.$disconnect(),
      ])
    })

    it(
      'duas instâncias fazem PENDING -> OVERDUE e produzem uma única evidência',
      async () => {
        let readers = 0
        let releaseReaders!: () => void

        const bothRead = new Promise<void>((resolve) => {
          releaseReaders = resolve
        })

        const installReadBarrier = (prisma: PrismaClient) => {
          prisma.$use(async (params, next) => {
            const result = await next(params)

            const dueDate = params.args?.where?.dueDate

            if (
              params.model === 'Charge' &&
              params.action === 'findMany' &&
              params.args?.where?.status === 'PENDING' &&
              dueDate &&
              typeof dueDate === 'object' &&
              'lt' in dueDate
            ) {
              readers += 1

              if (readers === 2) {
                releaseReaders()
              }

              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(
                  () =>
                    reject(
                      new Error(
                        'timeout esperando as duas instâncias lerem a cobrança',
                      ),
                    ),
                  5_000,
                )

                bothRead.then(() => {
                  clearTimeout(timeout)
                  resolve()
                }, reject)
              })
            }

            return result
          })
        }

        installReadBarrier(prismaA)
        installReadBarrier(prismaB)

        const serviceA = makeService(prismaA)
        const serviceB = makeService(prismaB)

        const [resultA, resultB] = await Promise.all([
          serviceA.automateOverdueLifecycle(orgId),
          serviceB.automateOverdueLifecycle(orgId),
        ])

        expect(readers).toBe(2)

        expect(resultA.updated + resultB.updated).toBe(1)

        const charge =
          await prismaA.charge.findUniqueOrThrow({
            where: { id: chargeId },
          })

        expect(charge.status).toBe('OVERDUE')

        const events =
          await prismaA.timelineEvent.findMany({
            where: {
              orgId,
              chargeId,
              action: 'CHARGE_OVERDUE',
            },
          })

        expect(events).toHaveLength(1)

        expect(events[0]).toMatchObject({
          orgId,
          chargeId,
          customerId,
          action: 'CHARGE_OVERDUE',
        })

        expect(events[0].metadata).toMatchObject({
          previousStatus: 'PENDING',
          nextStatus: 'OVERDUE',
        })

        const reminderCalls =
          (serviceA.sendPaymentReminderWhatsApp as jest.Mock)
            .mock.calls.length +
          (serviceB.sendPaymentReminderWhatsApp as jest.Mock)
            .mock.calls.length

        expect(reminderCalls).toBe(1)
      },
      15_000,
    )
  },
)

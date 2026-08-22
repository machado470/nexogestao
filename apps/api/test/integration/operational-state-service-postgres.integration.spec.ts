import { PrismaClient } from '@prisma/client'
import {
  OperationalStateService,
} from '../../src/people/operational-state.service'
import {
  OperationalStateJob,
} from '../../src/people/operational-state.job'
import {
  OperationalStateRepository,
} from '../../src/people/operational-state.repository'

const runReal =
  process.env
    .RUN_REAL_OPERATIONAL_STATE_SERVICE_INTEGRATION
  === 'true'

const databaseUrl =
  process.env.DATABASE_URL ?? ''

if (runReal) {
  if (
    !/127\.0\.0\.1|localhost/i.test(
      databaseUrl,
    )
  ) {
    throw new Error(
      'Teste real exige PostgreSQL local isolado',
    )
  }

  if (
    !/operational[_-]state[_-]test/i.test(
      databaseUrl,
    )
  ) {
    throw new Error(
      'Teste real exige banco operational_state_test',
    )
  }
}

const describeReal =
  runReal
    ? describe
    : describe.skip

type RepositoryLike = {
  getLastState: (
    params: {
      orgId: string
      personId: string
    },
    tx?: any,
  ) => Promise<any>
}

function createReadBarrier(
  expectedReaders: number,
) {
  let readers = 0

  let releaseReaders!: () => void

  const allReadersReady =
    new Promise<void>((resolve) => {
      releaseReaders = resolve
    })

  const wrap = (
    repository:
      OperationalStateRepository,
  ): RepositoryLike => ({
    getLastState: jest.fn(
      async (
        params: {
          orgId: string
          personId: string
        },
        tx?: any,
      ) => {
        /*
         * Dentro da transação não bloqueamos:
         * esta é a leitura autoritativa
         * posterior ao CAS.
         */
        if (tx) {
          return repository.getLastState(
            params,
            tx,
          )
        }

        /*
         * Cada concorrente lê de verdade
         * a Timeline antes de ser liberado
         * para disputar o CAS.
         */
        const observed =
          await repository.getLastState(
            params,
          )

        readers += 1

        if (readers === expectedReaders) {
          releaseReaders()
        }

        await allReadersReady

        return observed
      },
    ),
  })

  return {
    wrap,
    count: () => readers,
  }
}

function createTimelineDouble() {
  return {
    logInTransaction: jest.fn(
      async (
        input: any,
        tx: any,
      ) => {
        return tx.timelineEvent.create({
          data: {
            orgId: input.orgId,
            action: input.action,
            personId:
              input.personId ?? null,
            description:
              input.description ?? null,
            metadata:
              JSON.parse(
                JSON.stringify(
                  input.metadata ?? {},
                ),
              ),
          },
        })
      },
    ),

    dispatchPersistedEventWebhook:
      jest.fn().mockResolvedValue(
        undefined,
      ),
  }
}

describeReal(
  'OperationalState shared ownership PostgreSQL real',
  () => {
    const prismaA =
      new PrismaClient()

    const prismaB =
      new PrismaClient()

    const orgId =
      'operational-state-service-real-org'

    const orgSlug =
      'operational-state-service-real'

    const personId =
      'operational-state-service-real-person'

    const initialUpdatedAt =
      new Date(
        '2026-08-22T12:00:00.000Z',
      )

    beforeAll(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.person.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.organization.deleteMany({
        where: {
          OR: [
            {
              id: orgId,
            },
            {
              slug: orgSlug,
            },
          ],
        },
      })

      await prismaA.organization.create({
        data: {
          id: orgId,
          slug: orgSlug,
          name:
            'Operational State Service Real',
        },
      })
    })

    beforeEach(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.person.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.person.create({
        data: {
          id: personId,
          orgId,
          name:
            'Pessoa Concorrente',
          role: 'OPERADOR',
          active: true,
          operationalState:
            'NORMAL',
          operationalRiskScore:
            10,
          operationalStateUpdatedAt:
            initialUpdatedAt,
        },
      })

      /*
       * Evidência oficial anterior.
       */
      await prismaA.timelineEvent.create({
        data: {
          orgId,
          personId,
          action:
            'OPERATIONAL_STATE_CHANGED',
          description:
            'Estado operacional: UNKNOWN → NORMAL',
          metadata: {
            from: 'UNKNOWN',
            to: 'NORMAL',
            riskScore: 10,
            source: 'TEST_SEED',
          },
        },
      })
    })

    afterAll(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.person.deleteMany({
        where: {
          orgId,
        },
      })

      await prismaA.organization.deleteMany({
        where: {
          id: orgId,
        },
      })

      await Promise.all([
        prismaA.$disconnect(),
        prismaB.$disconnect(),
      ])
    })

    it(
      'Service × Service registra uma única transição',
      async () => {
        const repositoryA =
          new OperationalStateRepository(
            prismaA as any,
          )

        const repositoryB =
          new OperationalStateRepository(
            prismaB as any,
          )

        const barrier =
          createReadBarrier(2)

        const timelineA =
          createTimelineDouble()

        const timelineB =
          createTimelineDouble()

        const temporalRiskA = {
          calculate:
            jest.fn()
              .mockResolvedValue(60),
        }

        const temporalRiskB = {
          calculate:
            jest.fn()
              .mockResolvedValue(60),
        }

        const serviceA =
          new OperationalStateService(
            temporalRiskA as any,
            barrier.wrap(
              repositoryA,
            ) as any,
            timelineA as any,
            prismaA as any,
          )

        const serviceB =
          new OperationalStateService(
            temporalRiskB as any,
            barrier.wrap(
              repositoryB,
            ) as any,
            timelineB as any,
            prismaB as any,
          )

        const [
          resultA,
          resultB,
        ] = await Promise.all([
          serviceA
            .syncAndLogStateChange(
              orgId,
              personId,
            ),

          serviceB
            .syncAndLogStateChange(
              orgId,
              personId,
            ),
        ])

        /*
         * Ambos chegaram ao protocolo
         * observando NORMAL.
         */
        expect(
          barrier.count(),
        ).toBe(2)

        expect(
          [
            resultA.changed,
            resultB.changed,
          ].sort(),
        ).toEqual([
          false,
          true,
        ])

        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id: personId,
            },
          })

        expect(
          finalPerson?.operationalState,
        ).toBe('WARNING')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(60)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt
            ?.getTime(),
        ).not.toBe(
          initialUpdatedAt.getTime(),
        )

        const events =
          await prismaB.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action:
                  'OPERATIONAL_STATE_CHANGED',
              },
              orderBy: {
                createdAt: 'asc',
              },
            })

        const warningEvents =
          events.filter(
            (event) => {
              const metadata =
                event.metadata as any

              return (
                metadata?.to
                === 'WARNING'
              )
            },
          )

        /*
         * Seed NORMAL + uma única
         * transição WARNING.
         */
        expect(events).toHaveLength(2)

        expect(
          warningEvents,
        ).toHaveLength(1)

        expect(
          warningEvents[0]
            ?.metadata,
        ).toEqual(
          expect.objectContaining({
            from: 'NORMAL',
            to: 'WARNING',
            riskScore: 60,
            source:
              'OPERATIONAL_STATE_SERVICE',
          }),
        )

        expect(
          timelineA
            .logInTransaction
            .mock.calls.length
          +
          timelineB
            .logInTransaction
            .mock.calls.length,
        ).toBe(1)

        expect(
          timelineA
            .dispatchPersistedEventWebhook
            .mock.calls.length
          +
          timelineB
            .dispatchPersistedEventWebhook
            .mock.calls.length,
        ).toBe(1)
      },
      30_000,
    )

    it(
      'Service × Job compartilha o mesmo ownership',
      async () => {
        const repositoryA =
          new OperationalStateRepository(
            prismaA as any,
          )

        const repositoryB =
          new OperationalStateRepository(
            prismaB as any,
          )

        const barrier =
          createReadBarrier(2)

        const timelineService =
          createTimelineDouble()

        const timelineJob =
          createTimelineDouble()

        const temporalRisk = {
          calculate:
            jest.fn()
              .mockResolvedValue(60),
        }

        const service =
          new OperationalStateService(
            temporalRisk as any,
            barrier.wrap(
              repositoryA,
            ) as any,
            timelineService as any,
            prismaA as any,
          )

        const risk = {
          calculatePersonRisk:
            jest.fn()
              .mockResolvedValue(60),
        }

        const job =
          new OperationalStateJob(
            prismaB as any,
            timelineJob as any,
            risk as any,
            barrier.wrap(
              repositoryB,
            ) as any,
          )

        await Promise.all([
          service
            .syncAndLogStateChange(
              orgId,
              personId,
            ),

          job.run(),
        ])

        expect(
          barrier.count(),
        ).toBe(2)

        const finalPerson =
          await prismaA.person.findUnique({
            where: {
              id: personId,
            },
          })

        expect(
          finalPerson?.operationalState,
        ).toBe('WARNING')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(60)

        const events =
          await prismaA.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action:
                  'OPERATIONAL_STATE_CHANGED',
              },
              orderBy: {
                createdAt: 'asc',
              },
            })

        const warningEvents =
          events.filter(
            (event) => {
              const metadata =
                event.metadata as any

              return (
                metadata?.to
                === 'WARNING'
              )
            },
          )

        expect(events).toHaveLength(2)

        expect(
          warningEvents,
        ).toHaveLength(1)

        const metadata =
          warningEvents[0]
            ?.metadata as any

        /*
         * O owner pode ser Service ou Job.
         * A garantia é uma única autoridade
         * vencedora, não qual chega primeiro.
         */
        expect([
          'OPERATIONAL_STATE_SERVICE',
          'OPERATIONAL_STATE_JOB',
        ]).toContain(
          metadata?.source,
        )

        expect(
          timelineService
            .logInTransaction
            .mock.calls.length
          +
          timelineJob
            .logInTransaction
            .mock.calls.length,
        ).toBe(1)

        expect(
          timelineService
            .dispatchPersistedEventWebhook
            .mock.calls.length
          +
          timelineJob
            .dispatchPersistedEventWebhook
            .mock.calls.length,
        ).toBe(1)
      },
      30_000,
    )

    it(
      'faz rollback do Person quando a Timeline falha',
      async () => {
        const repository =
          new OperationalStateRepository(
            prismaA as any,
          )

        const timeline = {
          logInTransaction:
            jest.fn(
              async () => {
                throw new Error(
                  'timeline failure',
                )
              },
            ),

          dispatchPersistedEventWebhook:
            jest.fn(),
        }

        const temporalRisk = {
          calculate:
            jest.fn()
              .mockResolvedValue(60),
        }

        const service =
          new OperationalStateService(
            temporalRisk as any,
            repository as any,
            timeline as any,
            prismaA as any,
          )

        await expect(
          service
            .syncAndLogStateChange(
              orgId,
              personId,
            ),
        ).rejects.toThrow(
          'timeline failure',
        )

        /*
         * O UPDATE ocorreu dentro da
         * transação que falhou.
         *
         * PostgreSQL precisa revertê-lo.
         */
        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id: personId,
            },
          })

        expect(
          finalPerson?.operationalState,
        ).toBe('NORMAL')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(10)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt
            ?.getTime(),
        ).toBe(
          initialUpdatedAt.getTime(),
        )

        const events =
          await prismaB.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action:
                  'OPERATIONAL_STATE_CHANGED',
              },
            })

        /*
         * Apenas o seed continua existindo.
         */
        expect(events).toHaveLength(1)

        expect(
          (
            events[0]
              ?.metadata as any
          )?.to,
        ).toBe('NORMAL')

        expect(
          timeline
            .dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()
      },
      30_000,
    )
  },
)

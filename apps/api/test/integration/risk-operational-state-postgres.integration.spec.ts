import { PrismaClient } from '@prisma/client'
import { RiskService } from '../../src/risk/risk.service'
import {
  OperationalStateJob,
} from '../../src/people/operational-state.job'
import {
  OperationalStateRepository,
} from '../../src/people/operational-state.repository'

const runReal =
  process.env
    .RUN_REAL_RISK_OPERATIONAL_STATE_INTEGRATION
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

function createTimelineDouble(
  prisma: PrismaClient,
  options?: {
    failStateEvent?: boolean
    onStateEventCreated?: () => void
  },
) {
  return {
    logInTransaction:
      jest.fn(
        async (
          input: any,
          tx: any,
        ) => {
          if (options?.failStateEvent) {
            throw new Error(
              'timeline failure',
            )
          }

          const event =
            await tx.timelineEvent.create({
              data: {
                orgId:
                  input.orgId,
                personId:
                  input.personId ?? null,
                action:
                  input.action,
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

          options
            ?.onStateEventCreated
            ?.()

          return event
        },
      ),

    dispatchPersistedEventWebhook:
      jest.fn()
        .mockResolvedValue(
          undefined,
        ),

    /*
     * RISK_SNAPSHOT_CREATED e RISK_UPDATED
     * continuam sendo persistidos depois do
     * commit da transição canônica.
     */
    log:
      jest.fn(
        async (input: any) =>
          prisma.timelineEvent.create({
            data: {
              orgId:
                input.orgId,
              personId:
                input.personId ?? null,
              customerId:
                input.customerId ?? null,
              action:
                input.action,
              description:
                input.description ?? null,
              metadata:
                JSON.parse(
                  JSON.stringify(
                    input.metadata ?? {},
                  ),
                ),
            },
          }),
      ),
  }
}

describeReal(
  'RiskService operational state ownership PostgreSQL real',
  () => {
    const prismaA =
      new PrismaClient()

    const prismaB =
      new PrismaClient()

    const orgId =
      'risk-state-real-org'

    const orgSlug =
      'risk-state-real'

    const personId =
      'risk-state-real-person'

    const initialUpdatedAt =
      new Date(
        '2026-08-22T12:00:00.000Z',
      )

    async function cleanupPersonData() {
      await prismaA.riskSnapshot.deleteMany({
        where: {
          personId,
        },
      })

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
    }

    async function seedNormal() {
      await cleanupPersonData()

      await prismaA.person.create({
        data: {
          id:
            personId,
          orgId,
          name:
            'Pessoa Risk Real',
          role:
            'OPERADOR',
          active:
            true,
          riskScore:
            10,
          operationalRiskScore:
            10,
          operationalState:
            'NORMAL',
          operationalStateUpdatedAt:
            initialUpdatedAt,
        },
      })

      await prismaA.timelineEvent.create({
        data: {
          orgId,
          personId,
          action:
            'OPERATIONAL_STATE_CHANGED',
          description:
            'Estado operacional: UNKNOWN → NORMAL',
          metadata: {
            from:
              'UNKNOWN',
            to:
              'NORMAL',
            riskScore:
              10,
            source:
              'TEST_SEED',
          },
        },
      })
    }

    beforeAll(async () => {
      await cleanupPersonData()

      await prismaA.organization.deleteMany({
        where: {
          OR: [
            {
              id:
                orgId,
            },
            {
              slug:
                orgSlug,
            },
          ],
        },
      })

      await prismaA.organization.create({
        data: {
          id:
            orgId,
          slug:
            orgSlug,
          name:
            'Risk Operational State Real',
        },
      })
    })

    beforeEach(async () => {
      await seedNormal()
    })

    afterAll(async () => {
      await cleanupPersonData()

      await prismaA.organization.deleteMany({
        where: {
          id:
            orgId,
        },
      })

      await Promise.all([
        prismaA.$disconnect(),
        prismaB.$disconnect(),
      ])
    })

    it(
      'RiskService × Job compartilha ownership e produz uma única transição',
      async () => {
        /*
         * Ambos precisam capturar NORMAL/10
         * antes da disputa.
         */
        let readers = 0

        let releaseReaders!: () => void

        const bothRead =
          new Promise<void>((resolve) => {
            releaseReaders = resolve
          })

        const arrive = async () => {
          readers += 1

          if (readers === 2) {
            releaseReaders()
          }

          await bothRead
        }

        let riskInitialRead = true

        const riskPrisma = {
          person: {
            findFirst:
              async (args: any) => {
                const observed =
                  await prismaA.person.findFirst(
                    args,
                  )

                if (riskInitialRead) {
                  riskInitialRead = false
                  await arrive()
                }

                return observed
              },
          },

          timelineEvent:
            prismaA.timelineEvent,

          riskSnapshot:
            prismaA.riskSnapshot,

          $transaction:
            prismaA.$transaction.bind(
              prismaA,
            ),
        }

        const jobPrisma = {
          person: {
            findMany:
              async (args: any) => {
                const observed =
                  await prismaB.person.findMany(
                    args,
                  )

                await arrive()

                return observed
              },
          },

          timelineEvent:
            prismaB.timelineEvent,

          $transaction:
            prismaB.$transaction.bind(
              prismaB,
            ),
        }

        let releaseJobRisk!: () => void

        const riskStateEventCreated =
          new Promise<void>((resolve) => {
            releaseJobRisk = resolve
          })

        const riskTimeline =
          createTimelineDouble(
            prismaA,
            {
              onStateEventCreated:
                releaseJobRisk,
            },
          )

        const temporalRisk = {
          calculateDetailed:
            jest.fn()
              .mockResolvedValue({
                score:
                  60,
                state:
                  'WARNING',
                contributors: [
                  'REAL_TEST_SIGNAL',
                ],
                breakdown: [],
                factors: {},
              }),
        }

        const riskService =
          new RiskService(
            riskPrisma as any,
            temporalRisk as any,
            riskTimeline as any,
          )

        const jobTimeline =
          createTimelineDouble(
            prismaB,
          )

        const jobRisk = {
          calculatePersonRisk:
            jest.fn(
              async () => {
                /*
                 * RiskService conquista primeiro.
                 *
                 * O Job já possui NORMAL/10,
                 * então sua decisão usa o mesmo
                 * snapshot, mas chega ao CAS depois.
                 */
                await riskStateEventCreated

                return 60
              },
            ),
        }

        const jobRepository =
          new OperationalStateRepository(
            prismaB as any,
          )

        const job =
          new OperationalStateJob(
            jobPrisma as any,
            jobTimeline as any,
            jobRisk as any,
            jobRepository as any,
          )

        await Promise.all([
          riskService
            .recalculatePersonRisk(
              personId,
              'REAL_RISK_JOB_RACE',
              orgId,
            ),

          job.run(),
        ])

        expect(readers)
          .toBe(2)

        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id:
                personId,
            },
          })

        expect(
          finalPerson?.operationalState,
        ).toBe('WARNING')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(60)

        /*
         * Campo legado participa do mesmo
         * commit do owner.
         */
        expect(
          finalPerson?.riskScore,
        ).toBe(60)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt
            ?.getTime(),
        ).not.toBe(
          initialUpdatedAt.getTime(),
        )

        const stateEvents =
          await prismaB.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action:
                  'OPERATIONAL_STATE_CHANGED',
              },
              orderBy: {
                createdAt:
                  'asc',
              },
            })

        const warningEvents =
          stateEvents.filter(
            (event) =>
              (event.metadata as any)?.to
              === 'WARNING',
          )

        /*
         * Seed NORMAL + exatamente
         * uma transição WARNING.
         */
        expect(stateEvents)
          .toHaveLength(2)

        expect(warningEvents)
          .toHaveLength(1)

        expect(
          warningEvents[0]
            ?.metadata,
        ).toEqual(
          expect.objectContaining({
            from:
              'NORMAL',
            to:
              'WARNING',
            riskScore:
              60,
            source:
              'RISK_SERVICE',
          }),
        )

        expect(
          riskTimeline
            .logInTransaction,
        ).toHaveBeenCalledTimes(1)

        expect(
          jobTimeline
            .logInTransaction,
        ).not.toHaveBeenCalled()

        expect(
          riskTimeline
            .dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)

        expect(
          jobTimeline
            .dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()

        /*
         * RiskSnapshot histórico continua.
         */
        const riskSnapshots =
          await prismaB.riskSnapshot
            .findMany({
              where: {
                personId,
              },
            })

        expect(riskSnapshots)
          .toHaveLength(1)

        expect(
          riskSnapshots[0]?.score,
        ).toBe(60)

        const riskEvents =
          await prismaB.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action: {
                  in: [
                    'RISK_SNAPSHOT_CREATED',
                    'RISK_UPDATED',
                  ],
                },
              },
            })

        expect(riskEvents)
          .toHaveLength(2)
      },
      30_000,
    )

    it(
      'decisão stale não regride estado mais novo',
      async () => {
        const newerUpdatedAt =
          new Date(
            '2026-08-22T12:05:00.000Z',
          )

        let firstPersonRead = true

        const riskPrisma = {
          person: {
            findFirst:
              async (args: any) => {
                const observed =
                  await prismaA.person.findFirst(
                    args,
                  )

                /*
                 * A primeira leitura precisa ser
                 * NORMAL/10. As posteriores não
                 * devem alterar o cenário.
                 */
                if (firstPersonRead) {
                  firstPersonRead = false
                }

                return observed
              },
          },

          timelineEvent:
            prismaA.timelineEvent,

          riskSnapshot:
            prismaA.riskSnapshot,

          $transaction:
            prismaA.$transaction.bind(
              prismaA,
            ),
        }

        const timeline =
          createTimelineDouble(
            prismaA,
          )

        const temporalRisk = {
          calculateDetailed:
            jest.fn(
              async () => {
                /*
                 * Outro owner vence no banco REAL
                 * enquanto RiskService calcula.
                 */
                await prismaB.$transaction(
                  async (tx) => {
                    await tx.person.update({
                      where: {
                        id:
                          personId,
                      },
                      data: {
                        riskScore:
                          80,
                        operationalRiskScore:
                          80,
                        operationalState:
                          'RESTRICTED',
                        operationalStateUpdatedAt:
                          newerUpdatedAt,
                      },
                    })

                    await tx.timelineEvent.create({
                      data: {
                        orgId,
                        personId,
                        action:
                          'OPERATIONAL_STATE_CHANGED',
                        description:
                          'Estado operacional: NORMAL → RESTRICTED',
                        metadata: {
                          from:
                            'NORMAL',
                          to:
                            'RESTRICTED',
                          riskScore:
                            80,
                          source:
                            'SIMULATED_FRESHER_WRITER',
                        },
                      },
                    })
                  },
                )

                /*
                 * A execução antiga termina
                 * com WARNING/60.
                 */
                return {
                  score:
                    60,
                  state:
                    'WARNING',
                  contributors: [
                    'STALE_REAL_SIGNAL',
                  ],
                  breakdown: [],
                  factors: {},
                }
              },
            ),
        }

        const riskService =
          new RiskService(
            riskPrisma as any,
            temporalRisk as any,
            timeline as any,
          )

        const result =
          await riskService
            .recalculatePersonRisk(
              personId,
              'REAL_STALE_DECISION',
              orgId,
            )

        /*
         * O retorno também precisa refletir
         * o estado que venceu no banco.
         */
        expect(result)
          .toEqual(
            expect.objectContaining({
              score: 80,
              state: 'RESTRICTED',
            }),
          )

        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id:
                personId,
            },
          })

        /*
         * WARNING/60 não pode regredir
         * RESTRICTED/80.
         */
        expect(
          finalPerson?.operationalState,
        ).toBe('RESTRICTED')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(80)

        expect(
          finalPerson?.riskScore,
        ).toBe(80)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt,
        ).toEqual(
          newerUpdatedAt,
        )

        const stateEvents =
          await prismaB.timelineEvent
            .findMany({
              where: {
                orgId,
                personId,
                action:
                  'OPERATIONAL_STATE_CHANGED',
              },
              orderBy: {
                createdAt:
                  'asc',
              },
            })

        const warningEvents =
          stateEvents.filter(
            (event) =>
              (event.metadata as any)?.to
              === 'WARNING',
          )

        const restrictedEvents =
          stateEvents.filter(
            (event) =>
              (event.metadata as any)?.to
              === 'RESTRICTED',
          )

        expect(stateEvents)
          .toHaveLength(2)

        expect(warningEvents)
          .toHaveLength(0)

        expect(restrictedEvents)
          .toHaveLength(1)

        expect(
          restrictedEvents[0]
            ?.metadata,
        ).toEqual(
          expect.objectContaining({
            source:
              'SIMULATED_FRESHER_WRITER',
          }),
        )

        /*
         * Loser stale não publica nada.
         */
        expect(
          timeline
            .logInTransaction,
        ).not.toHaveBeenCalled()

        expect(
          timeline.log,
        ).not.toHaveBeenCalled()

        expect(
          timeline
            .dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()

        const snapshots =
          await prismaB.riskSnapshot
            .count({
              where: {
                personId,
              },
            })

        expect(snapshots)
          .toBe(0)
      },
      30_000,
    )

    it(
      'falha da Timeline faz rollback de estado e score legado',
      async () => {
        const riskPrisma = {
          person:
            prismaA.person,

          timelineEvent:
            prismaA.timelineEvent,

          riskSnapshot:
            prismaA.riskSnapshot,

          $transaction:
            prismaA.$transaction.bind(
              prismaA,
            ),
        }

        const timeline =
          createTimelineDouble(
            prismaA,
            {
              failStateEvent:
                true,
            },
          )

        const temporalRisk = {
          calculateDetailed:
            jest.fn()
              .mockResolvedValue({
                score:
                  60,
                state:
                  'WARNING',
                contributors: [
                  'ROLLBACK_SIGNAL',
                ],
                breakdown: [],
                factors: {},
              }),
        }

        const riskService =
          new RiskService(
            riskPrisma as any,
            temporalRisk as any,
            timeline as any,
          )

        await expect(
          riskService
            .recalculatePersonRisk(
              personId,
              'REAL_TIMELINE_FAILURE',
              orgId,
            ),
        ).rejects.toThrow(
          'timeline failure',
        )

        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id:
                personId,
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
          finalPerson?.riskScore,
        ).toBe(10)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt
            ?.getTime(),
        ).toBe(
          initialUpdatedAt.getTime(),
        )

        const stateEvents =
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
         * Só o seed NORMAL sobrevive.
         */
        expect(stateEvents)
          .toHaveLength(1)

        expect(
          (
            stateEvents[0]
              ?.metadata as any
          )?.to,
        ).toBe('NORMAL')

        const snapshots =
          await prismaB.riskSnapshot
            .count({
              where: {
                personId,
              },
            })

        expect(snapshots)
          .toBe(0)

        expect(
          timeline.log,
        ).not.toHaveBeenCalled()

        expect(
          timeline
            .dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()
      },
      30_000,
    )
  },
)

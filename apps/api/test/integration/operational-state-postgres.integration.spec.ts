import { PrismaClient } from '@prisma/client'
import { OperationalStateJob } from '../../src/people/operational-state.job'
import { OperationalStateRepository } from '../../src/people/operational-state.repository'

const runReal =
  process.env.RUN_REAL_OPERATIONAL_STATE_INTEGRATION === 'true'

const databaseUrl = process.env.DATABASE_URL ?? ''

if (runReal) {
  if (!/127\.0\.0\.1|localhost/i.test(databaseUrl)) {
    throw new Error(
      'Teste real do OperationalStateJob exige PostgreSQL local isolado',
    )
  }

  if (
    !/(outbox[_-]test|operational[_-]state[_-]test|test[_-](outbox|operational))/i
      .test(databaseUrl)
  ) {
    throw new Error(
      'Teste real do OperationalStateJob exige banco isolado de teste',
    )
  }
}

const describeReal = runReal ? describe : describe.skip

describeReal(
  'OperationalStateJob PostgreSQL real com duas instâncias',
  () => {
    const prismaA = new PrismaClient()
    const prismaB = new PrismaClient()

    const orgId = 'operational-state-real-org'
    const orgSlug = 'operational-state-real'
    const personId = 'operational-state-real-person'

    const initialUpdatedAt =
      new Date('2026-08-22T12:00:00.000Z')

    beforeAll(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: { orgId },
      })

      await prismaA.person.deleteMany({
        where: { orgId },
      })

      await prismaA.organization.deleteMany({
        where: {
          OR: [
            { id: orgId },
            { slug: orgSlug },
          ],
        },
      })

      await prismaA.organization.create({
        data: {
          id: orgId,
          slug: orgSlug,
          name: 'Operational State Real',
        },
      })
    })

    beforeEach(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: { orgId },
      })

      await prismaA.person.deleteMany({
        where: { orgId },
      })

      await prismaA.person.create({
        data: {
          id: personId,
          orgId,
          name: 'Pessoa Concorrente',
          role: 'OPERADOR',
          active: true,
          operationalState: 'NORMAL',
          operationalRiskScore: 10,
          operationalStateUpdatedAt:
            initialUpdatedAt,
        },
      })

      /*
       * Estado autoritativo anterior.
       *
       * As duas instâncias deverão observá-lo
       * antes que qualquer uma tente a transição.
       */
      await prismaA.timelineEvent.create({
        data: {
          orgId,
          personId,
          action: 'OPERATIONAL_STATE_CHANGED',
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
        where: { orgId },
      })

      await prismaA.person.deleteMany({
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
      'permite que apenas uma instância registre a transição',
      async () => {
        let initialReaders = 0
        let releaseInitialReaders!: () => void

        const bothReadInitialState =
          new Promise<void>((resolve) => {
            releaseInitialReaders = resolve
          })

        const repositoryA =
          new OperationalStateRepository(
            prismaA as any,
          )

        const repositoryB =
          new OperationalStateRepository(
            prismaB as any,
          )

        /*
         * Cada instância consulta de verdade a Timeline.
         * Só liberamos os jobs depois que ambas já
         * observaram o estado anterior NORMAL.
         */
        const makeRepository = (
          repository:
            OperationalStateRepository,
        ) => ({
          getLastState: jest.fn(
            async (
              params: {
                orgId: string
                personId: string
              },
              tx?: any,
            ) => {
              if (tx) {
                return repository.getLastState(
                  params,
                  tx,
                )
              }

              const observed =
                await repository.getLastState(
                  params,
                )

              initialReaders += 1

              if (initialReaders === 2) {
                releaseInitialReaders()
              }

              await bothReadInitialState

              return observed
            },
          ),
        })

        const timelineA = {
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

        const timelineB = {
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

        const riskA = {
          calculatePersonRisk:
            jest.fn().mockResolvedValue(80),
        }

        const riskB = {
          calculatePersonRisk:
            jest.fn().mockResolvedValue(80),
        }

        const jobA =
          new OperationalStateJob(
            prismaA as any,
            timelineA as any,
            riskA as any,
            makeRepository(
              repositoryA,
            ) as any,
          )

        const jobB =
          new OperationalStateJob(
            prismaB as any,
            timelineB as any,
            riskB as any,
            makeRepository(
              repositoryB,
            ) as any,
          )

        await Promise.all([
          jobA.run(),
          jobB.run(),
        ])

        /*
         * Prova de que reproduzimos a janela:
         * ambas viram NORMAL antes do CAS.
         */
        expect(initialReaders).toBe(2)

        const finalPerson =
          await prismaB.person.findUnique({
            where: {
              id: personId,
            },
            select: {
              operationalState: true,
              operationalRiskScore: true,
              operationalStateUpdatedAt:
                true,
            },
          })

        expect(finalPerson).not.toBeNull()

        expect(
          finalPerson?.operationalState,
        ).toBe('RESTRICTED')

        expect(
          finalPerson
            ?.operationalRiskScore,
        ).toBe(80)

        expect(
          finalPerson
            ?.operationalStateUpdatedAt
            ?.getTime(),
        ).not.toBe(
          initialUpdatedAt.getTime(),
        )

        /*
         * Consulta por outra conexão depois dos
         * dois commits.
         */
        const transitions =
          await prismaB.timelineEvent.findMany({
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

        const restrictedTransitions =
          transitions.filter(
            (event) => {
              const metadata =
                event.metadata as any

              return (
                metadata?.to ===
                'RESTRICTED'
              )
            },
          )

        /*
         * Seed NORMAL + apenas uma nova
         * transição RESTRICTED.
         */
        expect(transitions).toHaveLength(2)

        expect(
          restrictedTransitions,
        ).toHaveLength(1)

        expect(
          restrictedTransitions[0]
            ?.metadata,
        ).toEqual(
          expect.objectContaining({
            from: 'NORMAL',
            to: 'RESTRICTED',
            riskScore: 80,
            source:
              'OPERATIONAL_STATE_JOB',
          }),
        )

        /*
         * Só o owner despacha webhook.
         */
        expect(
          timelineA
            .dispatchPersistedEventWebhook
            .mock.calls.length
          +
          timelineB
            .dispatchPersistedEventWebhook
            .mock.calls.length,
        ).toBe(1)

        /*
         * Só uma transação cria evidência.
         */
        expect(
          timelineA
            .logInTransaction
            .mock.calls.length
          +
          timelineB
            .logInTransaction
            .mock.calls.length,
        ).toBe(1)
      },
      30_000,
    )
  },
)

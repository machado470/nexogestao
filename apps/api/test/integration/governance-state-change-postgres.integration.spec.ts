import { PrismaClient } from '@prisma/client'
import { EnforcementEngineService } from '../../src/governance/enforcement-engine.service'
import { EnforcementPolicyService } from '../../src/governance/enforcement-policy.service'

const runReal =
  process.env.RUN_REAL_GOVERNANCE_STATE_INTEGRATION === 'true'

const databaseUrl = process.env.DATABASE_URL ?? ''

if (runReal) {
  if (!/127\.0\.0\.1|localhost/i.test(databaseUrl)) {
    throw new Error(
      'Teste real de Governance exige PostgreSQL local isolado',
    )
  }

  if (
    !/governance[_-]state[_-]test/i.test(databaseUrl)
  ) {
    throw new Error(
      'Teste real de Governance exige banco isolado governance_state_test',
    )
  }
}

const describeReal = runReal ? describe : describe.skip

describeReal(
  'EnforcementEngineService PostgreSQL real',
  () => {
    const prismaA = new PrismaClient()
    const prismaB = new PrismaClient()

    const orgId = 'governance-state-real-org'
    const orgSlug = 'governance-state-real'
    const personId = 'governance-state-real-person'

    async function resetPerson() {
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
          name: 'Pessoa Governance Real',
          role: 'OPERADOR',
          active: true,
          operationalState: 'NORMAL',
          operationalRiskScore: 60,
        },
      })
    }

    function makeTimeline(params?: {
      failStateEvidence?: boolean
    }) {
      return {
        log: jest.fn().mockResolvedValue(undefined),

        logInTransaction: jest.fn(
          async (
            input: any,
            tx: any,
          ) => {
            if (params?.failStateEvidence) {
              throw new Error(
                'timeline persistence failed',
              )
            }

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
          jest.fn().mockResolvedValue(undefined),
      }
    }

    function makePrismaFacade(
      client: PrismaClient,
      beforeTransaction?: () => Promise<void>,
    ) {
      return {
        person: {
          findMany: jest.fn(
            async (args: any) =>
              client.person.findMany(args),
          ),
        },

        $queryRaw: (...args: any[]) =>
          (client as any).$queryRaw(...args),

        $transaction: (callback: any) =>
          client.$transaction(
            async (tx) => {
              if (beforeTransaction) {
                await beforeTransaction()
              }

              return callback(tx)
            },
          ),
      }
    }

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
          name: 'Governance State Real',
        },
      })
    })

    beforeEach(async () => {
      await resetPerson()
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
      'permite que apenas uma instância conquiste e registre a transição',
      async () => {
        let transactionEntrants = 0
        let releaseTransactions!: () => void

        const bothTransactionsStarted =
          new Promise<void>((resolve) => {
            releaseTransactions = resolve
          })

        const beforeTransaction =
          async () => {
            transactionEntrants += 1

            if (transactionEntrants === 2) {
              releaseTransactions()
            }

            await bothTransactionsStarted
          }

        const timelineA = makeTimeline()
        const timelineB = makeTimeline()

        const serviceA =
          new EnforcementEngineService(
            makePrismaFacade(
              prismaA,
              beforeTransaction,
            ) as any,
            new EnforcementPolicyService(),
            timelineA as any,
          )

        const serviceB =
          new EnforcementEngineService(
            makePrismaFacade(
              prismaB,
              beforeTransaction,
            ) as any,
            new EnforcementPolicyService(),
            timelineB as any,
          )

        await Promise.all([
          serviceA.runForOrg(orgId),
          serviceB.runForOrg(orgId),
        ])

        /*
         * Ambas abriram transação com decisão derivada
         * do mesmo snapshot NORMAL/60.
         */
        expect(transactionEntrants).toBe(2)

        const finalPerson =
          await prismaB.person.findUnique({
            where: { id: personId },
            select: {
              operationalState: true,
              operationalRiskScore: true,
            },
          })

        expect(finalPerson).toEqual({
          operationalState: 'WARNING',
          operationalRiskScore: 60,
        })

        const transitions =
          await prismaB.timelineEvent.findMany({
            where: {
              orgId,
              personId,
              action:
                'OPERATIONAL_STATE_CHANGED',
            },
          })

        /*
         * PostgreSQL deve fazer uma updateMany ganhar
         * NORMAL/60 e a concorrente reavaliar o WHERE,
         * retornando count=0.
         */
        expect(transitions).toHaveLength(1)

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
      'faz rollback real do estado quando a evidência falha',
      async () => {
        const timeline = makeTimeline({
          failStateEvidence: true,
        })

        const service =
          new EnforcementEngineService(
            makePrismaFacade(
              prismaA,
            ) as any,
            new EnforcementPolicyService(),
            timeline as any,
          )

        await expect(
          service.runForOrg(orgId),
        ).rejects.toThrow(
          'timeline persistence failed',
        )

        /*
         * O updateMany ocorreu dentro da transação,
         * mas a falha seguinte precisa revertê-lo.
         */
        const finalPerson =
          await prismaB.person.findUnique({
            where: { id: personId },
            select: {
              operationalState: true,
              operationalRiskScore: true,
            },
          })

        expect(finalPerson).toEqual({
          operationalState: 'NORMAL',
          operationalRiskScore: 60,
        })

        const transitions =
          await prismaB.timelineEvent.count({
            where: {
              orgId,
              personId,
              action:
                'OPERATIONAL_STATE_CHANGED',
            },
          })

        expect(transitions).toBe(0)

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()
      },
      30_000,
    )
  },
)

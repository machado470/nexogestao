import { PrismaClient } from '@prisma/client'
import { ExecutionRunner } from '../../src/execution/execution.runner'
import type {
  ExecutionActionCandidate,
  ExecutionPolicyConfig,
} from '../../src/execution/execution.types'

const runReal =
  process.env.RUN_REAL_EXECUTION_INTEGRATION === 'true'

const databaseUrl = process.env.DATABASE_URL ?? ''

if (runReal) {
  if (!/127\.0\.0\.1|localhost/i.test(databaseUrl)) {
    throw new Error(
      'Teste real do ExecutionRunner exige PostgreSQL local isolado',
    )
  }

  if (
    !/(outbox[_-]test|execution[_-]test|test[_-](outbox|execution))/i
      .test(databaseUrl)
  ) {
    throw new Error(
      'Teste real do ExecutionRunner exige banco isolado de teste',
    )
  }
}

const describeReal = runReal ? describe : describe.skip

describeReal(
  'ExecutionRunner PostgreSQL real com duas instâncias',
  () => {
    const prismaA = new PrismaClient()
    const prismaB = new PrismaClient()

    const orgId = 'execution-runner-real-org'
    const orgSlug = 'execution-runner-real'

    const policy: ExecutionPolicyConfig = {
      allowAutomaticCharge: true,
      allowWhatsAppAuto: true,
      allowOverdueReminderAuto: true,
      allowFinanceTeamNotifications: true,
      allowGovernanceFollowup: true,
      allowChargeFollowupCreation: true,
      allowRiskReviewEscalation: true,
      maxRetries: 3,
      throttleWindowMs: 30 * 60_000,
    }

    beforeAll(async () => {
      await prismaA.timelineEvent.deleteMany({
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
          name: 'Execution Runner Real',
        },
      })
    })

    beforeEach(async () => {
      await prismaA.timelineEvent.deleteMany({
        where: { orgId },
      })
    })

    afterAll(async () => {
      await prismaA.timelineEvent.deleteMany({
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
      'concede ownership para apenas uma instância e produz um único efeito',
      async () => {
        let initialReaders = 0
        let releaseInitialReaders!: () => void

        const bothRead = new Promise<void>((resolve) => {
          releaseInitialReaders = resolve
        })

        const makeEvents = (prisma: PrismaClient) => ({
          /*
           * Força as duas instâncias a atravessarem
           * a primeira checagem como se não houvesse
           * execução recente.
           */
          hasRecentExecution: jest.fn(async () => {
            initialReaders += 1

            if (initialReaders === 2) {
              releaseInitialReaders()
            }

            await bothRead
            return false
          }),

          countRecentFailures:
            jest.fn().mockResolvedValue(0),

          /*
           * Esta gravação usa o TransactionClient REAL
           * recebido pelo ExecutionRunner.
           */
          recordEventInTransaction: jest.fn(
            async (
              eventOrgId: string,
              payload: any,
              tx: any,
            ) => {
              const metadata = JSON.parse(
                JSON.stringify({
                  ...payload,
                  orgId: eventOrgId,
                  entityId: payload.entityId,
                  reasonCode:
                    payload.reasonCode ?? null,
                  cooldownUntil:
                    payload.cooldownUntil
                    ?? payload.explanation
                      ?.cooldownUntil
                    ?? null,
                }),
              )

              return tx.timelineEvent.create({
                data: {
                  orgId: eventOrgId,
                  action: 'EXECUTION_EVENT',
                  description:
                    `${payload.eventType} | `
                    + `${payload.actionId} => `
                    + `${payload.status}`,
                  metadata,
                },
              })
            },
          ),

          dispatchRecordedEventWebhook:
            jest.fn().mockResolvedValue(undefined),

          /*
           * Eventos posteriores ao STARTED continuam
           * persistidos por uma conexão real.
           */
          recordEvent: jest.fn(
            async (
              eventOrgId: string,
              payload: any,
            ) => {
              const metadata = JSON.parse(
                JSON.stringify({
                  ...payload,
                  orgId: eventOrgId,
                  entityId: payload.entityId,
                  reasonCode:
                    payload.reasonCode ?? null,
                  cooldownUntil:
                    payload.cooldownUntil
                    ?? payload.explanation
                      ?.cooldownUntil
                    ?? null,
                }),
              )

              return prisma.timelineEvent.create({
                data: {
                  orgId: eventOrgId,
                  action: 'EXECUTION_EVENT',
                  description:
                    `${payload.eventType} | `
                    + `${payload.actionId} => `
                    + `${payload.status}`,
                  metadata,
                },
              })
            },
          ),
        })

        const tenantOpsA = {
          enforceLimit: jest.fn().mockReturnValue({
            allowed: true,
            reason: null,
            used: 1,
            limit: 180,
            windowMs: 60_000,
          }),
          increment: jest.fn(),
          recordCriticalEvent: jest.fn(),
        }

        const tenantOpsB = {
          enforceLimit: jest.fn().mockReturnValue({
            allowed: true,
            reason: null,
            used: 1,
            limit: 180,
            windowMs: 60_000,
          }),
          increment: jest.fn(),
          recordCriticalEvent: jest.fn(),
        }

        const makeRunner = (
          prisma: PrismaClient,
          events: any,
          tenantOps: any,
        ) =>
          new ExecutionRunner(
            prisma as any,
            {} as any,
            {
              getExecutionMode:
                jest.fn().mockResolvedValue(
                  'automatic',
                ),

              getPolicyConfig:
                jest.fn().mockResolvedValue(policy),

              getBlockedRecentCooldownMs:
                jest.fn().mockReturnValue(60_000),
            } as any,
            {
              evaluate:
                jest.fn().mockReturnValue({
                  status: 'allowed',
                }),
            } as any,
            events,
            {
              increment: jest.fn(),
            } as any,
            tenantOps,
            {
              canUseFeature:
                jest.fn().mockResolvedValue({
                  allowed: true,
                }),

              enforceMeter:
                jest.fn().mockResolvedValue({
                  allowed: true,
                }),
            } as any,
          )

        const eventsA = makeEvents(prismaA)
        const eventsB = makeEvents(prismaB)

        const runnerA = makeRunner(
          prismaA,
          eventsA,
          tenantOpsA,
        )

        const runnerB = makeRunner(
          prismaB,
          eventsB,
          tenantOpsB,
        )

        const candidate: ExecutionActionCandidate = {
          actionId:
            'action-notify-operational-alert',
          decisionId:
            'decision-postgres-concurrent-1',
          entityType: 'system',
          entityId:
            'system-postgres-concurrent-1',
          orgId,
          priority: 'high',
          intent: 'reduce_risk',
          metadata: {
            overdueCount: 3,
            stalledServiceOrders: 0,
          },
        }

        const [resultA, resultB] =
          await Promise.all([
            (runnerA as any).processCandidate(
              candidate,
              {
                correlationId:
                  'postgres-correlation-a',
              },
            ),

            (runnerB as any).processCandidate(
              candidate,
              {
                correlationId:
                  'postgres-correlation-b',
              },
            ),
          ])

        expect(initialReaders).toBe(2)

        expect(
          [resultA, resultB].filter(
            (result) => result === 'executed',
          ),
        ).toHaveLength(1)

        expect(
          [resultA, resultB].filter(
            (result) =>
              result ===
              'blocked_recent_execution',
          ),
        ).toHaveLength(1)

        /*
         * Consulta feita por outra conexão Prisma:
         * comprova que o STARTED ficou visível depois
         * do commit que libera o advisory xact lock.
         */
        const startedEvents =
          await prismaB.timelineEvent.findMany({
            where: {
              orgId,
              action: 'EXECUTION_EVENT',
              metadata: {
                path: ['eventType'],
                equals: 'EXECUTION_STARTED',
              },
            },
          })

        expect(startedEvents).toHaveLength(1)

        const executedEvents =
          await prismaB.timelineEvent.findMany({
            where: {
              orgId,
              action: 'EXECUTION_EVENT',
              metadata: {
                path: ['eventType'],
                equals: 'EXECUTION_EXECUTED',
              },
            },
          })

        expect(executedEvents).toHaveLength(1)

        /*
         * Este é o efeito real da ação escolhida.
         */
        const effects =
          await prismaB.timelineEvent.findMany({
            where: {
              orgId,
              action: 'OPERATIONAL_ALERT',
            },
          })

        expect(effects).toHaveLength(1)

        /*
         * O runner perdedor não consome rate-limit.
         */
        expect(
          tenantOpsA.enforceLimit.mock.calls.length
          + tenantOpsB.enforceLimit.mock.calls.length,
        ).toBe(1)
      },
      30_000,
    )
  },
)

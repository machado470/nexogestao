import { ExecutionRunner } from './execution.runner'
import type {
  ExecutionActionCandidate,
  ExecutionPolicyConfig,
} from './execution.types'

describe('ExecutionRunner multi-instance concurrency', () => {
  it(
    'executa uma única vez quando duas instâncias passam pela checagem inicial',
    async () => {
      let initialReaders = 0
      let releaseReaders!: () => void

      const bothRead = new Promise<void>((resolve) => {
        releaseReaders = resolve
      })

      let started = false
      const startedEvents: any[] = []

      const timelineEffectCreate = jest
        .fn()
        .mockResolvedValue({ id: 'effect-1' })

      const timelineEvent = {
        create: timelineEffectCreate,
        findFirst: jest.fn(async () =>
          started
            ? { id: 'execution-started-1' }
            : null,
        ),
      }

      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        timelineEvent,
      }

      /*
       * Simula serialização causada pelo advisory lock real.
       */
      let transactionTail = Promise.resolve()

      const prisma = {
        timelineEvent,

        $transaction: jest.fn(async (callback: any) => {
          let release!: () => void

          const previous = transactionTail
          transactionTail = new Promise<void>((resolve) => {
            release = resolve
          })

          await previous

          try {
            return await callback(tx)
          } finally {
            release()
          }
        }),
      }

      const makeEvents = () => ({
        hasRecentExecution: jest.fn(async () => {
          initialReaders += 1

          if (initialReaders === 2) {
            releaseReaders()
          }

          await bothRead

          /*
           * As duas instâncias deliberadamente observam false
           * antes da disputa pelo ownership.
           */
          return false
        }),

        countRecentFailures:
          jest.fn().mockResolvedValue(0),

        recordEventInTransaction:
          jest.fn(async (_orgId, payload) => {
            startedEvents.push(payload)
            started = true

            return {
              id: 'execution-started-1',
            }
          }),

        dispatchRecordedEventWebhook:
          jest.fn().mockResolvedValue(undefined),

        recordEvent:
          jest.fn().mockResolvedValue(undefined),
      })

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

      const tenantLimit = jest.fn().mockReturnValue({
        allowed: true,
        reason: null,
        used: 1,
        limit: 180,
        windowMs: 60_000,
      })

      const makeRunner = () =>
        new ExecutionRunner(
          prisma as any,
          {} as any,
          {
            getExecutionMode:
              jest.fn().mockResolvedValue('automatic'),
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
          makeEvents() as any,
          {
            increment: jest.fn(),
          } as any,
          {
            enforceLimit: tenantLimit,
            increment: jest.fn(),
            recordCriticalEvent: jest.fn(),
          } as any,
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

      const candidate: ExecutionActionCandidate = {
        actionId: 'action-notify-operational-alert',
        decisionId: 'decision-concurrent-1',
        entityType: 'system',
        entityId: 'system-concurrent-1',
        orgId: 'org-1',
        priority: 'high',
        intent: 'reduce_risk',
        metadata: {
          overdueCount: 3,
          stalledServiceOrders: 0,
        },
      }

      const runnerA = makeRunner()
      const runnerB = makeRunner()

      const [resultA, resultB] = await Promise.all([
        (runnerA as any).processCandidate(
          candidate,
          { correlationId: 'corr-a' },
        ),
        (runnerB as any).processCandidate(
          candidate,
          { correlationId: 'corr-b' },
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
            result === 'blocked_recent_execution',
        ),
      ).toHaveLength(1)

      expect(startedEvents).toHaveLength(1)

      expect(
        startedEvents[0],
      ).toMatchObject({
        eventType: 'EXECUTION_STARTED',
        executionKey: expect.any(String),
      })

      expect(
        timelineEffectCreate,
      ).toHaveBeenCalledTimes(1)

      /*
       * Só o owner consome o rate-limit.
       */
      expect(tenantLimit).toHaveBeenCalledTimes(1)

      expect(tx.$queryRaw).toHaveBeenCalledTimes(2)

      const sql = String(
        tx.$queryRaw.mock.calls[0][0]
          ?.strings?.join(' ') ?? '',
      )

      expect(sql).toContain(
        'pg_advisory_xact_lock',
      )
      expect(sql).toContain(
        'hashtextextended',
      )
    },
  )
})

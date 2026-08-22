import { OperationalStateJob } from './operational-state.job'

describe('OperationalStateJob evidence', () => {
  it(
    'não grava UNKNOWN → NORMAL quando não há pessoas avaliáveis',
    async () => {
      const prisma = {
        person: {
          findMany:
            jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn(),
      }

      const timeline = {
        logInTransaction: jest.fn(),
        dispatchPersistedEventWebhook:
          jest.fn(),
      }

      const job = new OperationalStateJob(
        prisma as any,
        timeline as any,
        {} as any,
        {} as any,
      )

      await job.run()

      expect(
        timeline.logInTransaction,
      ).not.toHaveBeenCalled()

      expect(
        prisma.$transaction,
      ).not.toHaveBeenCalled()
    },
  )

  it(
    'grava primeira transição saudável quando uma pessoa foi realmente avaliada',
    async () => {
      const tx = {
        person: {
          updateMany: jest
            .fn()
            .mockResolvedValue({
              count: 1,
            }),
        },
      }

      const prisma = {
        person: {
          findMany:
            jest.fn().mockResolvedValue([
              {
                id: 'person-a',
                orgId: 'org-a',
                operationalState: 'NORMAL',
                operationalRiskScore: 0,
                operationalStateUpdatedAt:
                  null,
              },
            ]),
        },

        $transaction:
          jest.fn(async (callback) =>
            callback(tx),
          ),
      }

      const timeline = {
        logInTransaction:
          jest.fn().mockResolvedValue({
            id: 'event-a',
          }),

        dispatchPersistedEventWebhook:
          jest.fn().mockResolvedValue(
            undefined,
          ),
      }

      const risk = {
        calculatePersonRisk:
          jest.fn().mockResolvedValue(0),
      }

      const repo = {
        getLastState:
          jest.fn().mockResolvedValue(null),
      }

      await new OperationalStateJob(
        prisma as any,
        timeline as any,
        risk as any,
        repo as any,
      ).run()

      expect(
        tx.person.updateMany,
      ).toHaveBeenCalledTimes(1)

      expect(
        timeline.logInTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-a',
          action:
            'OPERATIONAL_STATE_CHANGED',
          personId: 'person-a',
          metadata:
            expect.objectContaining({
              from: 'UNKNOWN',
              to: 'NORMAL',
              evaluatedRecords: 1,
              source:
                'OPERATIONAL_STATE_JOB',
            }),
        }),
        tx,
      )

      expect(
        timeline
          .dispatchPersistedEventWebhook,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-a',
          action:
            'OPERATIONAL_STATE_CHANGED',
          personId: 'person-a',
        }),
        'event-a',
      )
    },
  )
})

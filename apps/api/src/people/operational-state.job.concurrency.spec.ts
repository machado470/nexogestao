import { OperationalStateJob } from './operational-state.job'

describe(
  'OperationalStateJob multi-instance concurrency',
  () => {
    it(
      'registra uma única vez a mesma transição operacional',
      async () => {
        let readers = 0
        let releaseReaders!: () => void

        const bothReadLastState =
          new Promise<void>((resolve) => {
            releaseReaders = resolve
          })

        const person = {
          id: 'person-a',
          orgId: 'org-a',
          operationalState: 'NORMAL',
          operationalRiskScore: 10,
          operationalStateUpdatedAt:
            new Date(
              '2026-08-22T15:00:00.000Z',
            ),
        }

        let claimed = false

        const updateMany = jest.fn(
          async () => {
            if (claimed) {
              return { count: 0 }
            }

            claimed = true
            return { count: 1 }
          },
        )

        const tx = {
          person: {
            updateMany,
          },
        }

        const prisma = {
          person: {
            findMany:
              jest.fn().mockResolvedValue([
                person,
              ]),
          },

          $transaction:
            jest.fn(async (callback) =>
              callback(tx),
            ),
        }

        const risk = {
          calculatePersonRisk:
            jest.fn().mockResolvedValue(80),
        }

        const repo = {
          getLastState:
            jest.fn(
              async (
                _params: unknown,
                transaction?: unknown,
              ) => {
                /*
                 * Revalidação dentro do claim.
                 */
                if (transaction) {
                  return 'NORMAL'
                }

                /*
                 * As duas instâncias atravessam
                 * deliberadamente o fast-path.
                 */
                readers += 1

                if (readers === 2) {
                  releaseReaders()
                }

                await bothReadLastState
                return 'NORMAL'
              },
            ),
        }

        const timelineLog =
          jest.fn().mockResolvedValue({
            id: 'event-1',
          })

        const timelineDispatch =
          jest.fn().mockResolvedValue(
            undefined,
          )

        const timeline = {
          logInTransaction:
            timelineLog,

          dispatchPersistedEventWebhook:
            timelineDispatch,
        }

        const jobA =
          new OperationalStateJob(
            prisma as any,
            timeline as any,
            risk as any,
            repo as any,
          )

        const jobB =
          new OperationalStateJob(
            prisma as any,
            timeline as any,
            risk as any,
            repo as any,
          )

        await Promise.all([
          jobA.run(),
          jobB.run(),
        ])

        expect(readers).toBe(2)

        /*
         * As duas tentam o CAS.
         */
        expect(
          updateMany,
        ).toHaveBeenCalledTimes(2)

        /*
         * Apenas uma conquista ownership.
         */
        expect(
          timelineLog,
        ).toHaveBeenCalledTimes(1)

        expect(
          timelineDispatch,
        ).toHaveBeenCalledTimes(1)

        expect(
          timelineLog,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            orgId: 'org-a',
            personId: 'person-a',
            action:
              'OPERATIONAL_STATE_CHANGED',
            metadata:
              expect.objectContaining({
                from: 'NORMAL',
                to: 'RESTRICTED',
                riskScore: 80,
                source:
                  'OPERATIONAL_STATE_JOB',
              }),
          }),
          tx,
        )
      },
    )
  },
)

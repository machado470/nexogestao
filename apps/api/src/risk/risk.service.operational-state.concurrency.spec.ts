import { RiskService } from './risk.service'
import {
  OperationalStateJob,
} from '../people/operational-state.job'

type State =
  | 'NORMAL'
  | 'WARNING'
  | 'RESTRICTED'
  | 'SUSPENDED'

describe(
  'RiskService operational state ownership',
  () => {
    it(
      'RiskService × Job produz uma única evidência canônica',
      async () => {
        const initialUpdatedAt =
          new Date(
            '2026-08-22T12:00:00.000Z',
          )

        let state: State = 'NORMAL'
        let operationalScore = 10
        let legacyScore = 10

        let updatedAt:
          Date | null =
            initialUpdatedAt

        let timelineState:
          State = 'NORMAL'

        /*
         * RiskService e Job precisam capturar
         * exatamente o mesmo snapshot NORMAL/10.
         */
        let initialReaders = 0

        let releaseReaders!: () => void

        const bothReadInitial =
          new Promise<void>((resolve) => {
            releaseReaders = resolve
          })

        let releaseJobRisk!: () => void

        const riskClaimed =
          new Promise<void>((resolve) => {
            releaseJobRisk = resolve
          })

        let riskPersonReads = 0

        const riskPersonFindFirst =
          jest.fn(
            async () => {
              riskPersonReads += 1

              const observed = {
                id: 'person-a',
                orgId: 'org-a',
                riskScore:
                  legacyScore,
                operationalRiskScore:
                  operationalScore,
                operationalState:
                  state,
                operationalStateUpdatedAt:
                  updatedAt,
              }

              /*
               * Só a primeira leitura pertence
               * ao snapshot que origina a decisão.
               */
              if (riskPersonReads === 1) {
                initialReaders += 1

                if (
                  initialReaders === 2
                ) {
                  releaseReaders()
                }

                await bothReadInitial
              }

              return observed
            },
          )

        const snapshotMatches = (
          where: any,
        ) => {
          const sameTimestamp =
            where.operationalStateUpdatedAt
              instanceof Date
            && updatedAt instanceof Date
              ? where
                  .operationalStateUpdatedAt
                  .getTime()
                === updatedAt.getTime()
              : where
                  .operationalStateUpdatedAt
                === updatedAt

          const sameLegacy =
            where.riskScore === undefined
            || where.riskScore
              === legacyScore

          return (
            where.id === 'person-a'
            && where.orgId === 'org-a'
            && where.active === true
            && where.operationalState
              === state
            && where.operationalRiskScore
              === operationalScore
            && sameTimestamp
            && sameLegacy
          )
        }

        const applyUpdate = (
          where: any,
          data: any,
        ) => {
          if (!snapshotMatches(where)) {
            return false
          }

          state =
            data.operationalState

          operationalScore =
            data.operationalRiskScore

          updatedAt =
            data.operationalStateUpdatedAt

          if (
            data.riskScore !== undefined
          ) {
            legacyScore =
              data.riskScore
          }

          return true
        }

        const riskUpdateMany =
          jest.fn(
            async ({
              where,
              data,
            }: any) => {
              const won =
                applyUpdate(
                  where,
                  data,
                )

              if (won) {
                /*
                 * Só liberamos o Job depois
                 * que RiskService conquistou
                 * NORMAL/10 -> WARNING/60.
                 */
                releaseJobRisk()
              }

              return {
                count: won ? 1 : 0,
              }
            },
          )

        const jobUpdateMany =
          jest.fn(
            async ({
              where,
              data,
            }: any) => ({
              count:
                applyUpdate(
                  where,
                  data,
                )
                  ? 1
                  : 0,
            }),
          )

        const timelineFindFirst =
          jest.fn(
            async () => ({
              metadata: {
                to: timelineState,
              },
            }),
          )

        const timelineCreate =
          jest.fn(
            async ({
              data,
            }: any) => {
              timelineState =
                data.metadata.to

              return {
                id:
                  'canonical-risk-event',
                ...data,
              }
            },
          )

        const riskPrisma = {
          person: {
            findFirst:
              riskPersonFindFirst,
          },

          timelineEvent: {
            findFirst:
              timelineFindFirst,
          },

          riskSnapshot: {
            create:
              jest.fn()
                .mockResolvedValue({
                  id:
                    'risk-snapshot',
                }),
          },

          $transaction:
            jest.fn(
              async (callback: any) =>
                callback({
                  person: {
                    updateMany:
                      riskUpdateMany,
                  },

                  timelineEvent: {
                    findFirst:
                      timelineFindFirst,
                    create:
                      timelineCreate,
                  },
                }),
            ),
        }

        const temporalRisk = {
          calculateDetailed:
            jest.fn()
              .mockResolvedValue({
                score: 60,
                state: 'WARNING',
                contributors: [
                  'TEST_SIGNAL',
                ],
                breakdown: [],
                factors: {},
              }),
        }

        const riskTimeline = {
          logInTransaction:
            jest.fn(
              async (
                input: any,
                tx: any,
              ) =>
                tx.timelineEvent.create({
                  data: {
                    orgId:
                      input.orgId,
                    personId:
                      input.personId,
                    action:
                      input.action,
                    description:
                      input.description,
                    metadata:
                      input.metadata,
                  },
                }),
            ),

          dispatchPersistedEventWebhook:
            jest.fn()
              .mockResolvedValue(
                undefined,
              ),

          log:
            jest.fn()
              .mockResolvedValue({
                id:
                  'risk-history-event',
              }),
        }

        const riskService =
          new RiskService(
            riskPrisma as any,
            temporalRisk as any,
            riskTimeline as any,
          )

        const jobPrisma = {
          person: {
            findMany:
              jest.fn(
                async () => {
                  const observed = {
                    id: 'person-a',
                    orgId: 'org-a',
                    operationalState:
                      state,
                    operationalRiskScore:
                      operationalScore,
                    operationalStateUpdatedAt:
                      updatedAt,
                  }

                  initialReaders += 1

                  if (
                    initialReaders === 2
                  ) {
                    releaseReaders()
                  }

                  await bothReadInitial

                  return [observed]
                },
              ),
          },

          $transaction:
            jest.fn(
              async (callback: any) =>
                callback({
                  person: {
                    updateMany:
                      jobUpdateMany,
                  },
                }),
            ),
        }

        const jobRisk = {
          calculatePersonRisk:
            jest.fn(
              async () => {
                await riskClaimed

                return 60
              },
            ),
        }

        const jobRepository = {
          getLastState:
            jest.fn(
              async () =>
                timelineState,
            ),
        }

        const jobTimeline = {
          logInTransaction:
            jest.fn(),

          dispatchPersistedEventWebhook:
            jest.fn(),
        }

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
              'person-a',
              'TEST_RISK_RECALCULATION',
              'org-a',
            ),

          job.run(),
        ])

        expect(initialReaders)
          .toBe(2)

        /*
         * Ambos tentaram conquistar
         * exatamente o snapshot NORMAL/10.
         */
        expect(riskUpdateMany)
          .toHaveBeenCalledTimes(1)

        expect(jobUpdateMany)
          .toHaveBeenCalledTimes(1)

        /*
         * Somente RiskService venceu.
         */
        expect(state)
          .toBe('WARNING')

        expect(operationalScore)
          .toBe(60)

        expect(legacyScore)
          .toBe(60)

        expect(timelineState)
          .toBe('WARNING')

        /*
         * Exatamente uma evidência canônica.
         */
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
            .logInTransaction
            .mock.calls[0][0],
        ).toEqual(
          expect.objectContaining({
            orgId: 'org-a',
            personId: 'person-a',
            action:
              'OPERATIONAL_STATE_CHANGED',

            metadata:
              expect.objectContaining({
                from: 'NORMAL',
                to: 'WARNING',
                riskScore: 60,
                source:
                  'RISK_SERVICE',
              }),
          }),
        )

        expect(
          riskTimeline
            .dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)

        /*
         * Semântica histórica do RiskService
         * continua preservada.
         */
        expect(
          riskPrisma
            .riskSnapshot
            .create,
        ).toHaveBeenCalledTimes(1)

        expect(
          riskTimeline.log,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'RISK_SNAPSHOT_CREATED',
          }),
        )

        expect(
          riskTimeline.log,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'RISK_UPDATED',
          }),
        )
      },
    )

    it(
      'não reaplica decisão stale sobre estado mais novo',
      async () => {
        const initialUpdatedAt =
          new Date(
            '2026-08-22T12:00:00.000Z',
          )

        const newerUpdatedAt =
          new Date(
            '2026-08-22T12:05:00.000Z',
          )

        let state: State = 'NORMAL'
        let operationalScore = 10
        let legacyScore = 10

        let updatedAt:
          Date | null =
            initialUpdatedAt

        let timelineState:
          State = 'NORMAL'

        let personReads = 0

        const updateMany =
          jest.fn(
            async ({
              where,
            }: any) => {
              const sameTimestamp =
                where.operationalStateUpdatedAt
                  instanceof Date
                && updatedAt
                  instanceof Date
                  ? where
                      .operationalStateUpdatedAt
                      .getTime()
                    === updatedAt.getTime()
                  : where
                      .operationalStateUpdatedAt
                    === updatedAt

              const matches =
                where.id === 'person-a'
                && where.orgId === 'org-a'
                && where.active === true
                && where.operationalState
                  === state
                && where.operationalRiskScore
                  === operationalScore
                && sameTimestamp
                && (
                  where.riskScore
                    === undefined
                  || where.riskScore
                    === legacyScore
                )

              return {
                count:
                  matches ? 1 : 0,
              }
            },
          )

        const timelineFindFirst =
          jest.fn(
            async () => ({
              metadata: {
                to: timelineState,
              },
            }),
          )

        const prisma = {
          person: {
            findFirst:
              jest.fn(
                async () => {
                  personReads += 1

                  return {
                    id: 'person-a',
                    orgId: 'org-a',
                    riskScore:
                      legacyScore,
                    operationalRiskScore:
                      operationalScore,
                    operationalState:
                      state,
                    operationalStateUpdatedAt:
                      updatedAt,
                  }
                },
              ),
          },

          timelineEvent: {
            findFirst:
              timelineFindFirst,
          },

          riskSnapshot: {
            create:
              jest.fn(),
          },

          $transaction:
            jest.fn(
              async (callback: any) =>
                callback({
                  person: {
                    updateMany,
                  },

                  timelineEvent: {
                    findFirst:
                      timelineFindFirst,
                  },
                }),
            ),
        }

        const temporalRisk = {
          calculateDetailed:
            jest.fn(
              async () => {
                /*
                 * Outro owner vence depois que
                 * este RiskService já capturou
                 * NORMAL/10.
                 */
                state = 'RESTRICTED'
                operationalScore = 80
                legacyScore = 80
                updatedAt =
                  newerUpdatedAt
                timelineState =
                  'RESTRICTED'

                /*
                 * Cálculo atual termina com
                 * decisão antiga WARNING/60.
                 */
                return {
                  score: 60,
                  state: 'WARNING',
                  contributors: [
                    'STALE_SIGNAL',
                  ],
                  breakdown: [],
                  factors: {},
                }
              },
            ),
        }

        const timeline = {
          logInTransaction:
            jest.fn(),

          dispatchPersistedEventWebhook:
            jest.fn(),

          log:
            jest.fn(),
        }

        const service =
          new RiskService(
            prisma as any,
            temporalRisk as any,
            timeline as any,
          )

        const result =
          await service
            .recalculatePersonRisk(
              'person-a',
              'STALE_TEST',
              'org-a',
            )

        /*
         * Uma leitura captura o snapshot que
         * originou a decisão e outra relê o
         * estado autoritativo após perder o CAS.
         */
        expect(personReads)
          .toBe(2)

        expect(result)
          .toEqual(
            expect.objectContaining({
              score: 80,
              state: 'RESTRICTED',
            }),
          )

        expect(updateMany)
          .toHaveBeenCalledTimes(1)

        /*
         * A decisão antiga não consegue
         * regredir RESTRICTED/80.
         */
        expect(state)
          .toBe('RESTRICTED')

        expect(operationalScore)
          .toBe(80)

        expect(legacyScore)
          .toBe(80)

        expect(updatedAt)
          .toEqual(newerUpdatedAt)

        expect(timelineState)
          .toBe('RESTRICTED')

        /*
         * Decisão stale derrotada não produz
         * evento nem RiskSnapshot.
         */
        expect(
          timeline
            .logInTransaction,
        ).not.toHaveBeenCalled()

        expect(
          timeline.log,
        ).not.toHaveBeenCalled()

        expect(
          prisma
            .riskSnapshot
            .create,
        ).not.toHaveBeenCalled()
      },
    )
  },
)

import {
  OperationalStateService,
  OperationalStateValue,
} from './operational-state.service'
import {
  OperationalStateJob,
} from './operational-state.job'

type Snapshot = {
  id: string
  orgId: string
  operationalState: OperationalStateValue
  operationalRiskScore: number
  operationalStateUpdatedAt: Date | null
}

function createSharedHarness() {
  const initialUpdatedAt =
    new Date(
      '2026-08-22T12:00:00.000Z',
    )

  let state:
    OperationalStateValue = 'NORMAL'

  let score = 10

  let updatedAt: Date | null =
    initialUpdatedAt

  let timelineState:
    OperationalStateValue = 'NORMAL'

  let outsideReaders = 0
  let targetOutsideReaders = 0

  let releaseReaders!: () => void

  let bothReadPreviousState:
    Promise<void> | null = null

  const startBarrier = (
    expectedReaders: number,
  ) => {
    outsideReaders = 0
    targetOutsideReaders =
      expectedReaders

    bothReadPreviousState =
      new Promise<void>((resolve) => {
        releaseReaders = resolve
      })
  }

  const snapshot = (): Snapshot => ({
    id: 'person-a',
    orgId: 'org-a',
    operationalState: state,
    operationalRiskScore: score,
    operationalStateUpdatedAt:
      updatedAt,
  })

  const updateMany = jest.fn(
    async ({
      where,
      data,
    }: any) => {
      const sameUpdatedAt =
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

      const matches =
        where.id === 'person-a'
        && where.orgId === 'org-a'
        && where.active === true
        && where.operationalState
          === state
        && where.operationalRiskScore
          === score
        && sameUpdatedAt

      if (!matches) {
        return {
          count: 0,
        }
      }

      state =
        data.operationalState

      score =
        data.operationalRiskScore

      updatedAt =
        data.operationalStateUpdatedAt

      return {
        count: 1,
      }
    },
  )

  const prisma = {
    person: {
      findFirst: jest.fn(
        async () => snapshot(),
      ),

      findMany: jest.fn(
        async () => [snapshot()],
      ),
    },

    $transaction: jest.fn(
      async (callback: any) =>
        callback({
          person: {
            updateMany,
          },
        }),
    ),
  }

  const repository = {
    getLastState: jest.fn(
      async (
        _params: any,
        tx?: any,
      ) => {
        if (tx) {
          return timelineState
        }

        outsideReaders += 1

        if (
          targetOutsideReaders > 0
          && outsideReaders
            === targetOutsideReaders
        ) {
          releaseReaders()
        }

        if (bothReadPreviousState) {
          await bothReadPreviousState
        }

        return timelineState
      },
    ),
  }

  let eventSequence = 0

  const timeline = {
    logInTransaction: jest.fn(
      async (input: any) => {
        timelineState =
          input.metadata.to

        return {
          id:
            `state-event-${++eventSequence}`,
        }
      },
    ),

    dispatchPersistedEventWebhook:
      jest.fn().mockResolvedValue(
        undefined,
      ),
  }

  return {
    prisma,
    repository,
    timeline,
    updateMany,

    startBarrier,

    getOutsideReaders:
      () => outsideReaders,

    getState:
      () => state,

    getScore:
      () => score,

    getTimelineState:
      () => timelineState,
  }
}

describe(
  'OperationalStateService concurrency',
  () => {
    it(
      'duas instâncias registram uma única transição',
      async () => {
        const shared =
          createSharedHarness()

        shared.startBarrier(2)

        const temporalRisk = {
          calculate:
            jest.fn().mockResolvedValue(
              60,
            ),
        }

        const first =
          new OperationalStateService(
            temporalRisk as any,
            shared.repository as any,
            shared.timeline as any,
            shared.prisma as any,
          )

        const second =
          new OperationalStateService(
            temporalRisk as any,
            shared.repository as any,
            shared.timeline as any,
            shared.prisma as any,
          )

        const [
          resultA,
          resultB,
        ] = await Promise.all([
          first.syncAndLogStateChange(
            'org-a',
            'person-a',
          ),
          second.syncAndLogStateChange(
            'org-a',
            'person-a',
          ),
        ])

        expect(
          shared.getOutsideReaders(),
        ).toBe(2)

        expect(
          shared.updateMany,
        ).toHaveBeenCalledTimes(2)

        expect(
          [
            resultA.changed,
            resultB.changed,
          ].sort(),
        ).toEqual([
          false,
          true,
        ])

        expect(
          shared.getState(),
        ).toBe('WARNING')

        expect(
          shared.getScore(),
        ).toBe(60)

        expect(
          shared.getTimelineState(),
        ).toBe('WARNING')

        expect(
          shared.timeline
            .logInTransaction,
        ).toHaveBeenCalledTimes(1)

        expect(
          shared.timeline
            .dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)
      },
    )

    it(
      'service e job compartilham o mesmo ownership',
      async () => {
        const shared =
          createSharedHarness()

        shared.startBarrier(2)

        const temporalRisk = {
          calculate:
            jest.fn().mockResolvedValue(
              60,
            ),
        }

        const service =
          new OperationalStateService(
            temporalRisk as any,
            shared.repository as any,
            shared.timeline as any,
            shared.prisma as any,
          )

        const risk = {
          calculatePersonRisk:
            jest.fn().mockResolvedValue(
              60,
            ),
        }

        const job =
          new OperationalStateJob(
            shared.prisma as any,
            shared.timeline as any,
            risk as any,
            shared.repository as any,
          )

        await Promise.all([
          service.syncAndLogStateChange(
            'org-a',
            'person-a',
          ),
          job.run(),
        ])

        /*
         * Ambos decidiram usando o mesmo
         * estado anterior antes do CAS.
         */
        expect(
          shared.getOutsideReaders(),
        ).toBe(2)

        /*
         * Ambos tentaram conquistar.
         */
        expect(
          shared.updateMany,
        ).toHaveBeenCalledTimes(2)

        /*
         * Uma única transição real.
         */
        expect(
          shared.getState(),
        ).toBe('WARNING')

        expect(
          shared.getScore(),
        ).toBe(60)

        expect(
          shared.timeline
            .logInTransaction,
        ).toHaveBeenCalledTimes(1)

        expect(
          shared.timeline
            .dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)

        const persistedInput =
          shared.timeline
            .logInTransaction
            .mock.calls[0][0]

        expect(
          persistedInput,
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
              }),
          }),
        )
      },
    )
  },
)

import { EnforcementEngineService } from './enforcement-engine.service'
import { EnforcementPolicyService } from './enforcement-policy.service'

const INITIAL_UPDATED_AT = new Date('2026-08-22T12:00:00.000Z')

type State =
  | 'NORMAL'
  | 'WARNING'
  | 'RESTRICTED'
  | 'SUSPENDED'

function stateChangedCalls(timeline: {
  log: jest.Mock
  logInTransaction: jest.Mock
}) {
  const direct = timeline.log.mock.calls.filter(
    ([input]) =>
      input?.action === 'OPERATIONAL_STATE_CHANGED',
  )

  const transactional =
    timeline.logInTransaction.mock.calls.filter(
      ([input]) =>
        input?.action === 'OPERATIONAL_STATE_CHANGED',
    )

  return [
    ...direct,
    ...transactional,
  ]
}

function buildService(params: {
  initialState: State
  initialScore: number
  claimCount?: number
}) {
  const prisma: any = {
    person: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'person-a',
          orgId: 'org-a',
          operationalState: params.initialState,
          operationalRiskScore: params.initialScore,
          operationalStateUpdatedAt: INITIAL_UPDATED_AT,
        },
      ]),

      updateMany: jest.fn().mockResolvedValue({
        count: params.claimCount ?? 1,
      }),
    },

    correctiveAction: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'corrective-a',
      }),
    },

    $queryRaw: jest.fn().mockResolvedValue([
      {
        active: false,
      },
    ]),
  }

  prisma.$transaction = jest.fn(
    async (callback: any) =>
      callback({
        person: prisma.person,
      }),
  )

  const timeline = {
    log: jest.fn().mockResolvedValue(undefined),

    logInTransaction: jest.fn().mockResolvedValue({
      id: 'state-event-a',
    }),

    dispatchPersistedEventWebhook:
      jest.fn().mockResolvedValue(undefined),
  }

  const service = new EnforcementEngineService(
    prisma,
    new EnforcementPolicyService(),
    timeline as any,
    { getLastState: jest.fn().mockResolvedValue(null) } as any,
  )

  return {
    service,
    prisma,
    timeline,
  }
}

describe(
  'EnforcementEngineService state-change evidence',
  () => {
    it(
      'não registra mudança quando estado já corresponde à decisão',
      async () => {
        const {
          service,
          prisma,
          timeline,
        } = buildService({
          initialState: 'WARNING',
          initialScore: 60,
        })

        await service.runForOrg('org-a')

        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(prisma.person.updateMany).not.toHaveBeenCalled()
        expect(stateChangedCalls(timeline)).toHaveLength(0)
      },
    )

    it(
      'persiste estado e evidência na mesma transação',
      async () => {
        const {
          service,
          prisma,
          timeline,
        } = buildService({
          initialState: 'NORMAL',
          initialScore: 60,
        })

        await service.runForOrg('org-a')

        expect(prisma.$transaction).toHaveBeenCalledTimes(1)

        expect(prisma.person.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'person-a',
            orgId: 'org-a',
            active: true,
            operationalState: 'NORMAL',
            operationalRiskScore: 60,
            operationalStateUpdatedAt: INITIAL_UPDATED_AT,
          },
          data: {
            operationalState: 'WARNING',
            operationalRiskScore: 60,
            operationalStateUpdatedAt: expect.any(Date),
          },
        })

        expect(
          timeline.logInTransaction,
        ).toHaveBeenCalledTimes(1)

        const calls = stateChangedCalls(timeline)

        expect(calls).toHaveLength(1)

        expect(calls[0][0]).toEqual(
          expect.objectContaining({
            orgId: 'org-a',
            personId: 'person-a',
            action: 'OPERATIONAL_STATE_CHANGED',
            metadata: expect.objectContaining({
              previousState: 'NORMAL',
              nextState: 'WARNING',
              riskScore: 60,
            }),
          }),
        )

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'OPERATIONAL_STATE_CHANGED',
            personId: 'person-a',
          }),
          'state-event-a',
        )
      },
    )

    it(
      'não registra mudança quando snapshot ficou obsoleto',
      async () => {
        const {
          service,
          prisma,
          timeline,
        } = buildService({
          initialState: 'NORMAL',
          initialScore: 60,
          claimCount: 0,
        })

        await service.runForOrg('org-a')

        expect(
          prisma.person.updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id: 'person-a',
            orgId: 'org-a',
            active: true,
            operationalState: 'NORMAL',
            operationalRiskScore: 60,
            operationalStateUpdatedAt: INITIAL_UPDATED_AT,
          },
          data: {
            operationalState: 'WARNING',
            operationalRiskScore: 60,
            operationalStateUpdatedAt: expect.any(Date),
          },
        })

        expect(
          timeline.logInTransaction,
        ).not.toHaveBeenCalled()

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()

        expect(stateChangedCalls(timeline)).toHaveLength(0)
      },
    )

    it(
      'duas execuções concorrentes registram uma única mudança',
      async () => {
        let sharedState: State = 'NORMAL'
        let sharedScore = 60

        const prisma: any = {
          person: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'person-a',
                orgId: 'org-a',
                operationalState: 'NORMAL',
                operationalRiskScore: 60,
                operationalStateUpdatedAt: INITIAL_UPDATED_AT,
              },
            ]),

            updateMany: jest.fn().mockImplementation(
              async ({ where, data }: any) => {
                const matches =
                  where.id === 'person-a' &&
                  where.operationalState === sharedState &&
                  where.operationalRiskScore === sharedScore

                if (!matches) {
                  return {
                    count: 0,
                  }
                }

                sharedState = data.operationalState

                return {
                  count: 1,
                }
              },
            ),
          },

          correctiveAction: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'corrective-a',
            }),
          },

          $queryRaw: jest.fn().mockResolvedValue([
            {
              active: false,
            },
          ]),
        }

        prisma.$transaction = jest.fn(
          async (callback: any) =>
            callback({
              person: prisma.person,
            }),
        )

        let eventSequence = 0

        const timeline = {
          log: jest.fn().mockResolvedValue(undefined),

          logInTransaction:
            jest.fn().mockImplementation(async () => ({
              id: `state-event-${++eventSequence}`,
            })),

          dispatchPersistedEventWebhook:
            jest.fn().mockResolvedValue(undefined),
        }

        const first = new EnforcementEngineService(
          prisma,
          new EnforcementPolicyService(),
          timeline as any,
          { getLastState: jest.fn().mockResolvedValue(null) } as any,
        )

        const second = new EnforcementEngineService(
          prisma,
          new EnforcementPolicyService(),
          timeline as any,
          { getLastState: jest.fn().mockResolvedValue(null) } as any,
        )

        await Promise.all([
          first.runForOrg('org-a'),
          second.runForOrg('org-a'),
        ])

        expect(
          prisma.person.updateMany,
        ).toHaveBeenCalledTimes(2)

        expect(sharedState).toBe('WARNING')
        expect(sharedScore).toBe(60)

        expect(stateChangedCalls(timeline)).toHaveLength(1)

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).toHaveBeenCalledTimes(1)
      },
    )

    it(
      'não sobrescreve estado e score mais novos com decisão obsoleta',
      async () => {
        let sharedState: State = 'SUSPENDED'
        let sharedScore = 95

        const prisma: any = {
          person: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'person-a',
                orgId: 'org-a',
                operationalState: 'NORMAL',
                operationalRiskScore: 60,
                operationalStateUpdatedAt: INITIAL_UPDATED_AT,
              },
            ]),

            updateMany: jest.fn().mockImplementation(
              async ({ where, data }: any) => {
                const matches =
                  where.operationalState === sharedState &&
                  where.operationalRiskScore === sharedScore

                if (!matches) {
                  return {
                    count: 0,
                  }
                }

                sharedState = data.operationalState

                return {
                  count: 1,
                }
              },
            ),
          },

          correctiveAction: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
          },

          $queryRaw: jest.fn().mockResolvedValue([
            {
              active: false,
            },
          ]),
        }

        prisma.$transaction = jest.fn(
          async (callback: any) =>
            callback({
              person: prisma.person,
            }),
        )

        const timeline = {
          log: jest.fn().mockResolvedValue(undefined),
          logInTransaction: jest.fn(),
          dispatchPersistedEventWebhook: jest.fn(),
        }

        const service = new EnforcementEngineService(
          prisma,
          new EnforcementPolicyService(),
          timeline as any,
          { getLastState: jest.fn().mockResolvedValue(null) } as any,
        )

        await service.runForOrg('org-a')

        expect(sharedState).toBe('SUSPENDED')
        expect(sharedScore).toBe(95)

        expect(stateChangedCalls(timeline)).toHaveLength(0)
      },
    )

    it(
      'não registra mudança repetida no caminho crítico',
      async () => {
        const {
          service,
          prisma,
          timeline,
        } = buildService({
          initialState: 'RESTRICTED',
          initialScore: 80,
        })

        await service.runForOrg('org-a')

        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(stateChangedCalls(timeline)).toHaveLength(0)

        expect(timeline.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'OPERATIONAL_STATE_ENFORCED',
            personId: 'person-a',
          }),
        )
      },
    )

    it(
      'faz rollback da mudança quando evidência transacional falha',
      async () => {
        let persistedState: State = 'NORMAL'
        const persistedScore = 60

        const prisma: any = {
          person: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'person-a',
                orgId: 'org-a',
                operationalState: 'NORMAL',
                operationalRiskScore: 60,
                operationalStateUpdatedAt: INITIAL_UPDATED_AT,
              },
            ]),

            updateMany: jest.fn().mockImplementation(
              async ({ where, data }: any) => {
                const matches =
                  where.id === 'person-a' &&
                  where.operationalState === persistedState &&
                  where.operationalRiskScore === persistedScore

                if (!matches) {
                  return {
                    count: 0,
                  }
                }

                persistedState = data.operationalState

                return {
                  count: 1,
                }
              },
            ),
          },

          correctiveAction: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'corrective-a',
            }),
          },

          $queryRaw: jest.fn().mockResolvedValue([
            {
              active: false,
            },
          ]),
        }

        /*
         * Simula atomicidade do PostgreSQL:
         * qualquer exceção dentro da callback restaura
         * o snapshot anterior.
         */
        prisma.$transaction = jest.fn(
          async (callback: any) => {
            const before = persistedState

            try {
              return await callback({
                person: prisma.person,
              })
            } catch (error) {
              persistedState = before
              throw error
            }
          },
        )

        const timeline = {
          log: jest.fn().mockResolvedValue(undefined),

          logInTransaction:
            jest.fn().mockRejectedValue(
              new Error('timeline persistence failed'),
            ),

          dispatchPersistedEventWebhook:
            jest.fn().mockResolvedValue(undefined),
        }

        const service = new EnforcementEngineService(
          prisma,
          new EnforcementPolicyService(),
          timeline as any,
          { getLastState: jest.fn().mockResolvedValue(null) } as any,
        )

        await expect(
          service.runForOrg('org-a'),
        ).rejects.toThrow(
          'timeline persistence failed',
        )

        expect(persistedState).toBe('NORMAL')

        expect(
          timeline.dispatchPersistedEventWebhook,
        ).not.toHaveBeenCalled()
      },
    )
  },
)

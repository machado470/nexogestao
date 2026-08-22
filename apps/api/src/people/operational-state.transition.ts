import type { PrismaService } from '../prisma/prisma.service'
import type { TimelineService } from '../timeline/timeline.service'
import type { OperationalStateRepository } from './operational-state.repository'
import type { OperationalStateValue } from './operational-state.service'

export type OperationalStateSnapshot = {
  id: string
  orgId: string
  operationalState: OperationalStateValue
  operationalRiskScore: number
  operationalStateUpdatedAt: Date | null
  legacyRiskScore?: number | null
}

export type OperationalStateTransitionResult = {
  claimed: boolean
  changed: boolean
  from: OperationalStateValue | null
  to: OperationalStateValue
}

export async function persistOperationalStateTransition(
  params: {
    prisma: PrismaService
    repository: OperationalStateRepository
    timeline: TimelineService
    snapshot: OperationalStateSnapshot
    nextState: OperationalStateValue
    riskScore: number
    nextLegacyRiskScore?: number
    source: string
    reason: string
    evaluatedAt?: Date
    evaluatedRecords?: number
    metadata?: Record<string, unknown>
  },
): Promise<OperationalStateTransitionResult> {
  const evaluatedAt =
    params.evaluatedAt ?? new Date()

  /*
   * Leitura fora da transação serve somente como
   * fast-path.
   *
   * Ownership real é conquistado pelo CAS abaixo.
   */
  const observedLastState =
    await params.repository.getLastState({
      orgId: params.snapshot.orgId,
      personId: params.snapshot.id,
    })

  const legacyRiskScoreOk =
    params.nextLegacyRiskScore === undefined
    || (
      params.snapshot.legacyRiskScore
        !== undefined
      && params.snapshot.legacyRiskScore
        === params.nextLegacyRiskScore
    )

  const snapshotOk =
    params.snapshot.operationalState
      === params.nextState
    && params.snapshot.operationalRiskScore
      === params.riskScore
    && params.snapshot.operationalStateUpdatedAt
      !== null
    && legacyRiskScoreOk
  if (
    observedLastState
    && observedLastState === params.nextState
    && snapshotOk
  ) {
    return {
      claimed: false,
      changed: false,
      from: observedLastState,
      to: params.nextState,
    }
  }

  const result =
    await params.prisma.$transaction(
      async (tx) => {
        /*
         * CAS contra exatamente o snapshot que
         * originou a decisão.
         *
         * Service, Job ou qualquer outra instância
         * que tente usar o mesmo snapshot não pode
         * conquistar a transição duas vezes.
         */
        const claim =
          await tx.person.updateMany({
            where: {
              id: params.snapshot.id,
              orgId: params.snapshot.orgId,
              active: true,
              operationalState:
                params.snapshot.operationalState,
              operationalRiskScore:
                params.snapshot
                  .operationalRiskScore,
              operationalStateUpdatedAt:
                params.snapshot
                  .operationalStateUpdatedAt,
              ...(
                params.nextLegacyRiskScore
                  !== undefined
                && params.snapshot.legacyRiskScore
                  !== undefined
                  ? {
                      riskScore:
                        params.snapshot
                          .legacyRiskScore,
                    }
                  : {}
              ),
            },
            data: {
              operationalState:
                params.nextState,
              operationalRiskScore:
                params.riskScore,
              operationalStateUpdatedAt:
                evaluatedAt,
              ...(
                params.nextLegacyRiskScore
                  !== undefined
                  ? {
                      riskScore:
                        params.nextLegacyRiskScore,
                    }
                  : {}
              ),
            },
          })

        if (claim.count !== 1) {
          return {
            claimed: false as const,
            changed: false as const,
            from: observedLastState,
            to: params.nextState,
            dispatch: null,
          }
        }

        /*
         * Depois do ownership, a Timeline é
         * revalidada dentro da mesma transação.
         *
         * Isso também repara snapshot incompleto
         * sem duplicar evidência já existente.
         */
        const authoritativeLastState =
          await params.repository.getLastState(
            {
              orgId: params.snapshot.orgId,
              personId: params.snapshot.id,
            },
            tx,
          )

        if (
          authoritativeLastState
          === params.nextState
        ) {
          return {
            claimed: true as const,
            changed: false as const,
            from: authoritativeLastState,
            to: params.nextState,
            dispatch: null,
          }
        }

        const timelineInput = {
          orgId: params.snapshot.orgId,
          action:
            'OPERATIONAL_STATE_CHANGED',
          personId: params.snapshot.id,
          description:
            `Estado operacional: `
            + `${authoritativeLastState ?? 'UNKNOWN'}`
            + ` → ${params.nextState}`,
          metadata: {
            ...(params.metadata ?? {}),
            from:
              authoritativeLastState
              ?? 'UNKNOWN',
            to: params.nextState,
            riskScore: params.riskScore,
            source: params.source,
            reason: params.reason,
            evaluatedRecords:
              params.evaluatedRecords ?? 1,
            evaluatedAt:
              evaluatedAt.toISOString(),
          },
        }

        /*
         * Snapshot e evidência oficial ficam
         * visíveis no mesmo commit PostgreSQL.
         */
        const event =
          await params.timeline.logInTransaction(
            timelineInput,
            tx,
          )

        if (!event?.id) {
          throw new Error(
            'OPERATIONAL_STATE_CHANGED não foi persistido',
          )
        }

        return {
          claimed: true as const,
          changed: true as const,
          from: authoritativeLastState,
          to: params.nextState,
          dispatch: {
            input: timelineInput,
            timelineEventId: event.id,
          },
        }
      },
    )

  /*
   * Integração externa ocorre somente após commit.
   */
  if (result.dispatch) {
    await params.timeline
      .dispatchPersistedEventWebhook(
        result.dispatch.input,
        result.dispatch.timelineEventId,
      )
  }

  return {
    claimed: result.claimed,
    changed: result.changed,
    from: result.from,
    to: result.to,
  }
}

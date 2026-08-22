import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { RiskService } from '../risk/risk.service'
import { OperationalStateRepository } from './operational-state.repository'
import type { OperationalStateValue } from './operational-state.service'

function deriveState(
  riskScore: number,
): OperationalStateValue {
  if (riskScore >= 90) return 'SUSPENDED'
  if (riskScore >= 70) return 'RESTRICTED'
  if (riskScore >= 50) return 'WARNING'
  return 'NORMAL'
}

@Injectable()
export class OperationalStateJob {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,

    @Inject(TimelineService)
    private readonly timeline: TimelineService,

    @Inject(RiskService)
    private readonly risk: RiskService,

    @Inject(OperationalStateRepository)
    private readonly repo: OperationalStateRepository,
  ) {}

  async run() {
    const persons = await this.prisma.person.findMany({
      where: { active: true },
      select: {
        id: true,
        orgId: true,
        operationalState: true,
        operationalRiskScore: true,
        operationalStateUpdatedAt: true,
      },
    })

    let evaluated = 0
    let changed = 0
    const now = new Date()

    for (const p of persons) {
      evaluated++

      // calculate-only: sem RiskSnapshot, sem spam na Timeline
      const riskScore =
        await this.risk.calculatePersonRisk(p.id)

      const nextState = deriveState(riskScore)

      /*
       * Fast-path.
       *
       * Não é a barreira de concorrência: a decisão
       * autoritativa ocorre novamente dentro da transação.
       */
      const lastState = await this.repo.getLastState({
        orgId: p.orgId,
        personId: p.id,
      })

      const snapshotOk =
        p.operationalState === nextState
        && p.operationalRiskScore === riskScore
        && p.operationalStateUpdatedAt !== null

      if (
        lastState
        && lastState === nextState
        && snapshotOk
      ) {
        continue
      }

      const transition =
        await this.prisma.$transaction(
          async (tx) => {
            /*
             * Compare-and-set sobre o snapshot lido.
             *
             * Duas instâncias podem chegar até aqui,
             * mas somente uma consegue atualizar a mesma
             * versão lógica da pessoa.
             */
            const claim =
              await tx.person.updateMany({
                where: {
                  id: p.id,
                  orgId: p.orgId,
                  active: true,
                  operationalState:
                    p.operationalState,
                  operationalRiskScore:
                    p.operationalRiskScore,
                  operationalStateUpdatedAt:
                    p.operationalStateUpdatedAt,
                },
                data: {
                  operationalState: nextState,
                  operationalRiskScore: riskScore,
                  operationalStateUpdatedAt: now,
                },
              })

            if (claim.count !== 1) {
              return {
                claimed: false as const,
              }
            }

            /*
             * Revalidação autoritativa depois do claim.
             * Isso também permite reparar Timeline ausente
             * sem duplicar uma transição já commitada.
             */
            const authoritativeLastState =
              await this.repo.getLastState(
                {
                  orgId: p.orgId,
                  personId: p.id,
                },
                tx,
              )

            if (
              authoritativeLastState === nextState
            ) {
              return {
                claimed: true as const,
                dispatch: null,
              }
            }

            const timelineInput = {
              orgId: p.orgId,
              action:
                'OPERATIONAL_STATE_CHANGED',
              personId: p.id,
              description:
                `Estado operacional: `
                + `${authoritativeLastState ?? 'UNKNOWN'}`
                + ` → ${nextState}`,
              metadata: {
                from:
                  authoritativeLastState
                  ?? 'UNKNOWN',
                to: nextState,
                riskScore,
                source:
                  'OPERATIONAL_STATE_JOB',
                reason:
                  'Risco operacional calculado para pessoa ativa',
                evaluatedRecords: 1,
                evaluatedAt:
                  now.toISOString(),
              },
            }

            /*
             * Snapshot + evidência tornam-se visíveis
             * atomicamente no mesmo commit.
             */
            const event =
              await this.timeline.logInTransaction(
                timelineInput,
                tx,
              )

            return {
              claimed: true as const,
              dispatch: {
                input: timelineInput,
                timelineEventId: event.id,
              },
            }
          },
        )

      if (!transition.claimed) {
        continue
      }

      changed++

      /*
       * Webhook somente depois de a transação ter
       * commitado a evidência autoritativa.
       */
      if (transition.dispatch) {
        await this.timeline
          .dispatchPersistedEventWebhook(
            transition.dispatch.input,
            transition.dispatch.timelineEventId,
          )
      }
    }

    console.log(
      `[OperationalStateJob] evaluated=${evaluated} changed=${changed} at=${new Date().toISOString()}`,
    )
  }
}

import {
  Injectable,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { RiskService } from '../risk/risk.service'
import { OperationalStateRepository } from './operational-state.repository'
import type {
  OperationalStateValue,
} from './operational-state.service'
import {
  persistOperationalStateTransition,
} from './operational-state.transition'
import {
  deriveOperationalStateFromRiskScore,
} from '../common/domain/operational-state-policy'

@Injectable()
export class OperationalStateJob {
  constructor(
    @Inject(PrismaService)
    private readonly prisma:
      PrismaService,

    @Inject(TimelineService)
    private readonly timeline:
      TimelineService,

    @Inject(RiskService)
    private readonly risk:
      RiskService,

    @Inject(OperationalStateRepository)
    private readonly repo:
      OperationalStateRepository,
  ) {}

  async run() {
    const persons =
      await this.prisma.person.findMany({
        where: {
          active: true,
        },
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

      /*
       * Calculate-only:
       * sem RiskSnapshot e sem Timeline lateral.
       */
      const riskScore =
        await this.risk
          .calculatePersonRisk(p.id)

      const nextState =
        deriveOperationalStateFromRiskScore(
          riskScore,
        )

      const transition =
        await persistOperationalStateTransition({
          prisma: this.prisma,
          repository: this.repo,
          timeline: this.timeline,
          snapshot: {
            id: p.id,
            orgId: p.orgId,
            operationalState: p.operationalState as OperationalStateValue,
            operationalRiskScore:
              p.operationalRiskScore,
            operationalStateUpdatedAt:
              p.operationalStateUpdatedAt,
          },
          nextState,
          riskScore,
          source:
            'OPERATIONAL_STATE_JOB',
          reason:
            'Risco operacional calculado para pessoa ativa',
          evaluatedRecords: 1,
          evaluatedAt: now,
        })

      /*
       * Mantém a semântica histórica do Job:
       * snapshot reparado/atualizado conta como
       * mudança processada mesmo se a Timeline
       * já continha o estado autoritativo.
       */
      if (transition.claimed) {
        changed++
      }
    }

    console.log(
      `[OperationalStateJob] evaluated=${evaluated} changed=${changed} at=${new Date().toISOString()}`,
    )
  }
}

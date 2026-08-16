import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { RiskService } from '../risk/risk.service'
import { OperationalStateRepository } from './operational-state.repository'
import type { OperationalStateValue } from './operational-state.service'

function deriveState(riskScore: number): OperationalStateValue {
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

      // ✅ calculate-only: sem RiskSnapshot, sem spam na timeline
      const riskScore = await this.risk.calculatePersonRisk(p.id)

      const nextState = deriveState(riskScore)

      const lastState = await this.repo.getLastState({
        orgId: p.orgId,
        personId: p.id,
      })

      const snapshotOk =
        p.operationalState === nextState &&
        p.operationalRiskScore === riskScore &&
        p.operationalStateUpdatedAt !== null

      if (lastState && lastState === nextState && snapshotOk) continue

      changed++

      if (!snapshotOk) {
        await this.prisma.person.update({
          where: { id: p.id },
          data: {
            operationalState: nextState,
            operationalRiskScore: riskScore,
            operationalStateUpdatedAt: now,
          },
        })
      }

      if (!lastState || lastState !== nextState) {
        await this.timeline.log({
          orgId: p.orgId,
          action: 'OPERATIONAL_STATE_CHANGED',
          personId: p.id,
          description: `Estado operacional: ${lastState ?? 'UNKNOWN'} → ${nextState}`,
          metadata: {
            from: lastState ?? 'UNKNOWN',
            to: nextState,
            riskScore,
            source: 'OPERATIONAL_STATE_JOB',
            reason: 'Risco operacional calculado para pessoa ativa',
            evaluatedRecords: 1,
            evaluatedAt: now.toISOString(),
          },
        })
      }
    }

    console.log(
      `[OperationalStateJob] evaluated=${evaluated} changed=${changed} at=${new Date().toISOString()}`,
    )
  }
}

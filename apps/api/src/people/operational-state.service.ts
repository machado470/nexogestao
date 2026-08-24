import { Injectable } from '@nestjs/common'
import {
  TemporalRiskService,
  TemporalRiskResult,
} from '../risk/temporal-risk.service'
import { PrismaService } from '../prisma/prisma.service'
import { OperationalStateRepository } from './operational-state.repository'
import { TimelineService } from '../timeline/timeline.service'
import {
  persistOperationalStateTransition,
} from './operational-state.transition'
import {
  deriveOperationalStateFromRiskScore,
} from '../common/domain/operational-state-policy'

export type OperationalStateValue =
  | 'NORMAL'
  | 'WARNING'
  | 'RESTRICTED'
  | 'SUSPENDED'

export type OperationalState = {
  state: OperationalStateValue
  riskScore: number
}

export type OperationalStateDetailed =
  OperationalState & {
    contributors:
      TemporalRiskResult['contributors']
    factors:
      TemporalRiskResult['factors']
  }

export type OperationalStateSyncResult = {
  status: OperationalState
  changed: boolean
  from: OperationalStateValue | null
  to: OperationalStateValue
}

@Injectable()
export class OperationalStateService {
  constructor(
    private readonly temporalRisk:
      TemporalRiskService,
    private readonly repository:
      OperationalStateRepository,
    private readonly timeline:
      TimelineService,
    private readonly prisma:
      PrismaService,
  ) {}

  async getStatus(
    personId: string,
  ): Promise<OperationalState> {
    const riskScore =
      await this.temporalRisk.calculate(
        personId,
      )

    return {
      state:
        deriveOperationalStateFromRiskScore(
          riskScore,
        ),
      riskScore,
    }
  }

  async getStatusDetailed(
    personId: string,
  ): Promise<OperationalStateDetailed> {
    const detailed =
      await this.temporalRisk
        .calculateDetailed(personId)

    return {
      state:
        deriveOperationalStateFromRiskScore(
          detailed.score,
        ),
      riskScore: detailed.score,
      contributors:
        detailed.contributors,
      factors:
        detailed.factors,
    }
  }

  async syncAndLogStateChange(
    orgId: string,
    personId: string,
  ): Promise<OperationalStateSyncResult> {
    const status =
      await this.getStatus(personId)

    /*
     * O snapshot da pessoa passa a participar
     * do ownership da transição.
     *
     * Antes, o Service decidia somente pela
     * Timeline e podia registrar decisão stale.
     */
    const snapshot =
      await this.prisma.person.findFirst({
        where: {
          id: personId,
          orgId,
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

    if (!snapshot) {
      const last =
        await this.repository.getLastState({
          orgId,
          personId,
        })

      return {
        status,
        changed: false,
        from: last,
        to: status.state,
      }
    }

    const transition =
      await persistOperationalStateTransition({
        prisma: this.prisma,
        repository: this.repository,
        timeline: this.timeline,
        snapshot: {
          id: snapshot.id,
          orgId: snapshot.orgId,
          operationalState: snapshot.operationalState as OperationalStateValue,
          operationalRiskScore:
            snapshot.operationalRiskScore,
          operationalStateUpdatedAt:
            snapshot.operationalStateUpdatedAt,
        },
        nextState: status.state,
        riskScore: status.riskScore,
        source:
          'OPERATIONAL_STATE_SERVICE',
        reason:
          'Sincronização operacional solicitada após mudança de domínio',
      })

    return {
      status,
      changed: transition.changed,
      from: transition.from,
      to: transition.to,
    }
  }
}

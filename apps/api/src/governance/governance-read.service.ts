import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class GovernanceReadService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getLatestRun(orgId: string) {
    return this.prisma.governanceRun.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async listRuns(orgId: string, limit = 20) {
    return this.prisma.governanceRun.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  async getSummary(orgId: string) {
    const last = await this.getLatestRun(orgId)

    const trend = await this.prisma.governanceRun.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: {
        createdAt: true,
        institutionalRiskScore: true,
        evaluated: true,
        warnings: true,
        correctives: true,
        restrictedCount: true,
        suspendedCount: true,
        openCorrectivesCount: true,
        durationMs: true,
      },
    })

    if (!last) {
      return {
        lastRunAt: null,
        evaluated: 0,
        warnings: 0,
        correctives: 0,
        institutionalRiskScore: 0,
        restrictedCount: 0,
        suspendedCount: 0,
        openCorrectivesCount: 0,
        durationMs: 0,
        trend: trend.reverse(),
      }
    }

    return {
      lastRunAt: last.createdAt,
      evaluated: last.evaluated,
      warnings: last.warnings,
      correctives: last.correctives,
      institutionalRiskScore: last.institutionalRiskScore,
      restrictedCount: last.restrictedCount,
      suspendedCount: last.suspendedCount,
      openCorrectivesCount: last.openCorrectivesCount,
      durationMs: last.durationMs,
      trend: trend.reverse(),
    }
  }

  async getAutoScore(orgId: string) {
    const [lastRun, peopleAgg] = await Promise.all([
      this.getLatestRun(orgId),
      this.prisma.person.aggregate({
        where: { orgId, operationalStateUpdatedAt: { not: null } },
        _count: { id: true },
        _avg: { operationalRiskScore: true },
      }),
    ])

    const peopleCount = peopleAgg._count.id ?? 0
    const hasCompletedRun = Boolean(lastRun && lastRun.evaluated > 0)
    const hasEvaluablePeople =
      peopleCount > 0 && peopleAgg._avg.operationalRiskScore != null
    const avgRiskScore = hasEvaluablePeople
      ? Math.round(peopleAgg._avg.operationalRiskScore as number)
      : null

    const restrictedCount = await this.prisma.person.count({
      where: { orgId, operationalState: 'RESTRICTED' },
    })

    const suspendedCount = await this.prisma.person.count({
      where: { orgId, operationalState: 'SUSPENDED' },
    })

    const openCorrectivesCount = await this.prisma.correctiveAction.count({
      where: {
        status: 'OPEN',
        person: {
          orgId,
        },
      },
    })

    const governanceScore =
      hasCompletedRun
        ? Math.max(0, 100 - lastRun.institutionalRiskScore)
        : hasEvaluablePeople
          ? Math.max(0, 100 - (avgRiskScore as number))
          : null

    const level = governanceScore == null
      ? null
      : governanceScore >= 90
        ? 'A'
        : governanceScore >= 75
          ? 'B'
          : governanceScore >= 60
            ? 'C'
            : governanceScore >= 40
              ? 'D'
              : 'E'

    return {
      score: governanceScore,
      level,
      lastUpdated: lastRun?.createdAt ?? null,
      source: hasCompletedRun
        ? 'GOVERNANCE_RUN'
        : hasEvaluablePeople
          ? 'RISK_ENGINE'
          : 'NO_DATA',
      availability: governanceScore == null ? 'NO_DATA' : 'AVAILABLE',
      reason:
        governanceScore == null
          ? 'Nenhuma execução concluída com pessoas avaliadas'
          : null,
      factors: [
        {
          name: 'Risco institucional',
          value: hasCompletedRun ? lastRun.institutionalRiskScore : avgRiskScore,
          reference: 'Quanto menor, melhor.',
        },
        {
          name: 'Pessoas avaliadas',
          value: hasCompletedRun ? lastRun.evaluated : peopleCount,
          reference: 'Base considerada na leitura atual.',
        },
        {
          name: 'Restritos',
          value: lastRun?.restrictedCount ?? restrictedCount,
          reference: 'Pessoas em estado RESTRICTED.',
        },
        {
          name: 'Suspensos',
          value: lastRun?.suspendedCount ?? suspendedCount,
          reference: 'Pessoas em estado SUSPENDED.',
        },
        {
          name: 'Corretivas abertas',
          value: lastRun?.openCorrectivesCount ?? openCorrectivesCount,
          reference: 'Carga corretiva operacional ativa.',
        },
      ],
    }
  }

  /**
   * Estado executivo autoritativo. A nota A-E não participa desta decisão:
   * somente uma execução concluída, com população avaliada, permite consolidar
   * o pior estado operacional persistido naquele ciclo.
   */
  async getOperationalState(orgId: string) {
    const lastRun = await this.getLatestRun(orgId)

    if (!lastRun || lastRun.evaluated <= 0) {
      return {
        operationalState: 'UNKNOWN' as const,
        source: 'NO_DATA' as const,
        evidenceAt: null,
        availability: 'NO_DATA' as const,
        reason: 'Nenhuma avaliação operacional concluída com dados avaliáveis',
        evaluatedRecords: 0,
      }
    }

    const operationalState = lastRun.suspendedCount > 0
      ? 'SUSPENDED'
      : lastRun.restrictedCount > 0
        ? 'RESTRICTED'
        : lastRun.warnings > 0
          ? 'WARNING'
          : 'NORMAL'

    return {
      operationalState,
      source: 'GOVERNANCE_RUN' as const,
      evidenceAt: lastRun.finishedAt,
      availability: 'AVAILABLE' as const,
      reason: `Execução de governança concluída com ${lastRun.evaluated} registro(s) avaliado(s)`,
      evaluatedRecords: lastRun.evaluated,
    }
  }
}

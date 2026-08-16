import { GovernanceReadService } from './governance-read.service'

describe('GovernanceReadService executive truth', () => {
  function createPrisma(lastRun: any, aggregate = { _count: { id: 0 }, _avg: { operationalRiskScore: null } }) {
    return {
      governanceRun: {
        findFirst: jest.fn().mockResolvedValue(lastRun),
      },
      person: {
        aggregate: jest.fn().mockResolvedValue(aggregate),
        count: jest.fn().mockResolvedValue(0),
      },
      correctiveAction: { count: jest.fn().mockResolvedValue(0) },
    }
  }

  it('retorna UNKNOWN/NO_DATA e não fabrica score 100 ou grade A sem avaliação', async () => {
    const prisma = createPrisma(null)
    const service = new GovernanceReadService(prisma as any)

    await expect(service.getOperationalState('org-a')).resolves.toEqual(
      expect.objectContaining({
        operationalState: 'UNKNOWN',
        source: 'NO_DATA',
        evaluatedRecords: 0,
      }),
    )
    await expect(service.getAutoScore('org-a')).resolves.toEqual(
      expect.objectContaining({ score: null, level: null, availability: 'NO_DATA' }),
    )
    expect(prisma.governanceRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-a' } }),
    )
  })

  it.each([
    [{ suspendedCount: 0, restrictedCount: 0, warnings: 1 }, 'WARNING'],
    [{ suspendedCount: 0, restrictedCount: 1, warnings: 0 }, 'RESTRICTED'],
    [{ suspendedCount: 1, restrictedCount: 0, warnings: 0 }, 'SUSPENDED'],
  ])('preserva o pior estado persistido da execução', async (counts, expected) => {
    const prisma = createPrisma({
      evaluated: 2,
      finishedAt: new Date('2026-08-15T10:00:00Z'),
      ...counts,
    })
    await expect(new GovernanceReadService(prisma as any).getOperationalState('org-a'))
      .resolves.toEqual(expect.objectContaining({ operationalState: expected }))
  })

  it('permite NORMAL somente após execução saudável com dados reais', async () => {
    const finishedAt = new Date('2026-08-15T10:00:00Z')
    const prisma = createPrisma({
      evaluated: 3,
      warnings: 0,
      restrictedCount: 0,
      suspendedCount: 0,
      finishedAt,
    })
    await expect(new GovernanceReadService(prisma as any).getOperationalState('org-a'))
      .resolves.toEqual(expect.objectContaining({
        operationalState: 'NORMAL',
        source: 'GOVERNANCE_RUN',
        evidenceAt: finishedAt,
        evaluatedRecords: 3,
      }))
  })
})

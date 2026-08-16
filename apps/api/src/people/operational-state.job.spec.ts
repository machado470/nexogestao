import { OperationalStateJob } from './operational-state.job'

describe('OperationalStateJob evidence', () => {
  it('não grava UNKNOWN → NORMAL quando não há pessoas avaliáveis', async () => {
    const prisma = { person: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() } }
    const timeline = { log: jest.fn() }
    const job = new OperationalStateJob(prisma as any, timeline as any, {} as any, {} as any)
    await job.run()
    expect(timeline.log).not.toHaveBeenCalled()
    expect(prisma.person.update).not.toHaveBeenCalled()
  })

  it('grava primeira transição saudável quando uma pessoa foi realmente avaliada', async () => {
    const prisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'person-a', orgId: 'org-a', operationalState: 'NORMAL',
          operationalRiskScore: 0, operationalStateUpdatedAt: null,
        }]),
        update: jest.fn(),
      },
    }
    const timeline = { log: jest.fn() }
    const risk = { calculatePersonRisk: jest.fn().mockResolvedValue(0) }
    const repo = { getLastState: jest.fn().mockResolvedValue(null) }
    await new OperationalStateJob(prisma as any, timeline as any, risk as any, repo as any).run()
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-a',
      action: 'OPERATIONAL_STATE_CHANGED',
      metadata: expect.objectContaining({
        from: 'UNKNOWN', to: 'NORMAL', evaluatedRecords: 1,
        source: 'OPERATIONAL_STATE_JOB',
      }),
    }))
  })
})

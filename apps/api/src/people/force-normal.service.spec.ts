import { NotFoundException } from '@nestjs/common'
import { ForceNormalService } from './force-normal.service'

function fixture(person: { id: string; riskScore: number } | null) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(person ? [person] : []),
    correctiveAction: {
      count: jest.fn().mockResolvedValue(person ? 2 : 0),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    person: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  }
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  }
  const timeline = {
    logInTransaction: jest.fn().mockResolvedValue({ id: 'event-1' }),
    dispatchPersistedEventWebhook: jest.fn().mockResolvedValue(undefined),
  }
  return {
    service: new ForceNormalService(prisma as any, timeline as any),
    prisma,
    timeline,
    tx,
  }
}

describe('ForceNormalService', () => {
  const input = { orgId: 'org-a', actorUserId: 'admin-a', personId: 'person-a' }

  it('persiste corretivas, score e Timeline na mesma transação e despacha após commit', async () => {
    const { service, timeline, tx } = fixture({ id: input.personId, riskScore: 73 })

    await expect(service.execute(input)).resolves.toMatchObject({ changed: true })

    expect(tx.correctiveAction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personId: input.personId,
        person: { id: input.personId, orgId: input.orgId, active: true },
      }),
    }))
    expect(tx.person.updateMany).toHaveBeenCalledWith({
      where: { id: input.personId, orgId: input.orgId, active: true },
      data: { riskScore: 0 },
    })
    expect(timeline.logInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      orgId: input.orgId,
      personId: input.personId,
      metadata: expect.objectContaining({
        actorUserId: input.actorUserId,
        previousRiskScore: 73,
        newRiskScore: 0,
        correctedActionsCount: 2,
      }),
    }), tx)
    expect(timeline.dispatchPersistedEventWebhook).toHaveBeenCalledTimes(1)
  })

  it('faz no-op sem Timeline quando a correção já está aplicada', async () => {
    const built = fixture({ id: input.personId, riskScore: 0 })
    built.tx.correctiveAction.count.mockResolvedValue(0)

    await expect(built.service.execute(input)).resolves.toEqual({ changed: false })
    expect(built.tx.correctiveAction.updateMany).not.toHaveBeenCalled()
    expect(built.tx.person.updateMany).not.toHaveBeenCalled()
    expect(built.timeline.logInTransaction).not.toHaveBeenCalled()
  })

  it('oculta pessoa ausente, inativa ou pertencente a outro tenant', async () => {
    const { service, timeline } = fixture(null)
    await expect(service.execute(input)).rejects.toBeInstanceOf(NotFoundException)
    expect(timeline.logInTransaction).not.toHaveBeenCalled()
  })

  it('não despacha efeito externo quando a transação falha', async () => {
    const built = fixture({ id: input.personId, riskScore: 10 })
    built.timeline.logInTransaction.mockRejectedValue(new Error('timeline unavailable'))
    await expect(built.service.execute(input)).rejects.toThrow('timeline unavailable')
    expect(built.timeline.dispatchPersistedEventWebhook).not.toHaveBeenCalled()
  })
})

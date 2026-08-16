import { OutboxService } from './outbox.service'

describe('OutboxService', () => {
  it('mantém idempotência e tenant fora do payload', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'evt' })
    const service = new OutboxService({ requestId: 'corr-1' } as any)
    await service.enqueue({ operationalOutboxEvent: { create } } as any, {
      orgId: 'org-autenticada', eventType: 'CHARGE_CREATED', aggregateType: 'Charge', aggregateId: 'ch-1',
      idempotencyKey: 'key-1', payload: { orgId: 'org-forjada', timelineEventId: 'tl-1' },
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-autenticada', correlationId: 'corr-1' }) }))
  })
})

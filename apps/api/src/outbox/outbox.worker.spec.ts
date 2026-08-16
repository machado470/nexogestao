import { OutboxWorker } from './outbox.worker'

describe('OutboxWorker', () => {
  const event = {
    id: 'evt-1', orgId: 'org-1', eventType: 'PAYMENT_RECEIVED', correlationId: 'corr-1',
    attempts: 1, payload: { timelineEventId: 'tl-1', paymentId: 'pay-1' },
  } as any

  it('processa evento reivindicado uma vez e usa o tenant persistido', async () => {
    const repository = {
      claimBatch: jest.fn().mockResolvedValue([event]),
      markProcessed: jest.fn().mockResolvedValue({ count: 1 }),
      markFailed: jest.fn(),
    }
    const webhooks = { dispatchTimelineEvent: jest.fn().mockResolvedValue(undefined) }
    const worker = new OutboxWorker(repository as any, webhooks as any, { get: jest.fn().mockReturnValue(undefined) } as any)
    await worker.tick()
    await worker.onApplicationShutdown()
    expect(webhooks.dispatchTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1', timelineEventId: 'tl-1' }))
    expect(repository.markProcessed).toHaveBeenCalledTimes(1)
  })

  it('agenda retry com erro sanitizado sem marcar processado', async () => {
    const repository = {
      claimBatch: jest.fn().mockResolvedValue([event]), markProcessed: jest.fn(),
      markFailed: jest.fn().mockResolvedValue({ count: 1 }),
    }
    const webhooks = { dispatchTimelineEvent: jest.fn().mockRejectedValue(new Error('token=segredo timeout')) }
    const worker = new OutboxWorker(repository as any, webhooks as any, { get: jest.fn().mockReturnValue(undefined) } as any)
    await worker.tick()
    await worker.onApplicationShutdown()
    expect(repository.markProcessed).not.toHaveBeenCalled()
    expect(repository.markFailed).toHaveBeenCalledWith(expect.objectContaining({ error: 'token=<redacted> timeout' }))
  })
})

import { WebhookDispatcher } from './webhook.dispatcher'

describe('WebhookDispatcher fan-out idempotente', () => {
  it('atribui identidade estável por evento e consumidor a cada handoff', async () => {
    const webhooks = {
      getActiveEndpointsByEvent: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
      createPendingDelivery: jest.fn(({ endpointId }) => Promise.resolve({ id: `delivery-${endpointId}` })),
    }
    const queue = { addJob: jest.fn().mockResolvedValue(undefined) }
    const dispatcher = new WebhookDispatcher(webhooks as any, queue as any)

    const input = { outboxEventId: 'event-1', orgId: 'org-persistida', action: 'SERVICE_ORDER_COMPLETED', timelineEventId: 'timeline-1', data: { orgId: 'forjada' } }
    await dispatcher.dispatchTimelineEvent(input)
    await dispatcher.dispatchTimelineEvent(input)

    expect(webhooks.getActiveEndpointsByEvent).toHaveBeenCalledWith('org-persistida', 'service.order.completed')
    expect(webhooks.createPendingDelivery).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'a', idempotencyKey: 'outbox:event-1:endpoint:a' }))
    expect(webhooks.createPendingDelivery).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'b', idempotencyKey: 'outbox:event-1:endpoint:b' }))
    expect(queue.addJob).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ jobId: 'webhook:dispatch:delivery-a' }))
  })
})

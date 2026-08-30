import { presentTimelineEvent } from './timeline.presenter'

describe('presentTimelineEvent', () => {
  it('canonicalizes legacy types in the API and exposes only official fields', () => {
    const result = presentTimelineEvent({
      id: 'event-1',
      action: 'WHATSAPP_MESSAGE_FAILED',
      personId: null,
      description: 'failed overdue restricted words do not classify the event',
      customerId: 'customer-1',
      serviceOrderId: null,
      appointmentId: null,
      chargeId: null,
      metadata: {
        severity: 'HIGH',
        module: 'whatsapp',
        token: 'secret',
        nested: { private: true },
      },
      createdAt: new Date('2026-08-30T12:00:00.000Z'),
      orgId: 'org-private',
      person: null,
    })

    expect(result.eventType).toBe('MESSAGE_FAILED')
    expect(result.severity).toBe('HIGH')
    expect(result.module).toBe('whatsapp')
    expect(result.entity).toEqual({
      type: 'customer',
      id: 'customer-1',
      href: '/customers?customerId=customer-1',
    })
    expect(result.metadata).toEqual({})
    expect(result).not.toHaveProperty('orgId')
  })

  it('does not infer module, severity, consequence or recommendation from text', () => {
    const result = presentTimelineEvent({
      id: 'event-2',
      action: 'FUTURE_EVENT_CREATED',
      personId: null,
      description: 'critical failed error risk suspended',
      customerId: null,
      serviceOrderId: null,
      appointmentId: null,
      chargeId: null,
      metadata: {},
      createdAt: new Date('2026-08-30T12:00:00.000Z'),
      orgId: 'org-private',
      person: null,
    })

    expect(result).toMatchObject({
      eventType: 'FUTURE_EVENT_CREATED',
      module: null,
      severity: null,
      consequence: null,
      recommendedAction: null,
      entity: null,
    })
  })
})

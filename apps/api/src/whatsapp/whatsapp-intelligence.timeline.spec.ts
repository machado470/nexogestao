import { WhatsAppService } from './whatsapp.service'
import { WhatsAppIntelligenceService } from './whatsapp-intelligence.service'

describe('WhatsAppService operational intelligence timeline', () => {
  function buildService(existingTimeline: any[] = []) {
    const timelineEvents = [...existingTimeline]
    const timeline = {
      log: jest.fn(async (input: any) => {
        timelineEvents.push({ id: `tl-${timelineEvents.length + 1}`, ...input })
        return { id: `tl-${timelineEvents.length}` }
      }),
    }
    const prisma: any = {
      whatsAppConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv1', orgId: 'org1', customerId: 'c1', phone: '+5511999999999', priority: 'MEDIUM', intent: 'GENERAL_INTENT', slaStatus: 'OK', lastOutboundAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      whatsAppMessage: {
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: {
        findFirst: jest.fn(async ({ where }: any) => {
          const dedupeKey = where?.metadata?.equals
          return timelineEvents.find((event) => event.metadata?.dedupeKey === dedupeKey) ? { id: 'existing' } : null
        }),
      },
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    }
    const svc = new WhatsAppService(
      prisma,
      { addJob: jest.fn() } as any,
      { incInbound: jest.fn(), observeProcessingDuration: jest.fn() } as any,
      timeline as any,
      { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any,
      {} as any,
      undefined,
      undefined,
      new WhatsAppIntelligenceService(),
    )
    return { svc, prisma, timeline }
  }

  it('persiste decisões com orgId e emite eventos de intent, prioridade e sugestão', async () => {
    const { svc, prisma, timeline } = buildService()

    await (svc as any).applyOperationalIntelligence({
      orgId: 'org1',
      conversationId: 'conv1',
      messageId: 'm1',
      content: 'reclamação, não gostei e tenho problema',
      resolution: { customerId: 'c1', serviceOrderId: 'so1', serviceOrderStatus: 'OPEN' },
      lastInboundAt: new Date('2026-05-06T10:00:00Z'),
      lastOutboundAt: null,
      status: 'WAITING_OPERATOR',
    })

    expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'conv1', orgId: 'org1' },
      data: expect.objectContaining({ intent: 'COMPLAINT_INTENT', priority: 'CRITICAL' }),
    }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org1', action: 'WHATSAPP_INTENT_DETECTED' }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org1', action: 'WHATSAPP_PRIORITY_UPDATED' }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org1', action: 'WHATSAPP_ACTION_SUGGESTED' }))
  })

  it('não duplica timeline quando a mesma decisão é reprocessada', async () => {
    const { svc, timeline } = buildService()
    const input = {
      orgId: 'org1',
      conversationId: 'conv1',
      messageId: 'm1',
      content: 'pix paguei',
      resolution: { customerId: 'c1', chargeId: 'ch1', chargeStatus: 'PENDING' },
      lastInboundAt: new Date('2026-05-06T10:00:00Z'),
      lastOutboundAt: null,
      status: 'WAITING_OPERATOR',
    }

    await (svc as any).applyOperationalIntelligence(input)
    const firstCount = timeline.log.mock.calls.length
    await (svc as any).applyOperationalIntelligence(input)

    expect(timeline.log.mock.calls.length).toBe(firstCount)
  })
})

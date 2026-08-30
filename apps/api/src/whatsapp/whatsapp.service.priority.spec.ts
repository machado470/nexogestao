import { WhatsAppService } from './whatsapp.service'
import { WhatsAppConversationStatus } from '@prisma/client'

describe('WhatsAppService prioridade autoritativa', () => {
  it('preserva prioridade persistida e posição oficial sem recalcular na leitura', async () => {
    const now = new Date('2026-04-29T10:00:00Z')
    const prisma: any = {
      whatsAppConversation: { findMany: jest.fn().mockResolvedValue([{ id: 'conv1', orgId: 'org1', customerId: 'c1', status: WhatsAppConversationStatus.WAITING_CUSTOMER, priority: 'NORMAL', unreadCount: 1, contextType: 'CUSTOMER', updatedAt: now, lastMessageAt: now, lastInboundAt: new Date('2026-04-29T08:00:00Z'), lastOutboundAt: new Date('2026-04-29T07:00:00Z') }]) },
      whatsAppMessage: { groupBy: jest.fn().mockResolvedValue([]) },
      charge: { groupBy: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ customerId: 'c1', _count: { _all: 1 } }]) },
      appointment: { groupBy: jest.fn().mockResolvedValue([]) },
      serviceOrder: { groupBy: jest.fn().mockResolvedValue([]) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { log: jest.fn() } as any, {} as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, { enforcePolicy: jest.fn() } as any)
    const res = await svc.listConversations('org1', {})
    expect(res.items[0].priority).toBe('NORMAL')
    expect(res.items[0].inboxPosition).toBe(1)
    expect(res.items[0].nextAction).toBeUndefined()
  })
})

import { WhatsAppWebhookService } from './whatsapp-webhook.service'

describe('WhatsAppWebhookService tenant isolation', () => {
  it('não recupera nem reenfileira webhook pertencente a outro tenant', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const queue = { addJob: jest.fn() }
    const service = new WhatsAppWebhookService(prisma, queue as any, {} as any)

    await expect(service.replayWebhookEvents('tenant-a', { ids: ['webhook-tenant-b'] }))
      .rejects.toThrow('webhook WhatsApp não encontrado')

    expect(prisma.whatsAppWebhookEvent.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['webhook-tenant-b'] }, orgId: 'tenant-a' },
    })
    expect(queue.addJob).not.toHaveBeenCalled()
  })

  it('mantém lookup, recovery stats e processamento persistido limitados ao orgId', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const service = new WhatsAppWebhookService(prisma, {} as any, {} as any)

    await expect(service.getWebhookEventDetail('tenant-a', 'webhook-tenant-b')).rejects.toThrow()
    await expect(service.processPersistedInboundWebhook(
      { webhookEventId: 'webhook-tenant-b', orgId: 'tenant-a', provider: 'meta_cloud' },
      jest.fn(),
    )).rejects.toThrow('webhook WhatsApp persistido não encontrado')

    expect(prisma.whatsAppWebhookEvent.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'webhook-tenant-b', orgId: 'tenant-a' },
    })
    expect(prisma.whatsAppWebhookEvent.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'webhook-tenant-b', orgId: 'tenant-a', provider: 'meta_cloud' },
    })
  })
})

import { WhatsAppService } from './whatsapp.service'

describe('WhatsApp timeline semantics', () => {
  it('não registra MESSAGE_SENT enquanto a mensagem está apenas QUEUED', async () => {
    const timeline = {
      log: jest.fn().mockResolvedValue({}),
    }

    const service = new WhatsAppService(
      {} as any,
      {} as any,
      {} as any,
      timeline as any,
      {
        requestId: 'req-1',
        userId: 'user-1',
        orgId: 'org1',
      } as any,
      {} as any,
      {} as any,
    )

    jest.spyOn(service, 'enqueueMessage').mockResolvedValue({
      created: true,
      message: {
        id: 'm1',
        orgId: 'org1',
        customerId: 'customer-1',
        conversationId: 'conversation-1',
        entityType: 'CUSTOMER',
        entityId: 'customer-1',
        messageType: 'MANUAL',
        status: 'QUEUED',
      },
    } as any)

    await service.sendManualMessage(
      'org1',
      'user-1',
      {
        customerId: 'customer-1',
        toPhone: '5511999999999',
        entityType: 'CUSTOMER',
        entityId: 'customer-1',
        messageType: 'MANUAL',
        content: 'Olá',
      },
    )

    expect(timeline.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WHATSAPP_MESSAGE_SENT',
      }),
    )

    expect(timeline.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MESSAGE_SENT',
      }),
    )
  })
})

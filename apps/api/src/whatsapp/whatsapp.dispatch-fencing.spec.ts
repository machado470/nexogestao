import { WhatsAppService } from './whatsapp.service'

describe('WhatsApp dispatch fencing', () => {
  function makeService(queryResult: any[] = []) {
    const timeline = {
      log: jest.fn().mockResolvedValue({}),
    }

    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue(queryResult),

      // Fluxo legado atual: altera apenas por id e ignora ownership.
      whatsAppMessage: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({
          id: 'm1',
          orgId: 'org1',
          customerId: 'customer-1',
          conversationId: 'conversation-1',
          entityType: 'CUSTOMER',
          entityId: 'customer-1',
          messageType: 'MANUAL',
          status: 'SENDING',
          lockedBy: 'worker-atual',
        }),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'm1',
            orgId: 'org1',
            status: data.status,
            messageType: 'MANUAL',
            provider: data.provider ?? null,
            providerMessageId: data.providerMessageId ?? null,
            errorMessage: data.errorMessage ?? null,
            lockedAt: data.lockedAt ?? null,
            lockedBy: data.lockedBy ?? null,
          }),
        ),
      },

      // Evita ruído de Timeline nos testes do mecanismo de fencing.
      timelineEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-event' }),
      },
    }

    const service = new WhatsAppService(
      prisma,
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
    {} as any,
    )

    return { service, prisma, timeline }
  }

  it('worker que perdeu ownership não pode marcar mensagem como SENT', async () => {
    const { service, prisma, timeline } = makeService([])

    const result = await (service.markSent as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-antigo',
      provider: 'meta_cloud',
      providerMessageId: 'wamid.1',
    })

    expect(result).toBeNull()

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled()
    expect(timeline.log).not.toHaveBeenCalled()
  })

  it('worker que perdeu ownership não pode transformar a mensagem em FAILED', async () => {
    const { service, prisma, timeline } = makeService([])

    const result = await (service.markFailedTerminal as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-antigo',
      provider: 'meta_cloud',
      errorCode: 'FATAL',
      errorMessage: 'falha',
    })

    expect(result).toBeNull()

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled()
    expect(timeline.log).not.toHaveBeenCalled()
  })

  it('worker que perdeu ownership não pode devolver a mensagem para QUEUED', async () => {
    const { service, prisma } = makeService([])

    const result = await (service.markFailedAndRequeue as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-antigo',
      provider: 'meta_cloud',
      errorCode: 'TIMEOUT',
      errorMessage: 'timeout',
    })

    expect(result).toBeNull()

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled()
  })

  it('worker que perdeu ownership não pode marcar entrega como UNCERTAIN', async () => {
    const { service, prisma, timeline } = makeService([])

    const result = await (service.markDeliveryUncertain as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-antigo',
      provider: 'meta_cloud',
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'connection reset',
    })

    expect(result).toBeNull()
    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled()
    expect(timeline.log).not.toHaveBeenCalled()
  })

  it('worker que possui ownership consegue marcar UNCERTAIN e registrar a Timeline', async () => {
    const uncertain = {
      id: 'm1',
      orgId: 'org1',
      status: 'UNCERTAIN',
      messageType: 'MANUAL',
      provider: 'meta_cloud',
      providerMessageId: null,
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'connection reset',
      lockedAt: null,
      lockedBy: null,
    }

    const { service, prisma, timeline } = makeService([uncertain])

    // Permite que logMessageTimelineEventOnce crie o novo evento.
    prisma.timelineEvent.findFirst.mockResolvedValue(null)

    const result = await (service.markDeliveryUncertain as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-atual',
      provider: 'meta_cloud',
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'connection reset',
    })

    expect(result).toEqual(uncertain)
    expect(prisma.$queryRaw).toHaveBeenCalled()

    expect(timeline.log).toHaveBeenCalledTimes(1)
    expect(timeline.log).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org1',
        action: 'MESSAGE_SEND_UNCERTAIN',
      }),
    )
  })

  it('worker que ainda possui ownership consegue finalizar SENT', async () => {
    const sent = {
      id: 'm1',
      orgId: 'org1',
      status: 'SENT',
      messageType: 'MANUAL',
      provider: 'meta_cloud',
      providerMessageId: 'wamid.1',
      errorMessage: null,
      lockedAt: null,
      lockedBy: null,
    }

    const { service, prisma } = makeService([sent])

    const result = await (service.markSent as any)({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-atual',
      provider: 'meta_cloud',
      providerMessageId: 'wamid.1',
    })

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(result).toEqual(sent)
  })
})

var mockProvider: {
  sendText: jest.Mock
}

jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'

describe('WhatsAppDispatcherJob ownership curto', () => {
  const previousDisableSchedule = process.env.DISABLE_WHATSAPP_SCHEDULE

  beforeEach(() => {
    delete process.env.DISABLE_WHATSAPP_SCHEDULE

    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'mock',
        providerMessageId: 'provider-message',
      }),
    }
  })

  afterAll(() => {
    if (previousDisableSchedule === undefined) {
      delete process.env.DISABLE_WHATSAPP_SCHEDULE
    } else {
      process.env.DISABLE_WHATSAPP_SCHEDULE = previousDisableSchedule
    }
  })

  function message(id: string) {
    return {
      id,
      orgId: 'org1',
      toPhone: '5511999999999',
      content: `mensagem-${id}`,
      renderedText: null,
    }
  }

  it('faz claim de uma única mensagem imediatamente antes de cada envio', async () => {
    const whatsApp = {
      claimQueued: jest.fn()
        .mockResolvedValueOnce([message('m1')])
        .mockResolvedValueOnce([message('m2')])
        .mockResolvedValueOnce([]),

      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await dispatcher.dispatchQueued()

    expect(whatsApp.claimQueued).toHaveBeenCalledTimes(3)

    for (const call of whatsApp.claimQueued.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          limit: 1,
          workerId: expect.any(String),
        }),
      )
    }

    expect(mockProvider.sendText).toHaveBeenCalledTimes(2)
  })

  it('usa ownership exclusivo para cada mensagem e preserva o token até a finalização', async () => {
    const whatsApp = {
      claimQueued: jest.fn()
        .mockResolvedValueOnce([message('m1')])
        .mockResolvedValueOnce([message('m2')])
        .mockResolvedValueOnce([]),

      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await dispatcher.dispatchQueued()

    const firstWorkerId = whatsApp.claimQueued.mock.calls[0][0].workerId
    const secondWorkerId = whatsApp.claimQueued.mock.calls[1][0].workerId

    expect(firstWorkerId).toBeTruthy()
    expect(secondWorkerId).toBeTruthy()
    expect(firstWorkerId).not.toBe(secondWorkerId)

    expect(whatsApp.markSent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'm1',
        orgId: 'org1',
        workerId: firstWorkerId,
      }),
    )

    expect(whatsApp.markSent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'm2',
        orgId: 'org1',
        workerId: secondWorkerId,
      }),
    )
  })

  it('nunca processa mais de 50 mensagens em uma execução', async () => {
    const whatsApp = {
      claimQueued: jest.fn().mockImplementation(async () => [
        message(`m${whatsApp.claimQueued.mock.calls.length}`),
      ]),
      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await dispatcher.dispatchQueued()

    expect(mockProvider.sendText).toHaveBeenCalledTimes(50)
    expect(whatsApp.claimQueued).toHaveBeenCalledTimes(50)
  })
})

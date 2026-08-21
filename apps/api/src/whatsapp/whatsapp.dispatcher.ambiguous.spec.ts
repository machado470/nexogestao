var mockProvider: {
  sendText: jest.Mock
}

jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'

describe('WhatsAppDispatcherJob ambiguous result', () => {
  const previousDisableSchedule = process.env.DISABLE_WHATSAPP_SCHEDULE

  beforeEach(() => {
    delete process.env.DISABLE_WHATSAPP_SCHEDULE

    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: false,
        provider: 'meta_cloud',
        errorCode: 'NETWORK_ERROR',
        errorMessage: 'connection reset',
        ambiguous: true,
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

  it('preserva resultado incerto sem devolver mensagem para QUEUED', async () => {
    const whatsApp = {
      claimQueued: jest.fn()
        .mockResolvedValueOnce([
          {
            id: 'm1',
            orgId: 'org1',
            toPhone: '5511999999999',
            content: 'mensagem',
            renderedText: null,
          },
        ])
        .mockResolvedValueOnce([]),

      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
      markDeliveryUncertain: jest.fn().mockResolvedValue({}),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await dispatcher.dispatchQueued()

    const workerId = whatsApp.claimQueued.mock.calls[0][0].workerId

    expect(whatsApp.markDeliveryUncertain).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm1',
        orgId: 'org1',
        workerId,
        provider: 'meta_cloud',
        errorCode: 'NETWORK_ERROR',
      }),
    )

    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
    expect(whatsApp.markFailedTerminal).not.toHaveBeenCalled()
  })
})

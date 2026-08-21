var mockProvider: {
  sendText: jest.Mock
}

jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'

describe('WhatsAppDispatcherJob stale SENDING reconciliation', () => {
  const previousDisableSchedule = process.env.DISABLE_WHATSAPP_SCHEDULE

  beforeEach(() => {
    delete process.env.DISABLE_WHATSAPP_SCHEDULE

    mockProvider = {
      sendText: jest.fn(),
    }

    jest.clearAllMocks()
  })

  afterAll(() => {
    if (previousDisableSchedule === undefined) {
      delete process.env.DISABLE_WHATSAPP_SCHEDULE
    } else {
      process.env.DISABLE_WHATSAPP_SCHEDULE = previousDisableSchedule
    }
  })

  it('executa reconciliação periódica sem chamar provider', async () => {
    const whatsApp = {
      reconcileStaleSending: jest.fn().mockResolvedValue([
        { id: 'm1', orgId: 'org1', status: 'UNCERTAIN' },
      ]),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await (dispatcher as any).reconcileStaleSendingMessages()

    expect(whatsApp.reconcileStaleSending).toHaveBeenCalledTimes(1)
    expect(whatsApp.reconcileStaleSending).toHaveBeenCalledWith({
      limit: 50,
    })

    expect(mockProvider.sendText).not.toHaveBeenCalled()
  })

  it('respeita DISABLE_WHATSAPP_SCHEDULE', async () => {
    process.env.DISABLE_WHATSAPP_SCHEDULE = '1'

    const whatsApp = {
      reconcileStaleSending: jest.fn().mockResolvedValue([]),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await (dispatcher as any).reconcileStaleSendingMessages()

    expect(whatsApp.reconcileStaleSending).not.toHaveBeenCalled()
    expect(mockProvider.sendText).not.toHaveBeenCalled()
  })

  it('falha da reconciliação não dispara envio nem propaga erro do cron', async () => {
    const whatsApp = {
      reconcileStaleSending: jest
        .fn()
        .mockRejectedValue(new Error('postgres unavailable')),
    }

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await expect(
      (dispatcher as any).reconcileStaleSendingMessages(),
    ).resolves.toBeUndefined()

    expect(mockProvider.sendText).not.toHaveBeenCalled()
  })
})

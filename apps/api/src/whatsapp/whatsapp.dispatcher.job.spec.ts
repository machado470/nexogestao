jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => ({
    sendText: jest.fn(),
  }),
}))

import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'

describe('WhatsAppDispatcherJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.DISABLE_WHATSAPP_SCHEDULE
  })

  afterAll(() => {
    delete process.env.DISABLE_WHATSAPP_SCHEDULE
  })

  it('não despacha pelo cron quando BullMQ está ativo', async () => {
    const whatsApp = {
      claimQueued: jest.fn(),
      markSent: jest.fn(),
      markFailedTerminal: jest.fn(),
      markFailedAndRequeue: jest.fn(),
    }
    const queueService = {
      isEnabled: jest.fn().mockReturnValue(true),
    }

    const job = new WhatsAppDispatcherJob(whatsApp as any, queueService as any)
    const sendText = (job as any).provider.sendText as jest.Mock

    await job.dispatchQueued()

    expect(queueService.isEnabled).toHaveBeenCalledTimes(1)
    expect(whatsApp.claimQueued).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('mantém o cron como fallback quando BullMQ está indisponível', async () => {
    const message = {
      id: 'm1',
      toPhone: '+5511999999999',
      content: 'oi',
      renderedText: 'oi',
    }
    const whatsApp = {
      claimQueued: jest.fn().mockResolvedValue([message]),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailedTerminal: jest.fn(),
      markFailedAndRequeue: jest.fn(),
    }
    const queueService = {
      isEnabled: jest.fn().mockReturnValue(false),
    }

    const job = new WhatsAppDispatcherJob(whatsApp as any, queueService as any)
    const sendText = (job as any).provider.sendText as jest.Mock
    sendText.mockResolvedValue({
      provider: 'fake',
      providerMessageId: 'provider-1',
    })

    await job.dispatchQueued()

    expect(whatsApp.claimQueued).toHaveBeenCalledWith({
      limit: 50,
      workerId: expect.stringMatching(/^api-/),
    })
    expect(sendText).toHaveBeenCalledWith({
      toPhone: message.toPhone,
      text: message.content,
    })
    expect(whatsApp.markSent).toHaveBeenCalledWith({
      id: message.id,
      provider: 'fake',
      providerMessageId: 'provider-1',
    })
    expect(whatsApp.markFailedTerminal).not.toHaveBeenCalled()
    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('respeita a desativação explícita do cron antes de consultar a fila', async () => {
    process.env.DISABLE_WHATSAPP_SCHEDULE = '1'
    const whatsApp = {
      claimQueued: jest.fn(),
    }
    const queueService = {
      isEnabled: jest.fn(),
    }

    const job = new WhatsAppDispatcherJob(whatsApp as any, queueService as any)

    await job.dispatchQueued()

    expect(queueService.isEnabled).not.toHaveBeenCalled()
    expect(whatsApp.claimQueued).not.toHaveBeenCalled()
  })
})

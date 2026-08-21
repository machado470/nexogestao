var mockProvider: {
  sendText: jest.Mock
}

jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'

describe('WhatsAppDispatcherJob post-send safety', () => {
  const previousDisableSchedule = process.env.DISABLE_WHATSAPP_SCHEDULE

  beforeEach(() => {
    delete process.env.DISABLE_WHATSAPP_SCHEDULE
    jest.clearAllMocks()
  })

  afterAll(() => {
    if (previousDisableSchedule === undefined) {
      delete process.env.DISABLE_WHATSAPP_SCHEDULE
    } else {
      process.env.DISABLE_WHATSAPP_SCHEDULE = previousDisableSchedule
    }
  })

  function message() {
    return {
      id: 'm1',
      orgId: 'org1',
      toPhone: '5511999999999',
      content: 'mensagem',
      renderedText: null,
    }
  }

  function makeWhatsApp() {
    return {
      claimQueued: jest.fn()
        .mockResolvedValueOnce([message()])
        .mockResolvedValueOnce([]),
      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
      markDeliveryUncertain: jest.fn().mockResolvedValue({}),
    }
  }

  it('não reenfileira quando provider confirmou mas markSent falha', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'meta_cloud',
        providerMessageId: 'wamid.1',
      }),
    }

    const whatsApp = makeWhatsApp()
    whatsApp.markSent.mockRejectedValueOnce(new Error('postgres unavailable'))

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await expect(dispatcher.dispatchQueued()).resolves.toBeUndefined()

    expect(mockProvider.sendText).toHaveBeenCalledTimes(1)
    expect(whatsApp.markSent).toHaveBeenCalledTimes(1)
    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('não reenfileira quando persistir UNCERTAIN falha', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: false,
        provider: 'zapi',
        errorCode: 'TIMEOUT',
        errorMessage: 'timeout',
        ambiguous: true,
      }),
    }

    const whatsApp = makeWhatsApp()
    whatsApp.markDeliveryUncertain.mockRejectedValueOnce(
      new Error('postgres unavailable'),
    )

    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await expect(dispatcher.dispatchQueued()).resolves.toBeUndefined()

    expect(whatsApp.markDeliveryUncertain).toHaveBeenCalledTimes(1)
    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('não reenfileira quando sendText lança após início da tentativa externa', async () => {
    mockProvider = {
      sendText: jest.fn().mockRejectedValue(new Error('connection reset')),
    }

    const whatsApp = makeWhatsApp()
    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await expect(dispatcher.dispatchQueued()).resolves.toBeUndefined()

    expect(mockProvider.sendText).toHaveBeenCalledTimes(1)
    expect(whatsApp.markSent).not.toHaveBeenCalled()
    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('mantém requeue para erro explicitamente retryable e não ambíguo', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: false,
        provider: 'meta_cloud',
        errorCode: 'HTTP_503',
        errorMessage: 'temporarily unavailable',
        fatal: false,
        ambiguous: false,
      }),
    }

    const whatsApp = makeWhatsApp()
    const dispatcher = new WhatsAppDispatcherJob(whatsApp as any)

    await expect(dispatcher.dispatchQueued()).resolves.toBeUndefined()

    expect(whatsApp.markFailedAndRequeue).toHaveBeenCalledTimes(1)
    expect(whatsApp.markFailedTerminal).not.toHaveBeenCalled()
    expect(whatsApp.markDeliveryUncertain).not.toHaveBeenCalled()
  })
})

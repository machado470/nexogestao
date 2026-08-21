var mockProvider: {
  sendText: jest.Mock
}

jest.mock('../../whatsapp/providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppProcessor } from './whatsapp.processor'
import { WHATSAPP_QUEUE_JOB_NAMES } from '../queue.constants'

describe('WhatsAppProcessor post-send safety', () => {
  function job(attemptsMade = 0) {
    return {
      id: 'job-1',
      name: WHATSAPP_QUEUE_JOB_NAMES.DISPATCH_MESSAGE,
      attemptsMade,
      opts: { attempts: 5 },
      data: {
        messageId: 'm1',
        orgId: 'org1',
        requestId: 'req-1',
        userId: 'user-1',
      },
    }
  }

  function claimedMessage() {
    return {
      id: 'm1',
      orgId: 'org1',
      status: 'SENDING',
      toPhone: '5511999999999',
      content: 'mensagem',
      renderedText: 'mensagem',
    }
  }

  function makeProcessor() {
    const whatsApp = {
      claimMessageForDispatch: jest.fn().mockResolvedValue(claimedMessage()),
      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
      markDeliveryUncertain: jest.fn().mockResolvedValue({}),
    }

    const queueService = {
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
      addJob: jest.fn().mockResolvedValue({}),
      ensureEnabled: jest.fn().mockResolvedValue(true),
    }

    const processor = new WhatsAppProcessor(
      {} as any,
      whatsApp as any,
      queueService as any,
      {
        incRetry: jest.fn(),
        incFailedJobs: jest.fn(),
      } as any,
      {
        increment: jest.fn(),
        observeDuration: jest.fn(),
      } as any,
    )

    return { processor, whatsApp, queueService }
  }

  it('não reenfileira se markSent falha depois de envio confirmado', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'meta_cloud',
        providerMessageId: 'wamid.1',
      }),
    }

    const { processor, whatsApp } = makeProcessor()
    whatsApp.markSent.mockRejectedValueOnce(new Error('postgres unavailable'))

    await expect(processor.process(job() as any)).rejects.toThrow(
      'postgres unavailable',
    )

    expect(mockProvider.sendText).toHaveBeenCalledTimes(1)
    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('não reenfileira se persistir UNCERTAIN falha', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: false,
        provider: 'zapi',
        errorCode: 'TIMEOUT',
        errorMessage: 'timeout',
        ambiguous: true,
      }),
    }

    const { processor, whatsApp } = makeProcessor()
    whatsApp.markDeliveryUncertain.mockRejectedValueOnce(
      new Error('postgres unavailable'),
    )

    await expect(processor.process(job() as any)).rejects.toThrow(
      'postgres unavailable',
    )

    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('não reenfileira quando sendText lança', async () => {
    mockProvider = {
      sendText: jest.fn().mockRejectedValue(new Error('connection reset')),
    }

    const { processor, whatsApp } = makeProcessor()

    await expect(processor.process(job() as any)).rejects.toThrow(
      'connection reset',
    )

    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
  })

  it('retry posterior sem novo claim não chama provider novamente', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'meta_cloud',
        providerMessageId: 'wamid.1',
      }),
    }

    const { processor, whatsApp } = makeProcessor()

    whatsApp.claimMessageForDispatch
      .mockResolvedValueOnce(claimedMessage())
      .mockResolvedValueOnce(null)

    whatsApp.markSent.mockRejectedValueOnce(new Error('postgres unavailable'))

    await expect(processor.process(job(0) as any)).rejects.toThrow(
      'postgres unavailable',
    )

    await expect(processor.process(job(1) as any)).resolves.toBeUndefined()

    expect(mockProvider.sendText).toHaveBeenCalledTimes(1)
    expect(whatsApp.claimMessageForDispatch).toHaveBeenCalledTimes(2)
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

    const { processor, whatsApp } = makeProcessor()

    await expect(processor.process(job() as any)).rejects.toThrow(
      'temporarily unavailable',
    )

    expect(whatsApp.markFailedAndRequeue).toHaveBeenCalledTimes(1)
    expect(whatsApp.markFailedTerminal).not.toHaveBeenCalled()
    expect(whatsApp.markDeliveryUncertain).not.toHaveBeenCalled()
  })
})

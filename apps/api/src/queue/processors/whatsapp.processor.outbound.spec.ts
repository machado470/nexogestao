var mockProvider: {
  sendText: jest.Mock
}

jest.mock('../../whatsapp/providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppProcessor } from './whatsapp.processor'
import { QUEUE_NAMES, WHATSAPP_QUEUE_JOB_NAMES } from '../queue.constants'

describe('WhatsAppProcessor outbound ownership', () => {
  function makeProcessor(input: {
    claimed?: any
    persisted?: any
  } = {}) {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'mock',
        providerMessageId: 'provider-1',
      }),
    }

    const whatsApp = {
      claimMessageForDispatch: jest.fn().mockResolvedValue(input.claimed ?? null),

      // Mantido propositalmente para demonstrar que o fluxo legado
      // ainda consegue enviar sem possuir claim.
      findById: jest.fn().mockResolvedValue(
        input.persisted ?? {
          id: 'm1',
          orgId: 'org1',
          status: 'SENT',
          toPhone: '5511999999999',
          content: 'mensagem',
          renderedText: 'mensagem',
        },
      ),

      markSent: jest.fn().mockResolvedValue({}),
      markFailedTerminal: jest.fn().mockResolvedValue({}),
      markFailedAndRequeue: jest.fn().mockResolvedValue({}),
    }

    const queueService = {
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
      addJob: jest.fn().mockResolvedValue({}),
      ensureEnabled: jest.fn().mockResolvedValue(true),
    }

    const waMetrics = {
      incRetry: jest.fn(),
      incFailedJobs: jest.fn(),
    }

    const queueMetrics = {
      increment: jest.fn(),
      observeDuration: jest.fn(),
    }

    const processor = new WhatsAppProcessor(
      {} as any,
      whatsApp as any,
      queueService as any,
      waMetrics as any,
      queueMetrics as any,
    )

    return {
      processor,
      whatsApp,
      queueService,
    }
  }

  function dispatchJob() {
    return {
      id: 'job-1',
      name: WHATSAPP_QUEUE_JOB_NAMES.DISPATCH_MESSAGE,
      attemptsMade: 0,
      opts: { attempts: 5 },
      data: {
        messageId: 'm1',
        orgId: 'org1',
        requestId: 'req-1',
        userId: 'user-1',
      },
    }
  }

  it('não chama o provider quando não consegue adquirir ownership da mensagem', async () => {
    const { processor, whatsApp } = makeProcessor({
      claimed: null,
    })

    await processor.process(dispatchJob() as any)

    expect(whatsApp.claimMessageForDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm1',
        orgId: 'org1',
      }),
    )

    expect(mockProvider.sendText).not.toHaveBeenCalled()
    expect(whatsApp.markSent).not.toHaveBeenCalled()
  })

  it('mensagem já terminal não pode ser reenviada por um job atrasado', async () => {
    const { processor } = makeProcessor({
      claimed: null,
      persisted: {
        id: 'm1',
        orgId: 'org1',
        status: 'SENT',
        toPhone: '5511999999999',
        content: 'já enviada',
        renderedText: 'já enviada',
      },
    })

    await processor.process(dispatchJob() as any)

    expect(mockProvider.sendText).not.toHaveBeenCalled()
  })
})

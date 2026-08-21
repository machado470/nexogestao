var mockProvider: {
  sendText: jest.Mock
}

jest.mock('../../whatsapp/providers/provider.factory', () => ({
  createWhatsAppProvider: () => mockProvider,
}))

import { WhatsAppProcessor } from './whatsapp.processor'
import {
  WHATSAPP_QUEUE_JOB_NAMES,
} from '../queue.constants'

describe('WhatsAppProcessor ambiguous outbound result', () => {
  it('não reenfileira automaticamente quando o resultado externo é ambíguo', async () => {
    mockProvider = {
      sendText: jest.fn().mockResolvedValue({
        ok: false,
        provider: 'zapi',
        errorCode: 'TIMEOUT',
        errorMessage: 'Timeout de 12000ms',
        ambiguous: true,
      }),
    }

    const whatsApp = {
      claimMessageForDispatch: jest.fn().mockResolvedValue({
        id: 'm1',
        orgId: 'org1',
        status: 'SENDING',
        toPhone: '5511999999999',
        content: 'mensagem',
        renderedText: 'mensagem',
      }),

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

    const job = {
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

    await expect(processor.process(job as any)).resolves.toBeUndefined()

    const workerId =
      whatsApp.claimMessageForDispatch.mock.calls[0][0].workerId

    expect(whatsApp.markDeliveryUncertain).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm1',
        orgId: 'org1',
        workerId,
        provider: 'zapi',
        errorCode: 'TIMEOUT',
      }),
    )

    expect(whatsApp.markFailedAndRequeue).not.toHaveBeenCalled()
    expect(whatsApp.markFailedTerminal).not.toHaveBeenCalled()

    expect(queueService.updateJobStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        completed: true,
      }),
    )
  })
})

var workerConstructor: jest.Mock

jest.mock('bullmq', () => ({
  Worker: class {
    on = jest.fn()
    close = jest.fn().mockResolvedValue(undefined)

    constructor(...args: any[]) {
      workerConstructor(...args)
    }
  },
}))

import { WhatsAppProcessor } from './whatsapp.processor'

describe('WhatsAppProcessor Redis lifecycle', () => {
  beforeEach(() => {
    workerConstructor = jest.fn()
  })

  it('não abandona permanentemente o worker quando Redis está indisponível no bootstrap', async () => {
    const queueService = {
      ensureEnabled: jest.fn().mockResolvedValue(false),
      updateJobStatus: jest.fn(),
      addJob: jest.fn(),
    }

    const processor = new WhatsAppProcessor(
      {} as any,
      {} as any,
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

    await processor.onModuleInit()

    expect(workerConstructor).toHaveBeenCalledTimes(1)

    await processor.onModuleDestroy()
  })
})

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { WebhookService } from './webhook.service'

describe('WebhookService replay failed delivery', () => {
  const makeService = (delivery: any, jobState: string | null = null) => {
    const getState = jest.fn().mockResolvedValue(jobState)
    const getJob = jest.fn().mockResolvedValue(jobState ? { getState } : null)
    const queueService = {
      ensureEnabled: jest.fn().mockResolvedValue(true),
      getQueue: jest.fn().mockReturnValue({ getJob }),
      addJob: jest.fn().mockResolvedValue({ id: 'webhook:dispatch:d1' }),
    }
    const prisma = {} as any
    const svc = new WebhookService(prisma, queueService as any)
    jest.spyOn(svc, 'getDeliveryContext').mockResolvedValue(delivery)
    jest.spyOn(svc, 'markDeliveryAttempt').mockResolvedValue({} as any)
    return { svc, queueService }
  }

  it('replay FAILED reenfileira com jobId determinístico', async () => {
    const delivery = { id: 'd1', status: 'FAILED', attempts: 5, endpointId: 'w1', endpoint: { orgId: 'org1' } }
    const { svc, queueService } = makeService(delivery)

    const result = await svc.replayFailedDelivery({ orgId: 'org1', deliveryId: 'd1', actorUserId: 'u1' })

    expect(queueService.addJob).toHaveBeenCalledWith(
      'webhooks',
      'dispatch-webhook',
      { deliveryId: 'd1' },
      expect.objectContaining({ jobId: 'webhook:dispatch:d1' }),
    )
    expect(result).toEqual(expect.objectContaining({ ok: true, deliveryId: 'd1', jobId: 'webhook:dispatch:d1' }))
  })

  it('bloqueia replay de SUCCESS', async () => {
    const delivery = { id: 'd1', status: 'SUCCESS', attempts: 1, endpointId: 'w1', endpoint: { orgId: 'org1' } }
    const { svc } = makeService(delivery)

    await expect(svc.replayFailedDelivery({ orgId: 'org1', deliveryId: 'd1', actorUserId: 'u1' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('isola tenant com 404', async () => {
    const delivery = { id: 'd1', status: 'FAILED', attempts: 1, endpointId: 'w1', endpoint: { orgId: 'org-other' } }
    const { svc } = makeService(delivery)

    await expect(svc.replayFailedDelivery({ orgId: 'org1', deliveryId: 'd1', actorUserId: 'u1' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('bloqueia replay duplicado quando já há job ativo', async () => {
    const delivery = { id: 'd1', status: 'FAILED', attempts: 5, endpointId: 'w1', endpoint: { orgId: 'org1' } }
    const { svc, queueService } = makeService(delivery, 'active')

    await expect(svc.replayFailedDelivery({ orgId: 'org1', deliveryId: 'd1', actorUserId: 'u1' })).rejects.toBeInstanceOf(ConflictException)
    expect(queueService.addJob).not.toHaveBeenCalled()
  })

  it('restaura FAILED quando Redis impede o enqueue do replay', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common')

    const delivery = {
      id: 'd1',
      status: 'FAILED',
      attempts: 5,
      endpointId: 'w1',
      endpoint: { orgId: 'org1' },
    }

    const { svc, queueService } = makeService(delivery)

    const enqueueError = new ServiceUnavailableException(
      'Fila indisponível: Redis não conectado (webhooks:dispatch-webhook)',
    )

    queueService.addJob.mockRejectedValue(enqueueError)

    const mark = jest.spyOn(svc, 'markDeliveryAttempt')
    mark.mockClear()

    await expect(
      svc.replayFailedDelivery({
        orgId: 'org1',
        deliveryId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBe(enqueueError)

    expect(mark).toHaveBeenNthCalledWith(1, {
      deliveryId: 'd1',
      attempts: 5,
      status: 'PENDING',
    })

    expect(mark).toHaveBeenNthCalledWith(2, {
      deliveryId: 'd1',
      attempts: 5,
      status: 'FAILED',
    })
  })


  it('mantém PENDING quando o erro após tentativa de enqueue é ambíguo', async () => {
    const delivery = {
      id: 'd1',
      status: 'FAILED',
      attempts: 5,
      endpointId: 'w1',
      endpoint: { orgId: 'org1' },
    }

    const { svc, queueService } = makeService(delivery)

    const enqueueError = new Error('connection reset after command write')
    queueService.addJob.mockRejectedValue(enqueueError)

    const mark = jest.spyOn(svc, 'markDeliveryAttempt')
    mark.mockClear()

    await expect(
      svc.replayFailedDelivery({
        orgId: 'org1',
        deliveryId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBe(enqueueError)

    expect(mark).toHaveBeenCalledTimes(1)
    expect(mark).toHaveBeenCalledWith({
      deliveryId: 'd1',
      attempts: 5,
      status: 'PENDING',
    })
  })

  it('revalida QueueService antes de consultar job após bootstrap degradado', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common')

    const delivery = {
      id: 'd1',
      status: 'FAILED',
      attempts: 5,
      endpointId: 'w1',
      endpoint: { orgId: 'org1' },
    }

    const { svc, queueService } = makeService(delivery)

    queueService.ensureEnabled.mockResolvedValue(false)

    const mark = jest.spyOn(svc, 'markDeliveryAttempt')
    mark.mockClear()

    await expect(
      svc.replayFailedDelivery({
        orgId: 'org1',
        deliveryId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)

    expect(queueService.ensureEnabled).toHaveBeenCalledTimes(1)
    expect(queueService.getQueue).not.toHaveBeenCalled()
    expect(mark).not.toHaveBeenCalled()
  })

})

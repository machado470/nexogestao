import { Logger } from '@nestjs/common'
import { ServiceOrdersService } from './service-orders.service'

describe('ServiceOrdersService notification failure isolation', () => {
  it('continues the operational flow after persisting the order once', async () => {
    const created = { id: 'so-1', orgId: 'org-1', customerId: 'customer-1', title: 'Instalação', status: 'OPEN', appointmentId: null, assignedToPersonId: null, createdAt: new Date(), customer: { id: 'customer-1', name: 'Cliente', phone: null }, assignedTo: null }
    const prisma: any = { customer: { findFirst: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Cliente' }) }, serviceOrder: { create: jest.fn().mockResolvedValue(created) } }
    const notifications = { createNotification: jest.fn().mockRejectedValue(new Error('sensitive failure details')) }
    const onboarding = { completeOnboardingStep: jest.fn() }
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    const service = new ServiceOrdersService(
      prisma, { log: jest.fn() } as any, { log: jest.fn() } as any, { syncAndLogStateChange: jest.fn() } as any,
      {} as any, {} as any, notifications as any, onboarding as any, { enqueueMessage: jest.fn() } as any,
      { track: jest.fn() } as any, { begin: jest.fn().mockResolvedValue({ mode: 'execute', recordId: 'idem-1' }), complete: jest.fn(), fail: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
    )
    await expect(service.create({ orgId: 'org-1', createdBy: 'user-1', personId: null, customerId: 'customer-1', title: 'Instalação' })).resolves.toBe(created)
    expect(prisma.serviceOrder.create).toHaveBeenCalledTimes(1)
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'service-order.created:so-1', routeHint: '/service-orders?id=so-1' }))
    expect(onboarding.completeOnboardingStep).toHaveBeenCalled()
    expect(logger).toHaveBeenCalledWith({ event: 'notification_producer_failed', producer: 'service-order.created', orgId: 'org-1', entityId: 'so-1', errorType: 'Error' })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('sensitive failure details')
    logger.mockRestore()
  })
})

describe('ServiceOrdersService timeline hardening', () => {
  it('emite SERVICE_ORDER_COMPLETED ao concluir O.S.', async () => {
    const before = {
      id: 'so-1',
      orgId: 'org-1',
      customerId: 'c-1',
      status: 'IN_PROGRESS',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      amountCents: 0,
      assignedToPersonId: null,
      title: 'OS crítica',
    }
    const updated = {
      ...before,
      status: 'DONE',
      customer: { id: 'c-1', name: 'Cliente', phone: null },
      assignedTo: null,
    }
    const prisma: any = {
      serviceOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(before),
      },
      $transaction: jest.fn(async (cb: any) =>
        cb({
          serviceOrder: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirst: jest.fn().mockResolvedValue(updated),
          },
        }),
      ),
    }
    const timeline = {
      log: jest.fn().mockResolvedValue(undefined),
      logInTransaction: jest.fn().mockResolvedValue({ id: 'timeline-1' }),
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const operationalState = { syncAndLogStateChange: jest.fn().mockResolvedValue(undefined) }
    const finance = { ensureChargeForServiceOrderDone: jest.fn() }
    const automation = { executeTrigger: jest.fn().mockResolvedValue(undefined) }
    const notifications = {} as any
    const onboarding = {} as any
    const whatsApp = { enqueueMessage: jest.fn() }
    const analytics = { track: jest.fn().mockResolvedValue(undefined) }
    const idempotency = {
      begin: jest.fn().mockResolvedValue({ mode: 'execute', recordId: 'idem-1' }),
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    }

    const service = new ServiceOrdersService(
      prisma,
      timeline as any,
      audit as any,
      operationalState as any,
      finance as any,
      automation as any,
      notifications,
      onboarding,
      whatsApp as any,
      analytics as any,
      idempotency as any,
      { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }) } as any,
    )

    await service.update({
      orgId: 'org-1',
      updatedBy: 'u-1',
      personId: 'p-1',
      id: 'so-1',
      data: {
        status: 'DONE',
        expectedUpdatedAt: before.updatedAt.toISOString(),
      },
    })

    expect(timeline.logInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVICE_ORDER_COMPLETED',
        serviceOrderId: 'so-1',
        customerId: 'c-1',
      }),
      expect.anything(),
    )
  })
})

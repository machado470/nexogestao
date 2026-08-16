import { Logger } from '@nestjs/common'
import { CustomersService } from './customers.service'

describe('CustomersService notification failure isolation', () => {
  it('returns the single persisted customer and records only structured identifiers', async () => {
    const created = { id: 'customer-1', orgId: 'org-1', name: 'Cliente', phone: '5511999999999', email: null, active: true, createdAt: new Date() }
    const prisma: any = { customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) } }
    const notifications = { createNotification: jest.fn().mockRejectedValue(new Error('private payload must not be logged')) }
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    const service = new CustomersService(
      prisma, { log: jest.fn() } as any, { log: jest.fn() } as any, notifications as any,
      { completeOnboardingStep: jest.fn() } as any, { track: jest.fn() } as any,
      { begin: jest.fn().mockResolvedValue({ mode: 'execute', recordId: 'idem-1' }), complete: jest.fn(), fail: jest.fn() } as any,
    )

    await expect(service.create({ orgId: 'org-1', createdBy: 'user-1', personId: null, name: 'Cliente', phone: '+55 11 99999-9999' })).resolves.toBe(created)
    expect(prisma.customer.create).toHaveBeenCalledTimes(1)
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'customer.created:customer-1', routeHint: '/customers?customerId=customer-1',
    }))
    expect(logger).toHaveBeenCalledWith({ event: 'notification_producer_failed', producer: 'customer.created', orgId: 'org-1', entityId: 'customer-1', errorType: 'Error' })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private payload')
    logger.mockRestore()
  })
})

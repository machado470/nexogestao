import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { NotificationsService, CreateNotificationInput, notificationJobId } from './notifications.service'

const prisma = {
  user: { findMany: jest.fn() },
  notification: { findUnique: jest.fn(), create: jest.fn() },
  notificationRecipient: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
}
const queue = { addJob: jest.fn() }
const transport = { publish: jest.fn().mockResolvedValue(true) }
const input: CreateNotificationInput = {
  orgId: 'org-a', eventKey: 'customer.created:c1', type: 'CUSTOMER_CREATED',
  title: 'Cliente criado', message: 'Cliente criado.', severity: 'INFO', source: 'customers',
  audience: { kind: 'user', userId: 'user-a' }, entityType: 'CUSTOMER', entityId: 'c1',
  metadata: { b: 2, a: 1 }, occurredAt: new Date('2026-08-16T10:00:00Z'),
}

describe('NotificationsService persistent recipients', () => {
  let service: NotificationsService
  beforeEach(() => {
    jest.clearAllMocks()
    service = new NotificationsService(prisma as never, queue as never, transport as never)
  })

  it('rejeita destinatário inativo ou de outro tenant', async () => {
    prisma.user.findMany.mockResolvedValue([])
    await expect(service.createNotification(input)).rejects.toThrow(BadRequestException)
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org-a', active: true, id: 'user-a' },
    }))
  })

  it('materializa somente usuários ativos da organização', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
    prisma.notification.findUnique.mockResolvedValue(null)
    prisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'n1', ...data }))
    await service.createNotification({ ...input, audience: { kind: 'organization' } })
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      recipients: { create: [{ userId: 'u1' }, { userId: 'u2' }] },
    }) }))
  })

  it('retry idempotente retorna o registro existente', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'user-a' }])
    prisma.notification.findUnique.mockResolvedValueOnce(null)
    prisma.notification.create.mockImplementationOnce(async ({ data }) => ({ id: 'n1', ...data }))
    const created = await service.createNotification(input)
    prisma.notification.findUnique.mockResolvedValueOnce({ ...created, recipients: [{ userId: 'user-a' }] })
    const retried = await service.createNotification(input)
    expect(retried.id).toBe('n1')
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('mesma eventKey com payload diferente gera conflito', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'user-a' }])
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1', payloadHash: 'different', recipients: [{ userId: 'user-a' }] })
    await expect(service.createNotification(input)).rejects.toThrow(ConflictException)
  })

  it('não normaliza uma audiência individual divergente com recipients persistidos', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'n1', payloadHash: 'irrelevante', recipients: [{ userId: 'user-a' }],
    })
    prisma.user.findMany.mockResolvedValue([{ id: 'user-b' }])

    await expect(service.createNotification({
      ...input,
      audience: { kind: 'user', userId: 'user-b' },
    })).rejects.toThrow(ConflictException)
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org-a', active: true, id: 'user-b' },
    }))
  })

  it('preserva o snapshot de recipients organizacionais nos retries', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null)
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
    prisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'n1', ...data }))
    const organizational = { ...input, audience: { kind: 'organization' } as const }
    const created = await service.createNotification(organizational)

    prisma.notification.findUnique.mockResolvedValueOnce({
      ...created, recipients: [{ userId: 'u1' }, { userId: 'u2' }],
    })
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])

    await expect(service.createNotification(organizational)).resolves.toMatchObject({ id: 'n1' })
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
  })

  it('diferencia audiência individual de snapshot organizacional equivalente', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null)
    prisma.user.findMany.mockResolvedValue([{ id: 'user-a' }])
    prisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'n1', ...data }))
    const created = await service.createNotification({ ...input, audience: { kind: 'organization' } })
    prisma.notification.findUnique.mockResolvedValueOnce({ ...created, recipients: [{ userId: 'user-a' }] })

    await expect(service.createNotification(input)).rejects.toThrow(ConflictException)
  })

  it('lista exclusivamente o recipient autenticado e retorna contagem autoritativa', async () => {
    prisma.notificationRecipient.findMany.mockResolvedValue([])
    prisma.notificationRecipient.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3)
    const result = await service.getNotifications('org-a', 'user-a')
    expect(result.unreadCount).toBe(3)
    expect(prisma.notificationRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', notification: { orgId: 'org-a' } },
    }))
  })

  it('marca leitura individual com escopo de usuário e tenant', async () => {
    prisma.notificationRecipient.updateMany.mockResolvedValue({ count: 1 })
    await expect(service.markAsRead('org-a', 'user-a', 'n1')).resolves.toEqual({ success: true })
    expect(prisma.notificationRecipient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { notificationId: 'n1', userId: 'user-a', notification: { orgId: 'org-a' }, readAt: null },
    }))
  })

  it('não permite ler recipient inexistente ou de outro tenant', async () => {
    prisma.notificationRecipient.updateMany.mockResolvedValue({ count: 0 })
    prisma.notificationRecipient.count.mockResolvedValue(0)
    await expect(service.markAsRead('org-a', 'user-a', 'n1')).rejects.toThrow(NotFoundException)
  })

  it('markAllAsRead não alcança outro usuário ou tenant', async () => {
    prisma.notificationRecipient.updateMany.mockResolvedValue({ count: 2 })
    await expect(service.markAllAsRead('org-a', 'user-a')).resolves.toEqual({ success: true, updated: 2 })
    expect(prisma.notificationRecipient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', readAt: null, notification: { orgId: 'org-a' } },
    }))
  })

  it('usa SHA-256 determinístico e compatível com BullMQ como jobId', async () => {
    await service.enqueueNotification(input)
    expect(queue.addJob).toHaveBeenCalledWith(expect.anything(), 'create-notification', input, {
      jobId: notificationJobId('org-a', 'customer.created:c1'),
    })
    expect(notificationJobId('org-a', 'customer.created:c1')).toMatch(/^[a-f0-9]{64}$/)
    expect(notificationJobId('org-a', 'customer.created:c1')).not.toContain(':')
  })
})

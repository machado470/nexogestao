import { WhatsAppService } from './whatsapp.service'
import { WhatsAppWebhookService } from './whatsapp-webhook.service'
import { normalizePhone } from './phone.util'
import { QUEUE_NAMES, WHATSAPP_QUEUE_JOB_NAMES } from '../queue/queue.constants'

jest.mock('./providers/provider.factory', () => ({
  createWhatsAppProvider: () => ({
    getProviderName: () => 'meta_cloud',
    parseWebhook: jest.fn(() => [{
      eventType: 'MESSAGE_RECEIVED',
      fromPhone: '11 99999-9999',
      toPhone: '5511888888888',
      content: 'oi',
      providerMessageId: 'wamid.1',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      metadata: {},
    }]),
  }),
}))

describe('WhatsAppService inbound/outbound', () => {
  it('normalize phone em E.164 com +55', () => {
    expect(normalizePhone('(11) 99999-9999')).toBe('+5511999999999')
    expect(normalizePhone('5511999999999')).toBe('+5511999999999')
  })

  it('inbound cria mensagem e não duplica webhook repetido', async () => {
    const prisma: any = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', orgId: 'org1', phone: '+5511999999999' }) },
      whatsAppConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv1', customerId: 'c1', phone: '+5511999999999' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      charge: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { findFirst: jest.fn().mockResolvedValue(null) },
      serviceOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppMessage: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'm1', orgId: 'org1', providerMessageId: 'wamid.1' })
          .mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CUSTOMER', entityId: 'c1', conversationId: 'conv1', direction: 'INBOUND', status: 'DELIVERED' }),
        create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date(), entityType: 'CUSTOMER', entityId: 'c1', messageType: 'MANUAL', status: 'DELIVERED' }),
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn().mockResolvedValue({}) } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)
    await svc.processInboundWebhook('meta_cloud', {}, { orgId: 'org1' })
    await svc.processInboundWebhook('meta_cloud', {}, { orgId: 'org1' })
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledTimes(1)
    expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalled()
  })

  it('inbound sem cliente retorna erro controlado', async () => {
    const prisma: any = {
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'conv1', customerId: null, phone: '+5511999999999' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      whatsAppMessage: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date(), customerId: null, conversationId: 'conv1', status: 'DELIVERED', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'GENERAL', entityId: 'conv1', direction: 'INBOUND', errorMessage: null }), count: jest.fn().mockResolvedValue(0) },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn().mockResolvedValue({}) } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)
    const result = await svc.processInboundWebhook('meta_cloud', {}, { orgId: 'org1' })
    expect(result.results[0].context.contextType).toBe('GENERAL')
  })

  it('outbound enfileira envio async', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'j1' })
    const prisma: any = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', phone: '+5511999999999' }) },
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv1', customerId: 'c1', phone: '+5511999999999' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      whatsAppMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date(), customerId: 'c1', conversationId: 'conv1', status: 'QUEUED' }) },
    }
    const svc = new WhatsAppService(prisma, { addJob } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn().mockResolvedValue({}) } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)
    await svc.enqueueMessage('org1', { customerId: 'c1', content: 'oi', entityType: 'CUSTOMER', entityId: 'c1', messageType: 'MANUAL' })
    expect(addJob).toHaveBeenCalled()
  })


  it('deduplica outbound por messageKey sem violar unique', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'j1' })
    const prisma: any = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', phone: '+5511999999999' }) },
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv1', customerId: 'c1', phone: '+5511999999999' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      whatsAppMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm-existing', createdAt: new Date(), customerId: 'c1', conversationId: 'conv1', status: 'QUEUED', messageKey: 'service_order_done:so1' }),
        create: jest.fn(),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn().mockResolvedValue({}) } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.enqueueMessage('org1', { customerId: 'c1', content: 'oi', entityType: 'SERVICE_ORDER', entityId: 'so1', messageType: 'EXECUTION_CONFIRMATION', messageKey: 'service_order_done:so1' })

    expect(result).toEqual(expect.objectContaining({ created: false, message: expect.objectContaining({ id: 'm-existing' }) }))
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
  })
  it('emite eventos críticos MESSAGE_SENT e PAYMENT_LINK_SENT ao marcar envio confirmado', async () => {
    const timeline = { log: jest.fn().mockResolvedValue({}) }
    const prisma: any = {
      whatsAppMessage: {
        update: jest.fn().mockResolvedValue({
          id: 'm1',
          orgId: 'org1',
          customerId: 'c1',
          providerMessageId: 'wamid.1',
          messageType: 'PAYMENT_LINK',
          entityType: 'CHARGE',
          entityId: 'ch1',
          conversationId: 'conv1',
          direction: 'OUTBOUND',
          status: 'SENT',
          errorMessage: null,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'm1',
          orgId: 'org1',
          customerId: 'c1',
          providerMessageId: 'wamid.1',
          messageType: 'PAYMENT_LINK',
          entityType: 'CHARGE',
          entityId: 'ch1',
          conversationId: 'conv1',
          direction: 'OUTBOUND',
          status: 'SENT',
          errorMessage: null,
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, timeline as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    ;(prisma as any).$queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        orgId: 'org1',
        status: 'SENT',
        messageType: 'PAYMENT_LINK',
        errorMessage: null,
      },
    ])

    await svc.markSent({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-a',
      provider: 'zapi',
      providerMessageId: 'wamid.1',
    })

    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_SENT' }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYMENT_LINK_SENT' }))
  })

  it('resolve contexto operacional com cobrança, agendamento e ordem vinculados', async () => {
    const prisma: any = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', orgId: 'org1', phone: '+5511999999999' }) },
      charge: { findFirst: jest.fn().mockResolvedValue({ id: 'ch1' }) },
      appointment: { findFirst: jest.fn().mockResolvedValue({ id: 'ap1' }) },
      serviceOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'so1' }) },
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'conv1', customerId: 'c1', phone: '+5511999999999' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      whatsAppMessage: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CHARGE', entityId: 'ch1', conversationId: 'conv1', direction: 'INBOUND', status: 'DELIVERED', errorMessage: null }),
        create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date(), customerId: 'c1', conversationId: 'conv1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CHARGE', entityId: 'ch1', direction: 'INBOUND', status: 'DELIVERED', errorMessage: null }),
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const timeline = { log: jest.fn().mockResolvedValue({}) }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, timeline as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.processInboundWebhook('meta_cloud', {}, { orgId: 'org1', traceId: 'trace-1', webhookEventId: 'wh-1' })

    expect(result.results[0].context).toEqual(expect.objectContaining({ contextType: 'CHARGE', chargeId: 'ch1', appointmentId: 'ap1', serviceOrderId: 'so1' }))
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: 'CHARGE', entityId: 'ch1' }) }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_RECEIVED' }))
  })

  it('emite timeline para status delivered/read/failed com deduplicação por mensagem', async () => {
    const timeline = { log: jest.fn().mockResolvedValue({}) }
    const prisma: any = {
      whatsAppMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CUSTOMER', entityId: 'c1', conversationId: 'conv1', direction: 'OUTBOUND', status: 'SENT', errorMessage: null }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CUSTOMER', entityId: 'c1', conversationId: 'conv1', direction: 'OUTBOUND', status: 'DELIVERED', errorMessage: null }),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incOutbound: jest.fn(), incInbound: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any, timeline as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await svc.updateMessageStatus('org1', { id: 'm1', status: 'DELIVERED' })
    await svc.updateMessageStatus('org1', { id: 'm1', status: 'READ' })
    await svc.updateMessageStatus('org1', { id: 'm1', status: 'FAILED', errorMessage: 'provider failed' })

    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_DELIVERED' }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_READ' }))
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_FAILED' }))
  })


  it('enfileira webhook inbound persistido com job dedicado e payload mínimo', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'job1' })
    const metrics = { incInboundWebhookQueued: jest.fn() }
    const svc = new WhatsAppService({} as any, { addJob } as any, metrics as any, { log: jest.fn() } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await svc.enqueueInboundWebhook({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1', receivedAt: new Date('2026-05-06T00:00:00Z') })

    expect(addJob).toHaveBeenCalledWith(
      QUEUE_NAMES.WHATSAPP,
      WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
      expect.objectContaining({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1', receivedAt: '2026-05-06T00:00:00.000Z' }),
      { jobId: 'whatsapp:inbound-webhook:wh1' },
    )
    expect(metrics.incInboundWebhookQueued).toHaveBeenCalled()
  })

  it('worker usa webhook persistido e marca PROCESSED sem duplicar em retry', async () => {
    const event = { id: 'wh1', orgId: 'org1', provider: 'meta_cloud', payload: {}, status: 'RECEIVED' }
    const prisma: any = {
      whatsAppWebhookEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({ ...event, status: 'PROCESSED' }),
      },
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', orgId: 'org1', phone: '+5511999999999' }) },
      whatsAppConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv1', customerId: 'c1', phone: '+5511999999999' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      charge: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { findFirst: jest.fn().mockResolvedValue(null) },
      serviceOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppMessage: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1' }),
        create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date(), entityType: 'CUSTOMER', entityId: 'c1', messageType: 'MANUAL', status: 'DELIVERED' }),
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incInbound: jest.fn(), incFailedWebhook: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn().mockResolvedValue({}) } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await svc.processPersistedInboundWebhook({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1' })
    event.status = 'PROCESSED'
    await svc.processPersistedInboundWebhook({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1' })

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledTimes(1)
    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'wh1' }, data: expect.objectContaining({ status: 'PROCESSED' }) }))
  })

  it('dead-letter marca webhook FAILED com tentativas e erro visíveis', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: { update: jest.fn().mockResolvedValue({ id: 'wh1', status: 'FAILED' }) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, {} as any, { log: jest.fn() } as any, { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await svc.deadLetterWebhookEvent({ id: 'wh1', orgId: 'org1', errorMessage: 'boom', attemptsMade: 5 })

    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wh1' },
      data: expect.objectContaining({ status: 'FAILED', orgId: 'org1', retryAttempts: 5, errorMessage: expect.stringContaining('boom') }),
    }))
  })


  it('lista webhook events com filtros e metadados sem expor payload bruto', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'wh1', orgId: 'org1', provider: 'meta_cloud', eventType: 'MESSAGE_RECEIVED', status: 'FAILED', retryAttempts: 3, errorMessage: 'boom', processedAt: null, traceId: 'trace-1', providerMessageId: 'wamid.1', payload: { messages: [{ providerMessageId: 'wamid.1' }] }, createdAt: new Date('2026-05-06T00:00:00Z') },
        ]),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, {} as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.listWebhookEvents('org1', { provider: 'meta_cloud', status: 'FAILED' as any, traceId: 'trace-1', providerMessageId: 'wamid.1', createdAtFrom: '2026-05-01T00:00:00Z', createdAtTo: '2026-05-07T00:00:00Z' })

    expect(prisma.whatsAppWebhookEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orgId: 'org1', provider: 'meta_cloud', status: 'FAILED', traceId: 'trace-1', providerMessageId: 'wamid.1' }),
    }))
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'wh1', status: 'FAILED', payloadMetadata: expect.objectContaining({ providerMessageIds: ['wamid.1'] }) }))
    expect((result.items[0] as any).payload).toBeUndefined()
  })

  it('retorna detalhe de webhook por org com tentativas, erro, trace e metadados', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wh1', orgId: 'org1', provider: 'meta_cloud', eventType: 'MESSAGE_RECEIVED', status: 'FAILED', retryAttempts: 2, errorMessage: 'boom', processedAt: new Date('2026-05-06T00:01:00Z'), traceId: 'trace-1', providerMessageId: null, payload: { messageId: 'wamid.1', nested: true }, createdAt: new Date('2026-05-06T00:00:00Z') }),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, {} as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.getWebhookEventDetail('org1', 'wh1')

    expect(prisma.whatsAppWebhookEvent.findFirst).toHaveBeenCalledWith({ where: { id: 'wh1', orgId: 'org1' } })
    expect(result).toEqual(expect.objectContaining({ id: 'wh1', retryAttempts: 2, errorMessage: 'boom', traceId: 'trace-1', providerMessageId: 'wamid.1', rawPayloadMetadata: expect.any(Object) }))
  })

  it('replay de webhook FAILED reenfileira usando job id único de replay', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'job-replay' })
    const prisma: any = {
      whatsAppWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'wh1', orgId: 'org1', provider: 'meta_cloud', status: 'FAILED', traceId: 'trace-1', createdAt: new Date('2026-05-06T00:00:00Z') }]),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob } as any, { incInboundWebhookQueued: jest.fn() } as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.replayWebhookEvents('org1', { ids: ['wh1'], requestedBy: 'u1' })

    expect(result.ok).toBe(true)
    expect(addJob).toHaveBeenCalledWith(
      QUEUE_NAMES.WHATSAPP,
      WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
      expect.objectContaining({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1' }),
      expect.objectContaining({ jobId: expect.stringMatching(/^whatsapp:inbound-webhook:wh1:replay-/) }),
    )
  })

  it('bloqueia replay de webhook PROCESSED por padrão', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'wh1', orgId: 'org1', provider: 'meta_cloud', status: 'PROCESSED', traceId: 'trace-1', createdAt: new Date() }]),
      },
    }
    const addJob = jest.fn()
    const svc = new WhatsAppService(prisma, { addJob } as any, {} as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await expect(svc.replayWebhookEvents('org1', { ids: ['wh1'] })).rejects.toThrow('force=true')
    expect(addJob).not.toHaveBeenCalled()
  })

  it('permite replay force=true para webhook PROCESSED', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'job-force' })
    const prisma: any = {
      whatsAppWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'wh1', orgId: 'org1', provider: 'meta_cloud', status: 'PROCESSED', traceId: 'trace-1', createdAt: new Date('2026-05-06T00:00:00Z') }]),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob } as any, { incInboundWebhookQueued: jest.fn() } as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await expect(svc.replayWebhookEvents('org1', { ids: ['wh1'], force: true })).resolves.toEqual(expect.objectContaining({ ok: true }))
    expect(addJob).toHaveBeenCalled()
  })

  it('reprocessamento de replay não cria mensagem duplicada quando providerMessageId já existe', async () => {
    const event = { id: 'wh1', orgId: 'org1', provider: 'meta_cloud', payload: {}, status: 'FAILED' }
    const prisma: any = {
      whatsAppWebhookEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({ ...event, status: 'PROCESSED' }),
      },
      whatsAppMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', customerId: 'c1', providerMessageId: 'wamid.1', messageType: 'MANUAL', entityType: 'CUSTOMER', entityId: 'c1', conversationId: 'conv1', direction: 'INBOUND', status: 'DELIVERED' }),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'tl1' }) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, { incInbound: jest.fn(), observeProcessingDuration: jest.fn() } as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await svc.processPersistedInboundWebhook({ webhookEventId: 'wh1', orgId: 'org1', provider: 'meta_cloud', traceId: 'trace-1' })

    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled()
    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }))
  })

  it('calcula estatísticas DLQ por org, provider e tentativas', async () => {
    const oldest = new Date(Date.now() - 60000)
    const prisma: any = {
      whatsAppWebhookEvent: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue({ id: 'wh-old', createdAt: oldest }),
        groupBy: jest.fn()
          .mockResolvedValueOnce([{ provider: 'meta_cloud', _count: { _all: 2 } }])
          .mockResolvedValueOnce([{ orgId: 'org1', _count: { _all: 2 } }]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { retryAttempts: 3 }, _max: { retryAttempts: 5 }, _min: { retryAttempts: 1 } }),
      },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, {} as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    const result = await svc.getWebhookDlqStats('org1')

    expect(result.failedCount).toBe(2)
    expect(result.failedByProvider).toEqual([{ provider: 'meta_cloud', count: 2 }])
    expect(result.failedByOrg).toEqual([{ orgId: 'org1', count: 2 }])
    expect(result.retryAttempts).toEqual({ min: 1, max: 5, avg: 3 })
    expect(result.oldestFailedEvent?.ageMs).toBeGreaterThanOrEqual(0)
  })

  it('isola tenants ao buscar detalhes de webhook', async () => {
    const prisma: any = {
      whatsAppWebhookEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WhatsAppService(prisma, { addJob: jest.fn() } as any, {} as any, { log: jest.fn() } as any, { orgId: 'org1', userId: 'u1', requestId: 'r1' } as any, { increment: jest.fn() } as any, { enforceMeter: jest.fn() } as any, {} as any)
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await expect(svc.getWebhookEventDetail('org1', 'wh-other')).rejects.toThrow('webhook WhatsApp não encontrado')
    expect(prisma.whatsAppWebhookEvent.findFirst).toHaveBeenCalledWith({ where: { id: 'wh-other', orgId: 'org1' } })
  })

})

describe('WhatsAppService queued dispatch claim', () => {
  function makeService(prisma: any) {
    return new WhatsAppService(
      prisma,
      { addJob: jest.fn() } as any,
      { incOutbound: jest.fn(), incInbound: jest.fn(), incFailed: jest.fn(), incFailedWebhook: jest.fn(), incQueuedJobs: jest.fn(), observeProcessingDuration: jest.fn() } as any,
      { log: jest.fn().mockResolvedValue({}) } as any,
      { orgId: 'test-org', userId: 'test-user', requestId: 'test-request' } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn().mockResolvedValue({ allowed: true }) } as any,
    {} as any,
    )
  }

  it('duas chamadas simultâneas de claim não retornam o mesmo id quando o banco aplica SKIP LOCKED', async () => {
    const prisma: any = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'm1', status: 'SENDING', lockedBy: 'worker-a' }])
        .mockResolvedValueOnce([{ id: 'm2', status: 'SENDING', lockedBy: 'worker-b' }]),
    }
    const svc = makeService(prisma)

    const [first, second] = await Promise.all([
      svc.claimQueued({ workerId: 'worker-a', limit: 1 }),
      svc.claimQueued({ workerId: 'worker-b', limit: 1 }),
    ])

    expect(first.map((item: any) => item.id)).toEqual(['m1'])
    expect(second.map((item: any) => item.id)).toEqual(['m2'])
    expect(new Set([...first, ...second].map((item: any) => item.id)).size).toBe(2)
  })

  it('usa claim atômico com FOR UPDATE SKIP LOCKED e ignora locks recentes', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) }
    const svc = makeService(prisma)

    await svc.claimQueued({ workerId: 'worker-a', limit: 25 })

    const sql = String(prisma.$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('status = \'QUEUED\'::"WhatsAppMessageStatus"')
    expect(sql).toContain('"lockedAt" IS NULL')
    expect(sql).toContain('"lockedAt" < NOW()')
    expect(sql).toContain('status = \'SENDING\'::"WhatsAppMessageStatus"')
    expect(sql).toContain('UPDATE "WhatsAppMessage" AS m')
    expect(sql).toContain('"lockedBy" =')
  })

  it('mensagem enviada vai para SENT e libera o lock', async () => {
    const prisma: any = {
      whatsAppMessage: {
        update: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', status: 'SENT', messageType: 'MANUAL', errorMessage: null }),
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', messageType: 'MANUAL' }),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
    }
    const svc = makeService(prisma)

    ;(prisma as any).$queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        orgId: 'org1',
        status: 'SENT',
        messageType: 'MANUAL',
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
      },
    ])

    await svc.markSent({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-a',
      provider: 'meta_cloud',
      providerMessageId: 'wamid.1',
    })

    expect((prisma as any).$queryRaw).toHaveBeenCalled()

    const sql = String(
      (prisma as any).$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    expect(sql).toContain("status = 'SENT'")
    expect(sql).toContain('"orgId" =')
    expect(sql).toContain("status = 'SENDING'")
    expect(sql).toContain('"lockedBy" =')
  })

  it('falha fatal vai para FAILED e libera o lock', async () => {
    const prisma: any = {
      whatsAppMessage: {
        update: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', status: 'FAILED', messageType: 'MANUAL', errorMessage: 'boom' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', orgId: 'org1', messageType: 'MANUAL' }),
      },
      timelineEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'existing' }) },
    }
    const svc = makeService(prisma)

    ;(prisma as any).$queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        orgId: 'org1',
        status: 'FAILED',
        messageType: 'MANUAL',
        errorMessage: 'boom',
        lockedAt: null,
        lockedBy: null,
      },
    ])

    await svc.markFailedTerminal({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-a',
      provider: 'meta_cloud',
      errorCode: 'FATAL',
      errorMessage: 'boom',
    })

    expect((prisma as any).$queryRaw).toHaveBeenCalled()

    const sql = String(
      (prisma as any).$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    expect(sql).toContain("status = 'FAILED'")
    expect(sql).toContain('"orgId" =')
    expect(sql).toContain("status = 'SENDING'")
    expect(sql).toContain('"lockedBy" =')
  })

  it('falha transitória volta para QUEUED e libera o lock para retry futuro', async () => {
    const prisma: any = {
      whatsAppMessage: {
        update: jest.fn().mockResolvedValue({ id: 'm1', status: 'QUEUED' }),
      },
    }
    const svc = makeService(prisma)

    ;(prisma as any).$queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        orgId: 'org1',
        status: 'QUEUED',
        messageType: 'MANUAL',
        lockedAt: null,
        lockedBy: null,
      },
    ])

    await svc.markFailedAndRequeue({
      id: 'm1',
      orgId: 'org1',
      workerId: 'worker-a',
      provider: 'meta_cloud',
      errorCode: 'TEMP',
      errorMessage: 'try again',
    })

    expect((prisma as any).$queryRaw).toHaveBeenCalled()

    const sql = String(
      (prisma as any).$queryRaw.mock.calls[0][0]?.strings?.join(' ') ?? '',
    )

    expect(sql).toContain("status = 'QUEUED'")
    expect(sql).toContain('"orgId" =')
    expect(sql).toContain("status = 'SENDING'")
    expect(sql).toContain('"lockedBy" =')
  })

  it('marca RECEIVED como FAILED quando o handoff para BullMQ é comprovadamente impossível', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common')

    const queueError = new ServiceUnavailableException(
      'Fila indisponível: Redis não conectado (whatsapp:inbound-webhook)',
    )

    const prisma: any = {
      whatsAppWebhookEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const queueService = {
      addJob: jest.fn().mockRejectedValue(queueError),
    }

    const metrics = {
      incInboundWebhookQueued: jest.fn(),
    }

    const svc = new WhatsAppService(
      prisma,
      queueService as any,
      metrics as any,
      { log: jest.fn() } as any,
      {
        orgId: 'org1',
        userId: 'u1',
        requestId: 'req-1',
      } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn() } as any,
    {} as any,
    )
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await expect(
      svc.enqueueInboundWebhook({
        webhookEventId: 'wh1',
        orgId: 'org1',
        provider: 'meta_cloud',
        traceId: 'trace-1',
        receivedAt: new Date('2026-05-06T00:00:00Z'),
      }),
    ).rejects.toBe(queueError)

    expect(prisma.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'wh1',
        orgId: 'org1',
        status: 'RECEIVED',
      },
      data: {
        status: 'FAILED',
        errorMessage: expect.stringContaining('Fila indisponível'),
      },
    })

    expect(metrics.incInboundWebhookQueued).not.toHaveBeenCalled()
  })


  it('não marca RECEIVED como FAILED quando o erro de enqueue é ambíguo', async () => {
    const queueError = new Error('connection reset after command write')

    const prisma: any = {
      whatsAppWebhookEvent: {
        updateMany: jest.fn(),
      },
    }

    const queueService = {
      addJob: jest.fn().mockRejectedValue(queueError),
    }

    const svc = new WhatsAppService(
      prisma,
      queueService as any,
      { incInboundWebhookQueued: jest.fn() } as any,
      { log: jest.fn() } as any,
      {
        orgId: 'org1',
        userId: 'u1',
        requestId: 'req-1',
      } as any,
      { increment: jest.fn() } as any,
      { enforceMeter: jest.fn() } as any,
    {} as any,
    )
    ;(svc as any).webhookService = new WhatsAppWebhookService((svc as any).prisma, (svc as any).queueService, (svc as any).waMetrics)

    await expect(
      svc.enqueueInboundWebhook({
        webhookEventId: 'wh1',
        orgId: 'org1',
        provider: 'meta_cloud',
        traceId: 'trace-1',
        receivedAt: new Date('2026-05-06T00:00:00Z'),
      }),
    ).rejects.toBe(queueError)

    expect(prisma.whatsAppWebhookEvent.updateMany).not.toHaveBeenCalled()
  })

})

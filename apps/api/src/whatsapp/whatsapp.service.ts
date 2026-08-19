import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  Prisma,
  WhatsAppContextType,
  WhatsAppConversationPriority,
  WhatsAppConversationStatus,
  WhatsAppDirection,
  WhatsAppEntityType,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppWebhookStatus,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { WhatsAppObservabilityService } from '../common/metrics/whatsapp-observability.service'
import { QUEUE_NAMES, WHATSAPP_QUEUE_JOB_NAMES } from '../queue/queue.constants'
import { TimelineService } from '../timeline/timeline.service'
import { RequestContextService } from '../common/context/request-context.service'
import { TenantOperationsService } from '../common/tenant-ops/tenant-ops.service'
import { CommercialPolicyService, isCommercialBlocked } from '../common/commercial/commercial-policy.service'
import { createWhatsAppProvider } from './providers/provider.factory'
import { ParsedWebhookMessage } from './providers/whatsapp.provider'
import { WhatsAppTemplateService } from './whatsapp-template.service'
import { WhatsAppContextService } from './whatsapp-context.service'
import { WhatsAppIntelligenceService, OperationalContextSnapshot } from './whatsapp-intelligence.service'
import { buildCommunicationFailureSignal } from '../governance/communication-failure.signal'
import { normalizePhone } from './phone.util'
import { randomUUID } from 'crypto'

const WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES = Number(process.env.WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES ?? 5)

export function buildDeterministicMessageKey(input: { entityType: WhatsAppEntityType; entityId: string; messageType: WhatsAppMessageType }) {
  return `${input.entityType}:${input.entityId}:${input.messageType}`
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)
  private logTransition(action: string, meta: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ requestId: this.requestContext.requestId, userId: this.requestContext.userId, orgId: this.requestContext.orgId, action, ...meta }))
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly waMetrics: WhatsAppObservabilityService,
    private readonly timeline: TimelineService,
    private readonly requestContext: RequestContextService,
    private readonly tenantOps: TenantOperationsService,
    private readonly commercial: CommercialPolicyService,
    private readonly templateService?: WhatsAppTemplateService,
    private readonly contextService?: WhatsAppContextService,
    private readonly intelligenceService?: WhatsAppIntelligenceService,
  ) {}

  async listConversations(orgId: string, filters: any = {}) {
    const statusFilter =
      filters.status
      ?? (filters.onlyFailed ? WhatsAppConversationStatus.FAILED : undefined)
      ?? (filters.onlyPending ? WhatsAppConversationStatus.WAITING_CUSTOMER : undefined)

    const where: Prisma.WhatsAppConversationWhereInput = {
      orgId,
      customerId: filters.customerId ?? undefined,
      status: statusFilter,
      priority: filters.priority ?? undefined,
      contextType: filters.contextType ?? undefined,
      unreadCount: filters.onlyUnread ? { gt: 0 } : undefined,
    }

    if (filters.search) {
      where.OR = [
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      ]
    }

    const take = Math.min(Math.max(Number(filters.limit ?? 50), 1), 200)
    const items = await this.prisma.whatsAppConversation.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [
        { priority: 'desc' },
        { unreadCount: 'desc' },
        { status: 'asc' },
        { lastMessageAt: 'desc' },
      ],
      cursor: filters.cursor ? { id: String(filters.cursor) } : undefined,
      skip: filters.cursor ? 1 : 0,
      take: take + 1,
    })
    const hasMore = items.length > take
    const sliced = hasMore ? items.slice(0, take) : items
    const customerIds = [...new Set(sliced.map((item) => item.customerId).filter(Boolean) as string[])]
    const conversationIds = sliced.map((item) => item.id)
    const [failedGroups, pendingChargesByCustomer, overdueChargesByCustomer, appointmentsByCustomer, serviceOrdersByCustomer] = await Promise.all([
      this.prisma.whatsAppMessage.groupBy({ by: ['conversationId'], where: { orgId, conversationId: { in: conversationIds }, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.charge.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: 'PENDING' }, _count: { _all: true } }),
      this.prisma.charge.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: 'OVERDUE' }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, _count: { _all: true } }),
      this.prisma.serviceOrder.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }, _count: { _all: true } }),
    ])
    const failedMap = new Map(failedGroups.map((g) => [g.conversationId, g._count._all]))
    const pendingMap = new Map(pendingChargesByCustomer.map((g) => [g.customerId, g._count._all]))
    const overdueMap = new Map(overdueChargesByCustomer.map((g) => [g.customerId, g._count._all]))
    const appointmentMap = new Map(appointmentsByCustomer.map((g) => [g.customerId, g._count._all]))
    const serviceOrderMap = new Map(serviceOrdersByCustomer.map((g) => [g.customerId, g._count._all]))
    return {
      items: sliced.map((item) => ({
      ...item,
      priority: this.calculateInboxPriority(item, {
        hasPendingCharge: (pendingMap.get(item.customerId ?? '') ?? 0) > 0,
        hasOverdueCharge: (overdueMap.get(item.customerId ?? '') ?? 0) > 0,
        failedMessageCount: failedMap.get(item.id) ?? 0,
      }),
      lastMessage: item.lastMessageAt,
      noResponseSince: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? item.lastInboundAt : null,
      noResponseMinutes: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? Math.floor((Date.now() - item.lastInboundAt.getTime()) / 60000) : null,
      noResponseHours: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? Number(((Date.now() - item.lastInboundAt.getTime()) / 3600000).toFixed(1)) : null,
      failedMessageCount: failedMap.get(item.id) ?? 0,
      intent: (item as any).intent ?? 'GENERAL_INTENT',
      slaStatus: (item as any).slaStatus ?? 'OK',
      waitingSince: (item as any).waitingSince ?? null,
      responseDueAt: (item as any).responseDueAt ?? null,
      suggestedActions: (item as any).suggestedActions ?? [],
      intelligence: {
        intent: (item as any).intent ?? 'GENERAL_INTENT',
        priority: (item as any).priority ?? item.priority,
        slaStatus: (item as any).slaStatus ?? 'OK',
        suggestedActions: (item as any).suggestedActions ?? [],
        explanation: (item as any).intelligenceExplanation ?? {
          intentReason: (item as any).intentReason ?? null,
          priorityReason: (item as any).priorityReason ?? null,
        },
      },
      nextAction: this.resolveNextAction({
        failedMessageCount: failedMap.get(item.id) ?? 0,
        hasPendingCharge: (pendingMap.get(item.customerId ?? '') ?? 0) > 0 || (overdueMap.get(item.customerId ?? '') ?? 0) > 0,
        hasUpcomingAppointment: (appointmentMap.get(item.customerId ?? '') ?? 0) > 0,
        hasActiveServiceOrder: (serviceOrderMap.get(item.customerId ?? '') ?? 0) > 0,
      }),
      flags: {
        hasPendingCharge: (pendingMap.get(item.customerId ?? '') ?? 0) > 0 || (overdueMap.get(item.customerId ?? '') ?? 0) > 0,
        hasNoResponse: item.status === WhatsAppConversationStatus.WAITING_CUSTOMER,
        hasFailure: item.status === WhatsAppConversationStatus.FAILED || (failedMap.get(item.id) ?? 0) > 0,
      },
      })),
      nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    }
  }

  async getConversation(orgId: string, conversationId: string) {
    return this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, orgId },
      include: { customer: true },
    })
  }

  async getMessages(orgId: string, conversationId: string) {
    return this.prisma.whatsAppMessage.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getContext(orgId: string, conversationId: string) {
    const conv = await this.getConversation(orgId, conversationId)
    if (!conv?.customerId) return null
    if (!this.contextService) return null
    const context = await this.contextService.getOperationalContext(orgId, conv.customerId)
    return {
      ...context,
      intelligence: this.toConversationIntelligence(conv),
    }
  }

  async getConversationIntelligence(orgId: string, conversationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({ where: { id: conversationId, orgId } })
    if (!conversation) throw new NotFoundException('Conversa WhatsApp não encontrada')
    return this.toConversationIntelligence(conversation)
  }

  private toConversationIntelligence(conversation: any) {
    return {
      intent: conversation.intent ?? 'GENERAL_INTENT',
      intentReason: conversation.intentReason ?? null,
      intentConfidence: conversation.intentConfidence ?? null,
      priority: conversation.priority ?? 'MEDIUM',
      priorityReason: conversation.priorityReason ?? null,
      waitingSince: conversation.waitingSince ?? null,
      lastInboundAt: conversation.lastInboundAt ?? null,
      lastOutboundAt: conversation.lastOutboundAt ?? null,
      slaStatus: conversation.slaStatus ?? 'OK',
      responseDueAt: conversation.responseDueAt ?? null,
      suggestedActions: conversation.suggestedActions ?? [],
      explanation: conversation.intelligenceExplanation ?? null,
      intelligenceVersion: conversation.intelligenceVersion ?? 1,
    }
  }

  async sendManualMessage(orgId: string, userId: string | null, input: any) {
    const content = String(input.content ?? '').trim()
    if (!content) throw new BadRequestException('content é obrigatório')

    const queued = await this.enqueueMessage(orgId, {
      customerId: input.customerId,
      conversationId: input.conversationId,
      toPhone: input.toPhone,
      entityType: input.entityType ?? 'CUSTOMER',
      entityId: input.entityId ?? input.customerId,
      messageType: input.messageType ?? 'MANUAL',
      content,
    })

    return queued
  }

  async sendTemplateMessage(orgId: string, userId: string | null, input: any) {
    if (!this.templateService) throw new BadRequestException('Template service indisponível')
    const rendered = await this.templateService.renderTemplate(orgId, input.templateKey, input.context ?? {})
    return this.sendManualMessage(orgId, userId, {
      ...input,
      messageType: input.messageType ?? rendered.template.messageType,
      content: rendered.content,
    })
  }

  async enqueueMessage(orgIdOrInput: string | any, maybeInput?: any) {
    const orgId = typeof orgIdOrInput === "string" ? orgIdOrInput : orgIdOrInput.orgId
    const input = typeof orgIdOrInput === "string" ? maybeInput : orgIdOrInput
    if (!orgId) throw new BadRequestException('orgId é obrigatório')

    const customer = input.customerId
      ? await this.prisma.customer.findFirst({ where: { id: input.customerId, orgId }, select: { id: true, phone: true } })
      : null

    if (input.customerId && !customer) {
      throw new BadRequestException('Cliente não encontrado para envio de WhatsApp')
    }

    const toPhone = normalizePhone(String(input.toPhone ?? customer?.phone ?? '').trim())
    if (!toPhone) throw new BadRequestException('Telefone de destino não informado')

    const commercialLimit = await this.commercial.enforceMeter(orgId, 'message_sends')
    if (isCommercialBlocked(commercialLimit)) {
      this.tenantOps.increment(orgId, 'whatsapp_blocked')
      throw new BadRequestException(`Envio bloqueado por política comercial: ${commercialLimit.reasonCode}`)
    }

    const conversation = input.conversationId
      ? await this.prisma.whatsAppConversation.findFirst({
          where: { id: String(input.conversationId), orgId },
        })
      : await this.resolveOrCreateConversation(
          orgId,
          input.customerId ?? null,
          toPhone,
          { contextType: input.entityType ?? 'GENERAL', contextId: input.entityId ?? null },
        )

    if (!conversation) {
      throw new BadRequestException('Conversa não encontrada para envio de WhatsApp')
    }

    if (input.messageKey) {
      const existing = await this.prisma.whatsAppMessage.findFirst({
        where: { orgId, messageKey: String(input.messageKey) },
      })
      if (existing) {
        return { created: false, message: existing }
      }
    }

    let message
    try {
      message = await this.prisma.whatsAppMessage.create({
        data: {
          orgId,
          conversationId: conversation.id,
          customerId: input.customerId ?? conversation.customerId ?? null,
          direction: 'OUTBOUND',
          entityType: (input.entityType ?? 'GENERAL') as WhatsAppEntityType,
          entityId: String(input.entityId ?? input.customerId ?? conversation.customerId ?? conversation.id),
          messageType: (input.messageType ?? 'MANUAL') as WhatsAppMessageType,
          messageKey: input.messageKey ?? null,
          toPhone,
          fromPhone: input.fromPhone ?? null,
          renderedText: String(input.content ?? input.renderedText ?? '').trim(),
          content: String(input.content ?? input.renderedText ?? '').trim(),
          status: 'QUEUED',
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      })
    } catch (err: any) {
      if (input.messageKey && err?.code === 'P2002') {
        const existing = await this.prisma.whatsAppMessage.findFirst({
          where: { orgId, messageKey: String(input.messageKey) },
        })
        if (existing) {
          return { created: false, message: existing }
        }
      }
      throw err
    }

    await this.touchConversation(conversation.id, {
      lastMessageAt: message.createdAt,
      lastOutboundAt: message.createdAt,
      waitingSince: null,
      responseDueAt: null,
      slaStatus: 'OK',
      status: WhatsAppConversationStatus.WAITING_CUSTOMER,
    })
    this.logTransition('whatsapp.outbound', { conversationId: conversation.id, messageId: message.id, status: 'WAITING_CUSTOMER' })

    await this.queueService.addJob(QUEUE_NAMES.WHATSAPP, WHATSAPP_QUEUE_JOB_NAMES.DISPATCH_MESSAGE, { messageId: message.id, orgId, requestId: this.requestContext.requestId, userId: this.requestContext.userId }, { jobId: `whatsapp:dispatch:${message.id}` })

    this.waMetrics.incQueuedJobs()
    this.tenantOps.increment(orgId, 'whatsapp_queued')
    this.waMetrics.incOutbound()
    return { created: true, message }
  }

  async updateMessageStatus(orgId: string, input: { id: string; status: WhatsAppMessageStatus; errorMessage?: string | null }) {
    const current = await this.prisma.whatsAppMessage.findFirst({ where: { id: input.id, orgId } })
    if (!current) throw new NotFoundException('Mensagem WhatsApp não encontrada')
    if ((current.status === 'DELIVERED' || current.status === 'READ') && input.status === 'FAILED') {
      return current
    }
    if (current.status === 'CANCELED') {
      return current
    }
    const data: Prisma.WhatsAppMessageUpdateInput = { status: input.status }
    if (input.status === 'SENT') data.sentAt = new Date()
    if (input.status === 'DELIVERED') data.deliveredAt = new Date()
    if (input.status === 'READ') data.readAt = new Date()
    if (input.status === 'FAILED') {
      data.failedAt = new Date()
      data.errorMessage = input.errorMessage ?? 'Falha de envio'
    }

    const updated = await this.prisma.whatsAppMessage.update({ where: { id: input.id }, data })
    const action = input.status === 'FAILED'
      ? 'MESSAGE_FAILED'
      : input.status === 'DELIVERED'
        ? 'MESSAGE_DELIVERED'
        : input.status === 'READ'
          ? 'MESSAGE_READ'
          : input.status === 'SENT'
            ? 'MESSAGE_SENT'
            : null

    if (action) {
      await this.logMessageTimelineEventOnce({
        orgId,
        messageId: updated.id,
        action,
        errorMessage: input.errorMessage ?? updated.errorMessage ?? null,
      })
    }
    return updated
  }

  async markConversationResolved(orgId: string, conversationId: string) {
    this.logTransition('whatsapp.resolve', { orgId, conversationId, status: 'RESOLVED' })
    return this.prisma.whatsAppConversation.updateMany({ where: { id: conversationId, orgId }, data: { status: WhatsAppConversationStatus.RESOLVED } })
  }

  async markConversationPending(orgId: string, conversationId: string) {
    return this.prisma.whatsAppConversation.updateMany({ where: { id: conversationId, orgId }, data: { status: WhatsAppConversationStatus.WAITING_OPERATOR } })
  }

  async updateConversationStatus(orgId: string, conversationId: string, status: WhatsAppConversationStatus) {
    return this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, orgId },
      data: { status },
    })
  }

  async retryFailedMessage(orgId: string, messageId: string) {
    const message = await this.prisma.whatsAppMessage.findFirst({ where: { id: messageId, orgId } })
    if (!message) throw new BadRequestException('Mensagem não encontrada')
    if (message.status !== 'FAILED') {
      throw new BadRequestException('Apenas mensagens com status FAILED podem ser reenviadas')
    }

    await this.prisma.whatsAppMessage.updateMany({ where: { id: messageId, orgId }, data: { status: 'QUEUED', failedAt: null, errorMessage: null, errorCode: null } })
    await this.queueService.addJob(QUEUE_NAMES.WHATSAPP, WHATSAPP_QUEUE_JOB_NAMES.DISPATCH_MESSAGE, { messageId, orgId, requestId: this.requestContext.requestId, userId: this.requestContext.userId }, { jobId: `whatsapp:dispatch:retry:${messageId}` })
    this.waMetrics.incQueuedJobs()
    await this.logMessageTimelineEventOnce({
      orgId,
      messageId,
      action: 'MESSAGE_RETRY_REQUESTED',
      errorMessage: message.errorMessage ?? null,
    })
    return { ok: true, messageId }
  }

  async processInboundWebhook(providerName: string, payload: unknown, options: { orgId?: string | null; traceId?: string | null; webhookEventId?: string | null } = {}) {
    const startedAt = Date.now()
    const provider = createWhatsAppProvider()
    if (provider.getProviderName() !== providerName) {
      throw new BadRequestException(`provider inválido: esperado ${provider.getProviderName()}, recebido ${providerName}`)
    }

    const parsed = provider.parseWebhook(payload)
    if (!Array.isArray(parsed)) throw new BadRequestException('payload de webhook inválido')
    if (parsed.length === 0) throw new BadRequestException('payload de webhook sem mensagens processáveis')

    const results: any[] = []
    for (const item of parsed) {
      this.validateParsedWebhookMessage(item)
      if (item.eventType === 'MESSAGE_RECEIVED') {
        results.push(await this.processInboundMessage(providerName, item, options))
      } else {
        results.push(await this.processProviderMessageStatus(providerName, item, options))
      }
    }

    const durationMs = Date.now() - startedAt
    this.waMetrics.observeProcessingDuration(durationMs)
    this.logger.log(JSON.stringify({
      action: 'whatsapp.webhook.processed',
      provider: providerName,
      orgId: options.orgId ?? null,
      traceId: options.traceId ?? null,
      webhookEventId: options.webhookEventId ?? null,
      processed: results.length,
      durationMs,
    }))

    return { provider: providerName, processed: results.length, results, durationMs }
  }

  private validateParsedWebhookMessage(item: ParsedWebhookMessage) {
    const validEvents = new Set(['MESSAGE_RECEIVED', 'MESSAGE_DELIVERED', 'MESSAGE_READ', 'MESSAGE_FAILED'])
    if (!item || typeof item !== 'object') throw new BadRequestException('mensagem de webhook inválida')
    if (!validEvents.has(item.eventType)) throw new BadRequestException(`tipo de evento WhatsApp inválido: ${(item as any).eventType}`)
    if (item.eventType === 'MESSAGE_RECEIVED' && !normalizePhone(item.fromPhone)) {
      throw new BadRequestException('mensagem recebida sem telefone de origem válido')
    }
    if (item.eventType !== 'MESSAGE_RECEIVED' && !item.providerMessageId) {
      throw new BadRequestException('evento de status sem providerMessageId')
    }
  }

  private async processProviderMessageStatus(providerName: string, item: ParsedWebhookMessage, options: { orgId?: string | null; traceId?: string | null; webhookEventId?: string | null }) {
    const status = item.eventType === 'MESSAGE_DELIVERED'
      ? 'DELIVERED'
      : item.eventType === 'MESSAGE_READ'
        ? 'READ'
        : item.eventType === 'MESSAGE_FAILED'
          ? 'FAILED'
          : null

    if (!status || !item.providerMessageId) {
      return { associated: false, reason: 'status_not_supported', eventType: item.eventType }
    }

    const existing = await this.prisma.whatsAppMessage.findFirst({
      where: {
        providerMessageId: item.providerMessageId,
        orgId: options.orgId ?? undefined,
      },
    })

    if (!existing) {
      this.waMetrics.incFailedWebhook()
      this.logger.warn(JSON.stringify({
        action: 'whatsapp.webhook.status_unmatched',
        provider: providerName,
        orgId: options.orgId ?? null,
        traceId: options.traceId ?? null,
        providerMessageId: item.providerMessageId,
        eventType: item.eventType,
      }))
      return { associated: false, reason: 'message_not_found', providerMessageId: item.providerMessageId, eventType: item.eventType }
    }

    await this.updateMessageStatus(existing.orgId, {
      id: existing.id,
      status: status as WhatsAppMessageStatus,
      errorMessage: item.content ?? undefined,
    })

    return { associated: true, orgId: existing.orgId, updatedMessageId: existing.id, eventType: item.eventType }
  }

  private async processInboundMessage(providerName: string, item: ParsedWebhookMessage, options: { orgId?: string | null; traceId?: string | null; webhookEventId?: string | null }) {
    const orgId = options.orgId?.trim()
    if (!orgId) throw new BadRequestException('orgId é obrigatório para webhook WhatsApp')

    const phone = normalizePhone(item.fromPhone)
    if (!phone) throw new BadRequestException('telefone de origem inválido')

    const duplicated = item.providerMessageId
      ? await this.prisma.whatsAppMessage.findFirst({ where: { orgId, providerMessageId: item.providerMessageId } })
      : null
    if (duplicated) {
      await this.logMessageTimelineEventOnce({ orgId, messageId: duplicated.id, action: 'MESSAGE_RECEIVED' })
      return { associated: true, orgId, customerId: duplicated.customerId ?? null, messageId: duplicated.id, duplicated: true }
    }

    const customer = await this.prisma.customer.findFirst({
      where: { orgId, phone },
      select: { id: true, orgId: true, phone: true },
    })

    const resolution = await this.resolveOperationalContext(orgId, customer?.id ?? null)
    const conversation = await this.resolveOrCreateConversation(orgId, customer?.id ?? null, customer?.phone ?? phone, {
      contextType: resolution.contextType,
      contextId: resolution.contextId,
    })

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        orgId,
        conversationId: conversation.id,
        customerId: customer?.id ?? null,
        direction: 'INBOUND',
        entityType: resolution.entityType,
        entityId: resolution.entityId ?? conversation.id,
        messageType: 'MANUAL',
        toPhone: normalizePhone(item.toPhone) ?? conversation.phone,
        fromPhone: phone,
        renderedText: item.content ?? '',
        content: item.content ?? '',
        status: 'DELIVERED',
        provider: providerName,
        providerMessageId: item.providerMessageId,
        metadata: {
          ...(item.metadata ?? {}),
          traceId: options.traceId ?? null,
          webhookEventId: options.webhookEventId ?? null,
          resolvedContext: resolution,
        } as Prisma.InputJsonValue,
        deliveredAt: item.timestamp ?? new Date(),
      },
    })

    await this.touchConversation(conversation.id, {
      unreadCountIncrement: 1,
      lastMessageAt: message.createdAt,
      lastInboundAt: message.createdAt,
      waitingSince: message.createdAt,
      status: WhatsAppConversationStatus.WAITING_OPERATOR,
    })
    this.logTransition('whatsapp.inbound', { orgId, provider: providerName, traceId: options.traceId ?? null, conversationId: conversation.id, messageId: message.id, status: 'WAITING_OPERATOR' })

    await this.logMessageTimelineEventOnce({ orgId, messageId: message.id, action: 'MESSAGE_RECEIVED' })

    const intelligence = await this.applyOperationalIntelligence({
      orgId,
      conversationId: conversation.id,
      messageId: message.id,
      content: item.content ?? '',
      resolution,
      lastInboundAt: message.createdAt,
      lastOutboundAt: conversation.lastOutboundAt ?? null,
      status: WhatsAppConversationStatus.WAITING_OPERATOR,
    })

    this.tenantOps.increment(orgId, 'whatsapp_inbound')
    this.waMetrics.incInbound()
    return { associated: true, orgId, customerId: customer?.id ?? null, messageId: message.id, conversationId: conversation.id, context: resolution, intelligence }
  }

  private async resolveOperationalContext(orgId: string, customerId: string | null) {
    if (!customerId) {
      return {
        contextType: 'GENERAL' as WhatsAppContextType,
        entityType: 'GENERAL' as WhatsAppEntityType,
        contextId: null,
        entityId: null,
        customerId: null,
        chargeId: null,
        appointmentId: null,
        serviceOrderId: null,
      }
    }

    const [openCharge, nextAppointment, activeServiceOrder] = await Promise.all([
      this.prisma.charge.findFirst({
        where: { orgId, customerId, status: { in: ['OVERDUE', 'PENDING'] } },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        select: { id: true, status: true, dueDate: true },
      }),
      this.prisma.appointment.findFirst({
        where: { orgId, customerId, startsAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true },
      }),
      this.prisma.serviceOrder.findFirst({
        where: { orgId, customerId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, status: true },
      }),
    ])

    const contextType = openCharge ? 'CHARGE' : nextAppointment ? 'APPOINTMENT' : activeServiceOrder ? 'SERVICE_ORDER' : 'GENERAL'
    const contextId = openCharge?.id ?? nextAppointment?.id ?? activeServiceOrder?.id ?? null

    return {
      contextType: contextType as WhatsAppContextType,
      entityType: contextType as WhatsAppEntityType,
      contextId,
      entityId: contextId ?? customerId,
      customerId,
      chargeId: openCharge?.id ?? null,
      chargeStatus: openCharge?.status ?? null,
      chargeDueDate: openCharge?.dueDate ?? null,
      appointmentId: nextAppointment?.id ?? null,
      appointmentStartsAt: nextAppointment?.startsAt ?? null,
      serviceOrderId: activeServiceOrder?.id ?? null,
      serviceOrderStatus: activeServiceOrder?.status ?? null,
    }
  }

  private calculateInboxPriority(item: { status: WhatsAppConversationStatus; lastInboundAt: Date | null; lastOutboundAt: Date | null; updatedAt: Date }, signals: { hasPendingCharge: boolean; hasOverdueCharge: boolean; failedMessageCount: number }): WhatsAppConversationPriority {
    const hasNoResponse = Boolean(item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt))
    if (item.status === WhatsAppConversationStatus.RESOLVED) return 'LOW'
    if ((signals.hasOverdueCharge && hasNoResponse) || item.status === WhatsAppConversationStatus.FAILED || signals.failedMessageCount >= 2) return 'CRITICAL'
    if (signals.hasPendingCharge || hasNoResponse) return 'HIGH'
    return 'NORMAL'
  }

  private resolveNextAction(input: { failedMessageCount: number; hasPendingCharge: boolean; hasUpcomingAppointment: boolean; hasActiveServiceOrder: boolean }) {
    if (input.failedMessageCount > 0) return 'RETRY_MESSAGE'
    if (input.hasPendingCharge) return 'SEND_PAYMENT_REMINDER'
    if (input.hasUpcomingAppointment) return 'CONFIRM_APPOINTMENT'
    if (input.hasActiveServiceOrder) return 'SEND_SERVICE_UPDATE'
    return 'SEND_SERVICE_UPDATE'
  }

  async buildConversationFromCustomer(orgId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { orgId, id: customerId } })
    if (!customer) throw new BadRequestException('Cliente não encontrado')

    return this.resolveOrCreateConversation(orgId, customer.id, customer.phone, {
      contextType: 'CUSTOMER',
      contextId: customer.id,
    })
  }

  async resolveOrCreateConversation(
    orgId: string,
    customerId: string | null,
    phone: string,
    context: { contextType?: WhatsAppContextType | WhatsAppEntityType | string; contextId?: string | null },
  ) {
    const normalizedContextType = this.toContextType(context.contextType)

    const normalizedPhone = normalizePhone(phone)

    const existing = await this.prisma.whatsAppConversation.findFirst({
      where: {
        orgId,
        OR: [
          customerId ? { customerId } : undefined,
          normalizedPhone ? { phone: normalizedPhone } : undefined,
        ].filter(Boolean) as Prisma.WhatsAppConversationWhereInput[],
      },
      orderBy: { updatedAt: 'desc' },
    })

    if (existing) return existing

    return this.prisma.whatsAppConversation.create({
      data: {
        orgId,
        customerId,
        phone: normalizedPhone ?? phone,
        title: null,
        contextType: normalizedContextType,
        contextId: context.contextId ?? null,
        status: WhatsAppConversationStatus.WAITING_OPERATOR,
        priority: 'NORMAL',
      },
    })
  }

  // Compat methods used elsewhere
  async findById(id: string, orgId?: string) {
    return this.prisma.whatsAppMessage.findFirst({ where: { id, orgId: orgId ?? undefined } })
  }

  async getMessagesFeed(params: { orgId: string; customerId: string; limit?: number; cursor?: string }) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({ where: { orgId: params.orgId, customerId: params.customerId } })
    if (!conversation) return { items: [], nextCursor: null }
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)

    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { orgId: params.orgId, conversationId: conversation.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      take: limit + 1,
    })
    const hasMore = rows.length > limit
    const sliced = hasMore ? rows.slice(0, limit) : rows
    return { items: sliced, nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null }
  }

  async queueMessage(input: {
    orgId: string
    customerId: string
    toPhone: string
    entityType: WhatsAppEntityType
    entityId: string
    messageType: WhatsAppMessageType
    messageKey: string
    renderedText: string
  }) {
    return this.enqueueMessage(input.orgId, {
      ...input,
      content: input.renderedText,
      conversationId: null,
    })
  }

  async claimMessageForDispatch(params: {
    id: string
    orgId: string
    workerId: string
  }) {
    const id = String(params.id ?? '').trim()
    const orgId = String(params.orgId ?? '').trim()
    const workerId = String(params.workerId ?? '').trim()

    if (!id) throw new BadRequestException('id é obrigatório para claim de WhatsApp')
    if (!orgId) throw new BadRequestException('orgId é obrigatório para claim de WhatsApp')
    if (!workerId) throw new BadRequestException('workerId é obrigatório para claim de WhatsApp')

    const lockTimeoutMinutes = Number.isFinite(WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES)
      ? Math.max(1, Math.floor(WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES))
      : 5

    const claimed = await this.prisma.$queryRaw<
      Prisma.WhatsAppMessageGetPayload<{}>[]
    >(Prisma.sql`
      UPDATE "WhatsAppMessage"
      SET
        status = 'SENDING'::"WhatsAppMessageStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "updatedAt" = NOW(),
        "failedAt" = NULL
      WHERE id = ${id}
        AND "orgId" = ${orgId}
        AND (
          (
            status = 'QUEUED'::"WhatsAppMessageStatus"
            AND (
              "lockedAt" IS NULL
              OR "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
            )
          )
          OR (
            status = 'SENDING'::"WhatsAppMessageStatus"
            AND "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
          )
        )
      RETURNING *
    `)

    return claimed[0] ?? null
  }

  async claimQueued(params: { limit?: number; workerId: string }) {
    const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 100)
    const workerId = params.workerId.trim()

    if (!workerId) {
      throw new BadRequestException('workerId é obrigatório para claim de WhatsApp')
    }

    const lockTimeoutMinutes = Number.isFinite(WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES)
      ? Math.max(1, Math.floor(WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES))
      : 5

    return this.prisma.$queryRaw<Prisma.WhatsAppMessageGetPayload<{}>[]>(Prisma.sql`
      WITH picked AS (
        SELECT id
        FROM "WhatsAppMessage"
        WHERE (
          status = 'QUEUED'::"WhatsAppMessageStatus"
          AND (
            "lockedAt" IS NULL
            OR "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
          )
        ) OR (
          status = 'SENDING'::"WhatsAppMessageStatus"
          AND "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
        )
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "WhatsAppMessage" AS m
      SET
        status = 'SENDING'::"WhatsAppMessageStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "updatedAt" = NOW(),
        "failedAt" = NULL
      FROM picked
      WHERE m.id = picked.id
      RETURNING m.*
    `)
  }

  async markSent(params: {
    id: string
    orgId: string
    workerId: string
    provider: string
    providerMessageId: string
  }) {
    const updatedRows = await this.prisma.$queryRaw<
      Prisma.WhatsAppMessageGetPayload<{}>[]
    >(Prisma.sql`
      UPDATE "WhatsAppMessage"
      SET
        status = 'SENT'::"WhatsAppMessageStatus",
        provider = ${params.provider},
        "providerMessageId" = ${params.providerMessageId},
        "sentAt" = NOW(),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "errorCode" = NULL,
        "errorMessage" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${params.id}
        AND "orgId" = ${params.orgId}
        AND status = 'SENDING'::"WhatsAppMessageStatus"
        AND "lockedBy" = ${params.workerId}
      RETURNING *
    `)

    const updated = updatedRows[0] ?? null
    if (!updated) return null

    await this.logMessageTimelineEventOnce({
      orgId: updated.orgId,
      messageId: updated.id,
      action: 'MESSAGE_SENT',
    })

    const byTypeAction = this.getMessageTypeTimelineAction(updated.messageType)
    if (byTypeAction) {
      await this.logMessageTimelineEventOnce({
        orgId: updated.orgId,
        messageId: updated.id,
        action: byTypeAction,
      })
    }

    return updated
  }

  async markFailedTerminal(params: {
    id: string
    orgId: string
    workerId: string
    provider: string
    errorCode: string
    errorMessage: string
  }) {
    const updatedRows = await this.prisma.$queryRaw<
      Prisma.WhatsAppMessageGetPayload<{}>[]
    >(Prisma.sql`
      UPDATE "WhatsAppMessage"
      SET
        status = 'FAILED'::"WhatsAppMessageStatus",
        provider = ${params.provider},
        "errorCode" = ${params.errorCode},
        "errorMessage" = ${params.errorMessage},
        "failedAt" = NOW(),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${params.id}
        AND "orgId" = ${params.orgId}
        AND status = 'SENDING'::"WhatsAppMessageStatus"
        AND "lockedBy" = ${params.workerId}
      RETURNING *
    `)

    const updated = updatedRows[0] ?? null
    if (!updated) return null

    await this.logMessageTimelineEventOnce({
      orgId: updated.orgId,
      messageId: updated.id,
      action: 'MESSAGE_FAILED',
      errorMessage: updated.errorMessage ?? params.errorMessage,
    })

    return updated
  }

  async markFailedAndRequeue(params: {
    id: string
    orgId: string
    workerId: string
    provider: string
    errorCode: string
    errorMessage: string
  }) {
    const updatedRows = await this.prisma.$queryRaw<
      Prisma.WhatsAppMessageGetPayload<{}>[]
    >(Prisma.sql`
      UPDATE "WhatsAppMessage"
      SET
        status = 'QUEUED'::"WhatsAppMessageStatus",
        provider = ${params.provider},
        "errorCode" = ${params.errorCode},
        "errorMessage" = ${params.errorMessage},
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${params.id}
        AND "orgId" = ${params.orgId}
        AND status = 'SENDING'::"WhatsAppMessageStatus"
        AND "lockedBy" = ${params.workerId}
      RETURNING *
    `)

    return updatedRows[0] ?? null
  }

  async listWebhookEvents(orgId: string, filters: {
    provider?: string
    status?: WhatsAppWebhookStatus
    traceId?: string
    providerMessageId?: string
    createdAtFrom?: string
    createdAtTo?: string
    limit?: number
    cursor?: string
  } = {}) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const where: Prisma.WhatsAppWebhookEventWhereInput = {
      orgId,
      provider: filters.provider?.trim() || undefined,
      status: filters.status,
      traceId: filters.traceId?.trim() || undefined,
      providerMessageId: filters.providerMessageId?.trim() || undefined,
    }
    if (filters.createdAtFrom || filters.createdAtTo) {
      where.createdAt = {
        gte: filters.createdAtFrom ? new Date(filters.createdAtFrom) : undefined,
        lte: filters.createdAtTo ? new Date(filters.createdAtTo) : undefined,
      }
    }
    const take = Math.min(Math.max(Number(filters.limit ?? 50), 1), 100)
    const items = await this.prisma.whatsAppWebhookEvent.findMany({
      where,
      take: take + 1,
      skip: filters.cursor ? 1 : 0,
      cursor: filters.cursor ? { id: filters.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orgId: true,
        provider: true,
        eventType: true,
        status: true,
        retryAttempts: true,
        errorMessage: true,
        processedAt: true,
        traceId: true,
        providerMessageId: true,
        payload: true,
        createdAt: true,
      },
    })
    const hasMore = items.length > take
    const page = hasMore ? items.slice(0, take) : items
    return {
      items: page.map((event) => this.toWebhookEventSummary(event)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    }
  }

  async getWebhookEventDetail(orgId: string, id: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const event = await this.prisma.whatsAppWebhookEvent.findFirst({ where: { id, orgId } })
    if (!event) throw new NotFoundException('webhook WhatsApp não encontrado')
    return this.toWebhookEventDetail(event)
  }

  async replayWebhookEvents(orgId: string, input: { ids: string[]; force?: boolean; requestedBy?: string | null }) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const ids = Array.from(new Set((input.ids ?? []).map((id) => String(id).trim()).filter(Boolean)))
    if (ids.length === 0) throw new BadRequestException('ids é obrigatório')

    const events = await this.prisma.whatsAppWebhookEvent.findMany({ where: { id: { in: ids }, orgId } })
    const foundIds = new Set(events.map((event) => event.id))
    const missingIds = ids.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) throw new NotFoundException(`webhook WhatsApp não encontrado: ${missingIds.join(',')}`)

    const blocked = events.filter((event) => event.status !== 'FAILED' && !input.force)
    if (blocked.length > 0) {
      const processed = blocked.find((event) => event.status === 'PROCESSED')
      if (processed) throw new BadRequestException('webhooks PROCESSED exigem force=true para replay')
      throw new BadRequestException('apenas webhooks FAILED podem ser reenfileirados sem force=true')
    }

    const replayed: any[] = []
    for (const event of events) {
      if (!event.orgId?.trim()) throw new BadRequestException(`webhook ${event.id} sem orgId não pode ser reenfileirado`)
      const replayAttemptId = `replay-${randomUUID()}`
      const job = await this.enqueueInboundWebhook({
        webhookEventId: event.id,
        orgId: event.orgId,
        provider: event.provider,
        traceId: event.traceId ?? replayAttemptId,
        receivedAt: event.createdAt,
        replayAttemptId,
      })
      this.logger.log(JSON.stringify({
        action: 'whatsapp.inbound_webhook.replay_requested',
        webhookEventId: event.id,
        orgId: event.orgId,
        provider: event.provider,
        traceId: event.traceId ?? null,
        replayAttemptId,
        force: Boolean(input.force),
        requestedBy: input.requestedBy ?? null,
        jobId: job.id?.toString() ?? null,
      }))
      replayed.push({ webhookEventId: event.id, status: event.status, replayAttemptId, jobId: job.id?.toString() ?? null })
    }

    return { ok: true, requested: ids.length, replayed }
  }

  async getWebhookDlqStats(orgId: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const [failedCount, oldestFailed, failedByProvider, failedByOrg, retryAttemptsSummary] = await Promise.all([
      this.prisma.whatsAppWebhookEvent.count({ where: { orgId, status: 'FAILED' } }),
      this.prisma.whatsAppWebhookEvent.findFirst({ where: { orgId, status: 'FAILED' }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } }),
      this.prisma.whatsAppWebhookEvent.groupBy({ by: ['provider'], where: { orgId, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.whatsAppWebhookEvent.groupBy({ by: ['orgId'], where: { orgId, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.whatsAppWebhookEvent.aggregate({ where: { orgId, status: 'FAILED' }, _avg: { retryAttempts: true }, _max: { retryAttempts: true }, _min: { retryAttempts: true } }),
    ])
    const now = Date.now()
    return {
      failedCount,
      oldestFailedEvent: oldestFailed ? { id: oldestFailed.id, createdAt: oldestFailed.createdAt, ageMs: now - oldestFailed.createdAt.getTime() } : null,
      failedByProvider: failedByProvider.map((item) => ({ provider: item.provider, count: item._count._all })),
      failedByOrg: failedByOrg.map((item) => ({ orgId: item.orgId, count: item._count._all })),
      retryAttempts: {
        min: retryAttemptsSummary._min.retryAttempts ?? 0,
        max: retryAttemptsSummary._max.retryAttempts ?? 0,
        avg: retryAttemptsSummary._avg.retryAttempts ?? 0,
      },
    }
  }

  async createWebhookEvent(input: { provider: string; eventType: string; payload: Prisma.InputJsonValue; orgId?: string | null; traceId?: string | null }) {
    const providerMessageId = this.extractProviderMessageId(input.payload)
    return this.prisma.whatsAppWebhookEvent.create({
      data: {
        orgId: input.orgId ?? null,
        provider: input.provider,
        eventType: input.eventType,
        payload: input.payload,
        traceId: input.traceId ?? null,
        providerMessageId,
        status: 'RECEIVED',
      },
    })
  }


  async enqueueInboundWebhook(input: {
    webhookEventId: string
    orgId: string
    provider: string
    traceId: string
    receivedAt: Date | string
    replayAttemptId?: string | null
  }) {
    if (!input.orgId?.trim()) throw new BadRequestException('orgId é obrigatório para webhook WhatsApp')

    const receivedAt = input.receivedAt instanceof Date ? input.receivedAt : new Date(input.receivedAt)
    const payload = {
      webhookEventId: input.webhookEventId,
      orgId: input.orgId,
      provider: input.provider,
      traceId: input.traceId,
      receivedAt: receivedAt.toISOString(),
    }

    const job = await this.queueService.addJob(
      QUEUE_NAMES.WHATSAPP,
      WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
      payload,
      { jobId: input.replayAttemptId ? `whatsapp:inbound-webhook:${input.webhookEventId}:${input.replayAttemptId}` : `whatsapp:inbound-webhook:${input.webhookEventId}` },
    )

    this.waMetrics.incInboundWebhookQueued()
    this.logger.log(JSON.stringify({
      action: 'whatsapp.inbound_webhook.job_queued',
      queue: QUEUE_NAMES.WHATSAPP,
      jobName: WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
      jobId: job.id?.toString() ?? null,
      webhookEventId: input.webhookEventId,
      orgId: input.orgId,
      provider: input.provider,
      traceId: input.traceId,
      receivedAt: payload.receivedAt,
      replayAttemptId: input.replayAttemptId ?? null,
    }))

    return job
  }

  async processPersistedInboundWebhook(input: {
    webhookEventId: string
    orgId: string
    provider: string
    traceId?: string | null
    receivedAt?: Date | string | null
  }) {
    const event = await this.prisma.whatsAppWebhookEvent.findFirst({
      where: { id: input.webhookEventId, orgId: input.orgId, provider: input.provider },
    })
    if (!event) throw new BadRequestException('webhook WhatsApp persistido não encontrado')
    if (event.status === 'PROCESSED') {
      return { provider: input.provider, processed: 0, results: [], skipped: true, reason: 'already_processed', durationMs: 0 }
    }

    await this.prisma.whatsAppWebhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', errorMessage: null },
    })

    const result = await this.processInboundWebhook(input.provider, event.payload, {
      orgId: event.orgId ?? input.orgId,
      traceId: input.traceId ?? null,
      webhookEventId: event.id,
    })

    await this.completeWebhookEvent(event.id, {
      status: 'PROCESSED',
      orgId: result.results?.find((item: any) => item.orgId)?.orgId ?? event.orgId ?? input.orgId,
    })

    return result
  }

  async recordWebhookEventAttempt(id: string, errorMessage: string) {
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id },
      data: {
        retryAttempts: { increment: 1 },
        errorMessage,
      },
    })
  }

  async deadLetterWebhookEvent(input: { id: string; orgId: string; errorMessage: string; attemptsMade: number }) {
    const errorMessage = `dead_letter after ${input.attemptsMade} attempts: ${input.errorMessage}`
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id: input.id },
      data: {
        status: 'FAILED',
        orgId: input.orgId,
        errorMessage,
        retryAttempts: input.attemptsMade,
        processedAt: new Date(),
      },
    })
  }

  async completeWebhookEvent(id: string, data: { status: 'PROCESSED' | 'FAILED'; orgId?: string | null; errorMessage?: string | null }) {
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id },
      data: {
        status: data.status,
        orgId: data.orgId ?? undefined,
        errorMessage: data.errorMessage ?? null,
        processedAt: data.status === 'PROCESSED' ? new Date() : undefined,
      },
    })
  }

  private toWebhookEventSummary(event: any) {
    return {
      id: event.id,
      orgId: event.orgId,
      provider: event.provider,
      eventType: event.eventType,
      status: event.status,
      retryAttempts: event.retryAttempts,
      errorMessage: event.errorMessage,
      processedAt: event.processedAt,
      traceId: event.traceId,
      providerMessageId: event.providerMessageId ?? this.extractProviderMessageId(event.payload),
      createdAt: event.createdAt,
      payloadMetadata: this.buildPayloadMetadata(event.payload),
    }
  }

  private toWebhookEventDetail(event: any) {
    return {
      ...this.toWebhookEventSummary(event),
      rawPayloadMetadata: this.buildPayloadMetadata(event.payload),
    }
  }

  private buildPayloadMetadata(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      return { shape: typeof payload, topLevelKeys: [], providerMessageIds: [] }
    }
    const topLevelKeys = Object.keys(payload as Record<string, unknown>).sort()
    const providerMessageIds = this.extractProviderMessageIds(payload)
    return {
      shape: Array.isArray(payload) ? 'array' : 'object',
      topLevelKeys,
      providerMessageIds,
      approxBytes: Buffer.byteLength(JSON.stringify(payload)),
    }
  }

  private extractProviderMessageId(payload: unknown) {
    return this.extractProviderMessageIds(payload)[0] ?? null
  }

  private extractProviderMessageIds(payload: unknown) {
    const ids = new Set<string>()
    const visit = (value: unknown, depth: number) => {
      if (depth > 8 || value == null) return
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1)
        return
      }
      if (typeof value !== 'object') return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (['providerMessageId', 'messageId', 'wamid'].includes(key) && typeof child === 'string' && child.trim()) {
          ids.add(child.trim())
        }
        visit(child, depth + 1)
      }
    }
    visit(payload, 0)
    return Array.from(ids)
  }

  private toContextType(value: string | undefined): WhatsAppContextType {
    const raw = String(value ?? 'GENERAL').toUpperCase()
    if (raw in {
      CUSTOMER: 1,
      APPOINTMENT: 1,
      SERVICE_ORDER: 1,
      CHARGE: 1,
      PAYMENT: 1,
      GENERAL: 1,
    }) return raw as WhatsAppContextType
    return 'GENERAL'
  }

  private async touchConversation(
    conversationId: string,
    input: { unreadCountIncrement?: number; lastMessageAt?: Date; lastInboundAt?: Date; lastOutboundAt?: Date; waitingSince?: Date | null; responseDueAt?: Date | null; slaStatus?: 'OK' | 'WARNING' | 'BREACHED'; status?: WhatsAppConversationStatus; lastEventTimestamp?: Date },
  ) {
    await this.prisma.whatsAppConversation.updateMany({
      where: { id: conversationId, ...(input.lastEventTimestamp ? { updatedAt: { lt: input.lastEventTimestamp } } : {}) },
      data: {
        unreadCount: input.unreadCountIncrement ? { increment: input.unreadCountIncrement } : undefined,
        lastMessageAt: input.lastMessageAt,
        lastInboundAt: input.lastInboundAt,
        lastOutboundAt: input.lastOutboundAt,
        waitingSince: input.waitingSince,
        responseDueAt: input.responseDueAt,
        slaStatus: input.slaStatus,
        status: input.status,
      },
    })
  }


  private async applyOperationalIntelligence(input: {
    orgId: string
    conversationId: string
    messageId: string
    content: string
    resolution: OperationalContextSnapshot
    lastInboundAt: Date
    lastOutboundAt: Date | null
    status: WhatsAppConversationStatus
  }) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: input.conversationId, orgId: input.orgId },
    })
    if (!conversation) return null

    const [failedMessageCount, repeatedInboundWithoutResponse] = await Promise.all([
      this.prisma.whatsAppMessage.count({ where: { orgId: input.orgId, conversationId: input.conversationId, status: 'FAILED' } }),
      this.prisma.whatsAppMessage.count({
        where: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          direction: 'INBOUND',
          createdAt: input.lastOutboundAt ? { gt: input.lastOutboundAt } : undefined,
        },
      }),
    ])

    const context: OperationalContextSnapshot = {
      ...input.resolution,
      failedMessageCount,
      repeatedInboundWithoutResponse,
    }
    const engine = this.intelligenceService ?? new WhatsAppIntelligenceService()
    const decision = engine.evaluate({
      content: input.content,
      status: input.status,
      lastInboundAt: input.lastInboundAt,
      lastOutboundAt: input.lastOutboundAt,
      context,
    })

    await this.prisma.whatsAppConversation.updateMany({
      where: { id: input.conversationId, orgId: input.orgId },
      data: {
        priority: decision.priority.priority,
        priorityReason: decision.priority.reason,
        intent: decision.intent.intent,
        intentReason: decision.intent.reason,
        intentConfidence: decision.intent.confidence,
        waitingSince: decision.sla.waitingSince,
        responseDueAt: decision.sla.responseDueAt,
        slaStatus: decision.sla.slaStatus,
        suggestedActions: decision.suggestedActions as unknown as Prisma.InputJsonValue,
        intelligenceExplanation: decision.explanation as unknown as Prisma.InputJsonValue,
        intelligenceVersion: decision.explanation.version,
      },
    })

    await this.emitIntelligenceTimelineEvents({
      orgId: input.orgId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      customerId: conversation.customerId ?? null,
      context,
      previous: conversation,
      decision,
    })

    return decision
  }

  private async emitIntelligenceTimelineEvents(input: {
    orgId: string
    conversationId: string
    messageId: string
    customerId: string | null
    context: OperationalContextSnapshot
    previous: { intent?: string | null; priority?: string | null; slaStatus?: string | null }
    decision: any
  }) {
    const base = {
      conversationId: input.conversationId,
      messageId: input.messageId,
      intelligenceVersion: input.decision.explanation?.version ?? 1,
    }

    await this.logConversationTimelineEventOnce({
      orgId: input.orgId,
      action: 'WHATSAPP_INTENT_DETECTED',
      conversationId: input.conversationId,
      dedupeKey: `intent:${input.messageId}:${input.decision.intent.intent}`,
      customerId: input.customerId,
      context: input.context,
      metadata: {
        ...base,
        intent: input.decision.intent.intent,
        reason: input.decision.intent.reason,
        confidence: input.decision.intent.confidence,
        matchedTerms: input.decision.intent.matchedTerms,
      },
    })

    if (input.previous.priority !== input.decision.priority.priority) {
      await this.logConversationTimelineEventOnce({
        orgId: input.orgId,
        action: 'WHATSAPP_PRIORITY_UPDATED',
        conversationId: input.conversationId,
        dedupeKey: `priority:${input.conversationId}:${input.decision.priority.priority}:${input.messageId}`,
        customerId: input.customerId,
        context: input.context,
        metadata: {
          ...base,
          previousPriority: input.previous.priority ?? null,
          priority: input.decision.priority.priority,
          score: input.decision.priority.score,
          factors: input.decision.priority.factors,
          reason: input.decision.priority.reason,
        },
      })
    }

    if (input.decision.sla.slaStatus === 'BREACHED') {
      await this.logConversationTimelineEventOnce({
        orgId: input.orgId,
        action: 'WHATSAPP_SLA_BREACHED',
        conversationId: input.conversationId,
        dedupeKey: `sla:${input.conversationId}:${input.decision.sla.responseDueAt?.toISOString?.() ?? 'none'}`,
        customerId: input.customerId,
        context: input.context,
        metadata: {
          ...base,
          slaStatus: input.decision.sla.slaStatus,
          waitingSince: input.decision.sla.waitingSince?.toISOString?.() ?? null,
          responseDueAt: input.decision.sla.responseDueAt?.toISOString?.() ?? null,
          reason: input.decision.sla.reason,
        },
      })
    }

    for (const suggestion of input.decision.suggestedActions ?? []) {
      await this.logConversationTimelineEventOnce({
        orgId: input.orgId,
        action: 'WHATSAPP_ACTION_SUGGESTED',
        conversationId: input.conversationId,
        dedupeKey: `suggestion:${input.conversationId}:${suggestion.action}:${suggestion.relatedEntity?.entityId ?? 'none'}`,
        customerId: input.customerId,
        context: input.context,
        metadata: {
          ...base,
          action: suggestion.action,
          label: suggestion.label,
          reason: suggestion.reason,
          confidence: suggestion.confidence,
          priority: suggestion.priority,
          relatedEntity: suggestion.relatedEntity,
        },
      })
    }
  }

  private async logConversationTimelineEventOnce(input: {
    orgId: string
    action: string
    conversationId: string
    dedupeKey: string
    customerId: string | null
    context: OperationalContextSnapshot
    metadata: Record<string, unknown>
  }) {
    const existing = await this.prisma.timelineEvent.findFirst({
      where: {
        orgId: input.orgId,
        action: input.action,
        metadata: {
          path: ['dedupeKey'],
          equals: input.dedupeKey,
        },
      },
      select: { id: true },
    })
    if (existing?.id) return null

    return this.timeline.log({
      orgId: input.orgId,
      action: input.action,
      customerId: input.customerId,
      chargeId: input.context.chargeId ?? null,
      appointmentId: input.context.appointmentId ?? null,
      serviceOrderId: input.context.serviceOrderId ?? null,
      metadata: {
        ...input.metadata,
        dedupeKey: input.dedupeKey,
        conversationId: input.conversationId,
        customerId: input.customerId,
      },
    }).catch(() => null)
  }

  private getMessageTypeTimelineAction(messageType: WhatsAppMessageType | null | undefined): string | null {
    if (messageType === 'PAYMENT_LINK') return 'PAYMENT_LINK_SENT'
    if (messageType === 'APPOINTMENT_REMINDER') return 'APPOINTMENT_REMINDER_SENT'
    if (messageType === 'SERVICE_UPDATE') return 'SERVICE_UPDATE_SENT'
    return null
  }

  private async logMessageTimelineEventOnce(input: {
    orgId: string
    messageId: string
    action: string
    errorMessage?: string | null
  }) {
    const message = await this.prisma.whatsAppMessage.findFirst({
      where: { id: input.messageId, orgId: input.orgId },
    })
    if (!message) return null

    const existing = await this.prisma.timelineEvent.findFirst({
      where: {
        orgId: input.orgId,
        action: input.action,
        metadata: {
          path: ['messageId'],
          equals: input.messageId,
        },
      },
      select: { id: true },
    })
    if (existing?.id) return null

    const communicationSignal = await buildCommunicationFailureSignal(this.prisma, {
      orgId: input.orgId,
      customerId: message.customerId ?? null,
    })

    return this.timeline.log({
      orgId: input.orgId,
      action: input.action,
      customerId: message.customerId ?? null,
      metadata: {
        messageId: message.id,
        providerMessageId: message.providerMessageId ?? null,
        messageType: message.messageType ?? null,
        errorMessage: input.errorMessage ?? message.errorMessage ?? null,
        entityType: message.entityType ?? null,
        entityId: message.entityId ?? null,
        customerId: message.customerId ?? null,
        governanceSignal: communicationSignal,
        conversationId: message.conversationId ?? null,
        direction: message.direction ?? null,
        status: message.status ?? null,
      },
    }).catch(() => null)
  }
}

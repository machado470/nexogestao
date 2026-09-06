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
import { WhatsAppConversationReadService } from './whatsapp-conversation-read.service'
import { WhatsAppWebhookService } from './whatsapp-webhook.service'

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
    private readonly conversationRead: WhatsAppConversationReadService,
    private readonly templateService?: WhatsAppTemplateService,
    private readonly contextService?: WhatsAppContextService,
    private readonly intelligenceService?: WhatsAppIntelligenceService,
    private readonly webhookService?: WhatsAppWebhookService,
  ) {}

  async listConversations(orgId: string, filters: any = {}) {
    return this.conversationRead.listConversations(orgId, filters)
  }

  async getConversation(orgId: string, conversationId: string) {
    return this.conversationRead.getConversation(orgId, conversationId)
  }

  async getMessages(orgId: string, conversationId: string) {
    return this.conversationRead.getMessages(orgId, conversationId)
  }

  async getContext(orgId: string, conversationId: string) {
    const conv = await this.getConversation(orgId, conversationId)
    if (!conv?.customerId) return null
    if (!this.contextService) return null
    const context = await this.contextService.getOperationalContext(orgId, conv.customerId)
    const intelligence = this.toConversationIntelligence(conv)
    return {
      ...context,
      intelligence,
      officialActions: this.buildOfficialConversationActions(conv, intelligence),
      governanceSignal: (conv as any).metadata?.governanceSignal ?? null,
      governanceAlert: (conv as any).metadata?.governanceSignal?.communicationFailure
        ? 'Sinal oficial de governança: falha de comunicação'
        : null,
      evaluatedAt: (intelligence.explanation as any)?.generatedAt ?? conv.updatedAt,
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

  private buildOfficialConversationActions(conversation: any, intelligence: any) {
    const suggestions = Array.isArray(intelligence.suggestedActions) ? intelligence.suggestedActions : []
    const definitions: Record<string, { key: string; group: string; groupId: string }> = {
      SEND_PAYMENT_LINK: { key: 'send-payment-link', group: 'Financeiro', groupId: 'finance' },
      CONFIRM_APPOINTMENT: { key: 'confirm-appointment', group: 'Agenda', groupId: 'agenda' },
      RESCHEDULE_APPOINTMENT: { key: 'reschedule-appointment', group: 'Agenda', groupId: 'agenda' },
      SEND_SERVICE_UPDATE: { key: 'update-service', group: 'Ordem de serviço', groupId: 'serviceOrder' },
      ESCALATE_TO_OPERATOR: { key: 'create-assisted-execution', group: 'Execução assistida', groupId: 'execution' },
      MARK_RESOLVED: { key: 'mark-resolved', group: 'Execução assistida', groupId: 'execution' },
      REPLY_WITH_TEMPLATE: { key: 'quick-template', group: 'Comunicação', groupId: 'communication' },
    }
    const evaluated = suggestions.flatMap((suggestion: any, index: number) => {
      const definition = definitions[String(suggestion?.action ?? '')]
      if (!definition) return []
      const target = suggestion.relatedEntity ?? { entityType: 'GENERAL', entityId: null }
      return [{ ...definition, action: suggestion.action, label: suggestion.label, description: suggestion.reason,
        reason: suggestion.reason, availability: index === 0 ? 'primary' : 'secondary', disabled: false, target,
        requiresHumanApproval: true, logicalKey: `whatsapp:${conversation.id}:${suggestion.action}:${target.entityId ?? 'general'}` }]
    })
    const evaluatedTypes = new Set(evaluated.map((action: any) => action.action))
    const unavailable = Object.entries(definitions).filter(([action]) => !evaluatedTypes.has(action)).map(([action, definition]) => ({
      ...definition, action, label: action.replaceAll('_', ' '), description: 'A API não disponibilizou esta ação na avaliação atual.',
      reason: 'Indisponível na avaliação oficial atual', availability: 'unavailable', disabled: true, target: null,
      requiresHumanApproval: true, logicalKey: null,
    }))
    return [...evaluated, ...unavailable, {
      key: 'attach-file', group: 'Comunicação', groupId: 'communication', action: null, label: 'Anexar arquivo',
      description: 'Capacidade futura ainda não liberada pela API.', reason: 'Em breve', availability: 'upcoming',
      disabled: true, target: null, requiresHumanApproval: false, logicalKey: null,
    }]
  }

  isQueueAvailable() { return this.queueService.isEnabled() }

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
    return this.conversationRead.findById(id, orgId)
  }

  async getMessagesFeed(params: { orgId: string; customerId: string; limit?: number; cursor?: string }) {
    return this.conversationRead.getMessagesFeed(params)
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
          AND status = 'QUEUED'::"WhatsAppMessageStatus"
          AND (
            "lockedAt" IS NULL
            OR "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
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
          WHERE status = 'QUEUED'::"WhatsAppMessageStatus"
            AND (
              "lockedAt" IS NULL
              OR "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
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

  async reconcileStaleSending(params: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 100)

    const lockTimeoutMinutes = Number.isFinite(
      WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES,
    )
      ? Math.max(1, Math.floor(WHATSAPP_MESSAGE_LOCK_TIMEOUT_MINUTES))
      : 5

    const errorCode = 'STALE_SENDING_TIMEOUT'
    const errorMessage =
      'Envio permaneceu em SENDING além do tempo de ownership; resultado externo incerto'

    return this.prisma.$transaction(async tx => {
      const updatedRows = await tx.$queryRaw<
        Prisma.WhatsAppMessageGetPayload<{}>[]
      >(Prisma.sql`
        WITH stale AS (
          SELECT id
          FROM "WhatsAppMessage"
          WHERE status = 'SENDING'::"WhatsAppMessageStatus"
            AND "lockedAt" IS NOT NULL
            AND "lockedAt" < NOW() - (${lockTimeoutMinutes}::int * INTERVAL '1 minute')
          ORDER BY "lockedAt" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "WhatsAppMessage" AS m
        SET
          status = 'UNCERTAIN'::"WhatsAppMessageStatus",
          "errorCode" = ${errorCode},
          "errorMessage" = ${errorMessage},
          "failedAt" = NULL,
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = NOW()
        FROM stale
        WHERE m.id = stale.id
          AND m.status = 'SENDING'::"WhatsAppMessageStatus"
        RETURNING m.*
      `)

      for (const updated of updatedRows) {
        const governanceSignal = await buildCommunicationFailureSignal(tx, {
          orgId: updated.orgId,
          customerId: updated.customerId ?? null,
        })

        await this.timeline.logInTransaction(
          {
            orgId: updated.orgId,
            action: 'MESSAGE_SEND_UNCERTAIN',
            customerId: updated.customerId ?? null,
            metadata: {
              messageId: updated.id,
              providerMessageId: updated.providerMessageId ?? null,
              messageType: updated.messageType ?? null,
              errorMessage: updated.errorMessage ?? errorMessage,
              entityType: updated.entityType ?? null,
              entityId: updated.entityId ?? null,
              customerId: updated.customerId ?? null,
              governanceSignal,
              conversationId: updated.conversationId ?? null,
              direction: updated.direction ?? null,
              status: updated.status ?? null,
            },
          },
          tx,
        )
      }

      return updatedRows
    })
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

  async markDeliveryUncertain(params: {
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
        status = 'UNCERTAIN'::"WhatsAppMessageStatus",
        provider = ${params.provider},
        "errorCode" = ${params.errorCode},
        "errorMessage" = ${params.errorMessage},
        "failedAt" = NULL,
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
      action: 'MESSAGE_SEND_UNCERTAIN',
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

  async listWebhookEvents(orgId: string, filters: Parameters<WhatsAppWebhookService['listWebhookEvents']>[1] = {}) {
    return this.requireWebhookService().listWebhookEvents(orgId, filters)
  }

  async getWebhookEventDetail(orgId: string, id: string) {
    return this.requireWebhookService().getWebhookEventDetail(orgId, id)
  }

  async replayWebhookEvents(orgId: string, input: { ids: string[]; force?: boolean; requestedBy?: string | null }) {
    return this.requireWebhookService().replayWebhookEvents(orgId, input)
  }

  async getWebhookDlqStats(orgId: string) {
    return this.requireWebhookService().getWebhookDlqStats(orgId)
  }

  async createWebhookEvent(input: { provider: string; eventType: string; payload: Prisma.InputJsonValue; orgId?: string | null; traceId?: string | null }) {
    return this.requireWebhookService().createWebhookEvent(input)
  }

  async enqueueInboundWebhook(input: Parameters<WhatsAppWebhookService['enqueueInboundWebhook']>[0]) {
    return this.requireWebhookService().enqueueInboundWebhook(input)
  }

  async processPersistedInboundWebhook(input: Parameters<WhatsAppWebhookService['processPersistedInboundWebhook']>[0]) {
    return this.requireWebhookService().processPersistedInboundWebhook(
      input,
      (provider, payload, options) => this.processInboundWebhook(provider, payload, options),
    )
  }

  async recordWebhookEventAttempt(id: string, errorMessage: string) {
    return this.requireWebhookService().recordWebhookEventAttempt(id, errorMessage)
  }

  async deadLetterWebhookEvent(input: { id: string; orgId: string; errorMessage: string; attemptsMade: number }) {
    return this.requireWebhookService().deadLetterWebhookEvent(input)
  }

  async completeWebhookEvent(id: string, data: { status: 'PROCESSED' | 'FAILED'; orgId?: string | null; errorMessage?: string | null }) {
    return this.requireWebhookService().completeWebhookEvent(id, data)
  }

  private requireWebhookService() {
    if (!this.webhookService) throw new BadRequestException('Serviço de webhook WhatsApp indisponível')
    return this.webhookService
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

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

const whatsappWebhookEventListInput = z.object({
  orgId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']).optional(),
  traceId: z.string().min(1).optional(),
  providerMessageId: z.string().min(1).optional(),
  createdAtFrom: z.string().min(1).optional(),
  createdAtTo: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const whatsappWebhookReplayInput = z.object({
  ids: z.array(z.string().min(1)).optional(),
  force: z.boolean().optional(),
});

function normalizeWebhookEventResponse(payload: any) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload.items)) {
    return {
      items: payload.items.map((item: any) => ({ ...item, payloadMetadata: item.payloadMetadata ?? item.rawPayloadMetadata ?? null })),
      nextCursor: payload.nextCursor ?? null,
    };
  }
  return { ...payload, payloadMetadata: payload.payloadMetadata ?? payload.rawPayloadMetadata ?? null };
}

const isoDate = z.string().datetime({ offset: true });
const nullableIsoDate = isoDate.nullable();
const id = z.string().uuid();
const conversationStatus = z.enum(['OPEN', 'WAITING_CUSTOMER', 'WAITING_OPERATOR', 'PENDING', 'RESOLVED', 'FAILED']);
const conversationPriority = z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL']);
const messageStatus = z.enum(['QUEUED', 'SENDING', 'UNCERTAIN', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELED']);
const messageDirection = z.enum(['INBOUND', 'OUTBOUND']);
const contextType = z.enum(['CUSTOMER', 'CHARGE', 'APPOINTMENT', 'SERVICE_ORDER', 'PAYMENT', 'GENERAL']);

const customerSummaryOutput = z.object({ id, name: z.string(), phone: z.string().nullable() }).strict();
const conversationOutput = z.object({
  id, customerId: id.nullable(), phone: z.string(), title: z.string().nullable(), status: conversationStatus,
  priority: conversationPriority, priorityReason: z.string().nullable(), assignedUserId: id.nullable(),
  contextType, contextId: z.string().nullable(), lastMessageAt: nullableIsoDate, lastInboundAt: nullableIsoDate,
  lastOutboundAt: nullableIsoDate, waitingSince: nullableIsoDate, responseDueAt: nullableIsoDate,
  unreadCount: z.number().int().nonnegative(), createdAt: isoDate, updatedAt: isoDate,
  customer: customerSummaryOutput.nullable(),
}).strict();
const conversationListItemOutput = conversationOutput.extend({
  inboxPosition: z.number().int().positive(), evaluatedAt: isoDate,
  ownership: z.object({ userId: id, name: z.string().nullable(), locked: z.boolean() }).strict().nullable(),
  lastMessage: nullableIsoDate, noResponseSince: nullableIsoDate, noResponseMinutes: z.number().int().nonnegative().nullable(),
  noResponseHours: z.number().nonnegative().nullable(), failedMessageCount: z.number().int().nonnegative(),
  operationalStatus: z.string(), flags: z.object({ hasPendingCharge: z.boolean(), hasNoResponse: z.boolean(), hasFailure: z.boolean() }).strict(),
}).strict();
const conversationListOutput = z.object({ items: z.array(conversationListItemOutput), nextCursor: id.nullable() }).strict();

const messageOutput = z.object({
  id, conversationId: id.nullable(), customerId: id.nullable(), direction: messageDirection,
  entityType: z.enum(["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT", "GENERAL"]),
  entityId: z.string(), messageType: z.enum([
    "APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER", "SERVICE_UPDATE", "PAYMENT_LINK", "PAYMENT_REMINDER",
    "PAYMENT_CONFIRMATION", "CUSTOMER_NOTIFICATION", "MANUAL", "REMIND_24H", "RECEIPT", "EXECUTION_CONFIRMATION",
  ]), status: messageStatus, toPhone: z.string(), fromPhone: z.string().nullable(),
  renderedText: z.string(), content: z.string().nullable(), providerMessageId: z.string().nullable(), errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(), sentAt: nullableIsoDate, deliveredAt: nullableIsoDate, readAt: nullableIsoDate,
  failedAt: nullableIsoDate, createdAt: isoDate, updatedAt: isoDate,
}).strict();
const sendOutput = z.object({ created: z.boolean(), message: messageOutput }).strict();
const messageFeedOutput = z.object({ items: z.array(messageOutput), nextCursor: id.nullable() }).strict();
const retryOutput = z.object({ ok: z.literal(true), messageId: id }).strict();
const updateCountOutput = z.object({ count: z.number().int().nonnegative() }).strict();
const healthOutput = z.object({
  provider: z.string(), status: z.enum(['configured_mock', 'configured', 'misconfigured']), missingEnv: z.array(z.string()),
  queueAvailable: z.boolean(), evaluatedAt: isoDate,
}).strict();
const suggestedAction = z.enum(['SEND_PAYMENT_LINK', 'CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'OPEN_SERVICE_ORDER', 'SEND_SERVICE_UPDATE', 'ESCALATE_TO_OPERATOR', 'MARK_RESOLVED', 'REPLY_WITH_TEMPLATE']);
const actionTargetOutput = z.object({ entityType: z.string(), entityId: z.string().nullable() }).strict();
const officialActionOutput = z.object({
  key: z.string(), group: z.string(), groupId: z.string(), action: suggestedAction.nullable(), label: z.string(), description: z.string(),
  reason: z.string(), availability: z.enum(['primary', 'secondary', 'unavailable', 'upcoming']), disabled: z.boolean(),
  target: actionTargetOutput.nullable(), requiresHumanApproval: z.boolean(), logicalKey: z.string().nullable(),
}).strict();
const intelligenceOutput = z.object({
  intent: z.enum(['PAYMENT_INTENT', 'RESCHEDULE_INTENT', 'CANCELLATION_INTENT', 'COMPLAINT_INTENT', 'QUOTE_REQUEST_INTENT', 'SERVICE_STATUS_INTENT', 'GENERAL_INTENT']),
  intentReason: z.string().nullable(), intentConfidence: z.number().nullable(), priority: conversationPriority,
  priorityReason: z.string().nullable(), waitingSince: nullableIsoDate, lastInboundAt: nullableIsoDate, lastOutboundAt: nullableIsoDate,
  slaStatus: z.enum(['OK', 'WARNING', 'BREACHED']), responseDueAt: nullableIsoDate, intelligenceVersion: z.number().int().positive(),
}).strict();
const contextOutput = z.object({
  customer: z.object({ id, name: z.string(), phone: z.string().nullable(), status: z.enum(['ACTIVE', 'INACTIVE']) }).strict().nullable(),
  nextAppointment: z.object({ id, scheduledAt: isoDate, status: z.string(), serviceName: z.string().nullable(), notes: z.string().nullable() }).strict().nullable(),
  activeServiceOrder: z.object({ id, code: z.string(), number: z.string(), status: z.string(), technician: z.string().nullable(), responsible: z.string().nullable() }).strict().nullable(),
  openCharge: z.object({ id, amount: z.number().int(), dueDate: isoDate, status: z.string(), daysOverdue: z.number().int().nonnegative().nullable() }).strict().nullable(),
  lastInteraction: z.object({ messageId: id, direction: messageDirection, status: messageStatus, createdAt: isoDate }).strict().nullable(),
  suggestedAction: z.object({ type: z.string(), label: z.string(), reason: z.string(), entityType: z.string(), entityId: z.string().nullable() }).strict(),
  intelligence: intelligenceOutput, officialActions: z.array(officialActionOutput), governanceAlert: z.string().nullable(), evaluatedAt: isoDate,
}).strict().nullable();

const actionPayloadOutput = z.object({
  customerName: z.string().optional(), paymentLink: z.string().optional(), chargeAmount: z.union([z.string(), z.number()]).optional(),
  chargeDueDate: z.string().optional(), appointmentDate: z.string().optional(), serviceOrderNumber: z.string().optional(),
  templateKey: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(), startsAt: z.string().optional(),
  endsAt: z.string().optional(), content: z.string().optional(),
}).strict();
const executionStatus = z.enum(['PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'FAILED', 'CANCELLED']);
const executionOutput = z.object({
  id, conversationId: id, suggestedAction, status: executionStatus, approvalRequired: z.boolean(), executionReason: z.string().nullable(),
  failureReason: z.string().nullable(), actionPayload: actionPayloadOutput.nullable(), approvedAt: nullableIsoDate, executedAt: nullableIsoDate,
  failedAt: nullableIsoDate, cancelledAt: nullableIsoDate, createdAt: isoDate, updatedAt: isoDate,
  conversation: z.object({ id, customerId: id.nullable(), phone: z.string(), title: z.string().nullable(), priority: conversationPriority, intent: z.string() }).strict().optional(),
}).strict();

const payloadMetadataOutput = z.object({
  shape: z.string(), topLevelKeys: z.array(z.string()), providerMessageIds: z.array(z.string()), approxBytes: z.number().int().nonnegative().optional(),
}).strict();
const webhookEventOutput = z.object({
  id, provider: z.string(), eventType: z.string(), status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']),
  retryAttempts: z.number().int().nonnegative(), errorMessage: z.string().nullable(), processedAt: nullableIsoDate,
  traceId: z.string().nullable(), providerMessageId: z.string().nullable(), createdAt: isoDate, payloadMetadata: payloadMetadataOutput,
}).strict();
const webhookListOutput = z.object({ items: z.array(webhookEventOutput), nextCursor: id.nullable() }).strict();
const replayOutput = z.object({
  ok: z.literal(true), requested: z.number().int().nonnegative(), replayed: z.array(z.object({
    webhookEventId: id, status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']), replayAttemptId: z.string().min(1),
  }).strict()),
}).strict();
const dlqStatsOutput = z.object({
  failedCount: z.number().int().nonnegative(),
  oldestFailedEvent: z.object({ id, createdAt: isoDate, ageMs: z.number().int().nonnegative() }).strict().nullable(),
  failedByProvider: z.array(z.object({ provider: z.string(), count: z.number().int().nonnegative() }).strict()),
  retryAttempts: z.object({ min: z.number(), max: z.number(), avg: z.number() }).strict(),
}).strict();

function publicOutput<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const internalKeys = new Set([
    'orgId', 'tenantId', 'organizationId', 'diagnostics', 'metadata', 'lockedBy', 'lockedAt', 'jobId',
    'rawPayload', 'rawPayloadMetadata', 'failedByOrg', 'idempotencyKey', 'executionResult', 'approvedBy', 'executedBy', 'cancelledBy',
  ]);
  const project = (value: unknown, parentKey?: string): unknown => {
    if (Array.isArray(value)) return value.map(item => project(item, parentKey));
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const isMessage = 'direction' in record && 'messageType' in record && 'renderedText' in record;
    const isConversation = 'phone' in record && 'priority' in record && 'contextType' in record && !isMessage;
    const conversationInternals = new Set([
      'provider', 'providerConversationId', 'intent', 'intentReason', 'intentConfidence', 'slaStatus', 'suggestedActions',
      'intelligenceExplanation', 'intelligenceVersion', 'intelligence', 'governanceSignal',
    ]);
    return Object.fromEntries(Object.entries(record)
      .filter(([key]) => !internalKeys.has(key)
        && !(isMessage && ['provider', 'messageKey', 'channel'].includes(key))
        && !(isConversation && conversationInternals.has(key))
        && !(parentKey === 'customer' && !['id', 'name', 'phone'].includes(key)))
      .map(([key, child]) => [key, project(child, key)]));
  };
  return schema.parse(project(payload));
}

const whatsappEntityType = z.enum(["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT", "GENERAL"]);
const whatsappMessageType = z.enum([
  "APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER", "SERVICE_UPDATE", "PAYMENT_LINK",
  "PAYMENT_REMINDER", "PAYMENT_CONFIRMATION", "CUSTOMER_NOTIFICATION", "MANUAL",
  "REMIND_24H", "RECEIPT", "EXECUTION_CONFIRMATION",
]);
const whatsappTemplateKey = z.enum([
  "appointment_confirmation", "appointment_reminder", "payment_reminder", "payment_link",
  "payment_confirmation", "service_update", "manual_followup",
]);
const whatsappTemplateContext = z.object({
  customerName: z.string().min(1).optional(),
  appointmentDate: z.string().min(1).optional(),
  appointmentTime: z.string().min(1).optional(),
  chargeAmount: z.string().min(1).optional(),
  chargeDueDate: z.string().min(1).optional(),
  paymentLink: z.string().min(1).optional(),
  serviceOrderNumber: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
}).strict();

const whatsappSendInput = z.object({
  customerId: z.string().min(1),
  content: z.string().min(1),
  toPhone: z.string().optional(),
  entityType: whatsappEntityType.optional(),
  entityId: z.string().optional(),
  messageType: whatsappMessageType.optional(),
  idempotencyKey: z.string().min(8).optional(),
}).strict();

export const whatsappRouter = router({
    listConversations: protectedProcedure
      .input(z.object({ status: z.enum(['OPEN', 'WAITING_CUSTOMER', 'WAITING_OPERATOR', 'PENDING', 'RESOLVED', 'FAILED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(), contextType: z.enum(['CUSTOMER', 'CHARGE', 'APPOINTMENT', 'SERVICE_ORDER', 'PAYMENT', 'GENERAL']).optional(), customerId: z.string().min(1).optional(), search: z.string().trim().max(120).optional(), cursor: z.string().min(1).optional(), limit: z.number().int().min(1).max(200).optional(), onlyUnread: z.boolean().optional() }).optional())
      .output(conversationListOutput)
      .query(async ({ ctx, input }) => publicOutput(conversationListOutput, await authedGet(ctx as NexoContext, '/whatsapp/conversations', input ?? {}))),

    getConversation: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .output(conversationOutput.nullable())
      .query(async ({ ctx, input }) => publicOutput(conversationOutput.nullable(), await authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.id}`))),

    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .output(z.array(messageOutput))
      .query(async ({ ctx, input }) => publicOutput(z.array(messageOutput), await authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/messages`))),

    getContext: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .output(contextOutput)
      .query(async ({ ctx, input }) => publicOutput(contextOutput, await authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/context`))),

    getIntelligence: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .output(intelligenceOutput)
      .query(async ({ ctx, input }) => publicOutput(intelligenceOutput, await authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/intelligence`))),

    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
        content: z.string().min(1),
        toPhone: z.string().optional(),
        entityType: whatsappEntityType.optional(),
        entityId: z.string().optional(),
        messageType: whatsappMessageType.optional(),
      }).strict().refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .output(sendOutput)
      .mutation(async ({ ctx, input }) => {
        if (input.conversationId) {
          return publicOutput(sendOutput, await authedPost(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/messages`, {
            content: input.content,
            messageType: input.messageType,
          }))
        }
        return publicOutput(sendOutput, await authedPost(ctx as NexoContext, '/whatsapp/messages', input))
      }),

    sendTemplate: protectedProcedure
      .input(z.object({ templateKey: whatsappTemplateKey, customerId: z.string().min(1).optional(), conversationId: z.string().min(1).optional(), context: whatsappTemplateContext.optional() }).strict().refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .output(sendOutput)
      .mutation(async ({ ctx, input }) => publicOutput(sendOutput, await authedPost(ctx as NexoContext, '/whatsapp/messages/template', input))),

    retryMessage: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .output(retryOutput)
      .mutation(async ({ ctx, input }) => publicOutput(retryOutput, await authedPost(ctx as NexoContext, `/whatsapp/messages/${input.id}/retry`))),

    updateConversationStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1), status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'FAILED']) }))
      .output(updateCountOutput)
      .mutation(async ({ ctx, input }) => publicOutput(updateCountOutput, await authedPatch(ctx as NexoContext, `/whatsapp/conversations/${input.id}/status`, { status: input.status }))),

    health: protectedProcedure.output(healthOutput).query(async ({ ctx }) => publicOutput(healthOutput, await authedGet(ctx as NexoContext, '/whatsapp/health'))),

    listPendingApprovals: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
      .output(z.array(executionOutput))
      .query(async ({ ctx, input }) => publicOutput(z.array(executionOutput), await authedGet(ctx as NexoContext, '/whatsapp/action-executions/pending', input ?? {}))),

    listExecutionHistory: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1).optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
      .output(z.array(executionOutput))
      .query(async ({ ctx, input }) => publicOutput(z.array(executionOutput), await authedGet(ctx as NexoContext, '/whatsapp/action-executions/history', input ?? {}))),

    getExecutionStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .output(executionOutput)
      .query(async ({ ctx, input }) => publicOutput(executionOutput, await authedGet(ctx as NexoContext, `/whatsapp/action-executions/${input.id}`))),

    requestExecution: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1), suggestedAction: z.enum(['SEND_PAYMENT_LINK', 'CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'SEND_SERVICE_UPDATE', 'ESCALATE_TO_OPERATOR', 'MARK_RESOLVED', 'REPLY_WITH_TEMPLATE']), executionReason: z.string().optional(), actionPayload: z.record(z.string(), z.any()).optional(), idempotencyKey: z.string().optional(), autoExecuteSafe: z.boolean().optional() }))
      .output(executionOutput)
      .mutation(async ({ ctx, input }) => publicOutput(executionOutput, await authedPost(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/actions`, input))),

    approveExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .output(executionOutput)
      .mutation(async ({ ctx, input }) => publicOutput(executionOutput, await authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/approve`, { reason: input.reason }))),

    executeExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .output(executionOutput)
      .mutation(async ({ ctx, input }) => publicOutput(executionOutput, await authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/execute`, { reason: input.reason }))),

    cancelExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .output(executionOutput)
      .mutation(async ({ ctx, input }) => publicOutput(executionOutput, await authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/cancel`, { reason: input.reason }))),


    listWebhookEvents: protectedProcedure
      .input(whatsappWebhookEventListInput.optional())
      .output(webhookListOutput)
      .query(async ({ ctx, input }) => publicOutput(webhookListOutput, normalizeWebhookEventResponse(await authedGet(ctx as NexoContext, '/whatsapp/webhook-events', input ?? {})))),

    getWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1) }).strict())
      .output(webhookEventOutput)
      .query(async ({ ctx, input }) => publicOutput(webhookEventOutput, normalizeWebhookEventResponse(await authedGet(ctx as NexoContext, `/whatsapp/webhook-events/${input.id}`)))),

    replayWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1), force: z.boolean().optional() }))
      .output(replayOutput)
      .mutation(async ({ ctx, input }) => publicOutput(replayOutput, await authedPost(ctx as NexoContext, `/whatsapp/webhook-events/${input.id}/replay`, { force: input.force }))),

    replayWebhookEvents: protectedProcedure
      .input(whatsappWebhookReplayInput)
      .output(replayOutput)
      .mutation(async ({ ctx, input }) => publicOutput(replayOutput, await authedPost(ctx as NexoContext, '/whatsapp/webhook-events/replay', input))),

    webhookDlqStats: protectedProcedure.output(dlqStatsOutput).query(async ({ ctx }) =>
      publicOutput(dlqStatsOutput, await authedGet(ctx as NexoContext, '/whatsapp/webhook-events/dlq/stats'))
    ),


    // backward compatibility
    conversations: protectedProcedure.output(conversationListOutput).query(async ({ ctx }) => publicOutput(conversationListOutput, await authedGet(ctx as NexoContext, '/whatsapp/conversations'))),
    messagesFeed: protectedProcedure.input(z.object({ customerId: z.string(), cursor: z.string().optional(), limit: z.number().int().min(1).max(100).optional() })).output(messageFeedOutput).query(async ({ ctx, input }) => publicOutput(messageFeedOutput, await authedGet(ctx as NexoContext, `/whatsapp/messages/${input.customerId}`, { cursor: input.cursor, limit: input.limit }))),
    messages: protectedProcedure.input(z.object({ customerId: z.string(), limit: z.number().int().min(1).max(100).optional() })).output(z.array(messageOutput)).query(async ({ ctx, input }) => {
      const payload = await authedGet(ctx as NexoContext, `/whatsapp/messages/${input.customerId}`, { limit: input.limit ?? 50 })
      return publicOutput(messageFeedOutput, payload).items
    }),
    send: protectedProcedure.input(whatsappSendInput).output(sendOutput).mutation(async ({ ctx, input }) => publicOutput(sendOutput, await authedPost(ctx as NexoContext, '/whatsapp/messages', input, input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined))),
  })

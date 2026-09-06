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

const whatsappSendInput = z.object({
  customerId: z.string().min(1),
  content: z.string().min(1),
  toPhone: z.string().optional(),
  receiverNumber: z.string().optional(),
  entityType: z.enum(["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT", "GENERAL"]).optional(),
  entityId: z.string().optional(),
  messageType: z
    .enum([
      "APPOINTMENT_CONFIRMATION",
      "SERVICE_UPDATE",
      "PAYMENT_REMINDER",
      "PAYMENT_CONFIRMATION",
      "CUSTOMER_NOTIFICATION",
      "MANUAL",
      "PAYMENT_LINK",
      "APPOINTMENT_REMINDER",
      "PAYMENT_CONFIRMATION",
      "EXECUTION_CONFIRMATION",
    ])
    .optional(),
  idempotencyKey: z.string().min(8).optional(),
  chargeId: z.string().optional(),
  serviceOrderId: z.string().optional(),
});

export const whatsappRouter = router({
    listConversations: protectedProcedure
      .input(z.object({ status: z.enum(['OPEN', 'WAITING_CUSTOMER', 'WAITING_OPERATOR', 'PENDING', 'RESOLVED', 'FAILED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(), contextType: z.enum(['CUSTOMER', 'CHARGE', 'APPOINTMENT', 'SERVICE_ORDER', 'PAYMENT', 'GENERAL']).optional(), customerId: z.string().min(1).optional(), search: z.string().trim().max(120).optional(), cursor: z.string().min(1).optional(), limit: z.number().int().min(1).max(200).optional(), onlyUnread: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, '/whatsapp/conversations', input ?? {})),

    getConversation: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.id}`)),

    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/messages`)),

    getContext: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/context`)),

    getIntelligence: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/intelligence`)),

    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
        content: z.string().min(1),
        toPhone: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        messageType: z.string().optional(),
      }).refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.conversationId) {
          return authedPost(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/messages`, input)
        }
        return authedPost(ctx as NexoContext, '/whatsapp/messages', input)
      }),

    sendTemplate: protectedProcedure
      .input(z.object({ templateKey: z.string().min(1), customerId: z.string().optional(), conversationId: z.string().optional(), context: z.record(z.string(), z.any()).optional(), toPhone: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(), messageType: z.string().optional() }).refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, '/whatsapp/messages/template', input)),

    retryMessage: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/messages/${input.id}/retry`)),

    updateConversationStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1), status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'FAILED']) }))
      .mutation(async ({ ctx, input }) => authedPatch(ctx as NexoContext, `/whatsapp/conversations/${input.id}/status`, { status: input.status })),

    health: protectedProcedure.query(async ({ ctx }) => authedGet(ctx as NexoContext, '/whatsapp/health')),

    listPendingApprovals: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, '/whatsapp/action-executions/pending', input ?? {})),

    listExecutionHistory: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1).optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, '/whatsapp/action-executions/history', input ?? {})),

    getExecutionStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/action-executions/${input.id}`)),

    requestExecution: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1), suggestedAction: z.enum(['SEND_PAYMENT_LINK', 'CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'SEND_SERVICE_UPDATE', 'ESCALATE_TO_OPERATOR', 'MARK_RESOLVED', 'REPLY_WITH_TEMPLATE']), executionReason: z.string().optional(), actionPayload: z.record(z.string(), z.any()).optional(), idempotencyKey: z.string().optional(), autoExecuteSafe: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/conversations/${input.conversationId}/actions`, input)),

    approveExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/approve`, { reason: input.reason })),

    executeExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/execute`, { reason: input.reason })),

    cancelExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/action-executions/${input.id}/cancel`, { reason: input.reason })),


    listWebhookEvents: protectedProcedure
      .input(whatsappWebhookEventListInput.optional())
      .query(async ({ ctx, input }) => normalizeWebhookEventResponse(await authedGet(ctx as NexoContext, '/whatsapp/webhook-events', input ?? {}))),

    getWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1) }).strict())
      .query(async ({ ctx, input }) => normalizeWebhookEventResponse(await authedGet(ctx as NexoContext, `/whatsapp/webhook-events/${input.id}`))),

    replayWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1), force: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, `/whatsapp/webhook-events/${input.id}/replay`, { force: input.force })),

    replayWebhookEvents: protectedProcedure
      .input(whatsappWebhookReplayInput)
      .mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, '/whatsapp/webhook-events/replay', input)),

    webhookDlqStats: protectedProcedure.query(async ({ ctx }) =>
      authedGet(ctx as NexoContext, '/whatsapp/webhook-events/dlq/stats')
    ),


    // backward compatibility
    conversations: protectedProcedure.query(async ({ ctx }) => authedGet(ctx as NexoContext, '/whatsapp/conversations')),
    messagesFeed: protectedProcedure.input(z.object({ customerId: z.string(), cursor: z.string().optional(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => authedGet(ctx as NexoContext, `/whatsapp/messages/${input.customerId}`, { cursor: input.cursor, limit: input.limit })),
    messages: protectedProcedure.input(z.object({ customerId: z.string(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => {
      const payload = await authedGet(ctx as NexoContext, `/whatsapp/messages/${input.customerId}`, { limit: input.limit ?? 50 })
      return Array.isArray(payload) ? payload : (payload as any)?.items ?? []
    }),
    send: protectedProcedure.input(whatsappSendInput).mutation(async ({ ctx, input }) => authedPost(ctx as NexoContext, '/whatsapp/messages', input, input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined)),
  })

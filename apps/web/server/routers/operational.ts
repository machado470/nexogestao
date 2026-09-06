import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPost, type NexoContext } from "../_core/nexoTransport";

const operationalActionType = z.enum(["RETRY_WHATSAPP_MESSAGE", "SEND_PAYMENT_REMINDER", "RECALCULATE_RISK", "RUN_GOVERNANCE_CHECK"]);
const operationalActionInput = z.object({
  actionType: operationalActionType,
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  sourceSignalId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
const operationalResult = z.object({ actionType: operationalActionType, status: z.enum(["REQUESTED", "EXECUTING", "EXECUTED", "FAILED", "CANCELED"]) }).passthrough();
const queueStatus = z.object({ queue: z.string(), waiting: z.number(), active: z.number(), completed: z.number(), failed: z.number(), delayed: z.number(), degraded: z.boolean(), degradedReasons: z.array(z.string()) });
const dlqStatus = z.object({ queue: z.string(), backlog: z.number(), failed: z.number(), lastFailureAt: z.string().nullable() });
const incident = z.object({ id: z.string(), severity: z.enum(["INFO", "WARNING", "CRITICAL"]), code: z.string(), title: z.string(), description: z.string(), source: z.string(), createdAt: z.string() });
const operationsSummary = z.object({
  status: z.enum(["ok", "degraded"]), degradedReasons: z.array(z.string()),
  metrics: z.object({ retries: z.number(), failedJobs: z.number(), failedWebhooks: z.number() }),
  queues: z.array(queueStatus), dlq: z.array(dlqStatus),
  recoveryActions: z.array(z.object({ id: z.string(), label: z.string(), method: z.literal("POST"), available: z.boolean() }).passthrough()),
}).passthrough();

export const operationsRouter = router({
    summary: protectedProcedure.output(operationsSummary).query(({ ctx }) => authedGet(ctx as NexoContext, "/internal/operations/summary")),
    incidents: protectedProcedure.output(z.array(incident)).query(({ ctx }) => authedGet(ctx as NexoContext, "/internal/operations/incidents")),
    queues: protectedProcedure.output(z.array(queueStatus)).query(({ ctx }) => authedGet(ctx as NexoContext, "/internal/operations/queues")),
    dlq: protectedProcedure.output(z.array(dlqStatus)).query(({ ctx }) => authedGet(ctx as NexoContext, "/internal/operations/dlq")),
    diagnostics: protectedProcedure.query(({ ctx }) => authedGet(ctx as NexoContext, "/internal/operational-actions/diagnostics")),
    requestAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as NexoContext, "/internal/operational-actions/request", input)),
    executeAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as NexoContext, "/internal/operational-actions/execute", input)),
    cancelAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as NexoContext, "/internal/operational-actions/cancel", input)),
    recoverAction: protectedProcedure.input(z.object({ executionId: z.string().min(1), recoveryReason: z.string().optional() }).strict()).mutation(({ ctx, input }) => authedPost(ctx as NexoContext, "/internal/operational-actions/recover-stuck", input)),
    webhookDeliveries: protectedProcedure.input(z.object({ status: z.enum(["PENDING", "PROCESSING", "SUCCESS", "FAILED"]).optional(), limit: z.number().int().min(1).max(100).optional() }).strict().optional()).query(({ ctx, input }) => authedGet(ctx as NexoContext, "/webhooks/deliveries", input ?? {})),
    replayWebhook: protectedProcedure.input(z.object({ deliveryId: z.string().min(1) }).strict()).mutation(({ ctx, input }) => authedPost(ctx as NexoContext, `/webhooks/deliveries/${input.deliveryId}/replay`)),
  })

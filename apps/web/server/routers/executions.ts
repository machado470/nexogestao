import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPost, type NexoContext } from "../_core/nexoTransport";

const isoTimestamp = z.string().datetime({ offset: true });
const executionMode = z.enum(["manual", "semi_automatic", "automatic"]);
const runnerStatus = z.enum(["pending", "executed", "failed", "blocked", "throttled", "requires_confirmation"]);
const priority = z.enum(["critical", "high", "medium", "low"]);

const executionPayloadFields = {
  notes: z.string().optional(),
  checklist: z.array(z.json()).optional(),
  attachments: z.array(z.json()).optional(),
};

export const executionOutput = z.object({
  id: z.uuid(),
  serviceOrderId: z.uuid(),
  customerId: z.uuid(),
  executorPersonId: z.uuid().nullable(),
  startedAt: isoTimestamp.nullable(),
  endedAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  checklist: z.array(z.json()),
  attachments: z.array(z.json()),
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]),
  amountCents: z.number().int().nullable(),
  dueDate: isoTimestamp.nullable(),
  mode: z.literal("service-order-fallback"),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  idempotent: z.boolean().optional(),
}).strict();

const executionListOutput = z.array(executionOutput);
const policyOutput = z.object({
  allowAutomaticCharge: z.boolean(),
  allowWhatsAppAuto: z.boolean(),
  allowOverdueReminderAuto: z.boolean(),
  allowFinanceTeamNotifications: z.boolean(),
  allowGovernanceFollowup: z.boolean(),
  allowChargeFollowupCreation: z.boolean(),
  allowRiskReviewEscalation: z.boolean(),
  maxRetries: z.number().int().nonnegative(),
  throttleWindowMs: z.number().int().min(5_000),
}).strict();
const modeOutput = z.object({ mode: executionMode, policy: policyOutput }).strict();
const updateModeOutput = modeOutput.extend({ ok: z.literal(true) }).strict();
const stateSummaryOutput = z.object({
  pending: z.number().int().nonnegative(), executed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(),
  blockedRecent: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(),
  throttled: z.number().int().nonnegative(),
}).strict();
const eventOutput = z.object({
  id: z.uuid(), actionId: z.string(), decisionId: z.string(), entityType: z.string(),
  entityId: z.string(), eventType: z.enum(["EXECUTION_STARTED", "EXECUTION_BLOCKED", "EXECUTION_EXECUTED", "EXECUTION_FAILED", "AUTH_BLOCKED_EXECUTION"]),
  status: runnerStatus, intent: z.string().nullable(), priority: priority.nullable(),
  correlationId: z.string().nullable(), reasonCode: z.string().nullable(), mode: executionMode.nullable(),
  result: z.json().nullable(), timestamp: isoTimestamp,
}).strict();
const recentOutput = z.object({
  id: z.uuid(), timestamp: isoTimestamp, status: runnerStatus, reasonCode: z.string().nullable(),
  intent: z.string().nullable(), priority: priority.nullable(), correlationId: z.string().nullable(),
}).strict();
const modeHistoryOutput = z.object({
  id: z.uuid(), actorUserId: z.string().nullable(), actorEmail: z.string().nullable(),
  source: z.string().nullable(), context: z.string().nullable(), changedAt: isoTimestamp,
  before: z.json(), after: z.json(),
}).strict();
const runOnceOutput = z.union([
  z.object({ orgs: z.literal(0), totalCandidates: z.literal(0), executed: z.literal(0), delayed: z.literal(true) }).strict(),
  z.object({
    orgs: z.number().int().nonnegative(), totalCandidates: z.number().int().nonnegative(), executed: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(), blockedRecent: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(), debugExecution: z.boolean(), blockedByReason: z.record(z.string(), z.number().int().nonnegative()),
    correlationId: z.uuid(),
  }).strict(),
]);

function withoutInternalFields(payload: unknown, fields: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const publicPayload = { ...(payload as Record<string, unknown>) };
  for (const field of fields) delete publicPayload[field];
  return publicPayload;
}
function parseExecution(payload: unknown) { return executionOutput.parse(withoutInternalFields(payload, ["orgId"])); }
function parseEvent(payload: unknown) { return eventOutput.parse(withoutInternalFields(payload, ["diagnostics", "metadata"])); }
function parseModeHistory(payload: unknown) { return modeHistoryOutput.parse(withoutInternalFields(payload, ["orgId"])); }

export const executionsRouter = router({
  listByServiceOrder: protectedProcedure
    .input(z.object({ serviceOrderId: z.uuid(), limit: z.number().int().min(1).max(500).optional() }).strict())
    .output(executionListOutput)
    .query(async ({ ctx, input }) => {
      const { serviceOrderId, ...query } = input;
      const payload = await authedGet(ctx as NexoContext, `/executions/service-order/${serviceOrderId}`, query);
      return z.array(z.json()).parse(payload).map(parseExecution);
    }),
  start: protectedProcedure
    .input(z.object({ serviceOrderId: z.uuid(), ...executionPayloadFields }).strict())
    .output(executionOutput)
    .mutation(async ({ ctx, input }) => parseExecution(await authedPost(ctx as NexoContext, "/executions/start", input))),
  complete: protectedProcedure
    .input(z.object({ executionId: z.uuid(), ...executionPayloadFields }).strict())
    .output(executionOutput)
    .mutation(async ({ ctx, input }) => {
      const { executionId, ...payload } = input;
      return parseExecution(await authedPost(ctx as NexoContext, `/executions/${executionId}/complete`, payload));
    }),
  mode: protectedProcedure.output(modeOutput).query(({ ctx }) => authedGet(ctx as NexoContext, "/executions/mode")),
  updateMode: protectedProcedure
    .input(z.object({
      mode: executionMode.optional(), resetToDefault: z.boolean().optional(),
      policy: policyOutput.partial().strict().optional(),
    }).strict())
    .output(updateModeOutput)
    .mutation(({ ctx, input }) => authedPost(ctx as NexoContext, "/executions/mode", input)),
  stateSummary: protectedProcedure
    .input(z.object({ sinceMs: z.number().int().positive().optional() }).strict().optional())
    .output(stateSummaryOutput)
    .query(({ ctx, input }) => authedGet(ctx as NexoContext, "/executions/state-summary", input ?? {})),
  events: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional(), status: z.string().optional(), actionId: z.string().optional(), entityType: z.string().optional() }).strict().optional())
    .output(z.array(eventOutput))
    .query(async ({ ctx, input }) => z.array(z.json()).parse(await authedGet(ctx as NexoContext, "/executions/events", input ?? {})).map(parseEvent)),
  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).strict().optional())
    .output(z.array(recentOutput))
    .query(({ ctx, input }) => authedGet(ctx as NexoContext, "/executions/recent", input ?? {})),
  modeHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).strict().optional())
    .output(z.array(modeHistoryOutput))
    .query(async ({ ctx, input }) => z.array(z.json()).parse(await authedGet(ctx as NexoContext, "/executions/mode-history", input ?? {})).map(parseModeHistory)),
  runOnce: protectedProcedure.output(runOnceOutput).mutation(({ ctx }) => authedPost(ctx as NexoContext, "/executions/runner/run-once")),
});

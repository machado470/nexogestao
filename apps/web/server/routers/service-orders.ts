import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable();
const timestamp = z.string().datetime();
const nullableTimestamp = timestamp.nullable();
const status = z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]);

const serviceOrderListInput = z.object({
  status: status.optional(),
  customerId: uuid.optional(),
  assignedToPersonId: uuid.optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(500).optional(),
  search: z.string().max(200).optional(),
}).strict().optional();

const serviceOrderCreateInput = z.object({
  customerId: uuid,
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: timestamp.optional(),
  appointmentId: uuid.optional(),
  assignedToPersonId: uuid.optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: timestamp.optional(),
}).strict();

const serviceOrderUpdateInput = z.object({
  id: uuid,
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: timestamp.optional(),
  status: status.optional(),
  assignedToPersonId: nullableUuid.optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: timestamp.optional(),
  cancellationReason: z.string().optional(),
  outcomeSummary: z.string().optional(),
  expectedUpdatedAt: timestamp.optional(),
}).strict();

const customerSummary = z.object({ id: uuid, name: z.string(), phone: z.string().nullable() }).strict();
const assigneeSummary = z.object({ id: uuid, name: z.string() }).strict();
const appointmentSummary = z.object({
  id: uuid,
  startsAt: timestamp,
  endsAt: timestamp,
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]),
}).strict();

const financialSummary = z.object({
  hasCharge: z.boolean(),
  chargeId: nullableUuid,
  chargeStatus: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELED"]).nullable(),
  chargeAmountCents: z.number().int().nonnegative().nullable(),
  chargeDueDate: nullableTimestamp,
  paidAt: nullableTimestamp,
}).strict();

export const serviceOrderOperationalDecisionSchema = z.object({
  isOverdue: z.boolean(),
  overdueDays: z.number().int().nonnegative(),
  isStalled: z.boolean(),
  chargeOverdue: z.boolean(),
  operationalStatus: z.enum(["NORMAL", "ATENÇÃO", "RISCO"]),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  riskLabel: z.string(),
  nextAction: z.object({
    type: z.enum(["start", "complete", "charge", "edit", "select"]),
    label: z.string(),
    reason: z.string(),
  }).strict(),
}).strict();

const baseServiceOrderShape = {
  id: uuid,
  customerId: uuid,
  appointmentId: nullableUuid,
  assignedToPersonId: nullableUuid,
  title: z.string(),
  description: z.string().nullable(),
  status,
  priority: z.number().int().min(1).max(5),
  scheduledFor: nullableTimestamp,
  startedAt: nullableTimestamp,
  finishedAt: nullableTimestamp,
  amountCents: z.number().int().nonnegative().nullable(),
  dueDate: nullableTimestamp,
  cancellationReason: z.string().nullable(),
  outcomeSummary: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const serviceOrderMutationOutputSchema = z.object({
  ...baseServiceOrderShape,
  customer: customerSummary,
  assignedTo: assigneeSummary.nullable(),
}).strict();

export const serviceOrderOutputSchema = z.object({
  ...baseServiceOrderShape,
  customer: customerSummary,
  assignedTo: assigneeSummary.nullable(),
  appointment: appointmentSummary.nullable(),
  financialSummary,
  operationalDecision: serviceOrderOperationalDecisionSchema,
}).strict();

const pagination = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
}).strict();

export const serviceOrdersListOutputSchema = z.object({
  data: z.array(serviceOrderOutputSchema),
  pagination,
}).strict();

const generateChargeOutputSchema = z.object({ created: z.boolean(), chargeId: uuid }).strict();

function withoutInternalFields(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const value = { ...(payload as Record<string, unknown>) };
  delete value[["org", "Id"].join("")];
  delete value.idempotencyKey;
  return value;
}

function parseList(payload: unknown) {
  if (Array.isArray(payload)) {
    throw new Error("Envelope paginado de ordens de serviço ausente.");
  }
  const source = z.object({ data: z.array(z.unknown()), pagination }).strict().parse(payload);
  return serviceOrdersListOutputSchema.parse({
    ...source,
    data: source.data.map(withoutInternalFields),
  });
}

function parseOrder<T extends z.ZodType>(payload: unknown, schema: T): z.infer<T> {
  return schema.parse(withoutInternalFields(payload));
}

export const serviceOrdersRouter = router({
  list: protectedProcedure.input(serviceOrderListInput).output(serviceOrdersListOutputSchema).query(async ({ ctx, input }) => {
    return parseList(await authedGet(ctx as NexoContext, "/service-orders", input));
  }),

  getById: protectedProcedure.input(z.object({ id: uuid }).strict()).output(serviceOrderOutputSchema).query(async ({ ctx, input }) => {
    return parseOrder(await authedGet(ctx as NexoContext, `/service-orders/${input.id}`), serviceOrderOutputSchema);
  }),

  create: protectedProcedure.input(serviceOrderCreateInput).output(serviceOrderMutationOutputSchema).mutation(async ({ ctx, input }) => {
    return parseOrder(await authedPost(ctx as NexoContext, "/service-orders", input), serviceOrderMutationOutputSchema);
  }),

  update: protectedProcedure.input(serviceOrderUpdateInput).output(serviceOrderMutationOutputSchema).mutation(async ({ ctx, input }) => {
    const { id, ...payload } = input;
    return parseOrder(await authedPatch(ctx as NexoContext, `/service-orders/${id}`, payload), serviceOrderMutationOutputSchema);
  }),

  generateCharge: protectedProcedure.input(z.object({ id: uuid }).strict()).output(generateChargeOutputSchema).mutation(async ({ ctx, input }) => {
    return generateChargeOutputSchema.parse(await authedPost(ctx as NexoContext, `/service-orders/${input.id}/generate-charge`));
  }),
});

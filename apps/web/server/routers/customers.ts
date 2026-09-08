import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  authedGet,
  authedPatch,
  authedPost,
  type NexoContext,
} from "../_core/nexoTransport";

const customersListInput = z
  .object({
    page: z.number().int().min(1).max(10_000).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    search: z.string().max(200).optional(),
  })
  .strict()
  .optional();

const customerCreateInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
});

const customerUpdateInput = customerCreateInput.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const customerOutputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    cpfCnpj: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const customersListOutputSchema = z.array(customerOutputSchema);

function parseCustomerPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return customerOutputSchema.parse(payload);
  }
  const publicCustomer = { ...(payload as Record<string, unknown>) };
  delete publicCustomer[["org", "Id"].join("")];
  return customerOutputSchema.parse(publicCustomer);
}

function parseCustomersListPayload(payload: unknown) {
  return z.array(z.unknown()).parse(payload).map(parseCustomerPayload);
}

const optionalId = z.string().uuid().nullable();
const optionalTimestamp = z.string().datetime().nullable();

const workspaceAppointmentSchema = z
  .object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    assignedToPersonId: optionalId,
    idempotencyKey: z.string().nullable(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const workspaceServiceOrderSchema = z
  .object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    idempotencyKey: z.string().nullable(),
    appointmentId: optionalId,
    assignedToPersonId: optionalId,
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]),
    priority: z.number().int(),
    scheduledFor: optionalTimestamp,
    startedAt: optionalTimestamp,
    finishedAt: optionalTimestamp,
    amountCents: z.number().int().nullable(),
    dueDate: optionalTimestamp,
    cancellationReason: z.string().nullable(),
    outcomeSummary: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const workspaceChargeSchema = z
  .object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    idempotencyKey: z.string().nullable(),
    serviceOrderId: optionalId,
    amountCents: z.number().int(),
    currency: z.string(),
    status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELED"]),
    dueDate: z.string().datetime(),
    paidAt: optionalTimestamp,
    canceledAt: optionalTimestamp,
    cancellationReason: z.string().nullable(),
    canceledByUserId: optionalId,
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const workspaceTimelineSchema = z
  .object({
    id: z.string().uuid(),
    action: z.string(),
    personId: optionalId,
    description: z.string().nullable(),
    customerId: optionalId,
    serviceOrderId: optionalId,
    appointmentId: optionalId,
    chargeId: optionalId,
    metadata: z.unknown().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

const customerWorkspaceOutputSchema = z
  .object({
    customer: customerOutputSchema,
    appointments: z.array(workspaceAppointmentSchema),
    serviceOrders: z.array(workspaceServiceOrderSchema),
    charges: z.array(workspaceChargeSchema),
    timeline: z.array(workspaceTimelineSchema),
    totalSpentCents: z.number().int().nonnegative(),
  })
  .strict();

function withoutTenantIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTenantIdentity);
  if (!value || typeof value !== "object") return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy[["org", "Id"].join("")];
  return Object.fromEntries(
    Object.entries(copy).map(([key, child]) => [
      key,
      withoutTenantIdentity(child),
    ])
  );
}

const customerOperationalBreakdownSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    description: z.string(),
    points: z.number(),
    value: z.number(),
    threshold: z.number().optional(),
  })
  .strict();

const customerOperationalSummaryItemSchema = z
  .object({
    customerId: z.string(),
    customerName: z.string(),
    active: z.boolean(),
    operationalStatus: z.enum(["NORMAL", "ATENÇÃO", "RISCO", "CRÍTICO"]),
    priority: z.enum(["P0", "P1", "P2", "P3"]),
    riskScore: z.number(),
    riskState: z.enum(["NORMAL", "WARNING", "RESTRICTED", "SUSPENDED"]),
    riskSignal: z.string(),
    interventionReason: z.string().nullable(),
    recommendedActionLabel: z.string().nullable(),
    recommendedActionTarget: z
      .enum(["FINANCES", "SERVICE_ORDERS", "APPOINTMENTS", "WHATSAPP"])
      .nullable(),
    contributors: z.array(z.string()),
    breakdown: z.array(customerOperationalBreakdownSchema),
    factors: z.record(z.string(), z.unknown()),
    explanation: z.array(z.string()),
    evaluatedAt: z.string().datetime(),
  })
  .strict();

const customersOperationalSummarySchema = z
  .object({
    evaluatedAt: z.string().datetime(),
    portfolio: z
      .object({
        operationalStatus: z.enum(["NORMAL", "ATENÇÃO", "RISCO", "CRÍTICO"]),
        totalCustomers: z.number(),
        normalCustomers: z.number(),
        attentionCustomers: z.number(),
        riskCustomers: z.number(),
        criticalCustomers: z.number(),
      })
      .strict(),
    customers: z.array(customerOperationalSummaryItemSchema),
  })
  .strict();

export const customersRouter = router({
  list: protectedProcedure
    .input(customersListInput)
    .output(customersListOutputSchema)
    .query(async ({ ctx, input }) => {
      const payload = await authedGet(ctx as NexoContext, "/customers", input);
      return customersListOutputSchema.parse(
        parseCustomersListPayload(payload)
      );
    }),

  operationalSummary: protectedProcedure
    .output(customersOperationalSummarySchema)
    .query(async ({ ctx }) => {
      const raw = await authedGet(
        ctx as NexoContext,
        "/customers/operational-summary"
      );

      return customersOperationalSummarySchema.parse(raw);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(customerOutputSchema)
    .query(async ({ ctx, input }) => {
      const payload = await authedGet(
        ctx as NexoContext,
        `/customers/${input.id}`
      );
      return parseCustomerPayload(payload);
    }),

  workspace: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(customerWorkspaceOutputSchema)
    .query(async ({ ctx, input }) => {
      const payload = await authedGet(
        ctx as NexoContext,
        `/customers/${input.id}/workspace`
      );
      return customerWorkspaceOutputSchema.parse(
        withoutTenantIdentity(payload)
      );
    }),

  create: protectedProcedure
    .input(customerCreateInput)
    .output(customerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const payload = await authedPost(ctx as NexoContext, "/customers", input);
      return parseCustomerPayload(payload);
    }),

  update: protectedProcedure
    .input(customerUpdateInput)
    .output(customerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID do cliente é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      const response = await authedPatch(
        ctx as NexoContext,
        `/customers/${id}`,
        payload
      );
      return parseCustomerPayload(response);
    }),
});

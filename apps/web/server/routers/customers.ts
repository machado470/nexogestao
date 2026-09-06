import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

const anyInput = z.any().optional();

const customerCreateInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
});

const customerUpdateInput = customerCreateInput
  .partial()
  .extend({
    id: z.string().min(1),
    active: z.boolean().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  });

const customerOperationalBreakdownSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    description: z.string(),
    points: z.number(),
    value: z.number(),
    threshold: z.number().optional(),
  })
  .passthrough();

const customerOperationalSummaryItemSchema = z
  .object({
    customerId: z.string(),
    customerName: z.string(),
    active: z.boolean(),
    operationalStatus: z.enum([
      "NORMAL",
      "ATENÇÃO",
      "RISCO",
      "CRÍTICO",
    ]),
    priority: z.enum(["P0", "P1", "P2", "P3"]),
    riskScore: z.number(),
    riskState: z.enum([
      "NORMAL",
      "WARNING",
      "RESTRICTED",
      "SUSPENDED",
    ]),
    riskSignal: z.string(),
    interventionReason: z.string().nullable(),
    recommendedActionLabel: z.string().nullable(),
    recommendedActionTarget: z
      .enum([
        "FINANCES",
        "SERVICE_ORDERS",
        "APPOINTMENTS",
        "WHATSAPP",
      ])
      .nullable(),
    contributors: z.array(z.string()).default([]),
    breakdown: z
      .array(customerOperationalBreakdownSchema)
      .default([]),
    factors: z.record(z.string(), z.unknown()),
    explanation: z.array(z.string()).default([]),
    evaluatedAt: z.string(),
  })
  .passthrough();

const customersOperationalSummarySchema = z
  .object({
    evaluatedAt: z.string(),
    portfolio: z
      .object({
        operationalStatus: z.enum([
          "NORMAL",
          "ATENÇÃO",
          "RISCO",
          "CRÍTICO",
        ]),
        totalCustomers: z.number(),
        normalCustomers: z.number(),
        attentionCustomers: z.number(),
        riskCustomers: z.number(),
        criticalCustomers: z.number(),
      })
      .passthrough(),
    customers: z
      .array(customerOperationalSummaryItemSchema)
      .default([]),
  })
  .passthrough();

export const customersRouter = router({
    list: protectedProcedure.input(anyInput).query(async ({ ctx, input }) => {
      return authedGet(ctx as NexoContext, "/customers", input);
    }),

    operationalSummary: protectedProcedure.query(async ({ ctx }) => {
      const raw = await authedGet(
        ctx as NexoContext,
        "/customers/operational-summary"
      );

      return customersOperationalSummarySchema.parse(raw);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/customers/${input.id}`);
      }),

    workspace: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/customers/${input.id}/workspace`);
      }),

    create: protectedProcedure.input(customerCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/customers", input);
    }),

    update: protectedProcedure.input(customerUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID do cliente é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      return authedPatch(ctx as NexoContext, `/customers/${id}`, payload);
    }),
  })

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

const serviceOrderListInput = z.object({
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
  customerId: z.string().optional(), assignedToPersonId: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(),
  page: z.number().int().positive().optional(), limit: z.number().int().positive().optional(), search: z.string().optional(),
}).optional();

const serviceOrderCreateInput = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: z.string().optional(),
  appointmentId: z.string().optional(),
  assignedToPersonId: z.string().optional(),
  amountCents: z.number().int().min(1).optional(),
  dueDate: z.string().optional(),
});

const serviceOrderUpdateInput = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: z.string().optional(),
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
  assignedToPersonId: z.string().nullable().optional(),
  amountCents: z.number().int().min(1).optional(),
  dueDate: z.string().optional(),
  cancellationReason: z.string().optional(),
  outcomeSummary: z.string().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const serviceOrdersRouter = router({
    list: protectedProcedure.input(serviceOrderListInput).query(async ({ ctx, input }) => {
      return authedGet(ctx as NexoContext, "/service-orders", input);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/service-orders/${input.id}`);
      }),

    create: protectedProcedure.input(serviceOrderCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/service-orders", input);
    }),

    update: protectedProcedure.input(serviceOrderUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID da ordem de serviço é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      return authedPatch(ctx as NexoContext, `/service-orders/${id}`, payload);
    }),

    generateCharge: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return authedPost(
          ctx as NexoContext,
          `/service-orders/${input.id}/generate-charge`
        );
      }),
  })

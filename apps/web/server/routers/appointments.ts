import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

const appointmentCreateInput = z.object({
  customerId: z.string().min(1),
  assignedToPersonId: z.string().min(1).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
});

const appointmentUpdateInput = z.object({
  id: z.string().min(1),
  assignedToPersonId: z.string().nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const appointmentsRouter = router({
    list: protectedProcedure.input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
      customerId: z.string().optional(),
      assignedToPersonId: z.string().optional(),
      page: z.number().int().positive().optional(),
      limit: z.number().int().positive().optional(),
      search: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return authedGet(ctx as NexoContext, "/appointments", input);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/appointments/${input.id}`);
      }),

    create: protectedProcedure.input(appointmentCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/appointments", input);
    }),

    update: protectedProcedure.input(appointmentUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID do agendamento é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      const updatePayload = { ...payload };

      if (!updatePayload.expectedUpdatedAt) {
        const current = await authedGet(ctx as NexoContext, `/appointments/${id}`) as { updatedAt?: string | null };
        if (!current?.updatedAt) {
          throw new Error("Não foi possível obter a versão atual do agendamento.");
        }
        updatePayload.expectedUpdatedAt = current.updatedAt;
      }

      return authedPatch(ctx as NexoContext, `/appointments/${id}`, updatePayload);
    }),
  })

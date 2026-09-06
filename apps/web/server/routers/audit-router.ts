import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const auditRouter = router({
    listEvents: protectedProcedure
      .input(
        z.object({
          page: z.number().optional(),
          limit: z.number().optional(),
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          action: z.string().optional(),
          actorPersonId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, "/audit/events", input);
      }),

    getSummary: protectedProcedure
      .input(
        z.object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, "/audit/summary", input);
      }),
  })

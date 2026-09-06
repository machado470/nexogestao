import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const settingsRouter = router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as NexoContext, "/organization-settings");
    }),

    administrativeSummary: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as NexoContext, "/organization-settings/administrative-summary");
    }),

    update: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          timezone: z.string().optional(),
          currency: z.enum(["BRL", "USD", "EUR"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return authedPatch(ctx as NexoContext, "/organization-settings", input);
      }),
  })

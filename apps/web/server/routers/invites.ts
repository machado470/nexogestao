import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const invitesRouter = router({
    invite: protectedProcedure
      .input(
        z.object({
          email: z.string().email(),
          role: z.enum(["ADMIN", "MANAGER", "STAFF", "VIEWER"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return authedPost(ctx as NexoContext, "/auth/invite", input);
      }),

    members: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as NexoContext, "/auth/organization/members");
    }),
  })

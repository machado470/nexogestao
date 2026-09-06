import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const riskRouter = router({
    explainPerson: protectedProcedure
      .input(z.object({ personId: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/risk/explain/person/${input.personId}`);
      }),
  })

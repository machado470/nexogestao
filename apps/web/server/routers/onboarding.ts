import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const onboardingRouter = router({
    status: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as NexoContext, "/onboarding/status");
    }),

    completeStep: protectedProcedure
      .input(z.object({ step: z.string().min(1), payload: z.any().optional() }))
      .mutation(async ({ ctx, input }) => {
        return authedPost(ctx as NexoContext, "/onboarding/complete-step", input);
      }),

    complete: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/onboarding/complete", input);
    }),
  })

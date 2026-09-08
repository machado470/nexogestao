import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  authedGet,
  authedPost,
  type NexoContext,
} from "../_core/nexoTransport";

const onboardingStepInput = z
  .object({
    step: z.enum(["createCustomer", "createService", "createCharge"]),
  })
  .strict();

const completeOnboardingInput = z.object({}).strict();

export const onboardingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    return authedGet(ctx as NexoContext, "/onboarding/status");
  }),

  completeStep: protectedProcedure
    .input(onboardingStepInput)
    .mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/onboarding/complete-step", input);
    }),

  complete: protectedProcedure
    .input(completeOnboardingInput)
    .mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/onboarding/complete", input);
    }),
});

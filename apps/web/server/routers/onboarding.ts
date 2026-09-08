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

export const onboardingStatusOutput = z
  .object({
    requiresOnboarding: z.boolean(),
    steps: z
      .object({
        createCustomer: z.boolean(),
        createService: z.boolean(),
        createCharge: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .nullable();

async function parseOnboardingStatus(request: Promise<unknown>) {
  return onboardingStatusOutput.parse(await request);
}

export const onboardingRouter = router({
  status: protectedProcedure
    .output(onboardingStatusOutput)
    .query(({ ctx }) =>
      parseOnboardingStatus(
        authedGet(ctx as NexoContext, "/onboarding/status")
      )
    ),

  completeStep: protectedProcedure
    .input(onboardingStepInput)
    .output(onboardingStatusOutput)
    .mutation(({ ctx, input }) =>
      parseOnboardingStatus(
        authedPost(ctx as NexoContext, "/onboarding/complete-step", input)
      )
    ),

  complete: protectedProcedure
    .input(completeOnboardingInput)
    .output(onboardingStatusOutput)
    .mutation(({ ctx, input }) =>
      parseOnboardingStatus(
        authedPost(ctx as NexoContext, "/onboarding/complete", input)
      )
    ),
});

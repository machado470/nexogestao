import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export const ONBOARDING_STEPS = [
  "createCustomer",
  "createService",
  "createCharge",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export class CompleteOnboardingStepDto {
  @ApiProperty({ enum: ONBOARDING_STEPS })
  @IsIn(ONBOARDING_STEPS as unknown as string[])
  step!: OnboardingStep;
}

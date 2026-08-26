import { PlanName } from '@prisma/client'
import { IsIn, IsOptional, IsString } from 'class-validator'

export class CreateCheckoutSessionDto {
  @IsIn([PlanName.STARTER, PlanName.PRO, PlanName.BUSINESS])
  planName!: PlanName

  @IsOptional()
  @IsString()
  successUrl?: string

  @IsOptional()
  @IsString()
  cancelUrl?: string
}

import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  UseGuards,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { Request } from 'express'
import { BillingService } from './billing.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto'
import { PlanName } from '@prisma/client'

const PRICE_PLAN_MAP: Record<string, PlanName> = {
  price_starter: 'STARTER',
  price_pro: 'PRO',
  price_business: 'BUSINESS',
  price_scale: 'BUSINESS',
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /*
  ========================================
  CREATE CHECKOUT SESSION
  ========================================
  */

  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('create-checkout-session')
  async createCheckoutSession(
    @Req() req: any,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    const orgId = req.user.orgId

    const planName = PRICE_PLAN_MAP[dto.priceId]

    if (!planName) {
      throw new BadRequestException(`priceId desconhecido: ${dto.priceId}`)
    }

    return this.billingService.createCheckoutSession(
      orgId,
      planName,
      dto.successUrl,
      dto.cancelUrl,
    )
  }

  /*
  ========================================
  STRIPE WEBHOOK
  ========================================
  */

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body))
    return this.billingService.handleWebhook(rawBody, signature)
  }

  /*
  ========================================
  SUBSCRIPTION
  ========================================
  */

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  async getSubscription(@Req() req: any) {
    const orgId = req.user.orgId
    return this.billingService.getSubscription(orgId)
  }

  /*
  ========================================
  CANCEL SUBSCRIPTION
  ========================================
  */

  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('cancel')
  async cancelSubscription(@Req() req: any) {
    const orgId = req.user.orgId
    return this.billingService.cancelSubscription(orgId)
  }

  /*
  ========================================
  PLANS
  ========================================
  */

  @UseGuards(JwtAuthGuard)
  @Get('plans')
  async getPlans() {
    const { PLAN_LIMITS } = await import('./billing.service')

    return Object.entries(PLAN_LIMITS).map(([name, limits]) => ({
      name,
      label: limits.label,
      limits,
    }))
  }

  /*
  ========================================
  BILLING STATUS
  ========================================
  */

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getBillingStatus(@Req() req: any) {
    const orgId = req.user.orgId
    return this.billingService.getBillingStatus(orgId)
  }

  /*
  ========================================
  BILLING LIMITS
  ========================================
  */

  @UseGuards(JwtAuthGuard)
  @Get('limits')
  async getBillingLimits(@Req() req: any) {
    const orgId = req.user.orgId
    return this.billingService.getBillingLimits(orgId)
  }
}

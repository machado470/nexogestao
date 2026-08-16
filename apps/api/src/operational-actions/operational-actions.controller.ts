import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator'
import { OperationalActionsService, type OperationalActionType } from './operational-actions.service'

export class OperationalActionDto {
  @IsIn(['RETRY_WHATSAPP_MESSAGE', 'SEND_PAYMENT_REMINDER', 'RECALCULATE_RISK', 'RUN_GOVERNANCE_CHECK'])
  actionType!: OperationalActionType
  @IsString() @MinLength(1) entityType!: string
  @IsString() @MinLength(1) entityId!: string
  @IsOptional() @IsString() sourceSignalId?: string
  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

export class RecoverOperationalActionDto {
  @IsString() @MinLength(1) executionId!: string
  @IsOptional() @IsString() recoveryReason?: string
}


@Controller('internal/operational-actions')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles('ADMIN')
export class OperationalActionsController {
  constructor(private readonly actions: OperationalActionsService) {}
  @Get()
  list() { return { supportedActionTypes: this.actions.getSupportedActionTypes() } }

  @Get('diagnostics')
  diagnostics(@Request() req: any) {
    return this.actions.getOperationalActionsDiagnostics(req.user.orgId)
  }

  @Post('request')
  request(@Request() req: any, @Body() body: OperationalActionDto) {
    return this.actions.request({ orgId: req.user.orgId, actorUserId: req.user.sub, ...body })
  }
  @Post('execute')
  execute(@Request() req: any, @Body() body: OperationalActionDto) {
    return this.actions.execute({ orgId: req.user.orgId, actorUserId: req.user.sub, ...body })
  }

  @Post('cancel')
  cancel(@Request() req: any, @Body() body: OperationalActionDto) {
    return this.actions.cancel({ orgId: req.user.orgId, actorUserId: req.user.sub, ...body })
  }

  @Post('recover-stuck')
  recoverStuck(@Request() req: any, @Body() body: RecoverOperationalActionDto) {
    return this.actions.recoverStuckExecution({ orgId: req.user.orgId, actorUserId: req.user.sub, ...body })
  }
}

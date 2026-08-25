import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { GovernanceReadService } from './governance-read.service'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'

@Controller('governance')
@UseGuards(JwtAuthGuard)
export class GovernanceReadController {
  constructor(
    private readonly read: GovernanceReadService,
  ) {}

  @Get('summary')
  async summary(@Req() req: any) {
    return this.read.getSummary(req.user.orgId)
  }

  @Get('runs')
  async runs(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.read.listRuns(
      req.user.orgId,
      limit ? Number(limit) : 20,
    )
  }

  @Get('runs/latest')
  async latest(@Req() req: any) {
    return this.read.getLatestRun(req.user.orgId)
  }

  @Get('auto-score')
  async autoScore(@Req() req: any) {
    return this.read.getAutoScore(req.user.orgId)
  }

  @Get('operational-state')
  @UseGuards(ActiveUserGuard, RolesGuard)
  @Roles('ADMIN', 'OPERADOR', 'FINANCEIRO')
  async operationalState(@Req() req: any) {
    return this.read.getOperationalState(req.user.orgId)
  }
}

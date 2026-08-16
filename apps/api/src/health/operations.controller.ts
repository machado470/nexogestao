import { Controller, Get, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { OperationalMonitoringService } from './operational-monitoring.service'
import { OperationalIncidentsService } from './operational-incidents.service'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles('ADMIN')
@Controller('internal/operations')
export class OperationsController {
  constructor(
    private readonly monitoring: OperationalMonitoringService,
    private readonly incidents: OperationalIncidentsService,
  ) {}

  @Get('summary')
  summary() { return this.monitoring.summary() }

  @Get('incidents')
  incidentsFeed() { return this.incidents.list() }

  @Get('queues')
  queues() { return this.monitoring.queues() }

  @Get('dlq')
  dlq() { return this.monitoring.dlq() }

  @Get('recent-failures')
  async recentFailures(@Request() req: any) {
    const [incidents, summary] = await Promise.all([this.incidents.list(), this.monitoring.summary()])
    return { orgId: req.user.orgId, incidents: incidents.filter((i) => i.severity !== 'INFO').slice(0, 30), metrics: summary.metrics }
  }
}

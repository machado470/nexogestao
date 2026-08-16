import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common'
import { QueueMetricsExporterService } from '../common/metrics/queue-metrics-exporter.service'
import { QueueService } from '../queue/queue.service'
import { WhatsAppObservabilityService } from '../common/metrics/whatsapp-observability.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { OperationalDiagnosticsService } from './operational-diagnostics.service'
import { OperationalSignalsService } from './operational-signals.service'
import { QueueObservabilityService } from '../common/metrics/queue-observability.service'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@Controller('internal')
export class InternalStatsController {
  constructor(
    private readonly queueService: QueueService,
    private readonly waMetrics: WhatsAppObservabilityService,
    private readonly operationalDiagnosticsService: OperationalDiagnosticsService,
    private readonly operationalSignalsService: OperationalSignalsService,
    private readonly queueObservability: QueueObservabilityService,
    private readonly queueMetricsExporter: QueueMetricsExporterService,
  ) {}

  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('stats')
  async stats(@Request() req: any) {
    return {
      orgId: req.user.orgId,
      scope: 'organization',
      infrastructureMetrics: {
        available: false,
        reason: 'Métricas globais não são disponibilizadas a administradores de organização.',
      },
    }
  }


  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('metrics')
  metrics() {
    return this.queueMetricsExporter.exportJson()
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('diagnostics/operational')
  async operationalDiagnostics(@Request() req: any, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 100)
    return this.operationalDiagnosticsService.runForOrg(req.user.orgId, Number.isFinite(parsedLimit) ? parsedLimit : 100)
  }

  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @Get('operational-signals')
  async operationalSignals(@Request() req: any, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 20)
    return this.operationalSignalsService.listForOrg(req.user.orgId, Number.isFinite(parsedLimit) ? parsedLimit : 20)
  }

  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @Get('operational-signals/next-best-action')
  async nextBestAction(@Request() req: any) {
    return this.operationalSignalsService.getNextBestAction(req.user.orgId)
  }
}

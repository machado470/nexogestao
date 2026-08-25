import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Org } from '../auth/decorators/org.decorator'
import { DashboardService } from './dashboard.service'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /dashboard/metrics
   * Retorna métricas operacionais gerais
   */
  @Get('metrics')
  @UseGuards(ActiveUserGuard)
  @Roles('ADMIN', 'OPERADOR', 'FINANCEIRO')
  async getMetrics(@Org() orgId: string) {
    return this.dashboard.getMetrics(orgId)
  }

  /**
   * GET /dashboard/alerts
   * Retorna alertas operacionais: ordens atrasadas, cobranças vencidas, serviços do dia
   */
  @Get('alerts')
  @UseGuards(ActiveUserGuard)
  @Roles('ADMIN', 'OPERADOR', 'FINANCEIRO')
  async getAlerts(@Org() orgId: string) {
    return this.dashboard.getAlerts(orgId)
  }

  /**
   * GET /dashboard/revenue
   * Retorna dados de faturamento por período (últimos 12 meses)
   */
  @Get('revenue')
  @Roles('ADMIN')
  async getRevenue(@Org() orgId: string) {
    return this.dashboard.getRevenueData(orgId)
  }

  /**
   * GET /dashboard/growth
   * Retorna crescimento de clientes por mês (últimos 12 meses)
   */
  @Get('growth')
  @Roles('ADMIN')
  async getGrowth(@Org() orgId: string) {
    return this.dashboard.getCustomerGrowth(orgId)
  }

  /**
   * GET /dashboard/service-orders-status
   * Retorna status detalhado das ordens de serviço
   */
  @Get('service-orders-status')
  @Roles('ADMIN')
  async getServiceOrdersStatus(@Org() orgId: string) {
    return this.dashboard.getServiceOrdersStatus(orgId)
  }

  /**
   * GET /dashboard/charges-status
   * Retorna status detalhado das cobranças
   */
  @Get('charges-status')
  @Roles('ADMIN')
  async getChargesStatus(@Org() orgId: string) {
    return this.dashboard.getChargesStatus(orgId)
  }
}

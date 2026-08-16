import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { WebhookService } from './webhook.service'
import { CreateWebhookDto } from './dto/create-webhook.dto'
import { UpdateWebhookDto } from './dto/update-webhook.dto'
import { WebhookDeliveriesQueryDto } from './dto/webhook-deliveries-query.dto'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(@Request() req: any, @Body() body: CreateWebhookDto) {
    const orgId = req.user.orgId
    const data = await this.webhookService.createEndpoint(orgId, body)
    return { ok: true, data }
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  async list(@Request() req: any) {
    const orgId = req.user.orgId
    const data = await this.webhookService.listEndpoints(orgId)
    return { ok: true, data }
  }

  @Put(':id')
  @Roles('ADMIN', 'MANAGER')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: UpdateWebhookDto) {
    const orgId = req.user.orgId
    const data = await this.webhookService.updateEndpoint(orgId, id, body)
    return { ok: true, data }
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  async remove(@Request() req: any, @Param('id') id: string) {
    const orgId = req.user.orgId
    const data = await this.webhookService.deleteEndpoint(orgId, id)
    return { ok: true, data }
  }

  @Get('deliveries')
  @Roles('ADMIN', 'MANAGER')
  async deliveries(@Request() req: any, @Query() query: WebhookDeliveriesQueryDto) {
    const orgId = req.user.orgId
    const data = await this.webhookService.listDeliveries(orgId, query)
    return { ok: true, data }
  }

  @Post('deliveries/:deliveryId/replay')
  @Roles('ADMIN')
  async replayFailedDelivery(@Request() req: any, @Param('deliveryId') deliveryId: string) {
    const data = await this.webhookService.replayFailedDelivery({
      orgId: req.user.orgId,
      deliveryId,
      actorUserId: req.user.sub,
    })
    return { ok: true, data }
  }
}

import { Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@Controller('notifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getMyNotifications(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.notificationsService.getNotifications(req.user.orgId, req.user.sub, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      category,
    })
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const unreadCount = await this.notificationsService.getUnreadCount(req.user.orgId, req.user.sub)
    return { unreadCount }
  }

  @Post('read-all')
  markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.orgId, req.user.sub)
  }

  @Patch(':id/read')
  markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.orgId, req.user.sub, id)
  }
}

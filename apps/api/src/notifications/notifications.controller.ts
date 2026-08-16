import { Controller, Get, Header, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { PrismaService } from '../prisma/prisma.service'
import { heartbeatFrame, NotificationStreamHub, notificationFrame } from './notification-stream-hub.service'
import { isSafeLastEventId, NOTIFICATION_TRANSPORT_KIND, NOTIFICATION_TRANSPORT_VERSION } from './notification-transport'

@Controller('notifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly hub: NotificationStreamHub,
  ) {}

  @Get('stream')
  @Header('Content-Type', 'text/event-stream')
  async stream(@Request() req, @Res() res: Response) {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
    })
    res.flushHeaders()
    const orgId = req.user.orgId as string
    const userId = req.user.sub as string
    const marker = req.headers['last-event-id']
    const write = (frame: string) => !res.destroyed && res.write(frame)
    const registration = this.hub.add(orgId, userId, write, () => res.end())
    if (!registration) { res.statusCode = 429; res.end(); return }
    let closed = false
    let heartbeat: NodeJS.Timeout | undefined
    let revalidate: NodeJS.Timeout | undefined
    let expiry: NodeJS.Timeout | undefined
    const close = () => {
      if (closed) return
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (revalidate) clearInterval(revalidate)
      if (expiry) clearTimeout(expiry)
      registration.remove()
      if (!res.writableEnded) res.end()
    }
    req.once('close', close); res.once('error', close)

    const replayed = await this.replay(orgId, userId, marker, write)
    if (closed) return
    if (!registration.finishReplay(replayed)) {
      if (!res.writableEnded) res.write('event: resync\ndata: {"kind":"resync"}\n\n')
      close(); return
    }
    heartbeat = setInterval(() => { try { write(heartbeatFrame()) } catch { close() } }, 25_000)
    revalidate = setInterval(async () => {
      const active = await this.prisma.user.count({ where: { id: userId, orgId, active: true } }).catch(() => 0)
      if (!active) close()
    }, 25_000)
    const expiresIn = Math.max(0, Number(req.user.exp ?? 0) * 1000 - Date.now())
    expiry = setTimeout(close, Math.min(expiresIn || 1, 2_147_483_647))
  }

  private async replay(orgId: string, userId: string, marker: unknown, write: (frame: string) => boolean) {
    const replayed = new Set<string>()
    if (marker === undefined) { write('event: ready\ndata: {"kind":"ready"}\n\n'); return replayed }
    if (!isSafeLastEventId(marker)) { write('event: resync\ndata: {"kind":"resync"}\n\n'); return replayed }
    const cursor = await this.prisma.notificationRecipient.findFirst({
      where: { id: marker, userId, notification: { orgId } }, select: { id: true, createdAt: true },
    })
    if (!cursor) { write('event: resync\ndata: {"kind":"resync"}\n\n'); return replayed }
    const rows = await this.prisma.notificationRecipient.findMany({
      where: { userId, notification: { orgId }, OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ] },
      select: { id: true, userId: true, createdAt: true, notification: { select: { id: true, orgId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 101,
    })
    if (rows.length > 100) { write('event: resync\ndata: {"kind":"resync"}\n\n'); return replayed }
    for (const row of rows) {
      replayed.add(row.id)
      if (!write(notificationFrame({
      version: NOTIFICATION_TRANSPORT_VERSION, kind: NOTIFICATION_TRANSPORT_KIND,
      eventId: row.id, orgId: row.notification.orgId, userId: row.userId,
      notificationId: row.notification.id, createdAt: row.createdAt.toISOString(),
      }))) break
    }
    return replayed
  }

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

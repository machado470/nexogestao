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
    const write = (frame: string) => !res.destroyed && !res.writableEnded && res.write(frame)
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
    // IncomingMessage.close means that the request body has been consumed too.  For
    // a GET that happens immediately after the headers and is not a disconnect.
    req.once('aborted', close); res.once('close', close); res.once('error', close)

    const replayed = await this.replay(orgId, userId, marker, res, () => closed)
    if (closed) return
    if (!replayed || !registration.finishReplay(replayed)) {
      await this.writeFrame(res, 'event: resync\ndata: {"kind":"resync"}\n\n', () => closed)
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

  private async writeFrame(res: Response, frame: string, closed: () => boolean) {
    if (closed() || res.destroyed || res.writableEnded) return false
    try {
      if (res.write(frame)) return true
      return await new Promise<boolean>(resolve => {
        const finish = (result: boolean) => {
          res.removeListener('drain', onDrain); res.removeListener('close', onClose); res.removeListener('error', onClose)
          resolve(result)
        }
        const onDrain = () => finish(!closed())
        const onClose = () => finish(false)
        res.once('drain', onDrain); res.once('close', onClose); res.once('error', onClose)
      })
    } catch { return false }
  }

  private async replay(orgId: string, userId: string, marker: unknown, res: Response, closed: () => boolean) {
    const replayed = new Set<string>()
    if (marker === undefined) return await this.writeFrame(res, 'event: ready\ndata: {"kind":"ready"}\n\n', closed) ? replayed : null
    if (!isSafeLastEventId(marker)) return await this.writeFrame(res, 'event: resync\ndata: {"kind":"resync"}\n\n', closed) ? replayed : null
    const cursor = await this.prisma.notificationRecipient.findFirst({
      where: { id: marker, userId, notification: { orgId } }, select: { id: true, createdAt: true },
    })
    if (!cursor) return await this.writeFrame(res, 'event: resync\ndata: {"kind":"resync"}\n\n', closed) ? replayed : null
    const rows = await this.prisma.notificationRecipient.findMany({
      where: { userId, notification: { orgId }, OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ] },
      select: { id: true, userId: true, createdAt: true, notification: { select: { id: true, orgId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 101,
    })
    if (rows.length > 100) return await this.writeFrame(res, 'event: resync\ndata: {"kind":"resync"}\n\n', closed) ? replayed : null
    for (const row of rows) {
      replayed.add(row.id)
      if (!await this.writeFrame(res, notificationFrame({
      version: NOTIFICATION_TRANSPORT_VERSION, kind: NOTIFICATION_TRANSPORT_KIND,
      eventId: row.id, orgId: row.notification.orgId, userId: row.userId,
      notificationId: row.notification.id, createdAt: row.createdAt.toISOString(),
      }), closed)) return null
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

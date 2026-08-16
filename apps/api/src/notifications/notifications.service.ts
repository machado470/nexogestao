import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Prisma, Notification } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { QUEUE_NAMES } from '../queue/queue.constants'
import { isSafeNotificationRouteHint } from '@nexogestao/common'

export type NotificationAudience =
  | { kind: 'user'; userId: string }
  | { kind: 'organization' }

export type CreateNotificationInput = {
  orgId: string
  eventKey: string
  type: string
  title: string
  message: string
  severity: string
  source: string
  audience: NotificationAudience
  entityType?: string
  entityId?: string
  routeHint?: string
  metadata?: Prisma.InputJsonValue
  occurredAt: Date
}

const CATEGORY_TYPES: Record<string, string[]> = {
  appointments: ['APPOINTMENT_CONFIRMED', 'APPOINTMENT_NO_SHOW', 'SERVICE_ORDER_COMPLETED'],
  finance: ['PAYMENT_OVERDUE', 'PAYMENT_RECEIVED', 'CHARGE_OVERDUE'],
  risk: ['RISK_LEVEL_CHANGED'],
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value instanceof Date ? value.toISOString() : value
}

function payloadHash(input: CreateNotificationInput, recipientIds: string[]) {
  const material = {
    type: input.type,
    title: input.title,
    message: input.message,
    severity: input.severity,
    source: input.source,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    routeHint: input.routeHint ?? null,
    metadata: input.metadata ?? null,
    occurredAt: input.occurredAt,
    audience: input.audience.kind === 'user'
      ? { kind: 'user', userId: input.audience.userId }
      : { kind: 'organization' },
    recipients: [...recipientIds].sort(),
  }
  return createHash('sha256').update(JSON.stringify(canonicalize(material))).digest('hex')
}

export function notificationJobId(orgId: string, eventKey: string) {
  return createHash('sha256').update(`${orgId}\0${eventKey}`).digest('hex')
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async enqueueNotification(input: CreateNotificationInput) {
    return this.queueService.addJob(
      QUEUE_NAMES.NOTIFICATIONS,
      'create-notification',
      input,
      { jobId: notificationJobId(input.orgId, input.eventKey) },
    )
  }

  async createNotificationNow(input: CreateNotificationInput): Promise<Notification> {
    if (!input.eventKey.trim()) throw new BadRequestException('eventKey é obrigatório')
    if (input.routeHint && !isSafeNotificationRouteHint(input.routeHint)) {
      throw new BadRequestException('routeHint não permitido')
    }

    const existing = await this.prisma.notification.findUnique({
      where: { orgId_eventKey: { orgId: input.orgId, eventKey: input.eventKey } },
      include: { recipients: { select: { userId: true } } },
    })
    if (existing) {
      // Organizational delivery is a snapshot: retries retain the recipients selected
      // by the winning request. Individual delivery must still resolve the requested
      // user, rather than being normalized with recipients already persisted.
      const recipientIds = input.audience.kind === 'organization'
        ? existing.recipients.map(({ userId }) => userId)
        : await this.resolveAudience(input.orgId, input.audience)
      const hash = payloadHash(input, recipientIds)
      return this.assertIdempotent(existing, hash)
    }

    const recipientIds = await this.resolveAudience(input.orgId, input.audience)
    const hash = payloadHash(input, recipientIds)

    try {
      return await this.prisma.notification.create({
        data: {
          orgId: input.orgId,
          eventKey: input.eventKey,
          payloadHash: hash,
          type: input.type,
          title: input.title,
          message: input.message,
          severity: input.severity,
          source: input.source,
          entityType: input.entityType,
          entityId: input.entityId,
          routeHint: input.routeHint,
          metadata: input.metadata,
          occurredAt: input.occurredAt,
          recipients: { create: recipientIds.map((userId) => ({ userId })) },
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.notification.findUnique({
          where: { orgId_eventKey: { orgId: input.orgId, eventKey: input.eventKey } },
        })
        if (winner) return this.assertIdempotent(winner, hash)
      }
      throw error
    }
  }

  async createNotification(input: CreateNotificationInput) {
    return this.createNotificationNow(input)
  }

  async getNotifications(
    orgId: string,
    userId: string,
    params: { page?: number; limit?: number; category?: string } = {},
  ) {
    const page = Math.max(1, params.page ?? 1)
    const limit = Math.max(1, Math.min(params.limit ?? 20, 50))
    const types = params.category && params.category !== 'all' ? CATEGORY_TYPES[params.category] : undefined
    if (params.category && params.category !== 'all' && !types) {
      throw new BadRequestException('Categoria de notificação inválida')
    }
    const where: Prisma.NotificationRecipientWhereInput = {
      userId,
      notification: { orgId, ...(types ? { type: { in: types } } : {}) },
    }
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        include: { notification: true },
        orderBy: { notification: { createdAt: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationRecipient.count({ where }),
      this.prisma.notificationRecipient.count({ where: { userId, readAt: null, notification: { orgId } } }),
    ])
    return {
      items: rows.map(({ notification, readAt }) => ({
        ...notification,
        read: readAt !== null,
        readAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      unreadCount,
    }
  }

  getUnreadCount(orgId: string, userId: string) {
    return this.prisma.notificationRecipient.count({
      where: { userId, readAt: null, notification: { orgId } },
    })
  }

  async markAsRead(orgId: string, userId: string, notificationId: string) {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: { notificationId, userId, notification: { orgId }, readAt: null },
      data: { readAt: new Date() },
    })
    if (result.count === 0) {
      const belongsToUser = await this.prisma.notificationRecipient.count({
        where: { notificationId, userId, notification: { orgId } },
      })
      if (!belongsToUser) throw new NotFoundException('Notificação não encontrada')
    }
    return { success: true }
  }

  async markAllAsRead(orgId: string, userId: string) {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null, notification: { orgId } },
      data: { readAt: new Date() },
    })
    return { success: true, updated: result.count }
  }

  private async resolveAudience(orgId: string, audience: NotificationAudience) {
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        active: true,
        ...(audience.kind === 'user' ? { id: audience.userId } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    if (audience.kind === 'user' && users.length !== 1) {
      throw new BadRequestException('Destinatário deve ser um usuário ativo da organização')
    }
    if (users.length === 0) throw new BadRequestException('A notificação precisa de destinatários ativos')
    return users.map(({ id }) => id)
  }

  private assertIdempotent(existing: Notification, hash: string) {
    if (existing.payloadHash !== hash) {
      throw new ConflictException('eventKey já utilizado com payload ou audiência diferente')
    }
    return existing
  }
}

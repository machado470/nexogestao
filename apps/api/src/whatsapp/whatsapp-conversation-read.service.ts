import { Injectable } from '@nestjs/common'
import { Prisma, WhatsAppConversationStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class WhatsAppConversationReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(orgId: string, filters: any = {}) {
    const statusFilter = filters.status ?? (filters.onlyFailed ? WhatsAppConversationStatus.FAILED : undefined) ?? (filters.onlyPending ? WhatsAppConversationStatus.WAITING_CUSTOMER : undefined)
    const where: Prisma.WhatsAppConversationWhereInput = {
      orgId,
      customerId: filters.customerId ?? undefined,
      status: statusFilter,
      priority: filters.priority ?? undefined,
      contextType: filters.contextType ?? undefined,
      unreadCount: filters.onlyUnread ? { gt: 0 } : undefined,
    }
    if (filters.search) where.OR = [
      { phone: { contains: filters.search, mode: 'insensitive' } },
      { title: { contains: filters.search, mode: 'insensitive' } },
      { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
    ]
    const take = Math.min(Math.max(Number(filters.limit ?? 50), 1), 200)
    const items = await this.prisma.whatsAppConversation.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ priority: 'desc' }, { unreadCount: 'desc' }, { status: 'asc' }, { lastMessageAt: 'desc' }],
      cursor: filters.cursor ? { id: String(filters.cursor) } : undefined,
      skip: filters.cursor ? 1 : 0,
      take: take + 1,
    })
    const hasMore = items.length > take
    const sliced = hasMore ? items.slice(0, take) : items
    const customerIds = [...new Set(sliced.map(item => item.customerId).filter(Boolean) as string[])]
    const conversationIds = sliced.map(item => item.id)
    const [failedGroups, pendingCharges, overdueCharges, appointments, serviceOrders] = await Promise.all([
      this.prisma.whatsAppMessage.groupBy({ by: ['conversationId'], where: { orgId, conversationId: { in: conversationIds }, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.charge.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: 'PENDING' }, _count: { _all: true } }),
      this.prisma.charge.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: 'OVERDUE' }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, _count: { _all: true } }),
      this.prisma.serviceOrder.groupBy({ by: ['customerId'], where: { orgId, customerId: { in: customerIds }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }, _count: { _all: true } }),
    ])
    const failedMap = new Map(failedGroups.map(g => [g.conversationId, g._count._all]))
    const pendingMap = new Map(pendingCharges.map(g => [g.customerId, g._count._all]))
    const overdueMap = new Map(overdueCharges.map(g => [g.customerId, g._count._all]))
    const appointmentMap = new Map(appointments.map(g => [g.customerId, g._count._all]))
    const serviceOrderMap = new Map(serviceOrders.map(g => [g.customerId, g._count._all]))
    return {
      items: sliced.map((item, index) => ({
        ...item,
        inboxPosition: index + 1,
        evaluatedAt: item.updatedAt,
        ownership: item.assignedUserId ? { userId: item.assignedUserId, name: null, locked: true } : null,
        priority: item.priority,
        priorityReason: item.priorityReason ?? null,
        lastMessage: item.lastMessageAt,
        noResponseSince: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? item.lastInboundAt : null,
        noResponseMinutes: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? Math.floor((Date.now() - item.lastInboundAt.getTime()) / 60000) : null,
        noResponseHours: item.lastInboundAt && (!item.lastOutboundAt || item.lastInboundAt > item.lastOutboundAt) ? Number(((Date.now() - item.lastInboundAt.getTime()) / 3600000).toFixed(1)) : null,
        failedMessageCount: failedMap.get(item.id) ?? 0,
        intent: (item as any).intent ?? 'GENERAL_INTENT',
        slaStatus: (item as any).slaStatus ?? 'OK',
        waitingSince: (item as any).waitingSince ?? null,
        responseDueAt: (item as any).responseDueAt ?? null,
        suggestedActions: (item as any).suggestedActions ?? [],
        intelligence: { intent: (item as any).intent ?? 'GENERAL_INTENT', priority: (item as any).priority ?? item.priority, slaStatus: (item as any).slaStatus ?? 'OK', suggestedActions: (item as any).suggestedActions ?? [], explanation: (item as any).intelligenceExplanation ?? { intentReason: (item as any).intentReason ?? null, priorityReason: (item as any).priorityReason ?? null } },
        operationalStatus: item.status === WhatsAppConversationStatus.FAILED || (failedMap.get(item.id) ?? 0) > 0 ? 'Falha oficial' : item.status === WhatsAppConversationStatus.WAITING_CUSTOMER ? 'Aguardando cliente' : item.status === WhatsAppConversationStatus.RESOLVED ? 'Resolvida' : 'Em atendimento',
        governanceSignal: (item as any).metadata?.governanceSignal ?? null,
        flags: {
          hasPendingCharge: (pendingMap.get(item.customerId ?? '') ?? 0) > 0 || (overdueMap.get(item.customerId ?? '') ?? 0) > 0,
          hasNoResponse: item.status === WhatsAppConversationStatus.WAITING_CUSTOMER,
          hasFailure: item.status === WhatsAppConversationStatus.FAILED || (failedMap.get(item.id) ?? 0) > 0,
        },
      })),
      nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    }
  }

  getConversation(orgId: string, conversationId: string) {
    return this.prisma.whatsAppConversation.findFirst({ where: { id: conversationId, orgId }, include: { customer: true } })
  }

  getMessages(orgId: string, conversationId: string) {
    return this.prisma.whatsAppMessage.findMany({ where: { orgId, conversationId }, orderBy: { createdAt: 'desc' } })
  }

  findById(id: string, orgId?: string) {
    return this.prisma.whatsAppConversation.findFirst({ where: { id, ...(orgId ? { orgId } : {}) } })
  }

  async getMessagesFeed(params: { orgId: string; customerId: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 30, 100)
    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { orgId: params.orgId, customerId: params.customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    })
    const hasMore = messages.length > limit
    const items = hasMore ? messages.slice(0, limit) : messages
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null }
  }
}

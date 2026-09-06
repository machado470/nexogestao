import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Prisma, WhatsAppWebhookStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import { WhatsAppObservabilityService } from '../common/metrics/whatsapp-observability.service'
import { PrismaService } from '../prisma/prisma.service'
import { QUEUE_NAMES, WHATSAPP_QUEUE_JOB_NAMES } from '../queue/queue.constants'
import { QueueService } from '../queue/queue.service'

export type InboundWebhookProcessor = (
  provider: string,
  payload: unknown,
  options: { orgId?: string | null; traceId?: string | null; webhookEventId?: string | null },
) => Promise<any>

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly waMetrics: WhatsAppObservabilityService,
  ) {}

  async listWebhookEvents(orgId: string, filters: {
    provider?: string
    status?: WhatsAppWebhookStatus
    traceId?: string
    providerMessageId?: string
    createdAtFrom?: string
    createdAtTo?: string
    limit?: number
    cursor?: string
  } = {}) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const where: Prisma.WhatsAppWebhookEventWhereInput = {
      orgId,
      provider: filters.provider?.trim() || undefined,
      status: filters.status,
      traceId: filters.traceId?.trim() || undefined,
      providerMessageId: filters.providerMessageId?.trim() || undefined,
    }
    if (filters.createdAtFrom || filters.createdAtTo) {
      where.createdAt = {
        gte: filters.createdAtFrom ? new Date(filters.createdAtFrom) : undefined,
        lte: filters.createdAtTo ? new Date(filters.createdAtTo) : undefined,
      }
    }
    const take = Math.min(Math.max(Number(filters.limit ?? 50), 1), 100)
    const items = await this.prisma.whatsAppWebhookEvent.findMany({
      where,
      take: take + 1,
      skip: filters.cursor ? 1 : 0,
      cursor: filters.cursor ? { id: filters.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orgId: true,
        provider: true,
        eventType: true,
        status: true,
        retryAttempts: true,
        errorMessage: true,
        processedAt: true,
        traceId: true,
        providerMessageId: true,
        payload: true,
        createdAt: true,
      },
    })
    const hasMore = items.length > take
    const page = hasMore ? items.slice(0, take) : items
    return {
      items: page.map((event) => this.toWebhookEventSummary(event)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    }
  }

  async getWebhookEventDetail(orgId: string, id: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const event = await this.prisma.whatsAppWebhookEvent.findFirst({ where: { id, orgId } })
    if (!event) throw new NotFoundException('webhook WhatsApp não encontrado')
    return this.toWebhookEventDetail(event)
  }

  async replayWebhookEvents(orgId: string, input: { ids: string[]; force?: boolean; requestedBy?: string | null }) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const ids = Array.from(new Set((input.ids ?? []).map((id) => String(id).trim()).filter(Boolean)))
    if (ids.length === 0) throw new BadRequestException('ids é obrigatório')

    const events = await this.prisma.whatsAppWebhookEvent.findMany({ where: { id: { in: ids }, orgId } })
    const foundIds = new Set(events.map((event) => event.id))
    const missingIds = ids.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) throw new NotFoundException(`webhook WhatsApp não encontrado: ${missingIds.join(',')}`)

    const blocked = events.filter((event) => event.status !== 'FAILED' && !input.force)
    if (blocked.length > 0) {
      const processed = blocked.find((event) => event.status === 'PROCESSED')
      if (processed) throw new BadRequestException('webhooks PROCESSED exigem force=true para replay')
      throw new BadRequestException('apenas webhooks FAILED podem ser reenfileirados sem force=true')
    }

    const replayed: any[] = []
    for (const event of events) {
      if (!event.orgId?.trim()) throw new BadRequestException(`webhook ${event.id} sem orgId não pode ser reenfileirado`)
      const replayAttemptId = `replay-${randomUUID()}`
      const job = await this.enqueueInboundWebhook({
        webhookEventId: event.id,
        orgId: event.orgId,
        provider: event.provider,
        traceId: event.traceId ?? replayAttemptId,
        receivedAt: event.createdAt,
        replayAttemptId,
      })
      this.logger.log(JSON.stringify({
        action: 'whatsapp.inbound_webhook.replay_requested',
        webhookEventId: event.id,
        orgId: event.orgId,
        provider: event.provider,
        traceId: event.traceId ?? null,
        replayAttemptId,
        force: Boolean(input.force),
        requestedBy: input.requestedBy ?? null,
        jobId: job.id?.toString() ?? null,
      }))
      replayed.push({ webhookEventId: event.id, status: event.status, replayAttemptId, jobId: job.id?.toString() ?? null })
    }

    return { ok: true, requested: ids.length, replayed }
  }

  async getWebhookDlqStats(orgId: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    const [failedCount, oldestFailed, failedByProvider, failedByOrg, retryAttemptsSummary] = await Promise.all([
      this.prisma.whatsAppWebhookEvent.count({ where: { orgId, status: 'FAILED' } }),
      this.prisma.whatsAppWebhookEvent.findFirst({ where: { orgId, status: 'FAILED' }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } }),
      this.prisma.whatsAppWebhookEvent.groupBy({ by: ['provider'], where: { orgId, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.whatsAppWebhookEvent.groupBy({ by: ['orgId'], where: { orgId, status: 'FAILED' }, _count: { _all: true } }),
      this.prisma.whatsAppWebhookEvent.aggregate({ where: { orgId, status: 'FAILED' }, _avg: { retryAttempts: true }, _max: { retryAttempts: true }, _min: { retryAttempts: true } }),
    ])
    const now = Date.now()
    return {
      failedCount,
      oldestFailedEvent: oldestFailed ? { id: oldestFailed.id, createdAt: oldestFailed.createdAt, ageMs: now - oldestFailed.createdAt.getTime() } : null,
      failedByProvider: failedByProvider.map((item) => ({ provider: item.provider, count: item._count._all })),
      failedByOrg: failedByOrg.map((item) => ({ orgId: item.orgId, count: item._count._all })),
      retryAttempts: {
        min: retryAttemptsSummary._min.retryAttempts ?? 0,
        max: retryAttemptsSummary._max.retryAttempts ?? 0,
        avg: retryAttemptsSummary._avg.retryAttempts ?? 0,
      },
    }
  }

  async createWebhookEvent(input: { provider: string; eventType: string; payload: Prisma.InputJsonValue; orgId?: string | null; traceId?: string | null }) {
    const providerMessageId = this.extractProviderMessageId(input.payload)
    return this.prisma.whatsAppWebhookEvent.create({
      data: {
        orgId: input.orgId ?? null,
        provider: input.provider,
        eventType: input.eventType,
        payload: input.payload,
        traceId: input.traceId ?? null,
        providerMessageId,
        status: 'RECEIVED',
      },
    })
  }


  async enqueueInboundWebhook(input: {
    webhookEventId: string
    orgId: string
    provider: string
    traceId: string
    receivedAt: Date | string
    replayAttemptId?: string | null
  }) {
    if (!input.orgId?.trim()) throw new BadRequestException('orgId é obrigatório para webhook WhatsApp')

    const receivedAt = input.receivedAt instanceof Date ? input.receivedAt : new Date(input.receivedAt)
    const payload = {
      webhookEventId: input.webhookEventId,
      orgId: input.orgId,
      provider: input.provider,
      traceId: input.traceId,
      receivedAt: receivedAt.toISOString(),
    }

    let job: any

    try {
      job = await this.queueService.addJob(
        QUEUE_NAMES.WHATSAPP,
        WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
        payload,
        { jobId: input.replayAttemptId ? `whatsapp:inbound-webhook:${input.webhookEventId}:${input.replayAttemptId}` : `whatsapp:inbound-webhook:${input.webhookEventId}` },
      )
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        await this.prisma.whatsAppWebhookEvent.updateMany({
          where: {
            id: input.webhookEventId,
            orgId: input.orgId,
            status: 'RECEIVED',
          },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        })
      }

      throw error
    }

    this.waMetrics.incInboundWebhookQueued()
    this.logger.log(JSON.stringify({
      action: 'whatsapp.inbound_webhook.job_queued',
      queue: QUEUE_NAMES.WHATSAPP,
      jobName: WHATSAPP_QUEUE_JOB_NAMES.INBOUND_WEBHOOK,
      jobId: job.id?.toString() ?? null,
      webhookEventId: input.webhookEventId,
      orgId: input.orgId,
      provider: input.provider,
      traceId: input.traceId,
      receivedAt: payload.receivedAt,
      replayAttemptId: input.replayAttemptId ?? null,
    }))

    return job
  }

  async processPersistedInboundWebhook(input: {
    webhookEventId: string
    orgId: string
    provider: string
    traceId?: string | null
    receivedAt?: Date | string | null
  }, processInboundWebhook: InboundWebhookProcessor) {
    const event = await this.prisma.whatsAppWebhookEvent.findFirst({
      where: { id: input.webhookEventId, orgId: input.orgId, provider: input.provider },
    })
    if (!event) throw new BadRequestException('webhook WhatsApp persistido não encontrado')
    if (event.status === 'PROCESSED') {
      return { provider: input.provider, processed: 0, results: [], skipped: true, reason: 'already_processed', durationMs: 0 }
    }

    await this.prisma.whatsAppWebhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', errorMessage: null },
    })

    const result = await processInboundWebhook(input.provider, event.payload, {
      orgId: event.orgId ?? input.orgId,
      traceId: input.traceId ?? null,
      webhookEventId: event.id,
    })

    await this.completeWebhookEvent(event.id, {
      status: 'PROCESSED',
      orgId: result.results?.find((item: any) => item.orgId)?.orgId ?? event.orgId ?? input.orgId,
    })

    return result
  }

  async recordWebhookEventAttempt(id: string, errorMessage: string) {
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id },
      data: {
        retryAttempts: { increment: 1 },
        errorMessage,
      },
    })
  }

  async deadLetterWebhookEvent(input: { id: string; orgId: string; errorMessage: string; attemptsMade: number }) {
    const errorMessage = `dead_letter after ${input.attemptsMade} attempts: ${input.errorMessage}`
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id: input.id },
      data: {
        status: 'FAILED',
        orgId: input.orgId,
        errorMessage,
        retryAttempts: input.attemptsMade,
        processedAt: new Date(),
      },
    })
  }

  async completeWebhookEvent(id: string, data: { status: 'PROCESSED' | 'FAILED'; orgId?: string | null; errorMessage?: string | null }) {
    return this.prisma.whatsAppWebhookEvent.update({
      where: { id },
      data: {
        status: data.status,
        orgId: data.orgId ?? undefined,
        errorMessage: data.errorMessage ?? null,
        processedAt: data.status === 'PROCESSED' ? new Date() : undefined,
      },
    })
  }

  private toWebhookEventSummary(event: any) {
    return {
      id: event.id,
      orgId: event.orgId,
      provider: event.provider,
      eventType: event.eventType,
      status: event.status,
      retryAttempts: event.retryAttempts,
      errorMessage: event.errorMessage,
      processedAt: event.processedAt,
      traceId: event.traceId,
      providerMessageId: event.providerMessageId ?? this.extractProviderMessageId(event.payload),
      createdAt: event.createdAt,
      payloadMetadata: this.buildPayloadMetadata(event.payload),
    }
  }

  private toWebhookEventDetail(event: any) {
    return {
      ...this.toWebhookEventSummary(event),
      rawPayloadMetadata: this.buildPayloadMetadata(event.payload),
    }
  }

  private buildPayloadMetadata(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      return { shape: typeof payload, topLevelKeys: [], providerMessageIds: [] }
    }
    const topLevelKeys = Object.keys(payload as Record<string, unknown>).sort()
    const providerMessageIds = this.extractProviderMessageIds(payload)
    return {
      shape: Array.isArray(payload) ? 'array' : 'object',
      topLevelKeys,
      providerMessageIds,
      approxBytes: Buffer.byteLength(JSON.stringify(payload)),
    }
  }

  private extractProviderMessageId(payload: unknown) {
    return this.extractProviderMessageIds(payload)[0] ?? null
  }

  private extractProviderMessageIds(payload: unknown) {
    const ids = new Set<string>()
    const visit = (value: unknown, depth: number) => {
      if (depth > 8 || value == null) return
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1)
        return
      }
      if (typeof value !== 'object') return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (['providerMessageId', 'messageId', 'wamid'].includes(key) && typeof child === 'string' && child.trim()) {
          ids.add(child.trim())
        }
        visit(child, depth + 1)
      }
    }
    visit(payload, 0)
    return Array.from(ids)
  }

}

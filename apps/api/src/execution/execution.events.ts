import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import type {
  ExecutionEventPayload,
  ExecutionRunnerStatus,
  ExecutionStateSummary,
} from './execution.types'

const EXECUTION_EVENT_ACTION = 'EXECUTION_EVENT'

@Injectable()
export class ExecutionEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  private buildTimelineInput(
    orgId: string,
    payload: ExecutionEventPayload,
  ) {
    return {
      orgId,
      action: EXECUTION_EVENT_ACTION,
      description:
        `${payload.eventType} | ${payload.actionId} => ${payload.status}`,
      customerId: payload.customerId,
      metadata: {
        ...payload,
        orgId,
        entityId: payload.entityId,
        reasonCode: payload.reasonCode ?? null,
        cooldownUntil:
          payload.cooldownUntil
          ?? payload.explanation?.cooldownUntil
          ?? null,
      },
    }
  }

  async recordEvent(
    orgId: string,
    payload: ExecutionEventPayload,
  ) {
    await this.timeline.log(
      this.buildTimelineInput(orgId, payload),
    )
  }

  async recordEventInTransaction(
    orgId: string,
    payload: ExecutionEventPayload,
    tx: Prisma.TransactionClient,
  ) {
    return this.timeline.logInTransaction(
      this.buildTimelineInput(orgId, payload),
      tx,
    )
  }

  async dispatchRecordedEventWebhook(
    orgId: string,
    payload: ExecutionEventPayload,
    timelineEventId: string,
  ) {
    await this.timeline.dispatchPersistedEventWebhook(
      this.buildTimelineInput(orgId, payload),
      timelineEventId,
    )
  }

  async hasRecentExecution(params: {
    orgId: string
    executionKey: string
    withinMs: number
  }) {
    const since = new Date(Date.now() - params.withinMs)

    const recent = await this.prisma.timelineEvent.findFirst({
      where: {
        orgId: params.orgId,
        action: EXECUTION_EVENT_ACTION,
        createdAt: { gte: since },
        metadata: {
          path: ['executionKey'],
          equals: params.executionKey,
        },
        OR: [
          { metadata: { path: ['status'], equals: 'executed' as ExecutionRunnerStatus } },
          { metadata: { path: ['eventType'], equals: 'EXECUTION_STARTED' } },
        ],
      },
      select: { id: true },
    })

    return Boolean(recent?.id)
  }

  async countRecentFailures(params: {
    orgId: string
    executionKey: string
    withinMs: number
  }) {
    const since = new Date(Date.now() - params.withinMs)

    return this.prisma.timelineEvent.count({
      where: {
        orgId: params.orgId,
        action: EXECUTION_EVENT_ACTION,
        createdAt: { gte: since },
        metadata: {
          path: ['executionKey'],
          equals: params.executionKey,
        },
        OR: [
          { metadata: { path: ['status'], equals: 'failed' as ExecutionRunnerStatus } },
          { metadata: { path: ['status'], equals: 'throttled' as ExecutionRunnerStatus } },
        ],
      },
    })
  }

  async getStateSummary(orgId: string, sinceMs = 1000 * 60 * 60 * 24): Promise<ExecutionStateSummary> {
    const since = new Date(Date.now() - sinceMs)

    const rows = await this.prisma.timelineEvent.findMany({
      where: {
        orgId,
        action: EXECUTION_EVENT_ACTION,
        createdAt: { gte: since },
      },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })

    const summary: ExecutionStateSummary = {
      pending: 0,
      executed: 0,
      failed: 0,
      blocked: 0,
      blockedRecent: 0,
      skipped: 0,
      throttled: 0,
    }

    for (const row of rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const status = String(metadata.status ?? '').trim()

      if (status === 'executed') summary.executed += 1
      else if (status === 'failed') summary.failed += 1
      else if (status === 'blocked' || status === 'requires_confirmation') {
        const reasonCode = String(metadata.reasonCode ?? '')
        if (reasonCode === 'blocked_recent_execution') summary.blockedRecent += 1
        else summary.blocked += 1
      }
      else if (status === 'throttled') summary.throttled += 1
      else summary.pending += 1
    }

    return summary
  }

  async listRecentEvents(
    orgId: string,
    limit = 100,
    filters?: { status?: string; actionId?: string; entityType?: string },
  ) {
    const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100))
    const normalizedStatus = typeof filters?.status === 'string' && filters.status.trim() ? filters.status.trim() : null
    const normalizedActionId =
      typeof filters?.actionId === 'string' && filters.actionId.trim() ? filters.actionId.trim() : null
    const normalizedEntityType =
      typeof filters?.entityType === 'string' && filters.entityType.trim() ? filters.entityType.trim() : null

    const rows = await this.prisma.timelineEvent.findMany({
      where: {
        orgId,
        action: EXECUTION_EVENT_ACTION,
      },
      select: {
        id: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(normalizedLimit * 4, 100),
    })

    return rows
      .map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      return {
        id: row.id,
        actionId: String(meta.actionId ?? ''),
        decisionId: String(meta.decisionId ?? ''),
        entityType: String(meta.entityType ?? ''),
        entityId: String(meta.entityId ?? ''),
        eventType: String(meta.eventType ?? ''),
        status: String(meta.status ?? ''),
        intent: typeof meta.intent === 'string' ? meta.intent : null,
        priority: typeof meta.priority === 'string' ? meta.priority : null,
        correlationId: typeof meta.correlationId === 'string' ? meta.correlationId : null,
        reasonCode: typeof meta.reasonCode === 'string' ? meta.reasonCode : null,
        mode: typeof meta.mode === 'string' ? meta.mode : null,
        result: typeof meta.result === 'object' && meta.result ? meta.result : null,
        timestamp:
          typeof meta.timestamp === 'string' && meta.timestamp
            ? meta.timestamp
            : row.createdAt.toISOString(),
        metadata: typeof meta.metadata === 'object' && meta.metadata ? meta.metadata : null,
        diagnostics: {
          executionKey: typeof meta.executionKey === 'string' ? meta.executionKey : null,
          policySignal: typeof meta.policySignal === 'string' ? meta.policySignal : null,
          governanceSignal: typeof meta.governanceSignal === 'string' ? meta.governanceSignal : null,
          orgId: typeof meta.orgId === 'string' ? meta.orgId : orgId,
          cooldownUntil: typeof meta.cooldownUntil === 'string' ? meta.cooldownUntil : null,
          explanation:
            typeof meta.explanation === 'object' && meta.explanation
              ? (meta.explanation as Record<string, unknown>)
              : null,
        },
      }
      })
      .filter((event) => {
        if (normalizedStatus && event.status !== normalizedStatus) return false
        if (normalizedActionId && event.actionId !== normalizedActionId) return false
        if (normalizedEntityType && event.entityType !== normalizedEntityType) return false
        return true
      })
      .slice(0, normalizedLimit)
  }

  async listRecentExecutions(
    orgId: string,
    limit = 100,
  ) {
    const rows = await this.listRecentEvents(orgId, limit)
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      status: row.status,
      reasonCode: row.reasonCode,
      intent: row.intent,
      priority: row.priority,
      correlationId: row.correlationId,
    }))
  }
}

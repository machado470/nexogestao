import { Injectable, Inject } from '@nestjs/common'
import { RequestContextService } from '../common/context/request-context.service'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineQueryDto } from './dto/timeline-query.dto'
import { WebhookDispatcher } from '../webhooks/webhook.dispatcher'
import { Prisma } from '@prisma/client'
import { timelineEventFilterValues } from './timeline-events'

type TimelineLogInput = {
  orgId: string
  action: string
  personId?: string | null
  description?: string | null
  customerId?: string | null
  serviceOrderId?: string | null
  appointmentId?: string | null
  chargeId?: string | null
  metadata?: Record<string, unknown> | null
}

type TimelineTransactionClient = Pick<
  Prisma.TransactionClient,
  'person' | 'customer' | 'timelineEvent'
>

function pickActorUserId(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null

  const v1 = metadata.actorUserId
  if (typeof v1 === 'string' && v1.trim()) return v1.trim()

  const v2 = metadata.updatedBy ?? metadata.createdBy
  if (typeof v2 !== 'string') return null
  const s = v2.trim()
  return s ? s : null
}

function pickActorPersonId(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const v = metadata.actorPersonId
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function pickString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null
  const value = metadata[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function getEventOrigin(metadata?: Record<string, unknown> | null): string {
  const raw =
    pickString(metadata ?? null, 'origin')
    ?? pickString(metadata ?? null, 'source')
    ?? pickString(metadata ?? null, 'eventType')
  return raw ?? 'unknown_origin'
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly webhookDispatcher: WebhookDispatcher,
  ) {}

  private logInvalidCustomerReference(params: {
    input: TimelineLogInput
    reason: string
    customerId: string | null
  }) {
    const metadata = params.input.metadata ?? null
    console.error(
      JSON.stringify({
        event: 'timeline_invalid_customer_reference',
        reason: params.reason,
        origin: getEventOrigin(metadata),
        orgId: params.input.orgId,
        action: params.input.action,
        actionId: pickString(metadata, 'actionId'),
        entityId:
          params.input.chargeId
          ?? params.input.serviceOrderId
          ?? params.input.appointmentId
          ?? pickString(metadata, 'entityId')
          ?? null,
        customerId: params.customerId,
      }),
    )
  }

  async log(input: TimelineLogInput) {
    if (!input.orgId) {
      throw new Error('TimelineService.log(): orgId é obrigatório')
    }

    let personId = input.personId ?? null

    if (!personId) {
      const actorPersonId = pickActorPersonId(input.metadata ?? null)

      if (actorPersonId) {
        const exists = await this.prisma.person.findFirst({
          where: { id: actorPersonId, orgId: input.orgId },
          select: { id: true },
        })
        if (exists?.id) personId = exists.id
      }
    }

    if (!personId) {
      const actorUserId = pickActorUserId(input.metadata ?? null)

      if (actorUserId) {
        const person = await this.prisma.person.findFirst({
          where: { orgId: input.orgId, userId: actorUserId },
          select: { id: true },
        })

        if (person?.id) {
          personId = person.id
        }
      }
    }

    if (!personId && String(input.action || '').startsWith('APPOINTMENT_')) {
      console.warn(
        '[Timeline] APPOINTMENT_* sem personId. action=%s orgId=%s metadataKeys=%s',
        input.action,
        input.orgId,
        input.metadata ? Object.keys(input.metadata).join(',') : '',
      )
    }

    const resolvedCustomerId =
      input.customerId ??
      pickString(input.metadata ?? null, 'customerId')

    let customerId: string | null = null

    if (resolvedCustomerId) {
      const customerExists = await this.prisma.customer.findFirst({
        where: { id: resolvedCustomerId, orgId: input.orgId },
        select: { id: true },
      })

      if (customerExists?.id) {
        customerId = customerExists.id
      } else {
        this.logInvalidCustomerReference({
          input,
          reason: 'customer_not_found_for_org',
          customerId: resolvedCustomerId,
        })
        return null
      }
    }

    const serviceOrderId =
      input.serviceOrderId ??
      pickString(input.metadata ?? null, 'serviceOrderId') ??
      pickString(input.metadata ?? null, 'executionId')

    const appointmentId =
      input.appointmentId ??
      pickString(input.metadata ?? null, 'appointmentId')

    const chargeId =
      input.chargeId ??
      pickString(input.metadata ?? null, 'chargeId')

    const requestId = this.requestContext.requestId

    if (!String(input.action || '').trim()) {
      console.warn('[Timeline] Skipped event due to missing minimal data')
      return null
    }

    const metadata = JSON.parse(
      JSON.stringify({
        ...(input.metadata ?? {}),
        ...(requestId ? { requestId } : {}),
      }),
    ) as Prisma.InputJsonValue

    let event: { id: string } | null = null

    try {
      event = await this.prisma.timelineEvent.create({
        data: {
          orgId: input.orgId,
          action: input.action,
          personId,
          description: input.description ?? null,
          customerId,
          serviceOrderId,
          appointmentId,
          chargeId,
          metadata,
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        this.logInvalidCustomerReference({
          input,
          reason: 'foreign_key_rejected',
          customerId,
        })
        return null
      }
      throw error
    }

    try {
      await this.webhookDispatcher.dispatchTimelineEvent({
        orgId: input.orgId,
        action: input.action,
        timelineEventId: event.id,
        data: {
          personId,
          description: input.description ?? null,
          metadata: input.metadata ?? null,
        },
      })
    } catch (error) {
      console.warn(
        '[Timeline] Falha ao despachar webhook. action=%s orgId=%s error=%s',
        input.action,
        input.orgId,
        error instanceof Error ? error.message : String(error),
      )
    }

    return event
  }

  /**
   * Persists authoritative evidence as part of the caller's transaction.
   * Webhooks are intentionally not dispatched here: they are an integration
   * side effect and must never make transactional evidence visible before the
   * owning business transaction commits.
   */
  async logInTransaction(
    input: TimelineLogInput,
    tx: TimelineTransactionClient,
  ) {
    if (!input.orgId) {
      throw new Error('TimelineService.logInTransaction(): orgId é obrigatório')
    }
    if (!String(input.action || '').trim()) {
      throw new Error('TimelineService.logInTransaction(): action é obrigatória')
    }

    let personId = input.personId ?? null
    if (!personId) {
      const actorPersonId = pickActorPersonId(input.metadata ?? null)
      if (actorPersonId) {
        const person = await tx.person.findFirst({
          where: { id: actorPersonId, orgId: input.orgId },
          select: { id: true },
        })
        personId = person?.id ?? null
      }
    }
    if (!personId) {
      const actorUserId = pickActorUserId(input.metadata ?? null)
      if (actorUserId) {
        const person = await tx.person.findFirst({
          where: { orgId: input.orgId, userId: actorUserId },
          select: { id: true },
        })
        personId = person?.id ?? null
      }
    }

    const resolvedCustomerId =
      input.customerId ?? pickString(input.metadata ?? null, 'customerId')
    let customerId: string | null = null
    if (resolvedCustomerId) {
      const customer = await tx.customer.findFirst({
        where: { id: resolvedCustomerId, orgId: input.orgId },
        select: { id: true },
      })
      if (!customer) {
        throw new Error(
          'TimelineService.logInTransaction(): customerId inválido para a organização',
        )
      }
      customerId = customer.id
    }

    const requestId = this.requestContext.requestId
    const metadata = JSON.parse(
      JSON.stringify({
        ...(input.metadata ?? {}),
        ...(requestId ? { requestId } : {}),
      }),
    ) as Prisma.InputJsonValue

    return tx.timelineEvent.create({
      data: {
        orgId: input.orgId,
        action: input.action,
        personId,
        description: input.description ?? null,
        customerId,
        serviceOrderId:
          input.serviceOrderId
          ?? pickString(input.metadata ?? null, 'serviceOrderId')
          ?? pickString(input.metadata ?? null, 'executionId'),
        appointmentId:
          input.appointmentId
          ?? pickString(input.metadata ?? null, 'appointmentId'),
        chargeId:
          input.chargeId ?? pickString(input.metadata ?? null, 'chargeId'),
        metadata,
      },
    })
  }

  async listByOrg(orgId: string, query?: TimelineQueryDto) {
    const take =
      query?.limit && Number(query.limit) > 0
        ? Math.min(Number(query.limit), 200)
        : 50

    const action = query?.action
    const actionValues = action ? timelineEventFilterValues(String(action)) : []
    const personId = query?.personId
    const cursorRaw = String(query?.cursor ?? '').trim()
    let cursorId: string | null = null

    if (cursorRaw) {
      const cursorParts = cursorRaw.split('_')
      const parsedCursorId = cursorParts[cursorParts.length - 1]
      cursorId = parsedCursorId || null
    }

    return this.prisma.timelineEvent.findMany({
      where: {
        orgId,
        ...(actionValues.length > 0 ? { action: { in: actionValues } } : {}),
        ...(personId ? { personId: String(personId) } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
  }

  async listByPersonInOrg(orgId: string, personId: string) {
    return this.prisma.timelineEvent.findMany({
      where: { orgId, personId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async listByCustomerInOrg(orgId: string, customerId: string, limit = 100) {
    return this.prisma.timelineEvent.findMany({
      where: {
        orgId,
        OR: [
          { customerId },
          { metadata: { path: ['customerId'], equals: customerId } },
          { metadata: { path: ['entityId'], equals: customerId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    })
  }

  async listByServiceOrderInOrg(orgId: string, serviceOrderId: string, limit = 100) {
    return this.prisma.timelineEvent.findMany({
      where: {
        orgId,
        OR: [
          { serviceOrderId },
          { metadata: { path: ['serviceOrderId'], equals: serviceOrderId } },
          { metadata: { path: ['entityId'], equals: serviceOrderId } },
          { metadata: { path: ['executionId'], equals: serviceOrderId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    })
  }
}

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { RequestContextService } from '../common/context/request-context.service'

type OutboxTransaction = Pick<Prisma.TransactionClient, 'operationalOutboxEvent'>

export type OperationalEventInput = {
  orgId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  actorId?: string | null
  correlationId?: string | null
  causationId?: string | null
  idempotencyKey: string
  occurredAt?: Date
  payload: Prisma.InputJsonObject
  schemaVersion?: number
}

@Injectable()
export class OutboxService {
  constructor(private readonly requestContext: RequestContextService) {}

  enqueue(tx: OutboxTransaction, input: OperationalEventInput) {
    if (!input.orgId || !input.idempotencyKey || !input.eventType) {
      throw new Error('Outbox requer orgId, eventType e idempotencyKey')
    }
    return tx.operationalOutboxEvent.create({
      data: {
        orgId: input.orgId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion ?? 1,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorId: input.actorId ?? null,
        correlationId:
          input.correlationId?.trim() || this.requestContext.requestId || randomUUID(),
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        occurredAt: input.occurredAt ?? new Date(),
      },
    })
  }
}

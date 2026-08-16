import { Injectable } from '@nestjs/common'
import { OperationalOutboxEvent, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimBatch(input: { workerId: string; batchSize: number; staleBefore: Date }) {
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<OperationalOutboxEvent[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "id" FROM "OperationalOutboxEvent"
          WHERE (
            ("status" IN ('PENDING', 'RETRY') AND "availableAt" <= NOW())
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${input.staleBefore})
          )
          ORDER BY "createdAt"
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.batchSize}
        )
        UPDATE "OperationalOutboxEvent" event
        SET "status" = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${input.workerId},
            "attempts" = event."attempts" + 1, "updatedAt" = NOW()
        FROM candidates WHERE event."id" = candidates."id"
        RETURNING event.*
      `)
      return rows
    })
  }

  markProcessed(id: string, workerId: string) {
    return this.prisma.operationalOutboxEvent.updateMany({
      where: { id, status: 'PROCESSING', lockedBy: workerId },
      data: { status: 'PROCESSED', processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    })
  }

  markFailed(input: { id: string; workerId: string; attempts: number; maxAttempts: number; error: string }) {
    const definitive = input.attempts >= input.maxAttempts
    const delayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, input.attempts - 1))
    return this.prisma.operationalOutboxEvent.updateMany({
      where: { id: input.id, status: 'PROCESSING', lockedBy: input.workerId },
      data: {
        status: definitive ? 'FAILED' : 'RETRY',
        availableAt: new Date(Date.now() + delayMs),
        lockedAt: null,
        lockedBy: null,
        lastError: input.error,
      },
    })
  }
}

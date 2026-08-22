import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'

type LockedPerson = {
  id: string
  riskScore: number
}

const ACTION = 'ADMIN_FORCE_OPERATIONAL_STATE_NORMAL'
const DESCRIPTION = 'Override administrativo consciente para DEV/DEMO'

@Injectable()
export class ForceNormalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  async execute(input: {
    orgId: string
    actorUserId: string
    personId: string
  }) {
    const committed = await this.prisma.$transaction(async (tx) => {
      // Serializa writers cooperativos desta operação e impede que duas
      // chamadas simultâneas produzam evidências duplicadas.
      const people = await tx.$queryRaw<LockedPerson[]>(Prisma.sql`
        SELECT "id", "riskScore"
        FROM "Person"
        WHERE "id" = ${input.personId}
          AND "orgId" = ${input.orgId}
          AND "active" = true
        FOR UPDATE
      `)
      const person = people[0]

      if (!person) throw new NotFoundException('Pessoa não encontrada.')

      const openActions = await tx.correctiveAction.count({
        where: {
          personId: input.personId,
          status: 'OPEN',
          person: { id: input.personId, orgId: input.orgId, active: true },
        },
      })

      if (person.riskScore === 0 && openActions === 0) {
        return { changed: false as const }
      }

      const resolvedAt = new Date()
      const corrected = await tx.correctiveAction.updateMany({
        where: {
          personId: input.personId,
          status: 'OPEN',
          person: { id: input.personId, orgId: input.orgId, active: true },
        },
        data: { status: 'DONE', resolvedAt },
      })

      const updated = await tx.person.updateMany({
        where: { id: input.personId, orgId: input.orgId, active: true },
        data: { riskScore: 0 },
      })
      if (updated.count !== 1) throw new NotFoundException('Pessoa não encontrada.')

      const metadata = {
        actorUserId: input.actorUserId,
        affectedPersonId: input.personId,
        previousRiskScore: person.riskScore,
        newRiskScore: 0,
        correctedActionsCount: corrected.count,
        reason: DESCRIPTION,
      }
      const event = await this.timeline.logInTransaction(
        {
          orgId: input.orgId,
          personId: input.personId,
          action: ACTION,
          description: DESCRIPTION,
          metadata,
        },
        tx,
      )

      return { changed: true as const, eventId: event.id, metadata }
    })

    if (committed.changed) {
      await this.timeline.dispatchPersistedEventWebhook(
        {
          orgId: input.orgId,
          personId: input.personId,
          action: ACTION,
          description: DESCRIPTION,
          metadata: committed.metadata,
        },
        committed.eventId,
      )
    }

    return committed
  }
}

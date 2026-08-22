import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { OperationalStateValue } from './operational-state.service'

const VALID_STATES: OperationalStateValue[] = [
  'NORMAL',
  'WARNING',
  'RESTRICTED',
  'SUSPENDED',
]

@Injectable()
export class OperationalStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private isOperationalStateValue(
    value: unknown,
  ): value is OperationalStateValue {
    return (
      typeof value === 'string'
      && (VALID_STATES as string[]).includes(value)
    )
  }

  async getLastState(
    params: {
      orgId: string
      personId: string
    },
    tx?: Prisma.TransactionClient,
  ): Promise<OperationalStateValue | null> {
    const query = {
      where: {
        orgId: params.orgId,
        personId: params.personId,
        action: 'OPERATIONAL_STATE_CHANGED',
      },
      orderBy: {
        createdAt: 'desc' as const,
      },
    }

    const last = tx
      ? await tx.timelineEvent.findFirst(query)
      : await this.prisma.timelineEvent.findFirst(query)

    if (
      !last?.metadata
      || typeof last.metadata !== 'object'
    ) {
      return null
    }

    const meta = last.metadata as any
    const to = meta.to ?? meta.state

    if (this.isOperationalStateValue(to)) {
      return to
    }

    return null
  }
}

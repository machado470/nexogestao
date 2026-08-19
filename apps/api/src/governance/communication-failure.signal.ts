import { PrismaService } from '../prisma/prisma.service'

export type CommunicationFailureSignal = {
  communicationFailure: boolean
  failedMessageCount: number
  lastFailedAt: string | null
}

type CommunicationFailureSignalPrisma = Pick<
  PrismaService,
  'whatsAppMessage'
>

export async function buildCommunicationFailureSignal(
  prisma: CommunicationFailureSignalPrisma,
  input: { orgId: string; customerId?: string | null },
): Promise<CommunicationFailureSignal> {
  const where = {
    orgId: input.orgId,
    customerId: input.customerId ?? undefined,
    status: 'FAILED' as const,
  }

  const [failedMessageCount, lastFailed] = await Promise.all([
    prisma.whatsAppMessage.count({ where }),
    prisma.whatsAppMessage.findFirst({
      where,
      orderBy: { failedAt: 'desc' },
      select: { failedAt: true },
    }),
  ])

  return {
    communicationFailure: failedMessageCount > 0,
    failedMessageCount,
    lastFailedAt: lastFailed?.failedAt?.toISOString() ?? null,
  }
}


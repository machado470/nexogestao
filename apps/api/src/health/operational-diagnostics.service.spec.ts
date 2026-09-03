import { Prisma } from '@prisma/client'
import { OperationalDiagnosticsService } from './operational-diagnostics.service'

describe('OperationalDiagnosticsService', () => {
  function build() {
    const prisma: any = {
      charge: { findMany: jest.fn() },
      payment: { findMany: jest.fn() },
      serviceOrder: { findMany: jest.fn() },
      whatsAppMessage: { findMany: jest.fn() },
      timelineEvent: { findMany: jest.fn() },
      riskSnapshot: { findFirst: jest.fn() },
      governanceRun: { findFirst: jest.fn() },
    }
    const service = new OperationalDiagnosticsService(prisma)
    return { prisma, service }
  }

  it('detecta charge PAID sem payment e payment com charge não PAID', async () => {
    const { prisma, service } = build()
    prisma.charge.findMany
      .mockResolvedValueOnce([{ id: 'ch-1', orgId: 'org-a', updatedAt: new Date('2026-05-01T00:00:00Z') }])
      .mockResolvedValueOnce([])
    prisma.payment.findMany.mockResolvedValueOnce([{ id: 'pay-1', orgId: 'org-a', chargeId: 'ch-2', charge: { status: 'PENDING' } }])
    prisma.serviceOrder.findMany.mockResolvedValue([])
    prisma.whatsAppMessage.findMany.mockResolvedValue([])
    prisma.timelineEvent.findMany.mockResolvedValue([])
    prisma.riskSnapshot.findFirst.mockResolvedValue({ id: 'risk-1', orgId: 'org-a', createdAt: new Date() })
    prisma.governanceRun.findFirst.mockResolvedValue({ id: 'gov-1', orgId: 'org-a', createdAt: new Date() })

    const result = await service.runForOrg('org-a', 100)
    expect(result.findings.some((f) => f.code === 'CHARGE_PAID_WITHOUT_PAYMENT')).toBe(true)
    expect(result.findings.some((f) => f.code === 'PAYMENT_WITHOUT_PAID_CHARGE')).toBe(true)
  })

  it('detecta service order concluída sem charge e whatsapp stuck', async () => {
    const { prisma, service } = build()
    prisma.charge.findMany.mockResolvedValue([])
    prisma.payment.findMany.mockResolvedValue([])
    prisma.serviceOrder.findMany
      .mockResolvedValueOnce([{ id: 'so-1', orgId: 'org-a', status: 'COMPLETED' }])
      .mockResolvedValueOnce([])
    prisma.whatsAppMessage.findMany
      .mockResolvedValueOnce([{ id: 'wa-1', orgId: 'org-a', status: 'QUEUED', createdAt: new Date('2026-05-01T00:00:00Z') }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prisma.timelineEvent.findMany.mockResolvedValue([])
    prisma.riskSnapshot.findFirst.mockResolvedValue({ id: 'risk-1', orgId: 'org-a', createdAt: new Date() })
    prisma.governanceRun.findFirst.mockResolvedValue({ id: 'gov-1', orgId: 'org-a', createdAt: new Date() })

    const result = await service.runForOrg('org-a', 100)
    expect(result.findings.some((f) => f.code === 'SERVICE_ORDER_COMPLETED_WITHOUT_CHARGE')).toBe(true)
    expect(result.findings.some((f) => f.code === 'WHATSAPP_MESSAGE_STUCK')).toBe(true)
  })

  it('respeita orgId na consulta e formato sem dados sensíveis', async () => {
    const { prisma, service } = build()
    prisma.charge.findMany.mockResolvedValue([])
    prisma.payment.findMany.mockResolvedValue([])
    prisma.serviceOrder.findMany.mockResolvedValue([])
    prisma.whatsAppMessage.findMany.mockResolvedValue([])
    prisma.timelineEvent.findMany.mockResolvedValue([])
    prisma.riskSnapshot.findFirst.mockResolvedValue(null)
    prisma.governanceRun.findFirst.mockResolvedValue(null)

    const result = await service.runForOrg('org-safe', 10)
    expect(prisma.charge.findMany.mock.calls[0][0].where.orgId).toBe('org-safe')
    expect(result.findings[0]).toEqual(expect.objectContaining({ id: expect.any(String), severity: expect.any(String), area: expect.any(String), code: expect.any(String), title: expect.any(String), description: expect.any(String), entityType: expect.any(String), entityId: expect.any(String), orgId: 'org-safe', detectedAt: expect.any(String), suggestedAction: expect.any(String), metadata: expect.any(Object) }))
    expect(JSON.stringify(result)).not.toContain('phone')
    expect(JSON.stringify(result)).not.toContain('content')
  })

  it('consulta metadata ausente com os filtros JSON nullable do Prisma e emite o diagnóstico', async () => {
    const { prisma, service } = build()
    prisma.charge.findMany.mockResolvedValue([])
    prisma.payment.findMany.mockResolvedValue([])
    prisma.serviceOrder.findMany.mockResolvedValue([])
    prisma.whatsAppMessage.findMany.mockResolvedValue([])
    prisma.timelineEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'timeline-1', orgId: 'org-a', action: 'PAYMENT_RECEIVED' }])
    prisma.riskSnapshot.findFirst.mockResolvedValue({ id: 'risk-1', createdAt: new Date() })
    prisma.governanceRun.findFirst.mockResolvedValue({ id: 'gov-1', orgId: 'org-a', createdAt: new Date() })

    const result = await service.runForOrg('org-a', 100)

    expect(prisma.timelineEvent.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        orgId: 'org-a',
        OR: [
          { metadata: { equals: Prisma.DbNull } },
          { metadata: { equals: Prisma.JsonNull } },
          { metadata: { equals: {} } },
        ],
      }),
    }))
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'TIMELINE_EVENT_MISSING_METADATA',
      entityId: 'timeline-1',
      metadata: { action: 'PAYMENT_RECEIVED' },
    }))
  })
})

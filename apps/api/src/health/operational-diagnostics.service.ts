import { Injectable } from '@nestjs/common'
import { ChargeStatus, Prisma, ServiceOrderStatus, WhatsAppMessageStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type Severity = 'INFO' | 'WARNING' | 'CRITICAL'
type Area = 'FINANCE' | 'SERVICE_ORDER' | 'WHATSAPP' | 'TIMELINE' | 'RISK' | 'GOVERNANCE' | 'NOTIFICATION'

export type OperationalDiagnosticFinding = {
  id: string
  severity: Severity
  area: Area
  code: string
  title: string
  description: string
  entityType: string
  entityId: string
  orgId: string | null
  detectedAt: string
  suggestedAction: string
  metadata: Record<string, unknown>
}

@Injectable()
export class OperationalDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async runForOrg(orgId: string, limit = 100) {
    const safeLimit = Math.max(1, Math.min(limit, 200))
    const detectedAt = new Date().toISOString()
    const findings: OperationalDiagnosticFinding[] = []

    const add = (finding: Omit<OperationalDiagnosticFinding, 'id' | 'detectedAt'>) => {
      if (findings.length >= safeLimit) return
      findings.push({ ...finding, id: `${finding.code}:${finding.entityId}`, detectedAt })
    }

    const [paidWithoutPayment, paymentWithoutPaidCharge, overdueWithoutTimeline, completedWithoutCharge, completedWithoutTimeline, stuckMessages, failedWithoutRetry, deliveredWithoutProviderId, criticalTimelineWithoutEntity, criticalTimelineWithoutMetadata, latestRiskSnapshot, latestGovernanceRun] = await Promise.all([
      this.prisma.charge.findMany({ where: { orgId, status: ChargeStatus.PAID, payments: { none: {} } }, select: { id: true, orgId: true, updatedAt: true }, take: safeLimit }),
      this.prisma.payment.findMany({ where: { orgId, charge: { status: { not: ChargeStatus.PAID } } }, select: { id: true, orgId: true, chargeId: true, charge: { select: { status: true } } }, take: safeLimit }),
      this.prisma.charge.findMany({ where: { orgId, status: ChargeStatus.OVERDUE, timelineEvents: { none: { action: 'CHARGE_OVERDUE' } } }, select: { id: true, orgId: true, dueDate: true }, take: safeLimit }),
      this.prisma.serviceOrder.findMany({ where: { orgId, status: { in: [ServiceOrderStatus.DONE] }, charges: { none: {} } }, select: { id: true, orgId: true, status: true }, take: safeLimit }),
      this.prisma.serviceOrder.findMany({ where: { orgId, status: { in: [ServiceOrderStatus.DONE] }, timelineEvents: { none: { action: 'SERVICE_ORDER_COMPLETED' } } }, select: { id: true, orgId: true, status: true }, take: safeLimit }),
      this.prisma.whatsAppMessage.findMany({ where: { orgId, status: { in: [WhatsAppMessageStatus.QUEUED, WhatsAppMessageStatus.SENDING] }, createdAt: { lt: new Date(Date.now() - 1000 * 60 * 30) } }, select: { id: true, orgId: true, status: true, createdAt: true }, take: safeLimit }),
      this.prisma.whatsAppMessage.findMany({ where: { orgId, status: WhatsAppMessageStatus.FAILED, failedAt: null }, select: { id: true, orgId: true, status: true }, take: safeLimit }),
      this.prisma.whatsAppMessage.findMany({ where: { orgId, status: { in: [WhatsAppMessageStatus.DELIVERED, WhatsAppMessageStatus.READ] }, providerMessageId: null }, select: { id: true, orgId: true, status: true }, take: safeLimit }),
      this.prisma.timelineEvent.findMany({ where: { orgId, action: { in: ['CHARGE_OVERDUE', 'PAYMENT_RECEIVED', 'SERVICE_ORDER_COMPLETED', 'EXECUTION_DONE', 'CHARGE_CREATED', 'SERVICE_ORDER_CHARGE_CREATED', 'MESSAGE_FAILED', 'WHATSAPP_MESSAGE_FAILED', 'GOVERNANCE_RUN_COMPLETED', 'RISK_UPDATED', 'RISK_SNAPSHOT_CREATED'] }, OR: [{ customerId: null, serviceOrderId: null, appointmentId: null, chargeId: null, personId: null }] }, select: { id: true, orgId: true, action: true }, take: safeLimit }),
      this.prisma.timelineEvent.findMany({ where: { orgId, action: { in: ['CHARGE_OVERDUE', 'PAYMENT_RECEIVED', 'SERVICE_ORDER_COMPLETED', 'EXECUTION_DONE', 'CHARGE_CREATED', 'SERVICE_ORDER_CHARGE_CREATED', 'MESSAGE_FAILED', 'WHATSAPP_MESSAGE_FAILED', 'GOVERNANCE_RUN_COMPLETED', 'RISK_UPDATED', 'RISK_SNAPSHOT_CREATED'] }, OR: [{ metadata: { equals: Prisma.DbNull } }, { metadata: { equals: Prisma.JsonNull } }, { metadata: { equals: {} } }] }, select: { id: true, orgId: true, action: true }, take: safeLimit }),
      this.prisma.riskSnapshot.findFirst({ where: { person: { orgId } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true } }),
      this.prisma.governanceRun.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' }, select: { id: true, orgId: true, createdAt: true } }),
    ])

    paidWithoutPayment.forEach((item) => add({ severity: 'CRITICAL', area: 'FINANCE', code: 'CHARGE_PAID_WITHOUT_PAYMENT', title: 'Cobrança paga sem pagamento', description: 'Charge marcada como PAID sem registro de Payment.', entityType: 'Charge', entityId: item.id, orgId: item.orgId, suggestedAction: 'Reconciliar lançamento financeiro e investigar fluxo de baixa.', metadata: { updatedAt: item.updatedAt.toISOString() } }))
    paymentWithoutPaidCharge.forEach((item) => add({ severity: 'CRITICAL', area: 'FINANCE', code: 'PAYMENT_WITHOUT_PAID_CHARGE', title: 'Pagamento com charge não paga', description: 'Payment existe, mas charge associada não está PAID.', entityType: 'Payment', entityId: item.id, orgId: item.orgId, suggestedAction: 'Revisar transição de status da charge e idempotência do pagamento.', metadata: { chargeId: item.chargeId, chargeStatus: item.charge.status } }))
    overdueWithoutTimeline.forEach((item) => add({ severity: 'WARNING', area: 'FINANCE', code: 'CHARGE_OVERDUE_WITHOUT_TIMELINE', title: 'Charge vencida sem timeline', description: 'Charge OVERDUE sem evento CHARGE_OVERDUE na timeline.', entityType: 'Charge', entityId: item.id, orgId: item.orgId, suggestedAction: 'Investigar emissão de timeline para transição OVERDUE.', metadata: { dueDate: item.dueDate?.toISOString() ?? null } }))
    completedWithoutCharge.forEach((item) => add({ severity: 'WARNING', area: 'SERVICE_ORDER', code: 'SERVICE_ORDER_COMPLETED_WITHOUT_CHARGE', title: 'O.S. concluída sem cobrança', description: 'ServiceOrder concluída não possui charge vinculada.', entityType: 'ServiceOrder', entityId: item.id, orgId: item.orgId, suggestedAction: 'Validar regra de geração de cobrança pós-conclusão.', metadata: { status: item.status } }))
    completedWithoutTimeline.forEach((item) => add({ severity: 'WARNING', area: 'SERVICE_ORDER', code: 'SERVICE_ORDER_COMPLETED_WITHOUT_TIMELINE', title: 'O.S. concluída sem timeline', description: 'ServiceOrder concluída sem evento SERVICE_ORDER_COMPLETED.', entityType: 'ServiceOrder', entityId: item.id, orgId: item.orgId, suggestedAction: 'Revisar logging de timeline no fechamento da O.S.', metadata: { status: item.status } }))
    stuckMessages.forEach((item) => add({ severity: 'WARNING', area: 'WHATSAPP', code: 'WHATSAPP_MESSAGE_STUCK', title: 'Mensagem WhatsApp presa', description: 'Mensagem ficou muito tempo em QUEUED/SENDING.', entityType: 'WhatsAppMessage', entityId: item.id, orgId: item.orgId, suggestedAction: 'Auditar fila/worker e aplicar retry manual quando necessário.', metadata: { status: item.status, createdAt: item.createdAt.toISOString() } }))
    failedWithoutRetry.forEach((item) => add({ severity: 'WARNING', area: 'WHATSAPP', code: 'WHATSAPP_FAILED_WITHOUT_RETRY', title: 'Falha sem retry rastreável', description: 'Mensagem FAILED sem retryCount e sem timeline de falha.', entityType: 'WhatsAppMessage', entityId: item.id, orgId: item.orgId, suggestedAction: 'Registrar timeline de falha e avaliar retry manual.', metadata: { status: item.status } }))
    deliveredWithoutProviderId.forEach((item) => add({ severity: 'WARNING', area: 'WHATSAPP', code: 'WHATSAPP_DELIVERED_WITHOUT_PROVIDER_ID', title: 'Entrega sem providerMessageId', description: 'Mensagem DELIVERED/READ sem identificador do provedor.', entityType: 'WhatsAppMessage', entityId: item.id, orgId: item.orgId, suggestedAction: 'Revisar callback de status do provedor e persistência de IDs externos.', metadata: { status: item.status } }))
    criticalTimelineWithoutEntity.forEach((item) => add({ severity: 'CRITICAL', area: 'TIMELINE', code: 'TIMELINE_EVENT_MISSING_ENTITY', title: 'Evento crítico sem entidade', description: 'Timeline crítica sem entityType/entityId.', entityType: 'TimelineEvent', entityId: item.id, orgId: item.orgId, suggestedAction: 'Corrigir origem do evento para informar rastreabilidade da entidade.', metadata: { action: item.action } }))
    criticalTimelineWithoutMetadata.forEach((item) => add({ severity: 'WARNING', area: 'TIMELINE', code: 'TIMELINE_EVENT_MISSING_METADATA', title: 'Evento crítico sem metadata', description: 'Timeline crítica sem metadata útil.', entityType: 'TimelineEvent', entityId: item.id, orgId: item.orgId, suggestedAction: 'Incluir metadados mínimos operacionais no evento crítico.', metadata: { action: item.action } }))

    if (!latestRiskSnapshot || latestRiskSnapshot.createdAt.getTime() < Date.now() - 1000 * 60 * 60 * 24 * 7) {
      add({ severity: 'WARNING', area: 'RISK', code: 'RISK_SNAPSHOT_STALE', title: 'Risk snapshot desatualizado', description: 'Último snapshot de risco está stale para a organização.', entityType: 'RiskSnapshot', entityId: latestRiskSnapshot?.id ?? 'missing', orgId, suggestedAction: 'Executar recálculo de risco e validar pipeline de snapshots.', metadata: { lastCreatedAt: latestRiskSnapshot?.createdAt?.toISOString() ?? null } })
    }
    if (!latestGovernanceRun || latestGovernanceRun.createdAt.getTime() < Date.now() - 1000 * 60 * 60 * 24 * 3) {
      add({ severity: 'WARNING', area: 'GOVERNANCE', code: 'GOVERNANCE_RUN_STALE', title: 'Governança desatualizada', description: 'Última execução de governança está stale para a organização.', entityType: 'GovernanceRun', entityId: latestGovernanceRun?.id ?? 'missing', orgId, suggestedAction: 'Reprocessar governança e inspecionar worker/cron de enforcement.', metadata: { lastCreatedAt: latestGovernanceRun?.createdAt?.toISOString() ?? null } })
    }

    return { orgId, generatedAt: detectedAt, totalFindings: findings.length, findings }
  }
}

import { Injectable } from '@nestjs/common'
import { ChargeStatus, ServiceOrderStatus, WhatsAppMessageStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { OperationalDiagnosticsService } from './operational-diagnostics.service'

type Severity = 'INFO' | 'WARNING' | 'CRITICAL'
type Area = 'FINANCE' | 'WHATSAPP' | 'SERVICE_ORDER' | 'APPOINTMENT' | 'TIMELINE' | 'RISK' | 'GOVERNANCE' | 'SYSTEM'
type Source = 'DIAGNOSTIC' | 'RISK' | 'GOVERNANCE' | 'TIMELINE' | 'FINANCE' | 'WHATSAPP'

export type OperationalSignal = {
  id: string
  severity: Severity
  priorityScore: number
  area: Area
  title: string
  summary: string
  reason: string
  impact: string
  suggestedAction: string
  actionType: string
  entityType: string
  entityId: string
  customerId: string | null
  serviceOrderId: string | null
  chargeId: string | null
  messageId: string | null
  orgId: string
  createdAt: string
  detectedAt: string
  source: Source
  metadata: Record<string, unknown>
}

@Injectable()
export class OperationalSignalsService {
  constructor(private readonly prisma: PrismaService, private readonly diagnostics: OperationalDiagnosticsService) {}

  private severityBase: Record<Severity, number> = { CRITICAL: 100, WARNING: 60, INFO: 20 }

  private computePriority(signal: Omit<OperationalSignal, 'priorityScore'>): number {
    let score = this.severityBase[signal.severity]
    const meta = signal.metadata
    if (typeof meta.amountCents === 'number') {
      if (meta.amountCents >= 500_000) score += 30
      else if (meta.amountCents >= 200_000) score += 20
      else if (meta.amountCents >= 100_000) score += 10
    }
    if (typeof meta.daysOverdue === 'number') {
      if (meta.daysOverdue >= 30) score += 30
      else if (meta.daysOverdue >= 15) score += 20
      else if (meta.daysOverdue >= 7) score += 10
    }
    if (signal.source === 'WHATSAPP' && signal.actionType === 'RESOLVE_WHATSAPP_FAILURE') score += 15
    if (signal.actionType === 'GENERATE_CHARGE_FOR_COMPLETED_SO') score += 25
    if (signal.source === 'GOVERNANCE' && signal.severity === 'CRITICAL') score += 30
    if (signal.source === 'GOVERNANCE' && signal.actionType === 'RUN_GOVERNANCE') score += 15
    if (typeof meta.recurrence === 'number' && meta.recurrence > 1) score += 10
    return score
  }

  async listForOrg(orgId: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(50, limit))
    const now = new Date()
    const signals: OperationalSignal[] = []
    const diagnostics = await this.diagnostics.runForOrg(orgId, 100)
    for (const f of diagnostics.findings) {
      const actionType = f.code === 'SERVICE_ORDER_COMPLETED_WITHOUT_CHARGE' ? 'GENERATE_CHARGE_FOR_COMPLETED_SO' : f.area === 'FINANCE' ? 'REVIEW_FINANCIAL_INCONSISTENCY' : f.area === 'WHATSAPP' ? 'RESOLVE_WHATSAPP_FAILURE' : 'REVIEW_OPERATIONAL_EVENT'
      const base: Omit<OperationalSignal, 'priorityScore'> = {
        id: `diag:${f.id}`,
        severity: f.severity,
        area: f.area as Area,
        title: f.title,
        summary: f.description,
        reason: f.code,
        impact: 'Risco de inconsistência operacional.',
        suggestedAction: f.suggestedAction,
        actionType,
        entityType: f.entityType,
        entityId: f.entityId,
        customerId: null,
        serviceOrderId: f.entityType === 'ServiceOrder' ? f.entityId : null,
        chargeId: f.entityType === 'Charge' ? f.entityId : null,
        messageId: f.entityType === 'WhatsAppMessage' ? f.entityId : null,
        orgId,
        createdAt: f.detectedAt,
        detectedAt: f.detectedAt,
        source: 'DIAGNOSTIC',
        metadata: { ...f.metadata },
      }
      signals.push({ ...base, priorityScore: this.computePriority(base) })
    }
    const overdueCharges = await this.prisma.charge.findMany({ where: { orgId, status: ChargeStatus.OVERDUE }, select: { id: true, customerId: true, amountCents: true, dueDate: true, updatedAt: true }, take: 30 })
    overdueCharges.forEach((c) => {
      const daysOverdue = c.dueDate ? Math.max(0, Math.floor((now.getTime() - c.dueDate.getTime()) / 86_400_000)) : 0
      const base: Omit<OperationalSignal, 'priorityScore'> = { id: `fin:overdue:${c.id}`, severity: daysOverdue >= 30 ? 'CRITICAL' : 'WARNING', area: 'FINANCE', title: 'Cobrança vencida pendente de ação', summary: 'Charge em OVERDUE sem resolução recente.', reason: 'CHARGE_OVERDUE', impact: 'Afeta caixa e previsibilidade financeira.', suggestedAction: 'Cobrar cliente com cobrança vencida e revisar negociação.', actionType: 'COLLECT_OVERDUE_CHARGE', entityType: 'Charge', entityId: c.id, customerId: c.customerId, serviceOrderId: null, chargeId: c.id, messageId: null, orgId, createdAt: c.updatedAt.toISOString(), detectedAt: now.toISOString(), source: 'FINANCE', metadata: { amountCents: c.amountCents, daysOverdue } }
      signals.push({ ...base, priorityScore: this.computePriority(base) })
    })
    const failedMessages = await this.prisma.whatsAppMessage.findMany({ where: { orgId, status: WhatsAppMessageStatus.FAILED }, select: { id: true, customerId: true, updatedAt: true, errorCode: true }, take: 20 })
    failedMessages.forEach((m) => {
      const base: Omit<OperationalSignal, 'priorityScore'> = { id: `wa:failed:${m.id}`, severity: 'WARNING', area: 'WHATSAPP', title: 'Mensagem WhatsApp com falha', summary: 'Mensagem com status FAILED requer intervenção.', reason: 'WHATSAPP_FAILED', impact: 'Risco de perda de contato com o cliente.', suggestedAction: 'Resolver WhatsApp travado e aplicar retry manual.', actionType: 'RESOLVE_WHATSAPP_FAILURE', entityType: 'WhatsAppMessage', entityId: m.id, customerId: m.customerId, serviceOrderId: null, chargeId: null, messageId: m.id, orgId, createdAt: m.updatedAt.toISOString(), detectedAt: now.toISOString(), source: 'WHATSAPP', metadata: { errorCode: m.errorCode ?? null } }
      signals.push({ ...base, priorityScore: this.computePriority(base) })
    })

    const sorted = signals.sort((a, b) => b.priorityScore - a.priorityScore || (a.severity === b.severity ? 0 : a.severity === 'CRITICAL' ? -1 : b.severity === 'CRITICAL' ? 1 : a.severity === 'WARNING' ? -1 : 1) || new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    return { orgId, generatedAt: now.toISOString(), totalSignals: sorted.length, signals: sorted.slice(0, safeLimit) }
  }

  async getNextBestAction(orgId: string) {
    const { signals } = await this.listForOrg(orgId, 20)
    const top = signals[0]
    if (!top) return null
    const routeHint = top.messageId
      ? '/whatsapp'
      : top.chargeId
        ? '/finances?view=charges'
        : top.serviceOrderId
          ? `/service-orders?id=${top.serviceOrderId}`
          : top.area === 'GOVERNANCE' || top.area === 'RISK'
            ? '/governance'
            : '/timeline'
    return {
      signalId: top.id,
      actionType: top.actionType,
      title: top.title,
      reason: top.reason,
      impact: top.impact,
      suggestedAction: top.suggestedAction,
      area: top.area,
      entityType: top.entityType,
      entityId: top.entityId,
      serviceOrderId: top.serviceOrderId,
      chargeId: top.chargeId,
      messageId: top.messageId,
      routeHint,
      source: top.source,
      detectedAt: top.detectedAt,
      metadata: { severity: top.severity, priorityScore: top.priorityScore },
    }
  }
}

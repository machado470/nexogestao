import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, ServiceOrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type FinancialSummary = {
  hasCharge: boolean
  chargeId: string | null
  chargeStatus: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED' | null
  chargeAmountCents: number | null
  chargeDueDate: Date | null
  paidAt: Date | null
}

export type ServiceOrderOperationalDecision = {
  isOverdue: boolean
  overdueDays: number
  isStalled: boolean
  chargeOverdue: boolean
  operationalStatus: 'NORMAL' | 'ATENÇÃO' | 'RISCO'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  riskLabel: string
  nextAction: { type: 'start' | 'complete' | 'charge' | 'edit' | 'select'; label: string; reason: string }
}

export function resolveServiceOrderOperationalDecision(input: {
  status: ServiceOrderStatus; assignedToPersonId?: string | null; dueDate?: Date | null
  scheduledFor?: Date | null; financialSummary: FinancialSummary; now?: Date
}): ServiceOrderOperationalDecision {
  const now = input.now ?? new Date()
  const deadline = input.dueDate ?? input.scheduledFor ?? null
  const active = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(input.status)
  const isOverdue = Boolean(deadline && active && deadline.getTime() < now.getTime())
  const overdueDays = isOverdue && deadline ? Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / 86_400_000)) : 0
  const isStalled = input.status === 'IN_PROGRESS' && !deadline
  const chargeDueDate = input.financialSummary.chargeDueDate
  const chargeOverdue = input.financialSummary.chargeStatus === 'OVERDUE' || Boolean(input.financialSummary.chargeStatus === 'PENDING' && chargeDueDate && chargeDueDate.getTime() < now.getTime())
  const withoutOwner = !input.assignedToPersonId && active
  const doneWithoutCharge = input.status === 'DONE' && !input.financialSummary.hasCharge
  let nextAction: ServiceOrderOperationalDecision['nextAction']
  if (isOverdue) nextAction = input.status === 'IN_PROGRESS' ? { type: 'complete', label: 'Concluir ou replanejar', reason: 'Prazo vencido' } : { type: 'start', label: 'Iniciar agora', reason: 'Atrasada sem execução' }
  else if (withoutOwner) nextAction = { type: 'edit', label: 'Definir responsável', reason: 'Sem responsável' }
  else if (doneWithoutCharge) nextAction = { type: 'charge', label: 'Gerar cobrança', reason: 'Concluída sem cobrança' }
  else if (chargeOverdue) nextAction = { type: 'select', label: 'Cobrar cliente', reason: 'Cobrança vencida vinculada' }
  else if (input.status === 'OPEN' || input.status === 'ASSIGNED') nextAction = { type: 'start', label: 'Iniciar', reason: 'Pronta para execução' }
  else if (input.status === 'IN_PROGRESS') nextAction = { type: 'complete', label: 'Concluir', reason: 'Execução em andamento' }
  else if (input.status === 'DONE') nextAction = { type: 'select', label: 'Abrir detalhe', reason: 'Execução concluída' }
  else nextAction = { type: 'select', label: 'Revisar O.S.', reason: 'Dados incompletos' }
  const riskLabel = isOverdue ? 'Atrasada' : doneWithoutCharge ? 'Alerta: concluída sem cobrança' : chargeOverdue ? 'Cobrança vencida vinculada' : withoutOwner ? 'Sem responsável' : isStalled ? 'Em risco: sem prazo' : 'Sem bloqueio crítico'
  const operationalStatus = isOverdue || doneWithoutCharge || chargeOverdue ? 'RISCO' as const : withoutOwner || isStalled ? 'ATENÇÃO' as const : 'NORMAL' as const
  const priority = isOverdue || doneWithoutCharge || chargeOverdue ? 'P0' as const : withoutOwner || isStalled ? 'P1' as const : active ? 'P2' as const : 'P3' as const
  return { isOverdue, overdueDays, isStalled, chargeOverdue, operationalStatus, priority, riskLabel, nextAction }
}

function parseOptionalDate(label: string, value?: string): Date | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} inválido (use ISO)`)
  return parsed
}

function isStatus(v: any): v is ServiceOrderStatus {
  return ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELED'].includes(v)
}

@Injectable()
export class ServiceOrderReadService {
  constructor(private readonly prisma: PrismaService) {}

  private buildFinancialSummary(charge?: { id: string; status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED'; amountCents: number; dueDate: Date; paidAt: Date | null } | null): FinancialSummary {
    if (!charge) return { hasCharge: false, chargeId: null, chargeStatus: null, chargeAmountCents: null, chargeDueDate: null, paidAt: null }
    return { hasCharge: true, chargeId: charge.id, chargeStatus: charge.status, chargeAmountCents: charge.amountCents, chargeDueDate: charge.dueDate, paidAt: charge.paidAt ?? null }
  }

  private async attachFinancialSummary<T extends { id: string }>(orgId: string, serviceOrders: T[]) {
    if (serviceOrders.length === 0) return []
    const charges = await this.prisma.charge.findMany({
      where: { orgId, serviceOrderId: { in: serviceOrders.map(item => item.id) } },
      select: { id: true, serviceOrderId: true, status: true, amountCents: true, dueDate: true, paidAt: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    const priority = { OVERDUE: 4, PENDING: 3, PAID: 2, CANCELED: 1 }
    const selected = new Map<string, typeof charges[number]>()
    for (const charge of charges) {
      if (!charge.serviceOrderId) continue
      const current = selected.get(charge.serviceOrderId)
      if (!current || priority[charge.status] > priority[current.status]) selected.set(charge.serviceOrderId, charge)
    }
    return serviceOrders.map(serviceOrder => {
      const financialSummary = this.buildFinancialSummary(selected.get(serviceOrder.id) ?? null)
      const order = serviceOrder as T & { status: ServiceOrderStatus; assignedToPersonId?: string | null; dueDate?: Date | null; scheduledFor?: Date | null }
      return { ...serviceOrder, financialSummary, operationalDecision: resolveServiceOrderOperationalDecision({ status: order.status, assignedToPersonId: order.assignedToPersonId, dueDate: order.dueDate, scheduledFor: order.scheduledFor, financialSummary }) }
    })
  }

  async list(orgId: string, filters: { status?: ServiceOrderStatus; customerId?: string; assignedToPersonId?: string; from?: string; to?: string; page?: number; limit?: number; search?: string }) {
    if (!orgId) throw new BadRequestException('orgId é obrigatório')
    const page = Number(filters.page) || 1
    const limit = Math.min(Number(filters.limit) || 20, 100)
    const from = parseOptionalDate('from', filters.from)
    const to = parseOptionalDate('to', filters.to)
    if (from && to && from.getTime() > to.getTime()) throw new BadRequestException('intervalo inválido: from não pode ser maior que to')
    const where: Prisma.ServiceOrderWhereInput = { orgId }
    if (filters.customerId) where.customerId = filters.customerId
    if (filters.assignedToPersonId) where.assignedToPersonId = filters.assignedToPersonId
    if (filters.status != null) { if (!isStatus(filters.status)) throw new BadRequestException('status inválido'); where.status = filters.status }
    if (from || to) { where.scheduledFor = {}; if (from) where.scheduledFor.gte = from; if (to) where.scheduledFor.lte = to }
    if (filters.search) {
      const s = String(filters.search)
      where.OR = [{ title: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }, { customer: { OR: [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }, { phone: { contains: s, mode: 'insensitive' } }] } }]
    }
    const [rows, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { customer: { select: { id: true, name: true, phone: true } }, assignedTo: { select: { id: true, name: true } }, appointment: { select: { id: true, startsAt: true, endsAt: true, status: true } } } }),
      this.prisma.serviceOrder.count({ where }),
    ])
    return { data: await this.attachFinancialSummary(orgId, rows), pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  }

  async get(orgId: string, id: string) {
    if (!orgId) throw new BadRequestException('orgId é obrigatório')
    if (!id) throw new BadRequestException('id é obrigatório')
    const order = await this.prisma.serviceOrder.findFirst({ where: { id, orgId }, include: { customer: { select: { id: true, name: true, phone: true } }, assignedTo: { select: { id: true, name: true } }, appointment: { select: { id: true, startsAt: true, endsAt: true, status: true } } } })
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada')
    const [enriched] = await this.attachFinancialSummary(orgId, [order])
    if (!enriched) throw new NotFoundException('Ordem de serviço não encontrada')
    return enriched
  }
}

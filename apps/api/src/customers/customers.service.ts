import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TimelineService } from '../timeline/timeline.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { OnboardingService } from '../onboarding/onboarding.service'
import { AUDIT_ACTIONS } from '../audit/audit.actions'
import { AnalyticsService, UsageMetricEvent } from '../analytics/analytics.service'
import { Prisma } from '@prisma/client'
import { IdempotencyService } from '../common/idempotency/idempotency.service'
import { notificationRoutes } from '@nexogestao/common'

function normalizeEmail(v?: string): string | null {
  const s = (v ?? '').trim().toLowerCase()
  return s ? s : null
}

function normalizePhone(v?: string): string {
  const digits = (v ?? '').replace(/\D/g, '').trim()
  return digits
}

function normalizeCpfCnpj(v?: string): string | null {
  const digits = (v ?? '').replace(/\D/g, '').trim()
  if (!digits) return null
  if (digits.length !== 11 && digits.length !== 14) {
    throw new BadRequestException('CPF/CNPJ inválido')
  }
  return digits
}

function normalizeAddress(v?: string): string | null {
  const normalized = (v ?? '').trim()
  return normalized || null
}

function isUniqueConflict(err: any): boolean {
  return err?.code === 'P2002'
}

function parseExpectedUpdatedAt(value?: string): Date {
  if (!value) {
    throw new BadRequestException({
      code: 'EXPECTED_UPDATED_AT_REQUIRED',
      message: 'expectedUpdatedAt é obrigatório para atualizar cliente protegido.',
    })
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('expectedUpdatedAt inválido (use ISO)')
  }
  return parsed
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly audit: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly onboardingService: OnboardingService,
    private readonly analytics: AnalyticsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private buildCreateCustomerIdempotencyKey(input: {
    orgId: string
    name: string
    phone: string
    email?: string | null
  }): string {
    return [
      'customer-create',
      input.orgId,
      input.name.trim().toLowerCase(),
      input.phone,
      (input.email ?? '').trim().toLowerCase() || '-',
    ].join(':')
  }

  async list(orgId: string, query?: any) {
    if (!orgId) throw new BadRequestException('orgId é obrigatório')

    const page = Number(query?.page) || 1
    const limit = Number(query?.limit) || 20
    const skip = (page - 1) * limit

    const where: Prisma.CustomerWhereInput = { orgId }

    if (query?.search) {
      const s = String(query.search)
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.customer.count({ where }),
    ])

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  async exportCsv(orgId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    })

    const header = 'ID,Nome,Email,Telefone,Ativo,Criado Em\n'
    const rows = customers
      .map((c) => {
        return `"${c.id}","${c.name}","${c.email || ''}","${c.phone}","${
          c.active ? 'Sim' : 'Não'
        }","${c.createdAt.toISOString()}"`
      })
      .join('\n')

    return header + rows
  }

  async get(orgId: string, id: string) {
    if (!orgId) throw new BadRequestException('orgId é obrigatório')

    const customer = await this.prisma.customer.findFirst({
      where: { id, orgId },
    })

    if (!customer) throw new NotFoundException('Cliente não encontrado')
    return customer
  }

  async workspace(orgId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, orgId },
    })

    if (!customer) throw new NotFoundException('Cliente não encontrado')

    const [appointments, serviceOrders, charges, timeline] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { orgId, customerId: id },
        orderBy: { startsAt: 'desc' },
        take: 50,
      }),
      this.prisma.serviceOrder.findMany({
        where: { orgId, customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.charge.findMany({
        where: { orgId, customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.timelineEvent.findMany({
        where: {
          orgId,
          OR: [
            { customerId: id },
            { metadata: { path: ['customerId'], equals: id } },
            { metadata: { path: ['entityId'], equals: id } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    return { customer, timeline, appointments, serviceOrders, charges }
  }

  async create(params: {
    orgId: string
    createdBy: string | null
    personId: string | null
    name: string
    phone: string
    email?: string
    notes?: string
    cpfCnpj?: string
    address?: string
    idempotencyKey?: string | null
  }) {
    const name = params.name?.trim()
    const phone = normalizePhone(params.phone)
    const email = normalizeEmail(params.email)
    const notes = (params.notes ?? '').trim() || null
    const cpfCnpj = normalizeCpfCnpj(params.cpfCnpj)
    const address = normalizeAddress(params.address)

    if (!params.orgId) throw new BadRequestException('orgId é obrigatório')
    if (!name) throw new BadRequestException('Nome é obrigatório')
    if (!phone) {
      throw new BadRequestException('Telefone (WhatsApp) é obrigatório')
    }

    const byEmail = email
      ? await this.prisma.customer.findFirst({
          where: { email, orgId: params.orgId },
          select: { id: true },
        })
      : null
    if (byEmail) {
      throw new BadRequestException('Já existe um cliente com este e-mail')
    }

    const byPhone = await this.prisma.customer.findFirst({
      where: { phone, orgId: params.orgId },
      select: { id: true },
    })
    if (byPhone) {
      throw new BadRequestException('Já existe um cliente com este telefone')
    }

    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      this.buildCreateCustomerIdempotencyKey({
        orgId: params.orgId,
        name,
        phone,
        email,
      })

    const idem = await this.idempotency.begin({
      orgId: params.orgId,
      scope: 'customers.create',
      idempotencyKey,
      payload: { name, phone, email, notes, cpfCnpj, address },
    })
    if (idem.mode === 'replay') {
      return idem.response as any
    }

    let created: any
    try {
      try {
        created = await this.prisma.customer.create({
          data: {
            orgId: params.orgId,
            name,
            phone,
            email,
            notes,
            cpfCnpj,
            address,
            active: true,
          },
        })
      } catch (err) {
        if (!isUniqueConflict(err)) throw err
        throw new BadRequestException(
          'Cliente já existe com o mesmo e-mail ou telefone nesta organização',
        )
      }

    const context = `Cliente criado: ${created.name}`

    await this.timeline.log({
      orgId: params.orgId,
      action: 'CUSTOMER_CREATED',
      description: context,
      personId: params.personId,
      customerId: created.id,
      metadata: {
        customerId: created.id,
        customerName: created.name,
      },
    })

    await this.audit.log({
      orgId: params.orgId,
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      actorUserId: params.createdBy,
      actorPersonId: params.personId,
      personId: params.personId,
      entityType: 'CUSTOMER',
      entityId: created.id,
      context,
      metadata: {
        customerId: created.id,
        name: created.name,
        phone: created.phone,
        email: created.email,
        active: created.active,
      },
    })

    try {
      await this.notificationsService.createNotification({
        orgId: created.orgId,
        eventKey: `customer.created:${created.id}`,
        type: 'CUSTOMER_CREATED',
        title: 'Novo cliente',
        message: `Novo cliente ${created.name} criado.`,
        severity: 'INFO',
        source: 'customers',
        audience: { kind: 'user', userId: params.createdBy },
        entityType: 'CUSTOMER',
        entityId: created.id,
        routeHint: notificationRoutes.customer(created.id),
        metadata: { customerId: created.id },
        occurredAt: created.createdAt,
      })
    } catch (error) {
      this.logger.error({
        event: 'notification_producer_failed',
        producer: 'customer.created',
        orgId: created.orgId,
        entityId: created.id,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    await this.onboardingService.completeOnboardingStep(
      params.orgId,
      'createCustomer',
    )

    void this.analytics.track({
      orgId: params.orgId,
      userId: params.createdBy ?? undefined,
      event:
        (UsageMetricEvent as any)?.CUSTOMER_CREATED ??
        (UsageMetricEvent as any)?.LOGIN,
      metadata: {
        source: 'customer_create',
        customerId: created.id,
      },
    })

      await this.idempotency.complete(idem.recordId, created)
      return created
    } catch (error: any) {
      await this.idempotency.fail(idem.recordId, error?.code)
      throw error
    }
  }

  async update(params: {
    orgId: string
    updatedBy: string | null
    personId: string | null
    id: string
    data: {
      name?: string
      phone?: string
      email?: string
      notes?: string
      active?: boolean
      expectedUpdatedAt?: string
    }
  }) {
    if (!params.orgId) throw new BadRequestException('orgId é obrigatório')
    if (!params.id) throw new BadRequestException('id é obrigatório')

    const before = await this.prisma.customer.findFirst({
      where: { id: params.id, orgId: params.orgId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        notes: true,
        active: true,
        updatedAt: true,
      },
    })

    if (!before) throw new NotFoundException('Cliente não encontrado')

    const data: Record<string, unknown> = {}

    if (typeof params.data.name === 'string') {
      const v = params.data.name.trim()
      if (!v) throw new BadRequestException('Nome inválido')
      data.name = v
    }

    if (typeof params.data.phone === 'string') {
      const v = normalizePhone(params.data.phone)
      if (!v) throw new BadRequestException('Telefone inválido')
      data.phone = v
    }

    if (typeof params.data.email === 'string') {
      const v = normalizeEmail(params.data.email)

      if (v && v !== before.email) {
        const dup = await this.prisma.customer.findFirst({
          where: {
            email: v,
            orgId: params.orgId,
            NOT: { id: params.id },
          },
          select: { id: true },
        })

        if (dup) {
          throw new BadRequestException('Já existe um cliente com este e-mail')
        }
      }

      data.email = v
    }

    if (typeof params.data.notes === 'string') {
      const v = params.data.notes.trim()
      data.notes = v ? v : null
    }

    if (typeof params.data.active === 'boolean') {
      data.active = params.data.active
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nenhum campo para atualizar')
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(
      (params.data as any).expectedUpdatedAt,
    )

    const result = await this.prisma.customer.updateMany({
      where: { id: params.id, orgId: params.orgId, updatedAt: expectedUpdatedAt },
      data,
    })

    if (result.count === 0) {
      const latest = await this.prisma.customer.findFirst({
        where: { id: params.id, orgId: params.orgId },
        select: { id: true, updatedAt: true, active: true },
      })
      if (!latest) throw new NotFoundException('Cliente não encontrado')
      throw new ConflictException({
        code: 'CUSTOMER_CONCURRENT_MODIFICATION',
        message:
          'Cliente foi alterado por outra operação. Recarregue antes de salvar.',
        details: {
          customerId: latest.id,
          currentUpdatedAt: latest.updatedAt,
          active: latest.active,
        },
      })
    }

    const updated = await this.prisma.customer.findFirst({
      where: { id: params.id, orgId: params.orgId },
    })

    if (!updated) throw new NotFoundException('Cliente não encontrado')

    const context = `Cliente atualizado: ${updated.name}`

    await this.timeline.log({
      orgId: params.orgId,
      action: 'CUSTOMER_UPDATED',
      description: context,
      personId: params.personId,
      customerId: updated.id,
      metadata: {
        customerId: updated.id,
        customerName: updated.name,
        changedFields: Object.keys(data),
      },
    })

    const activeChanged =
      data.active !== undefined && data.active !== before.active

    await this.audit.log({
      orgId: params.orgId,
      action: activeChanged
        ? AUDIT_ACTIONS.CUSTOMER_ACTIVE_CHANGED
        : AUDIT_ACTIONS.CUSTOMER_UPDATED,
      actorUserId: params.updatedBy,
      actorPersonId: params.personId,
      personId: params.personId,
      entityType: 'CUSTOMER',
      entityId: updated.id,
      context,
      metadata: {
        customerId: updated.id,
        before,
        after: {
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          notes: updated.notes,
          active: updated.active,
        },
        patch: data,
      },
    })

    return updated
  }
}

import {
  AppointmentStatus,
  ChargeStatus,
  MessageChannel,
  PaymentMethod,
  PlanName,
  PrismaClient,
  ServiceOrderStatus,
  UserRole,
  WhatsAppContextType,
  WhatsAppConversationPriority,
  WhatsAppConversationStatus,
  WhatsAppDirection,
  WhatsAppEntityType,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '@prisma/client'

import bcrypt from 'bcryptjs'
import {
  buildDefaultPlanCreateData,
  getDefaultPlanDefinition,
} from '../apps/api/src/common/commercial/default-plan-definitions'

const prisma = new PrismaClient()

const PILOT_ADMIN_EMAIL_FALLBACK = 'admin.piloto@nexogestao.local'
const PILOT_ADMIN_PASSWORD_FALLBACK = 'Admin123!'

type PilotUser = {
  key: 'admin' | 'operator' | 'finance'
  name: string
  email: string
  password: string
  role: UserRole
  personRole: string
}

type CustomerSeed = {
  name: string
  phone?: string | null
  email: string
  notes: string
}

function env(name: string, fallback: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : fallback
}

function atHour(base: Date, dayOffset: number, hour: number, minute = 0) {
  const date = new Date(base)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date
}

async function resolveNonOverlappingWindow(params: {
  orgId: string
  desiredStartsAt: Date
  desiredEndsAt: Date
  preserveAppointmentId?: string
}) {
  const durationMs = params.desiredEndsAt.getTime() - params.desiredStartsAt.getTime()
  let candidateStartsAt = new Date(params.desiredStartsAt)
  let candidateEndsAt = new Date(params.desiredEndsAt)

  while (true) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        orgId: params.orgId,
        ...(params.preserveAppointmentId
          ? { id: { not: params.preserveAppointmentId } }
          : {}),
        startsAt: { lt: candidateEndsAt },
        endsAt: { gt: candidateStartsAt },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    })

    if (!conflict) {
      return { startsAt: candidateStartsAt, endsAt: candidateEndsAt }
    }

    candidateStartsAt = new Date(conflict.endsAt.getTime())
    candidateEndsAt = new Date(candidateStartsAt.getTime() + durationMs)
  }
}

function deriveStartedAt(params: {
  status: ServiceOrderStatus
  scheduledFor?: Date
}) {
  if (
    params.status !== ServiceOrderStatus.IN_PROGRESS &&
    params.status !== ServiceOrderStatus.DONE
  ) {
    return null
  }

  if (params.scheduledFor) {
    return new Date(params.scheduledFor.getTime() + 30 * 60 * 1000)
  }

  return atHour(new Date(), -1, 9)
}

function deriveFinishedAt(params: {
  status: ServiceOrderStatus
  scheduledFor?: Date
}) {
  if (params.status !== ServiceOrderStatus.DONE) {
    return null
  }

  if (params.scheduledFor) {
    return new Date(params.scheduledFor.getTime() + 8 * 60 * 60 * 1000)
  }

  return atHour(new Date(), -1, 17)
}

async function upsertUser(orgId: string, user: PilotUser) {
  const passwordHash = await bcrypt.hash(user.password, 10)

  const saved = await prisma.user.upsert({
    where: { email: user.email.toLowerCase() },
    update: {
      orgId,
      role: user.role,
      active: true,
      password: passwordHash,
      emailVerifiedAt: new Date(),
      emailVerifyTokenHash: null,
      emailVerifyTokenExpiresAt: null,
    },
    create: {
      orgId,
      role: user.role,
      active: true,
      email: user.email.toLowerCase(),
      password: passwordHash,
      emailVerifiedAt: new Date(),
    },
  })

  await prisma.person.upsert({
    where: { userId: saved.id },
    update: {
      orgId,
      name: user.name,
      email: user.email.toLowerCase(),
      role: user.personRole,
      active: true,
    },
    create: {
      orgId,
      name: user.name,
      email: user.email.toLowerCase(),
      role: user.personRole,
      active: true,
      userId: saved.id,
    },
  })

  return saved
}

async function upsertCustomer(orgId: string, customer: CustomerSeed) {
  const phone = customer.phone?.trim() ?? ''

  const existing = await prisma.customer.findFirst({
    where: {
      orgId,
      email: customer.email.toLowerCase(),
    },
  })

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: customer.name,
        phone,
        notes: customer.notes,
        active: true,
      },
    })
  }

  return prisma.customer.create({
    data: {
      org: { connect: { id: orgId } },
      name: customer.name,
      phone,
      email: customer.email.toLowerCase(),
      notes: customer.notes,
      active: true,
    },
  })
}

async function upsertAppointment(params: {
  idempotencyKey: string
  legacyIdempotencyKeyPrefix?: string
  orgId: string
  customerId: string
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
  notes: string
}) {
  const foundByKey = await prisma.appointment.findUnique({
    where: {
      idempotencyKey: params.idempotencyKey,
    },
  })

  const foundLegacy =
    foundByKey ??
    (await prisma.appointment.findFirst({
      where: {
        orgId: params.orgId,
        customerId: params.customerId,
        OR: [
          { startsAt: params.startsAt },
          ...(params.legacyIdempotencyKeyPrefix
            ? [{ idempotencyKey: { startsWith: params.legacyIdempotencyKeyPrefix } }]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }))

  const resolvedWindow = await resolveNonOverlappingWindow({
    orgId: params.orgId,
    desiredStartsAt: params.startsAt,
    desiredEndsAt: params.endsAt,
    preserveAppointmentId: foundLegacy?.id,
  })

  if (foundLegacy) {
    return prisma.appointment.update({
      where: { id: foundLegacy.id },
      data: {
        idempotencyKey: params.idempotencyKey,
        customerId: params.customerId,
        startsAt: resolvedWindow.startsAt,
        endsAt: resolvedWindow.endsAt,
        status: params.status,
        notes: params.notes,
      },
    })
  }

  return prisma.appointment.create({
    data: {
      idempotencyKey: params.idempotencyKey,
      orgId: params.orgId,
      customerId: params.customerId,
      startsAt: resolvedWindow.startsAt,
      endsAt: resolvedWindow.endsAt,
      status: params.status,
      notes: params.notes,
    },
  })
}

type PilotAppointmentSeed = {
  key: string
  customerIndex: number
  dayOffset: number
  startsHour: number
  startsMinute: number
  durationMinutes: number
  status: AppointmentStatus
  notes: string
}

function buildPilotAppointmentDate(params: {
  base: Date
  dayOffset: number
  startsHour: number
  startsMinute: number
  durationMinutes: number
}) {
  const startsAt = atHour(
    params.base,
    params.dayOffset,
    params.startsHour,
    params.startsMinute,
  )
  const endsAt = new Date(startsAt.getTime() + params.durationMinutes * 60 * 1000)

  return { startsAt, endsAt }
}

async function seedPilotAppointments(params: {
  orgId: string
  baseDate: Date
  customers: Array<Awaited<ReturnType<typeof upsertCustomer>>>
}) {
  const seedPlan: PilotAppointmentSeed[] = [
    {
      key: 'condominio-manutencao-eletrica',
      customerIndex: 0,
      dayOffset: 1,
      startsHour: 8,
      startsMinute: 30,
      durationMinutes: 120,
      status: AppointmentStatus.CONFIRMED,
      notes:
        'Visita técnica mensal elétrica nas áreas comuns. Validar acesso na portaria.',
    },
    {
      key: 'clinica-revisao-climatizacao',
      customerIndex: 1,
      dayOffset: 2,
      startsHour: 14,
      startsMinute: 0,
      durationMinutes: 90,
      status: AppointmentStatus.SCHEDULED,
      notes:
        'Inspeção de ar-condicionado na recepção. Equipamento split 36.000 BTUs.',
    },
    {
      key: 'restaurante-corretiva-coifa',
      customerIndex: 2,
      dayOffset: -2,
      startsHour: 21,
      startsMinute: 0,
      durationMinutes: 120,
      status: AppointmentStatus.DONE,
      notes:
        'Manutenção corretiva da coifa industrial concluída dentro do prazo.',
    },
    {
      key: 'escola-preventiva-hidraulica',
      customerIndex: 3,
      dayOffset: 3,
      startsHour: 9,
      startsMinute: 0,
      durationMinutes: 60,
      status: AppointmentStatus.CONFIRMED,
      notes:
        'Revisão preventiva hidráulica com acompanhamento da coordenação escolar.',
    },
    {
      key: 'loja-diagnostico-rede-no-show',
      customerIndex: 4,
      dayOffset: 0,
      startsHour: 16,
      startsMinute: 0,
      durationMinutes: 90,
      status: AppointmentStatus.NO_SHOW,
      notes:
        'Diagnóstico de rede interna. Responsável da loja não estava presente.',
    },
    {
      key: 'escola-emergencial-reservatorio',
      customerIndex: 3,
      dayOffset: -4,
      startsHour: 8,
      startsMinute: 0,
      durationMinutes: 120,
      status: AppointmentStatus.DONE,
      notes:
        'Atendimento emergencial no bloco B para reparo de vazamento no reservatório.',
    },
  ]

  const appointments: Array<Awaited<ReturnType<typeof upsertAppointment>>> = []

  for (const seed of seedPlan) {
    const { startsAt, endsAt } = buildPilotAppointmentDate({
      base: params.baseDate,
      dayOffset: seed.dayOffset,
      startsHour: seed.startsHour,
      startsMinute: seed.startsMinute,
      durationMinutes: seed.durationMinutes,
    })

    const stableIdempotencyKey = `pilot:${params.orgId}:appointment:${seed.key}`

    appointments.push(
      await upsertAppointment({
        idempotencyKey: stableIdempotencyKey,
        legacyIdempotencyKeyPrefix: `${stableIdempotencyKey}:`,
        orgId: params.orgId,
        customerId: params.customers[seed.customerIndex].id,
        startsAt,
        endsAt,
        status: seed.status,
        notes: seed.notes,
      }),
    )
  }

  return appointments
}

async function upsertServiceOrder(params: {
  orgId: string
  customerId: string
  appointmentId?: string
  assignedToPersonId?: string
  title: string
  description: string
  amountCents: number
  dueDate: Date
  status: ServiceOrderStatus
  priority?: number
  scheduledFor?: Date
  outcomeSummary?: string
  cancellationReason?: string | null
}) {
  const found = await prisma.serviceOrder.findFirst({
    where: {
      orgId: params.orgId,
      customerId: params.customerId,
      title: params.title,
    },
  })

  const startedAt = deriveStartedAt({
    status: params.status,
    scheduledFor: params.scheduledFor,
  })

  const finishedAt = deriveFinishedAt({
    status: params.status,
    scheduledFor: params.scheduledFor,
  })

  if (found) {
    return prisma.serviceOrder.update({
      where: { id: found.id },
      data: {
        appointmentId: params.appointmentId,
        assignedToPersonId: params.assignedToPersonId,
        description: params.description,
        amountCents: params.amountCents,
        dueDate: params.dueDate,
        status: params.status,
        priority: params.priority ?? 2,
        scheduledFor: params.scheduledFor,
        outcomeSummary: params.outcomeSummary,
        cancellationReason: params.cancellationReason ?? null,
        startedAt,
        finishedAt,
      },
    })
  }

  return prisma.serviceOrder.create({
    data: {
      ...params,
      priority: params.priority ?? 2,
      cancellationReason: params.cancellationReason ?? null,
      startedAt: startedAt ?? undefined,
      finishedAt: finishedAt ?? undefined,
    },
  })
}

async function upsertChargeByServiceOrder(params: {
  orgId: string
  customerId: string
  serviceOrderId: string
  amountCents: number
  dueDate: Date
  status: ChargeStatus
  paidAt?: Date | null
  notes?: string | null
}) {
  const existing = await prisma.charge.findFirst({
    where: {
      orgId: params.orgId,
      serviceOrderId: params.serviceOrderId,
    },
  })

  if (existing) {
    return prisma.charge.update({
      where: { id: existing.id },
      data: {
        customerId: params.customerId,
        amountCents: params.amountCents,
        dueDate: params.dueDate,
        status: params.status,
        paidAt: params.paidAt ?? null,
        notes: params.notes ?? null,
      },
    })
  }

  return prisma.charge.create({
    data: {
      orgId: params.orgId,
      customerId: params.customerId,
      serviceOrderId: params.serviceOrderId,
      amountCents: params.amountCents,
      dueDate: params.dueDate,
      status: params.status,
      paidAt: params.paidAt ?? null,
      notes: params.notes ?? null,
    },
  })
}

async function upsertStandaloneCharge(params: {
  orgId: string
  customerId: string
  amountCents: number
  dueDate: Date
  status: ChargeStatus
  notes?: string | null
}) {
  const existing = await prisma.charge.findFirst({
    where: {
      orgId: params.orgId,
      customerId: params.customerId,
      serviceOrderId: null,
      amountCents: params.amountCents,
    },
  })

  if (existing) {
    return prisma.charge.update({
      where: { id: existing.id },
      data: {
        dueDate: params.dueDate,
        status: params.status,
        notes: params.notes ?? null,
      },
    })
  }

  return prisma.charge.create({
    data: {
      orgId: params.orgId,
      customerId: params.customerId,
      amountCents: params.amountCents,
      dueDate: params.dueDate,
      status: params.status,
      notes: params.notes ?? null,
    },
  })
}

async function upsertPayment(params: {
  orgId: string
  chargeId: string
  amountCents: number
  method: PaymentMethod
  paidAt: Date
  notes?: string | null
  externalRef?: string | null
}) {
  const existing = await prisma.payment.findFirst({
    where: {
      orgId: params.orgId,
      chargeId: params.chargeId,
    },
  })

  if (existing) {
    return prisma.payment.update({
      where: { id: existing.id },
      data: {
        amountCents: params.amountCents,
        method: params.method,
        paidAt: params.paidAt,
        notes: params.notes ?? null,
        externalRef: params.externalRef ?? null,
      },
    })
  }

  return prisma.payment.create({
    data: {
      orgId: params.orgId,
      chargeId: params.chargeId,
      amountCents: params.amountCents,
      method: params.method,
      paidAt: params.paidAt,
      notes: params.notes ?? null,
      externalRef: params.externalRef ?? null,
    },
  })
}

async function upsertExpense(params: {
  orgId: string
  title: string
  description?: string
  amountCents: number
  category: any
  type: 'FIXED' | 'VARIABLE'
  recurrence: 'NONE' | 'MONTHLY'
  occurredAt: Date
  dueDay?: number
  isActive?: boolean
  notes?: string
  createdByUserId?: string
}) {
  const existing = await prisma.expense.findFirst({
    where: {
      orgId: params.orgId,
      title: params.title,
      occurredAt: params.occurredAt,
    },
  })

  if (existing) {
    return prisma.expense.update({
      where: { id: existing.id },
      data: params,
    })
  }

  return prisma.expense.create({ data: params })
}

async function upsertLaunch(params: {
  orgId: string
  description: string
  amountCents: number
  type: string
  category: string
  account?: string
  date: Date
  notes?: string
  createdByUserId?: string
}) {
  const existing = await prisma.launch.findFirst({
    where: {
      orgId: params.orgId,
      description: params.description,
      date: params.date,
    },
  })

  if (existing) {
    return prisma.launch.update({
      where: { id: existing.id },
      data: params,
    })
  }

  return prisma.launch.create({ data: params })
}

async function upsertInvoice(params: {
  orgId: string
  number: string
  customerId?: string
  description: string
  amountCents: number
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED'
}) {
  const existing = await prisma.invoice.findFirst({
    where: {
      orgId: params.orgId,
      number: params.number,
    },
  })

  if (existing) {
    return prisma.invoice.update({
      where: { id: existing.id },
      data: {
        customerId: params.customerId,
        description: params.description,
        amountCents: params.amountCents,
        status: params.status,
      },
    })
  }

  return prisma.invoice.create({
    data: params,
  })
}

async function createTimelineIfMissing(params: {
  orgId: string
  action: string
  description: string
  personId?: string
  customerId?: string
  serviceOrderId?: string
  appointmentId?: string
  chargeId?: string
  metadata?: Record<string, unknown>
}) {
  const existing = await prisma.timelineEvent.findFirst({
    where: {
      orgId: params.orgId,
      action: params.action,
      customerId: params.customerId ?? null,
      serviceOrderId: params.serviceOrderId ?? null,
      appointmentId: params.appointmentId ?? null,
      chargeId: params.chargeId ?? null,
    },
  })

  if (existing) {
    return prisma.timelineEvent.update({
      where: { id: existing.id },
      data: {
        description: params.description,
        personId: params.personId,
        metadata: params.metadata,
      },
    })
  }

  return prisma.timelineEvent.create({
    data: {
      orgId: params.orgId,
      action: params.action,
      description: params.description,
      personId: params.personId,
      customerId: params.customerId,
      serviceOrderId: params.serviceOrderId,
      appointmentId: params.appointmentId,
      chargeId: params.chargeId,
      metadata: params.metadata,
    },
  })
}

async function ensureBusinessSubscription(orgId: string) {
  const businessPlan = getDefaultPlanDefinition(PlanName.BUSINESS)

  const plan = await prisma.plan.upsert({
    where: { name: PlanName.BUSINESS },
    update: {
      displayName: businessPlan.displayName,
      priceCents: businessPlan.priceCents,
      limitsJson: businessPlan.limitsJson,
      featuresJson: businessPlan.featuresJson,
    },
    create: buildDefaultPlanCreateData(PlanName.BUSINESS),
  })

  const currentPeriodStart = atHour(new Date(), -2, 0, 0)
  const currentPeriodEnd = atHour(new Date(), 28, 23, 59)

  const existing = await prisma.subscription.findUnique({
    where: { orgId },
  })

  if (existing) {
    return prisma.subscription.update({
      where: { orgId },
      data: {
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart,
        currentPeriodEnd,
        canceledAt: null,
      },
    })
  }

  return prisma.subscription.create({
    data: {
      orgId,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart,
      currentPeriodEnd,
    },
  })
}

async function upsertWhatsAppTemplate(params: {
  orgId: string
  key: string
  name: string
  messageType: WhatsAppMessageType
  body: string
}) {
  return prisma.whatsAppTemplate.upsert({
    where: {
      orgId_key: {
        orgId: params.orgId,
        key: params.key,
      },
    },
    update: {
      channel: MessageChannel.WHATSAPP,
      name: params.name,
      messageType: params.messageType,
      body: params.body,
      content: params.body,
      isActive: true,
    },
    create: {
      orgId: params.orgId,
      channel: MessageChannel.WHATSAPP,
      key: params.key,
      name: params.name,
      messageType: params.messageType,
      body: params.body,
      content: params.body,
      isActive: true,
    },
  })
}

async function upsertWhatsAppConversation(params: {
  orgId: string
  customerId?: string
  phone: string
  title: string
  status: WhatsAppConversationStatus
  priority: WhatsAppConversationPriority
  contextType: WhatsAppContextType
  contextId: string
  lastMessageAt?: Date | null
  lastInboundAt?: Date | null
  lastOutboundAt?: Date | null
  unreadCount: number
}) {
  const existing = await prisma.whatsAppConversation.findFirst({
    where: {
      orgId: params.orgId,
      contextType: params.contextType,
      contextId: params.contextId,
    },
  })

  if (existing) {
    return prisma.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        customerId: params.customerId,
        phone: params.phone,
        title: params.title,
        status: params.status,
        priority: params.priority,
        contextType: params.contextType,
        contextId: params.contextId,
        lastMessageAt: params.lastMessageAt,
        lastInboundAt: params.lastInboundAt,
        lastOutboundAt: params.lastOutboundAt,
        unreadCount: params.unreadCount,
      },
    })
  }

  return prisma.whatsAppConversation.create({
    data: {
      orgId: params.orgId,
      customerId: params.customerId,
      phone: params.phone,
      title: params.title,
      status: params.status,
      priority: params.priority,
      contextType: params.contextType,
      contextId: params.contextId,
      lastMessageAt: params.lastMessageAt,
      lastInboundAt: params.lastInboundAt,
      lastOutboundAt: params.lastOutboundAt,
      unreadCount: params.unreadCount,
    },
  })
}

async function upsertWhatsAppMessage(params: {
  orgId: string
  conversationId: string
  customerId?: string
  direction: WhatsAppDirection
  entityType: WhatsAppEntityType
  entityId: string
  messageType: WhatsAppMessageType
  messageKey: string
  status: WhatsAppMessageStatus
  toPhone: string
  fromPhone?: string
  renderedText: string
  provider?: string
  providerMessageId?: string
  errorCode?: string
  errorMessage?: string
  sentAt?: Date
  deliveredAt?: Date
  readAt?: Date
  failedAt?: Date
  createdAt?: Date
  metadata?: Record<string, unknown>
}) {
  const existing = await prisma.whatsAppMessage.findUnique({
    where: { messageKey: params.messageKey },
  })

  if (existing) {
    return prisma.whatsAppMessage.update({
      where: { id: existing.id },
      data: {
        orgId: params.orgId,
        conversationId: params.conversationId,
        customerId: params.customerId,
        direction: params.direction,
        entityType: params.entityType,
        entityId: params.entityId,
        messageType: params.messageType,
        status: params.status,
        toPhone: params.toPhone,
        fromPhone: params.fromPhone,
        renderedText: params.renderedText,
        content: params.renderedText,
        provider: params.provider,
        providerMessageId: params.providerMessageId,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        sentAt: params.sentAt,
        deliveredAt: params.deliveredAt,
        readAt: params.readAt,
        failedAt: params.failedAt,
        metadata: params.metadata,
      },
    })
  }

  return prisma.whatsAppMessage.create({
    data: {
      orgId: params.orgId,
      conversationId: params.conversationId,
      customerId: params.customerId,
      channel: MessageChannel.WHATSAPP,
      direction: params.direction,
      entityType: params.entityType,
      entityId: params.entityId,
      messageType: params.messageType,
      messageKey: params.messageKey,
      status: params.status,
      toPhone: params.toPhone,
      fromPhone: params.fromPhone,
      renderedText: params.renderedText,
      content: params.renderedText,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      sentAt: params.sentAt,
      deliveredAt: params.deliveredAt,
      readAt: params.readAt,
      failedAt: params.failedAt,
      createdAt: params.createdAt,
      metadata: params.metadata,
    },
  })
}

export async function seedPilot() {
  const now = new Date()
  const baseDate = atHour(now, 0, 0, 0)
  const pilotOrgSlug = env('PILOT_ORG_SLUG', 'pilot-servicos-viva')
  const pilotOrgName = env('PILOT_ORG_NAME', 'Serviços Viva - Ambiente Piloto')

  const org = await prisma.organization.upsert({
    where: { slug: pilotOrgSlug },
    update: {
      name: pilotOrgName,
      requiresOnboarding: false,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
    },
    create: {
      slug: pilotOrgSlug,
      name: pilotOrgName,
      requiresOnboarding: false,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
    },
  })

  await ensureBusinessSubscription(org.id)

  const users: PilotUser[] = [
    {
      key: 'admin',
      name: 'Paula Almeida',
      email: env('PILOT_ADMIN_EMAIL', PILOT_ADMIN_EMAIL_FALLBACK),
      password: env('PILOT_ADMIN_PASSWORD', PILOT_ADMIN_PASSWORD_FALLBACK),
      role: UserRole.ADMIN,
      personRole: 'ADMIN',
    },
    {
      key: 'operator',
      name: 'Rafael Operações',
      email: env('PILOT_OPERATOR_EMAIL', 'operador.piloto@nexogestao.local'),
      password: env('PILOT_OPERATOR_PASSWORD', 'Piloto@Operador123'),
      role: UserRole.STAFF,
      personRole: 'OPERATOR',
    },
    {
      key: 'finance',
      name: 'Juliana Financeiro',
      email: env('PILOT_FINANCE_EMAIL', 'financeiro.piloto@nexogestao.local'),
      password: env('PILOT_FINANCE_PASSWORD', 'Piloto@Finance123'),
      role: UserRole.MANAGER,
      personRole: 'FINANCE',
    },
  ]

  const savedUsers = await Promise.all(
    users.map((user) => upsertUser(org.id, user)),
  )

  const [adminUser, operatorUser, financeUser] = savedUsers

  const adminPerson = await prisma.person.findUnique({
    where: { userId: adminUser.id },
  })

  const operatorPerson = await prisma.person.findUnique({
    where: { userId: operatorUser.id },
  })

  const financePerson = await prisma.person.findUnique({
    where: { userId: financeUser.id },
  })

  const customerSeeds: CustomerSeed[] = [
    {
      name: 'Condomínio Parque das Flores',
      phone: '5511987112233',
      email: 'sindico@parquedasflores.com.br',
      notes: 'Contrato mensal de manutenção predial e elétrica.',
    },
    {
      name: 'Clínica Vida Leve',
      phone: '5511933557799',
      email: 'compras@clinicaleve.com.br',
      notes: 'Cliente com prioridade alta para chamados de climatização.',
    },
    {
      name: 'Restaurante Sabor da Serra',
      phone: '5511974431188',
      email: 'proprietario@sabordaserra.com.br',
      notes: 'Atendimento fora do horário comercial para cozinha industrial.',
    },
    {
      name: 'Escola Crescer Mais',
      phone: '5511911223344',
      email: 'diretoria@crescermais.edu.br',
      notes: 'Inspeção preventiva mensal em instalações hidráulicas.',
    },
    {
      name: 'Loja Center Tech',
      phone: '5511945670033',
      email: 'financeiro@centertech.com.br',
      notes: 'Chamados de TI e rede com SLA de 24h.',
    },
    {
      name: 'Cliente Sem Telefone',
      phone: null,
      email: 'sem.telefone@cliente-piloto.com.br',
      notes: 'Cliente de teste para validar bloqueio de envio sem telefone.',
    },
  ]

  const customers: Array<Awaited<ReturnType<typeof upsertCustomer>>> = []
  for (const customer of customerSeeds) {
    customers.push(await upsertCustomer(org.id, customer))
  }

  const joaoSilva = await upsertCustomer(org.id, {
    name: 'João Silva',
    phone: '5511998877661',
    email: 'joao.silva@cliente-piloto.com.br',
    notes: 'Cliente piloto de cobrança no WhatsApp.',
  })

  const helenaMartins = await upsertCustomer(org.id, {
    name: 'Helena Martins',
    phone: '5511911345501',
    email: 'helena.martins@cliente-piloto.com.br',
    notes: 'Cliente piloto de confirmação de agendamento no WhatsApp.',
  })

  const carlosAlberto = await upsertCustomer(org.id, {
    name: 'Carlos Alberto',
    phone: '5511970012299',
    email: 'carlos.alberto@cliente-piloto.com.br',
    notes: 'Cliente piloto de atualização de ordem de serviço no WhatsApp.',
  })

  const beatrizLima = await upsertCustomer(org.id, {
    name: 'Beatriz Lima',
    phone: '5511985516633',
    email: 'beatriz.lima@cliente-piloto.com.br',
    notes: 'Cliente piloto para simulação de falha de envio no WhatsApp.',
  })

  const appointments = await seedPilotAppointments({
    orgId: org.id,
    baseDate,
    customers,
  })

  const serviceOrders: Array<Awaited<ReturnType<typeof upsertServiceOrder>>> = []

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[0].id,
      appointmentId: appointments[0].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-001 - Manutenção elétrica condomínio',
      description:
        'Reaperto em barramentos, revisão de quadro e substituição de 12 lâmpadas LED.',
      amountCents: 185000,
      dueDate: atHour(now, 7, 18, 0),
      status: ServiceOrderStatus.IN_PROGRESS,
      priority: 3,
      scheduledFor: appointments[0].startsAt,
    }),
  )

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[1].id,
      appointmentId: appointments[1].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-002 - Revisão climatização clínica',
      description: 'Limpeza completa, teste de pressão e troca de filtro HEPA.',
      amountCents: 124000,
      dueDate: atHour(now, 10, 18, 0),
      status: ServiceOrderStatus.ASSIGNED,
      priority: 2,
      scheduledFor: appointments[1].startsAt,
    }),
  )

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[2].id,
      appointmentId: appointments[2].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-003 - Cozinha industrial corretiva',
      description:
        'Troca de contatores, testes elétricos e emissão de relatório técnico.',
      amountCents: 98000,
      dueDate: atHour(now, -1, 18, 0),
      status: ServiceOrderStatus.DONE,
      priority: 3,
      scheduledFor: appointments[2].startsAt,
      outcomeSummary:
        'Equipamento liberado para uso com recomendação de monitoramento semanal.',
    }),
  )

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[3].id,
      appointmentId: appointments[3].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-004 - Preventiva hidráulica escolar',
      description:
        'Substituição de válvulas, vedação de 4 pontos de vazamento e teste de pressão.',
      amountCents: 76000,
      dueDate: atHour(now, 12, 18, 0),
      status: ServiceOrderStatus.OPEN,
      priority: 2,
      scheduledFor: appointments[3].startsAt,
    }),
  )

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[4].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-005 - Reestruturação de rede loja',
      description:
        'Passagem de novo cabeamento CAT6, organização de rack e troca do switch principal.',
      amountCents: 212000,
      dueDate: atHour(now, 15, 18, 0),
      status: ServiceOrderStatus.OPEN,
      priority: 3,
      scheduledFor: atHour(now, 4, 13, 0),
      cancellationReason: null,
    }),
  )

  serviceOrders.push(
    await upsertServiceOrder({
      orgId: org.id,
      customerId: customers[3].id,
      appointmentId: appointments[5].id,
      assignedToPersonId: operatorPerson?.id,
      title: 'OS-006 - Reparo emergencial reservatório escola',
      description:
        'Troca de boia, vedação de conexões e normalização do abastecimento do bloco B.',
      amountCents: 143000,
      dueDate: atHour(now, 2, 17, 0),
      status: ServiceOrderStatus.DONE,
      priority: 3,
      scheduledFor: appointments[5].startsAt,
      outcomeSummary:
        'Sistema estabilizado e operação normalizada; recomendado retorno preventivo em 30 dias.',
    }),
  )

  const charge1 = await upsertChargeByServiceOrder({
    orgId: org.id,
    customerId: customers[0].id,
    serviceOrderId: serviceOrders[0].id,
    amountCents: 185000,
    dueDate: atHour(now, 10, 12, 0),
    status: ChargeStatus.PENDING,
    notes: 'Pagamento via PIX em até 10 dias.',
  })

  const charge2 = await upsertChargeByServiceOrder({
    orgId: org.id,
    customerId: customers[2].id,
    serviceOrderId: serviceOrders[2].id,
    amountCents: 98000,
    dueDate: atHour(now, -4, 12, 0),
    paidAt: atHour(now, -3, 10, 0),
    status: ChargeStatus.PAID,
    notes: 'Pago no cartão corporativo.',
  })

  const payment2 = await upsertPayment({
    orgId: org.id,
    chargeId: charge2.id,
    amountCents: 98000,
    method: PaymentMethod.CARD,
    paidAt: atHour(now, -3, 10, 0),
    notes: 'Conciliação automática finalizada pelo financeiro.',
    externalRef: 'PILOT-PAYMENT-OS003',
  })

  const overdueCharge = await upsertStandaloneCharge({
    orgId: org.id,
    customerId: customers[1].id,
    amountCents: 124000,
    dueDate: atHour(now, -5, 12, 0),
    status: ChargeStatus.OVERDUE,
    notes: 'Fatura vencida há 5 dias.',
  })

  const pendingStandaloneCharge = await upsertStandaloneCharge({
    orgId: org.id,
    customerId: customers[4].id,
    amountCents: 212000,
    dueDate: atHour(now, 18, 12, 0),
    status: ChargeStatus.PENDING,
    notes: 'Cobrança inicial para início da reestruturação de rede.',
  })

  const pendingDoneCharge = await upsertChargeByServiceOrder({
    orgId: org.id,
    customerId: customers[3].id,
    serviceOrderId: serviceOrders[5].id,
    amountCents: 143000,
    dueDate: atHour(now, 2, 12, 0),
    status: ChargeStatus.PENDING,
    notes: 'OS concluída aguardando processamento no contas a pagar da escola.',
  })

  const chargeJoao = await upsertStandaloneCharge({
    orgId: org.id,
    customerId: joaoSilva.id,
    amountCents: 48000,
    dueDate: atHour(now, -3, 12, 0),
    status: ChargeStatus.OVERDUE,
    notes: 'Cobrança operacional piloto vencida há 3 dias.',
  })

  const appointmentHelena = await upsertAppointment({
    idempotencyKey: `pilot:${org.id}:appointment:whatsapp:helena:amanha-14h`,
    orgId: org.id,
    customerId: helenaMartins.id,
    startsAt: atHour(now, 1, 14, 0),
    endsAt: atHour(now, 1, 15, 0),
    status: AppointmentStatus.SCHEDULED,
    notes: 'Agendamento piloto para confirmação via WhatsApp.',
  })

  const serviceOrderCarlos = await upsertServiceOrder({
    orgId: org.id,
    customerId: carlosAlberto.id,
    assignedToPersonId: operatorPerson?.id,
    title: 'OS-WHATSAPP-001 - Atendimento técnico em andamento',
    description: 'Ordem de serviço operacional utilizada para timeline do WhatsApp.',
    amountCents: 93000,
    dueDate: atHour(now, 6, 18, 0),
    status: ServiceOrderStatus.IN_PROGRESS,
    priority: 2,
    scheduledFor: atHour(now, 0, 10, 0),
  })

  const whatsappTemplates = [
    {
      key: 'appointment_confirmation',
      name: 'Confirmação de agendamento',
      messageType: WhatsAppMessageType.APPOINTMENT_CONFIRMATION,
      body: 'Olá {{nome}}, seu agendamento está confirmado para {{data_hora}}.',
    },
    {
      key: 'appointment_reminder',
      name: 'Lembrete de agendamento',
      messageType: WhatsAppMessageType.APPOINTMENT_REMINDER,
      body: 'Olá {{nome}}, lembrando seu agendamento para {{data_hora}}.',
    },
    {
      key: 'payment_reminder',
      name: 'Lembrete de pagamento',
      messageType: WhatsAppMessageType.PAYMENT_REMINDER,
      body: 'Olá {{nome}}, identificamos uma cobrança em aberto no valor de {{valor}}.',
    },
    {
      key: 'payment_link',
      name: 'Envio de link de pagamento',
      messageType: WhatsAppMessageType.PAYMENT_LINK,
      body: 'Segue seu link para pagamento: {{link_pagamento}}',
    },
    {
      key: 'payment_confirmation',
      name: 'Confirmação de pagamento',
      messageType: WhatsAppMessageType.PAYMENT_CONFIRMATION,
      body: 'Pagamento confirmado com sucesso. Obrigado, {{nome}}!',
    },
    {
      key: 'service_update',
      name: 'Atualização de serviço',
      messageType: WhatsAppMessageType.SERVICE_UPDATE,
      body: 'Atualização da sua ordem de serviço: {{status_os}}.',
    },
    {
      key: 'manual_followup',
      name: 'Follow-up manual',
      messageType: WhatsAppMessageType.MANUAL,
      body: 'Olá {{nome}}, estamos acompanhando seu atendimento.',
    },
  ] as const

  for (const template of whatsappTemplates) {
    await upsertWhatsAppTemplate({
      orgId: org.id,
      key: template.key,
      name: template.name,
      messageType: template.messageType,
      body: template.body,
    })
  }

  const conversationChargeLastOutbound = atHour(now, -1, 10, 15)
  const conversationChargeLastInbound = atHour(now, -1, 10, 18)
  const chargeConversation = await upsertWhatsAppConversation({
    orgId: org.id,
    customerId: joaoSilva.id,
    phone: joaoSilva.phone ?? '5511998877661',
    title: 'Cobrança vencida - João Silva',
    status: WhatsAppConversationStatus.PENDING,
    priority: WhatsAppConversationPriority.HIGH,
    contextType: WhatsAppContextType.CHARGE,
    contextId: chargeJoao.id,
    lastMessageAt: conversationChargeLastInbound,
    lastOutboundAt: conversationChargeLastOutbound,
    lastInboundAt: conversationChargeLastInbound,
    unreadCount: 0,
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: chargeConversation.id,
    customerId: joaoSilva.id,
    direction: WhatsAppDirection.OUTBOUND,
    entityType: WhatsAppEntityType.CHARGE,
    entityId: chargeJoao.id,
    messageType: WhatsAppMessageType.PAYMENT_REMINDER,
    messageKey: `pilot:${org.id}:wa:joao:cobranca:outbound`,
    status: WhatsAppMessageStatus.DELIVERED,
    toPhone: joaoSilva.phone ?? '5511998877661',
    fromPhone: 'NEXOGESTAO',
    renderedText: 'Olá João, segue o lembrete da cobrança em aberto.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-joao-out-01`,
    sentAt: conversationChargeLastOutbound,
    deliveredAt: new Date(conversationChargeLastOutbound.getTime() + 30_000),
    createdAt: conversationChargeLastOutbound,
    metadata: { seedScenario: 'whatsapp_charge_overdue' },
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: chargeConversation.id,
    customerId: joaoSilva.id,
    direction: WhatsAppDirection.INBOUND,
    entityType: WhatsAppEntityType.CHARGE,
    entityId: chargeJoao.id,
    messageType: WhatsAppMessageType.MANUAL,
    messageKey: `pilot:${org.id}:wa:joao:cobranca:inbound`,
    status: WhatsAppMessageStatus.READ,
    toPhone: 'NEXOGESTAO',
    fromPhone: joaoSilva.phone ?? '5511998877661',
    renderedText: 'Vou efetuar o pagamento hoje.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-joao-in-01`,
    sentAt: conversationChargeLastInbound,
    deliveredAt: new Date(conversationChargeLastInbound.getTime() + 20_000),
    readAt: new Date(conversationChargeLastInbound.getTime() + 60_000),
    createdAt: conversationChargeLastInbound,
    metadata: { seedScenario: 'whatsapp_charge_overdue' },
  })

  const appointmentLastOutbound = atHour(now, 0, 9, 10)
  const appointmentLastInbound = atHour(now, 0, 9, 14)
  const appointmentConversation = await upsertWhatsAppConversation({
    orgId: org.id,
    customerId: helenaMartins.id,
    phone: helenaMartins.phone ?? '5511911345501',
    title: 'Confirmação de agendamento - Helena Martins',
    status: WhatsAppConversationStatus.PENDING,
    priority: WhatsAppConversationPriority.HIGH,
    contextType: WhatsAppContextType.APPOINTMENT,
    contextId: appointmentHelena.id,
    lastMessageAt: appointmentLastInbound,
    lastOutboundAt: appointmentLastOutbound,
    lastInboundAt: appointmentLastInbound,
    unreadCount: 1,
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: appointmentConversation.id,
    customerId: helenaMartins.id,
    direction: WhatsAppDirection.OUTBOUND,
    entityType: WhatsAppEntityType.APPOINTMENT,
    entityId: appointmentHelena.id,
    messageType: WhatsAppMessageType.APPOINTMENT_REMINDER,
    messageKey: `pilot:${org.id}:wa:helena:appointment:outbound`,
    status: WhatsAppMessageStatus.DELIVERED,
    toPhone: helenaMartins.phone ?? '5511911345501',
    fromPhone: 'NEXOGESTAO',
    renderedText:
      'Olá Helena, passando para confirmar seu agendamento de amanhã às 14:00.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-helena-out-01`,
    sentAt: appointmentLastOutbound,
    deliveredAt: new Date(appointmentLastOutbound.getTime() + 40_000),
    createdAt: appointmentLastOutbound,
    metadata: { seedScenario: 'whatsapp_appointment_pending' },
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: appointmentConversation.id,
    customerId: helenaMartins.id,
    direction: WhatsAppDirection.INBOUND,
    entityType: WhatsAppEntityType.APPOINTMENT,
    entityId: appointmentHelena.id,
    messageType: WhatsAppMessageType.MANUAL,
    messageKey: `pilot:${org.id}:wa:helena:appointment:inbound`,
    status: WhatsAppMessageStatus.DELIVERED,
    toPhone: 'NEXOGESTAO',
    fromPhone: helenaMartins.phone ?? '5511911345501',
    renderedText: 'Obrigada, até amanhã.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-helena-in-01`,
    sentAt: appointmentLastInbound,
    deliveredAt: new Date(appointmentLastInbound.getTime() + 15_000),
    createdAt: appointmentLastInbound,
    metadata: { seedScenario: 'whatsapp_appointment_pending' },
  })

  const serviceOrderLastOutbound = atHour(now, 0, 11, 25)
  const serviceOrderLastInbound = atHour(now, 0, 11, 31)
  const serviceOrderConversation = await upsertWhatsAppConversation({
    orgId: org.id,
    customerId: carlosAlberto.id,
    phone: carlosAlberto.phone ?? '5511970012299',
    title: 'Atualização de O.S. - Carlos Alberto',
    status: WhatsAppConversationStatus.OPEN,
    priority: WhatsAppConversationPriority.NORMAL,
    contextType: WhatsAppContextType.SERVICE_ORDER,
    contextId: serviceOrderCarlos.id,
    lastMessageAt: serviceOrderLastInbound,
    lastOutboundAt: serviceOrderLastOutbound,
    lastInboundAt: serviceOrderLastInbound,
    unreadCount: 1,
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: serviceOrderConversation.id,
    customerId: carlosAlberto.id,
    direction: WhatsAppDirection.OUTBOUND,
    entityType: WhatsAppEntityType.SERVICE_ORDER,
    entityId: serviceOrderCarlos.id,
    messageType: WhatsAppMessageType.SERVICE_UPDATE,
    messageKey: `pilot:${org.id}:wa:carlos:service-order:outbound`,
    status: WhatsAppMessageStatus.SENT,
    toPhone: carlosAlberto.phone ?? '5511970012299',
    fromPhone: 'NEXOGESTAO',
    renderedText: 'Carlos, sua ordem de serviço está em andamento.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-carlos-out-01`,
    sentAt: serviceOrderLastOutbound,
    deliveredAt: new Date(serviceOrderLastOutbound.getTime() + 45_000),
    createdAt: serviceOrderLastOutbound,
    metadata: { seedScenario: 'whatsapp_service_order_in_progress' },
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: serviceOrderConversation.id,
    customerId: carlosAlberto.id,
    direction: WhatsAppDirection.INBOUND,
    entityType: WhatsAppEntityType.SERVICE_ORDER,
    entityId: serviceOrderCarlos.id,
    messageType: WhatsAppMessageType.MANUAL,
    messageKey: `pilot:${org.id}:wa:carlos:service-order:inbound`,
    status: WhatsAppMessageStatus.DELIVERED,
    toPhone: 'NEXOGESTAO',
    fromPhone: carlosAlberto.phone ?? '5511970012299',
    renderedText: 'Perfeito, obrigado.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-carlos-in-01`,
    sentAt: serviceOrderLastInbound,
    deliveredAt: new Date(serviceOrderLastInbound.getTime() + 20_000),
    createdAt: serviceOrderLastInbound,
    metadata: { seedScenario: 'whatsapp_service_order_in_progress' },
  })

  const failedLastOutbound = atHour(now, 0, 8, 50)
  const failedConversation = await upsertWhatsAppConversation({
    orgId: org.id,
    customerId: beatrizLima.id,
    phone: beatrizLima.phone ?? '5511985516633',
    title: 'Falha de envio - Beatriz Lima',
    status: WhatsAppConversationStatus.FAILED,
    priority: WhatsAppConversationPriority.HIGH,
    contextType: WhatsAppContextType.GENERAL,
    contextId: `pilot:${org.id}:general:beatriz-lima`,
    lastMessageAt: failedLastOutbound,
    lastOutboundAt: failedLastOutbound,
    lastInboundAt: null,
    unreadCount: 0,
  })

  await upsertWhatsAppMessage({
    orgId: org.id,
    conversationId: failedConversation.id,
    customerId: beatrizLima.id,
    direction: WhatsAppDirection.OUTBOUND,
    entityType: WhatsAppEntityType.GENERAL,
    entityId: `pilot:${org.id}:general:beatriz-lima`,
    messageType: WhatsAppMessageType.MANUAL,
    messageKey: `pilot:${org.id}:wa:beatriz:failed:outbound`,
    status: WhatsAppMessageStatus.FAILED,
    toPhone: beatrizLima.phone ?? '5511985516633',
    fromPhone: 'NEXOGESTAO',
    renderedText: 'Olá Beatriz, tentamos enviar uma atualização do seu atendimento.',
    provider: 'mock-provider',
    providerMessageId: `pilot-${org.slug}-beatriz-out-01`,
    errorCode: 'PROVIDER_MOCK_FAILED',
    errorMessage: 'Falha simulada de envio no provider mock',
    sentAt: failedLastOutbound,
    failedAt: new Date(failedLastOutbound.getTime() + 35_000),
    createdAt: failedLastOutbound,
    metadata: { seedScenario: 'whatsapp_failed_delivery' },
  })

  const year = now.getFullYear()

  await upsertInvoice({
    orgId: org.id,
    number: `FV-${year}-1001`,
    customerId: customers[0].id,
    description: 'Mensalidade manutenção predial - Condomínio Parque das Flores',
    amountCents: 185000,
    status: 'ISSUED',
  })

  await upsertInvoice({
    orgId: org.id,
    number: `FV-${year}-1002`,
    customerId: customers[2].id,
    description: 'Serviço corretivo cozinha industrial',
    amountCents: 98000,
    status: 'PAID',
  })

  await upsertInvoice({
    orgId: org.id,
    number: `FV-${year}-1003`,
    customerId: customers[1].id,
    description: 'Manutenção de climatização trimestral',
    amountCents: 124000,
    status: 'ISSUED',
  })

  await upsertInvoice({
    orgId: org.id,
    number: `FV-${year}-1004`,
    customerId: customers[3].id,
    description: 'Pacote preventivo hidráulico semestral',
    amountCents: 76000,
    status: 'DRAFT',
  })

  const expenseSeeds = [
    {
      orgId: org.id,
      title: 'Transporte equipe técnica',
      description: 'Combustível equipe técnica - semana 1',
      amountCents: 18750,
      category: 'TRANSPORT',
      type: 'VARIABLE' as const,
      recurrence: 'NONE' as const,
      occurredAt: atHour(now, -7, 18, 0),
      notes: 'Abastecimento para 3 veículos utilitários.',
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      title: 'Mercado / insumos',
      description: 'Compra de filtros e peças de reposição',
      amountCents: 25490,
      category: 'MARKET',
      type: 'VARIABLE' as const,
      recurrence: 'NONE' as const,
      occurredAt: atHour(now, -6, 15, 0),
      createdByUserId: operatorUser.id,
    },
    {
      orgId: org.id,
      title: 'Internet e ferramentas',
      description: 'Assinatura plataforma de chamados',
      amountCents: 6990,
      category: 'INTERNET',
      type: 'FIXED' as const,
      recurrence: 'MONTHLY' as const,
      dueDay: 5,
      isActive: true,
      occurredAt: atHour(now, -5, 10, 0),
      notes: 'Plano profissional mensal.',
      createdByUserId: adminUser.id,
    },
    {
      orgId: org.id,
      title: 'Operacional da semana',
      description: 'Campanha local Google Ads',
      amountCents: 18000,
      category: 'OPERATIONS',
      type: 'VARIABLE' as const,
      recurrence: 'NONE' as const,
      occurredAt: atHour(now, -4, 12, 0),
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      title: 'Funcionários',
      description: 'Vale-transporte equipe operacional',
      amountCents: 22500,
      category: 'PAYROLL',
      type: 'FIXED' as const,
      recurrence: 'MONTHLY' as const,
      dueDay: 6,
      isActive: true,
      occurredAt: atHour(now, -3, 9, 0),
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      title: 'Aluguel',
      description: 'Aluguel da operação',
      amountCents: 450000,
      category: 'HOUSING',
      type: 'FIXED' as const,
      recurrence: 'MONTHLY' as const,
      dueDay: 5,
      isActive: true,
      occurredAt: atHour(now, -10, 9, 0),
      createdByUserId: adminUser.id,
    },
    {
      orgId: org.id,
      title: 'Energia',
      description: 'Conta mensal de energia',
      amountCents: 69000,
      category: 'ELECTRICITY',
      type: 'FIXED' as const,
      recurrence: 'MONTHLY' as const,
      dueDay: 10,
      isActive: true,
      occurredAt: atHour(now, -9, 9, 0),
      createdByUserId: financeUser.id,
    },
  ]

  for (const expense of expenseSeeds) {
    await upsertExpense(expense)
  }

  const launchSeeds = [
    {
      orgId: org.id,
      description: 'Receita prevista - OS-001',
      amountCents: 185000,
      type: 'INCOME',
      category: 'Serviços Prediais',
      account: 'Conta Corrente Principal',
      date: atHour(now, 10, 8, 0),
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      description: 'Receita realizada - OS-003',
      amountCents: 98000,
      type: 'INCOME',
      category: 'Manutenção Corretiva',
      account: 'Conta Corrente Principal',
      date: atHour(now, -3, 11, 0),
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      description: 'Despesa com combustível',
      amountCents: 18750,
      type: 'EXPENSE',
      category: 'Logística',
      account: 'Cartão Empresa',
      date: atHour(now, -7, 18, 30),
      createdByUserId: financeUser.id,
    },
    {
      orgId: org.id,
      description: 'Despesa com peças de reposição',
      amountCents: 25490,
      type: 'EXPENSE',
      category: 'Suprimentos Técnicos',
      account: 'Conta Corrente Principal',
      date: atHour(now, -6, 16, 0),
      createdByUserId: financeUser.id,
    },
  ]

  for (const launch of launchSeeds) {
    await upsertLaunch(launch)
  }

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'PILOT_ENVIRONMENT_SEEDED',
    description: 'Ambiente piloto populado com base operacional realista.',
    personId: financePerson?.id,
    metadata: {
      orgSlug: org.slug,
      users: users.map((user) => ({ email: user.email, role: user.role })),
      customers: customerSeeds.length,
      appointments: appointments.length,
      serviceOrders: serviceOrders.length,
      chargesSeeded: 5,
      invoicesSeeded: 4,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CUSTOMER_CREATED',
    description: `Cliente ${customers[0].name} inserido no ambiente piloto.`,
    personId: adminPerson?.id,
    customerId: customers[0].id,
    metadata: {
      source: 'seed-pilot',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'APPOINTMENT_CREATED',
    description: `Agendamento criado para ${customers[0].name}.`,
    personId: adminPerson?.id,
    customerId: customers[0].id,
    appointmentId: appointments[0].id,
    metadata: {
      startsAt: appointments[0].startsAt.toISOString(),
      endsAt: appointments[0].endsAt.toISOString(),
      status: appointments[0].status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'SERVICE_ORDER_CREATED',
    description: 'OS-001 criada para atendimento do condomínio.',
    personId: adminPerson?.id,
    customerId: customers[0].id,
    serviceOrderId: serviceOrders[0].id,
    appointmentId: appointments[0].id,
    metadata: {
      title: serviceOrders[0].title,
      status: serviceOrders[0].status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'SERVICE_ORDER_IN_PROGRESS',
    description: 'OS-001 em execução com equipe técnica em campo.',
    personId: operatorPerson?.id,
    customerId: customers[0].id,
    serviceOrderId: serviceOrders[0].id,
    appointmentId: appointments[0].id,
    metadata: {
      status: 'IN_PROGRESS',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CHARGE_CREATED',
    description: 'Cobrança gerada para a OS-001.',
    personId: financePerson?.id,
    customerId: customers[0].id,
    serviceOrderId: serviceOrders[0].id,
    chargeId: charge1.id,
    metadata: {
      amountCents: charge1.amountCents,
      dueDate: charge1.dueDate.toISOString(),
      status: charge1.status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'SERVICE_ORDER_DONE',
    description: 'OS-006 concluída com restabelecimento do abastecimento na escola.',
    personId: operatorPerson?.id,
    customerId: customers[3].id,
    serviceOrderId: serviceOrders[5].id,
    appointmentId: appointments[5].id,
    metadata: {
      status: serviceOrders[5].status,
      outcomeSummary: serviceOrders[5].outcomeSummary,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CHARGE_CREATED',
    description: 'Cobrança pendente gerada para a OS-006 já concluída.',
    personId: financePerson?.id,
    customerId: customers[3].id,
    serviceOrderId: serviceOrders[5].id,
    chargeId: pendingDoneCharge.id,
    metadata: {
      amountCents: pendingDoneCharge.amountCents,
      dueDate: pendingDoneCharge.dueDate.toISOString(),
      status: pendingDoneCharge.status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'SERVICE_ORDER_DONE',
    description: 'OS-003 concluída com emissão de relatório técnico.',
    personId: operatorPerson?.id,
    customerId: customers[2].id,
    serviceOrderId: serviceOrders[2].id,
    appointmentId: appointments[2].id,
    metadata: {
      status: serviceOrders[2].status,
      outcomeSummary: serviceOrders[2].outcomeSummary,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CHARGE_CREATED',
    description: 'Cobrança gerada para a OS-003.',
    personId: financePerson?.id,
    customerId: customers[2].id,
    serviceOrderId: serviceOrders[2].id,
    chargeId: charge2.id,
    metadata: {
      amountCents: charge2.amountCents,
      dueDate: charge2.dueDate.toISOString(),
      status: charge2.status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'PAYMENT_RECEIVED',
    description: 'Pagamento recebido e conciliado para a OS-003.',
    personId: financePerson?.id,
    customerId: customers[2].id,
    serviceOrderId: serviceOrders[2].id,
    chargeId: charge2.id,
    metadata: {
      paymentId: payment2.id,
      amountCents: 98000,
      method: 'CARD',
      status: 'PAID',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CHARGE_OVERDUE',
    description: 'Cobrança em atraso detectada para a Clínica Vida Leve.',
    personId: financePerson?.id,
    customerId: customers[1].id,
    chargeId: overdueCharge.id,
    metadata: {
      amountCents: 124000,
      status: 'OVERDUE',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'APPOINTMENT_NO_SHOW',
    description: 'Atendimento não realizado por ausência do responsável da loja.',
    personId: operatorPerson?.id,
    customerId: customers[4].id,
    appointmentId: appointments[4].id,
    metadata: {
      status: 'NO_SHOW',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'CHARGE_CREATED',
    description: 'Cobrança inicial registrada para reestruturação de rede da loja.',
    personId: financePerson?.id,
    customerId: customers[4].id,
    chargeId: pendingStandaloneCharge.id,
    metadata: {
      amountCents: pendingStandaloneCharge.amountCents,
      dueDate: pendingStandaloneCharge.dueDate.toISOString(),
      status: pendingStandaloneCharge.status,
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'WHATSAPP_MESSAGE_SENT',
    description: 'Mensagem de cobrança enviada para João Silva.',
    personId: financePerson?.id,
    customerId: joaoSilva.id,
    chargeId: chargeJoao.id,
    metadata: {
      channel: 'WHATSAPP',
      contextType: 'CHARGE',
      conversationStatus: 'PENDING',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'WHATSAPP_INBOUND_RECEIVED',
    description: 'Resposta recebida de Helena Martins confirmando agendamento.',
    personId: operatorPerson?.id,
    customerId: helenaMartins.id,
    appointmentId: appointmentHelena.id,
    metadata: {
      channel: 'WHATSAPP',
      contextType: 'APPOINTMENT',
      conversationStatus: 'PENDING',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'WHATSAPP_MESSAGE_SENT',
    description: 'Atualização de O.S. enviada para Carlos Alberto.',
    personId: operatorPerson?.id,
    customerId: carlosAlberto.id,
    serviceOrderId: serviceOrderCarlos.id,
    metadata: {
      channel: 'WHATSAPP',
      contextType: 'SERVICE_ORDER',
      conversationStatus: 'OPEN',
    },
  })

  await createTimelineIfMissing({
    orgId: org.id,
    action: 'WHATSAPP_MESSAGE_FAILED',
    description: 'Falha simulada no envio de mensagem para Beatriz Lima.',
    personId: operatorPerson?.id,
    customerId: beatrizLima.id,
    metadata: {
      channel: 'WHATSAPP',
      contextType: 'GENERAL',
      errorMessage: 'Falha simulada de envio no provider mock',
      conversationStatus: 'FAILED',
    },
  })

  console.log('✅ Pilot seed concluído com sucesso!')
  console.log(`Organização: ${org.name} (${org.slug})`)
  console.log('Usuários de teste:')
  for (const user of users) {
    console.log(`- ${user.key}: ${user.email} / ${user.password}`)
  }
  console.log(`Cobrança pendente principal: ${charge1.id}`)
  console.log(`Cobrança paga principal: ${charge2.id}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedPilot()
    .catch((error) => {
      console.error('❌ Falha ao gerar seed piloto:', error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'

import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import {
  describeRealIntegration,
  REAL_INTEGRATION_ENABLED_MESSAGE,
  REAL_INTEGRATION_SKIP_REASON,
  RUN_REAL_INTEGRATION,
} from './infra-guards'

type WorkflowPrisma = PrismaService & {
  serviceOrder: PrismaService['serviceOrder']
}

if (!RUN_REAL_INTEGRATION) {
  console.warn(`[integration-skip] ${REAL_INTEGRATION_SKIP_REASON}`)
} else {
  console.info(`[integration-run] ${REAL_INTEGRATION_ENABLED_MESSAGE}`)
}


const extractCollection = (payload: any): any[] => {
  const items = payload?.data ?? payload?.items ?? payload
  return Array.isArray(items) ? items : []
}

describeRealIntegration('Canonical Operational Workflow (e2e)', () => {
  // Real infra startup (Postgres/Redis + Prisma retries) can exceed 30s on cold boots.
  jest.setTimeout(90000)
  let app: INestApplication
  let prisma: WorkflowPrisma

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be explicitly configured for integration tests')
  }
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })

  const primaryOrgId = randomUUID()
  const secondaryOrgId = randomUUID()
  const primaryPersonId = randomUUID()
  const secondaryPersonId = randomUUID()
  const primaryUserId = randomUUID()
  const secondaryUserId = randomUUID()

  const authFor = (orgId: string, userId: string, personId: string) => {
    const token = jwt.sign({ sub: userId, role: 'ADMIN', orgId, personId })
    return { Authorization: `Bearer ${token}` }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()

    prisma = app.get(PrismaService) as WorkflowPrisma

    await prisma.organization.createMany({
      data: [
        { id: primaryOrgId, name: `Workflow Org ${primaryOrgId.slice(0, 8)}`, slug: `wf-${primaryOrgId.slice(0, 8)}` },
        { id: secondaryOrgId, name: `Isolated Org ${secondaryOrgId.slice(0, 8)}`, slug: `wf-${secondaryOrgId.slice(0, 8)}` },
      ],
    })

    await prisma.person.createMany({
      data: [
        { id: primaryPersonId, orgId: primaryOrgId, name: 'Operator Main', role: 'TECH' },
        { id: secondaryPersonId, orgId: secondaryOrgId, name: 'Operator Isolated', role: 'TECH' },
      ],
    })
  })

  afterAll(async () => {
    try {
      if (prisma) {
        const orgIds = [primaryOrgId, secondaryOrgId]

        await prisma.payment.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.whatsAppMessage.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.whatsAppActionExecution.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.whatsAppConversation.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.whatsAppTemplate.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.whatsAppWebhookEvent.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.charge.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.serviceOrder.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.appointment.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.customer.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.timelineEvent.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.auditEvent.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.usageMetric.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.idempotencyRecord.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.organizationExecutionConfig.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.tenantFeatureOverride.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.subscription.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.person.deleteMany({ where: { orgId: { in: orgIds } } })
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
      }
    } finally {
      if (app) {
        await app.close()
      }
    }
  })

  it('runs end-to-end operational flow with timeline, finance transitions, risk recalculation, and org isolation', async () => {
    const mainAuth = authFor(primaryOrgId, primaryUserId, primaryPersonId)
    const otherAuth = authFor(secondaryOrgId, secondaryUserId, secondaryPersonId)

    // 1) customer
    const createCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set(mainAuth)
      .send({ name: 'Cliente Canônico', phone: '+55 (11) 99999-0000', email: `workflow.${primaryOrgId}@mail.test` })
      .expect(201)

    const customerId = createCustomer.body.id as string
    const customerDb = await prisma.customer.findFirst({ where: { id: customerId, orgId: primaryOrgId } })
    expect(customerDb).toBeTruthy()
    expect(customerDb?.phone).toBe('5511999990000')

    // forged orgId from client must not escape authenticated tenant
    const forgedCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set(mainAuth)
      .send({ name: 'Cliente Forjado', phone: '+55 (11) 98888-0000', email: `forged.${primaryOrgId}@mail.test`, orgId: secondaryOrgId })
      .expect(201)

    const forgedCustomerDb = await prisma.customer.findFirst({ where: { id: forgedCustomer.body.id, orgId: primaryOrgId } })
    expect(forgedCustomerDb).toBeTruthy()
    const forgedCustomerCrossTenant = await prisma.customer.findFirst({ where: { id: forgedCustomer.body.id, orgId: secondaryOrgId } })
    expect(forgedCustomerCrossTenant).toBeNull()

    const customerListMain = await request(app.getHttpServer()).get('/customers').set(mainAuth).expect(200)
    const customerItemsMain = extractCollection(customerListMain.body)
    expect(customerItemsMain.some((item: any) => item.id === customerId)).toBe(true)

    const customerListOther = await request(app.getHttpServer()).get('/customers').set(otherAuth).expect(200)
    const customerItemsOther = extractCollection(customerListOther.body)
    expect(customerItemsOther.some((item: any) => item.id === customerId)).toBe(false)

    // tenant isolation check
    await request(app.getHttpServer()).get(`/customers/${customerId}`).set(otherAuth).expect(404)

    // tenant isolation on update
    await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set(otherAuth)
      .send({ name: 'Tentativa invasiva' })
      .expect(404)

    // 2) appointment
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const endsAt = new Date(Date.now() + 90 * 60 * 1000).toISOString()

    const createAppointment = await request(app.getHttpServer())
      .post('/appointments')
      .set(mainAuth)
      .send({ customerId, title: 'Visita técnica', assignedToPersonId: primaryPersonId, startsAt, endsAt })
      .expect(201)

    const appointmentId = createAppointment.body.id as string
    const appointmentDb = await prisma.appointment.findFirst({ where: { id: appointmentId, orgId: primaryOrgId } })
    expect(appointmentDb?.status).toBe('SCHEDULED')
    expect(appointmentDb?.assignedToPersonId).toBe(primaryPersonId)
    expect(createAppointment.body.assignedToPersonId).toBe(primaryPersonId)

    await request(app.getHttpServer())
      .get(`/appointments?assignedToPersonId=${primaryPersonId}`)
      .set(mainAuth)
      .expect(200)
      .expect((res) => {
        const appointmentItems = extractCollection(res.body)
        expect(appointmentItems.some((item: any) => item.id === appointmentId)).toBe(true)
      })

    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentId}`)
      .set(mainAuth)
      .send({ assignedToPersonId: secondaryPersonId, expectedUpdatedAt: createAppointment.body.updatedAt })
      .expect(400)

    const unassignedAppointment = await request(app.getHttpServer())
      .patch(`/appointments/${appointmentId}`)
      .set(mainAuth)
      .send({ assignedToPersonId: null, expectedUpdatedAt: createAppointment.body.updatedAt })
      .expect(200)
    expect(unassignedAppointment.body.assignedToPersonId).toBeNull()

    const reassignedAppointment = await request(app.getHttpServer())
      .patch(`/appointments/${appointmentId}`)
      .set(mainAuth)
      .send({ assignedToPersonId: primaryPersonId, expectedUpdatedAt: unassignedAppointment.body.updatedAt })
      .expect(200)
    expect(reassignedAppointment.body.assignedToPersonId).toBe(primaryPersonId)

    // 3) confirm appointment + whatsapp
    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentId}`)
      .set(mainAuth)
      .send({ status: 'CONFIRMED', expectedUpdatedAt: reassignedAppointment.body.updatedAt })
      .expect(200)

    const confirmedAppointmentDb = await prisma.appointment.findFirst({ where: { id: appointmentId, orgId: primaryOrgId } })
    expect(confirmedAppointmentDb?.status).toBe('CONFIRMED')

    await request(app.getHttpServer()).get('/appointments').set(otherAuth).expect(200).expect((res) => {
      const appointmentItems = extractCollection(res.body)
      expect(appointmentItems.some((item: any) => item.id === appointmentId)).toBe(false)
    })

    const confirmationMessage = await prisma.whatsAppMessage.findFirst({
      where: {
        orgId: primaryOrgId,
        entityType: 'APPOINTMENT',
        entityId: appointmentId,
        messageType: 'APPOINTMENT_CONFIRMATION',
      },
    })
    expect(confirmationMessage).toBeTruthy()

    // 4) create service order
    const createServiceOrder = await request(app.getHttpServer())
      .post('/service-orders')
      .set(mainAuth)
      .send({
        customerId,
        appointmentId,
        title: 'Execução de serviço completo',
        description: 'Fluxo operacional canônico',
        assignedToPersonId: primaryPersonId,
      })
      .expect(201)

    const serviceOrderId = createServiceOrder.body.id as string
    const serviceOrderDb = await prisma.serviceOrder.findFirst({ where: { id: serviceOrderId, orgId: primaryOrgId } })
    expect(serviceOrderDb?.status).toBe('ASSIGNED')

    await request(app.getHttpServer()).get('/service-orders').set(otherAuth).expect(200).expect((res) => {
      const serviceOrderItems = extractCollection(res.body)
      expect(serviceOrderItems.some((item: any) => item.id === serviceOrderId)).toBe(false)
    })

    await request(app.getHttpServer())
      .patch(`/service-orders/${serviceOrderId}`)
      .set(otherAuth)
      .send({ status: 'CANCELLED' })
      .expect(404)

    // 5) start execution
    const startExecution = await request(app.getHttpServer())
      .post('/executions/start')
      .set(mainAuth)
      .send({ serviceOrderId, notes: 'Iniciado', checklist: [{ key: 'safety', done: true }] })
      .expect(201)

    const executionId = startExecution.body.id as string

    await request(app.getHttpServer())
      .post('/executions/start')
      .set(otherAuth)
      .send({ serviceOrderId, notes: 'cross tenant try' })
      .expect(404)
    const executionDb = await prisma.serviceOrder.findFirst({ where: { id: executionId, orgId: primaryOrgId } })
    expect(executionDb?.id).toBe(serviceOrderId)

    const serviceOrderInProgress = await prisma.serviceOrder.findFirst({ where: { id: serviceOrderId, orgId: primaryOrgId } })
    expect(serviceOrderInProgress?.status).toBe('IN_PROGRESS')
    expect(serviceOrderInProgress?.startedAt).toBeTruthy()

    // 6) complete execution
    await request(app.getHttpServer())
      .post(`/executions/${executionId}/complete`)
      .set(otherAuth)
      .send({ notes: 'cross-tenant complete' })
      .expect(404)

    await request(app.getHttpServer())
      .post(`/executions/${executionId}/complete`)
      .set(mainAuth)
      .send({ notes: 'Concluído com sucesso', checklist: [{ key: 'final-review', done: true }] })
      .expect(201)

    const completedExecutionDb = await prisma.serviceOrder.findFirst({ where: { id: executionId, orgId: primaryOrgId } })
    expect(completedExecutionDb?.finishedAt).toBeTruthy()
    expect(completedExecutionDb?.outcomeSummary).toBe('Concluído com sucesso')

    const serviceOrderDone = await prisma.serviceOrder.findFirst({ where: { id: serviceOrderId, orgId: primaryOrgId } })
    expect(serviceOrderDone?.status).toBe('DONE')

    // 7) generate charge
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const createCharge = await request(app.getHttpServer())
      .post('/finance/charges')
      .set(mainAuth)
      .send({ customerId, serviceOrderId, amountCents: 15000, dueDate, notes: 'Cobrança do serviço' })
      .expect(201)

    const chargeId = createCharge.body.data.id as string
    const chargeDb = await prisma.charge.findFirst({ where: { id: chargeId, orgId: primaryOrgId } })
    expect(chargeDb?.status).toBe('PENDING')

    // finance transition: cross-tenant fetch/list must fail
    await request(app.getHttpServer()).get(`/finance/charges/${chargeId}`).set(otherAuth).expect(404)
    await request(app.getHttpServer()).get('/finance/charges').set(otherAuth).expect(200).expect((res) => {
      const chargeItems = extractCollection(res.body)
      expect(chargeItems.some((item: any) => item.id === chargeId)).toBe(false)
    })

    // 8) register payment
    const payResponse = await request(app.getHttpServer())
      .post(`/finance/charges/${chargeId}/pay`)
      .set(mainAuth)
      .send({ method: 'PIX', amountCents: 15000, orgId: secondaryOrgId })
      .expect(201)

    expect(payResponse.body.ok).toBe(true)
    expect(payResponse.body.data.paymentId).toBeTruthy()

    const paymentDb = await prisma.payment.findFirst({ where: { chargeId, orgId: primaryOrgId } })
    expect(paymentDb).toBeTruthy()
    expect(paymentDb?.amountCents).toBe(15000)

    const paidChargeDb = await prisma.charge.findFirst({ where: { id: chargeId, orgId: primaryOrgId } })
    expect(paidChargeDb?.status).toBe('PAID')
    expect(paidChargeDb?.paidAt).toBeTruthy()

    // 9) whatsapp notification for receipt
    const crossTenantReceipt = await prisma.whatsAppMessage.findFirst({ where: { orgId: secondaryOrgId, entityType: 'CHARGE', entityId: chargeId } })
    expect(crossTenantReceipt).toBeNull()

    const receiptMessage = await prisma.whatsAppMessage.findFirst({
      where: {
        orgId: primaryOrgId,
        entityType: 'CHARGE',
        entityId: chargeId,
        messageType: 'RECEIPT',
      },
    })
    expect(receiptMessage).toBeTruthy()

    // 10) timeline events emitted for canonical path
    const timeline = await prisma.timelineEvent.findMany({
      where: { orgId: primaryOrgId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, metadata: true },
    })

    const actions = timeline.map((event) => event.action)
    expect(actions).toEqual(expect.arrayContaining([
      'CUSTOMER_CREATED',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_CONFIRMED',
      'SERVICE_ORDER_CREATED',
      'EXECUTION_STARTED',
      'EXECUTION_DONE',
      'CHARGE_CREATED',
      'CHARGE_PAID',
    ]))

    // 11) recalculate risk from operational events (job endpoint + persisted state)
    await request(app.getHttpServer())
      .post('/admin/operational-state/run-once')
      .set(mainAuth)
      .expect(201)

    const personAfterRiskRun = await prisma.person.findFirst({
      where: { id: primaryPersonId, orgId: primaryOrgId },
      select: {
        operationalRiskScore: true,
        operationalState: true,
        operationalStateUpdatedAt: true,
      },
    })

    expect(personAfterRiskRun).toBeTruthy()
    expect(personAfterRiskRun?.operationalRiskScore).toBeGreaterThanOrEqual(0)
    expect(personAfterRiskRun?.operationalStateUpdatedAt).toBeTruthy()

    const isolatedOrgTimelineCount = await prisma.timelineEvent.count({ where: { orgId: secondaryOrgId } })
    expect(isolatedOrgTimelineCount).toBe(0)
  })
})

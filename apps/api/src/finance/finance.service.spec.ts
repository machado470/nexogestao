import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FinanceService } from './finance.service'

describe('FinanceService hardening', () => {
  const buildService = () => {
    const prisma = {
      customer: { findFirst: jest.fn() },
      serviceOrder: { findFirst: jest.fn() },
      charge: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'ch-1' }),
      },
      payment: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    } as any
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma))

    const whatsapp = {} as any
    const timeline = {
      log: jest.fn().mockResolvedValue(undefined),
      logInTransaction: jest.fn().mockResolvedValue({ id: 'event-1' }),
    } as any
    const analytics = { track: jest.fn() } as any
    const requestContext = { requestId: 'req-1', correlationId: 'corr-1' } as any
    const idempotency = {
      begin: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    } as any
    const metrics = { increment: jest.fn() } as any
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any
    const outbox = { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }) } as any

    const service = new FinanceService(
      prisma,
      whatsapp,
      timeline,
      analytics,
      requestContext,
      idempotency,
      metrics,
      audit,
      outbox,
    )

    return { service, prisma, idempotency, metrics, audit, timeline }
  }

  it('bloqueia geração de cobrança para O.S. cancelada', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    prisma.serviceOrder.findFirst.mockResolvedValue({
      id: 'os-1',
      customerId: 'c-1',
      status: 'CANCELED',
    })

    await expect(
      service.ensureChargeForServiceOrderDone({
        orgId: 'org-1',
        serviceOrderId: 'os-1',
        customerId: 'c-1',
        amountCents: 1000,
      }),
    ).rejects.toThrow('O.S. cancelada')
  })

  it('bloqueia pagamento em cobrança cancelada', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })

    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        charge: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ch-1',
            orgId: 'org-1',
            status: 'CANCELED',
            amountCents: 1000,
          }),
          updateMany: jest.fn(),
        },
        payment: { findFirst: jest.fn() },
      }),
    )

    await expect(
      service.payCharge({
        orgId: 'org-1',
        chargeId: 'ch-1',
        amountCents: 1000,
        method: 'PIX',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('não reserva idempotência quando a cobrança não pertence ao tenant', async () => {
    const { service, prisma, idempotency } = buildService()
    prisma.charge.findFirst.mockResolvedValue(null)

    await expect(
      service.payCharge({
        orgId: 'org-forged',
        chargeId: 'ch-1',
        amountCents: 1000,
        method: 'PIX',
        idempotencyKey: 'cross-tenant-key',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(prisma.charge.findFirst).toHaveBeenCalledWith({
      where: { id: 'ch-1', orgId: 'org-forged' },
      select: { id: true },
    })
    expect(idempotency.begin).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('bloqueia pagamento quando cobrança já está paga', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })

    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        charge: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'ch-1', orgId: 'org-1', status: 'PAID', amountCents: 1000 })
            .mockResolvedValueOnce({ id: 'ch-1', orgId: 'org-1', status: 'PAID', amountCents: 1000 }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
      }),
    )

    await expect(
      service.payCharge({
        orgId: 'org-1',
        chargeId: 'ch-1',
        amountCents: 1000,
        method: 'PIX',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('retorna modo degradado quando envio de WhatsApp falha ao criar cobrança', async () => {
    const { service, prisma, idempotency, metrics } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' })
    prisma.charge.create.mockResolvedValue({
      id: 'ch-1',
      orgId: 'org-1',
      customerId: 'c-1',
      serviceOrderId: null,
      amountCents: 1000,
      dueDate: new Date('2026-01-01T00:00:00Z'),
      customer: { id: 'c-1', name: 'Cliente', phone: '+5511999999999' },
    })

    jest.spyOn(service, 'sendChargeWhatsApp').mockRejectedValue(new Error('timeout'))

    const result = await service.createCharge({
      orgId: 'org-1',
      customerId: 'c-1',
      amountCents: 1000,
      dueDate: new Date('2026-01-01T00:00:00Z'),
    })

    expect(result.degraded).toEqual({
      channel: 'whatsapp',
      reason: 'whatsapp_send_failed',
      fallback: 'message_queued',
      status: 'retry_scheduled',
    })
    expect(result.operation?.status).toBe('executed')
    expect(metrics.increment).toHaveBeenCalledWith('integrationTemporaryFailures')
  })

  it('retorna duplicate quando idempotência replaya createCharge', async () => {
    const { service, idempotency, prisma } = buildService()
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' })
    idempotency.begin.mockResolvedValue({
      mode: 'replay',
      recordId: 'idem-1',
      response: { id: 'ch-1', idempotent: true },
    })

    const result = await service.createCharge({
      orgId: 'org-1',
      customerId: 'c-1',
      amountCents: 1000,
      dueDate: new Date('2026-01-01T00:00:00Z'),
      idempotencyKey: 'k-charge-1',
    })

    expect(result.id).toBe('ch-1')
    expect(result.operation).toEqual(
      expect.objectContaining({
        status: 'duplicate',
        reason: 'idempotency_replay',
        idempotencyKey: 'k-charge-1',
        requestId: 'req-1',
        correlationId: 'corr-1',
      }),
    )
  })

  it('bloqueia createCharge com amountCents <= 0', async () => {
    const { service, prisma } = buildService()
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' })
    await expect(
      service.createCharge({
        orgId: 'org-1',
        customerId: 'c-1',
        amountCents: 0,
        dueDate: new Date('2026-01-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('retorna duplicate quando idempotência replaya payCharge', async () => {
    const { service, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({
      mode: 'replay',
      recordId: 'idem-1',
      response: { ok: true, paymentId: 'pay-1', idempotent: true },
    })

    const result = await service.payCharge({
      orgId: 'org-1',
      chargeId: 'ch-1',
      amountCents: 1000,
      method: 'PIX',
      idempotencyKey: 'k-pay-1',
    })

    expect(result.paymentId).toBe('pay-1')
    expect(result.operation).toEqual(
      expect.objectContaining({
        status: 'duplicate',
        reason: 'idempotency_replay',
        idempotencyKey: 'k-pay-1',
        requestId: 'req-1',
        correlationId: 'corr-1',
      }),
    )
  })

  it('emite evento crítico PAYMENT_RECEIVED ao registrar pagamento', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })

    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        charge: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ch-1',
            orgId: 'org-1',
            customerId: 'c-1',
            serviceOrderId: 'so-1',
            status: 'PENDING',
            amountCents: 1000,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        payment: {
          create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
          findFirst: jest.fn(),
        },
      }),
    )
    jest.spyOn(service, 'sendPaymentConfirmationWhatsApp').mockResolvedValue({} as any)

    await service.payCharge({
      orgId: 'org-1',
      chargeId: 'ch-1',
      amountCents: 1000,
      method: 'PIX',
    })

    expect((service as any).timeline.logInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_RECEIVED',
        chargeId: 'ch-1',
        serviceOrderId: 'so-1',
      }),
      expect.anything(),
    )
  })

  it('persiste paidAt e notes informados no pagamento manual e na timeline', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const create = jest.fn().mockResolvedValue({ id: 'pay-1' })
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null, status: 'PENDING', amountCents: 1000 }),
        updateMany,
      },
      payment: { create, findFirst: jest.fn() },
    }))
    jest.spyOn(service, 'sendPaymentConfirmationWhatsApp').mockResolvedValue({} as any)

    await service.payCharge({
      orgId: 'org-1',
      chargeId: 'ch-1',
      amountCents: 1000,
      method: 'PIX',
      paidAt: '2026-01-15T12:00:00.000Z',
      notes: '  Pago no caixa  ',
    })

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orgId: 'org-1' }),
      data: { status: 'PAID', paidAt: new Date('2026-01-15T12:00:00.000Z') },
    }))
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orgId: 'org-1',
      paidAt: new Date('2026-01-15T12:00:00.000Z'),
      notes: 'Pago no caixa',
    }) })
    expect((service as any).timeline.logInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYMENT_RECEIVED',
      metadata: expect.objectContaining({ paidAt: '2026-01-15T12:00:00.000Z', notes: 'Pago no caixa' }),
    }), expect.anything())
  })

  it('usa a data atual como fallback quando paidAt não é informado', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T09:30:00.000Z'))
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    const create = jest.fn().mockResolvedValue({ id: 'pay-1' })
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null, status: 'PENDING', amountCents: 1000 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { create, findFirst: jest.fn() },
    }))
    jest.spyOn(service, 'sendPaymentConfirmationWhatsApp').mockResolvedValue({} as any)

    await service.payCharge({ orgId: 'org-1', chargeId: 'ch-1', amountCents: 1000, method: 'PIX' })

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ paidAt: new Date('2026-02-10T09:30:00.000Z') }) })
    jest.useRealTimers()
  })

  it('rejeita paidAt inválido ou mais de 24 horas no futuro antes de persistir', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T09:30:00.000Z'))
    const { service, idempotency } = buildService()
    const base = { orgId: 'org-1', chargeId: 'ch-1', amountCents: 1000, method: 'PIX' as const }

    await expect(service.payCharge({ ...base, paidAt: 'data-invalida' })).rejects.toThrow('paidAt inválido')
    await expect(service.payCharge({ ...base, paidAt: '2026-02-12T09:30:00.001Z' })).rejects.toThrow('paidAt não pode estar no futuro')
    expect(idempotency.begin).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it.each([
    ['parcial', 999],
    ['superior', 1001],
  ])('rejeita valor %s sem reservar, criar pagamento ou Timeline', async (_label, amountCents) => {
    const { service, prisma, idempotency, timeline } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    const updateMany = jest.fn()
    const create = jest.fn()
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null,
          status: 'PENDING', amountCents: 1000,
        }),
        updateMany,
      },
      payment: { create, findFirst: jest.fn() },
    }))

    await expect(service.payCharge({
      orgId: 'org-1', chargeId: 'ch-1', amountCents, method: 'PIX',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_AMOUNT_MISMATCH' }) })
    expect(updateMany).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(timeline.logInTransaction).not.toHaveBeenCalled()
  })

  it('liquida cobrança OVERDUE pelo valor total exato', async () => {
    const { service, prisma, idempotency, timeline } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null,
          status: 'OVERDUE', amountCents: 1001,
        }),
        updateMany,
      },
      payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }), findFirst: jest.fn() },
    }))
    jest.spyOn(service, 'sendPaymentConfirmationWhatsApp').mockResolvedValue({} as any)

    await expect(service.payCharge({
      orgId: 'org-1', chargeId: 'ch-1', amountCents: 1001, method: 'PIX',
    })).resolves.toMatchObject({ paymentId: 'pay-1', idempotent: false })
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orgId: 'org-1', status: { in: ['PENDING', 'OVERDUE'] } }),
    }))
    expect(timeline.logInTransaction).toHaveBeenCalledTimes(1)
  })

  it('propaga falha da Timeline dentro da transação e não confirma idempotência', async () => {
    const { service, prisma, idempotency, timeline } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    timeline.logInTransaction.mockRejectedValue(new Error('timeline indisponível'))
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: { findFirst: jest.fn().mockResolvedValue({
        id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null,
        status: 'PENDING', amountCents: 1000,
      }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }), findFirst: jest.fn() },
    }))

    await expect(service.payCharge({
      orgId: 'org-1', chargeId: 'ch-1', amountCents: 1000, method: 'PIX',
    })).rejects.toThrow('timeline indisponível')
    expect(idempotency.complete).not.toHaveBeenCalled()
    expect(idempotency.fail).toHaveBeenCalledWith('idem-1', undefined)
  })

  it('propaga falha ao criar Payment sem criar evidência oficial', async () => {
    const { service, prisma, idempotency, timeline } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    prisma.$transaction.mockImplementation(async (cb: any) => cb({
      charge: { findFirst: jest.fn().mockResolvedValue({
        id: 'ch-1', orgId: 'org-1', customerId: 'c-1', serviceOrderId: null,
        status: 'PENDING', amountCents: 1000,
      }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      payment: { create: jest.fn().mockRejectedValue(new Error('payment failed')), findFirst: jest.fn() },
    }))

    await expect(service.payCharge({
      orgId: 'org-1', chargeId: 'ch-1', amountCents: 1000, method: 'PIX',
    })).rejects.toThrow('payment failed')
    expect(timeline.logInTransaction).not.toHaveBeenCalled()
    expect(idempotency.complete).not.toHaveBeenCalled()
  })

  it('bloqueia lembrete de cobrança para charge paga', async () => {
    const { service, prisma } = buildService()
    prisma.charge.findFirst.mockResolvedValue({ id: 'ch-1', status: 'PAID' })

    await expect(service.remindChargeInOrg('org-1', 'ch-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('permite lembrete de cobrança pendente no mesmo orgId', async () => {
    const { service, prisma } = buildService()
    prisma.charge.findFirst.mockResolvedValue({ id: 'ch-1', status: 'PENDING' })
    jest.spyOn(service, 'sendPaymentReminderWhatsApp').mockResolvedValue({} as any)

    await expect(service.remindChargeInOrg('org-1', 'ch-1')).resolves.toBeUndefined()
    expect(service.sendPaymentReminderWhatsApp).toHaveBeenCalledWith('ch-1')
  })

  it('não reemite CHARGE_OVERDUE para cobrança que já estava vencida antes do ciclo', async () => {
    const { service, prisma, timeline } = buildService()

    prisma.charge.findMany = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'ch-overdue',
          orgId: 'org-1',
          customerId: 'c-1',
          serviceOrderId: null,
          amountCents: 1000,
          status: 'OVERDUE',
          dueDate: new Date('2026-08-20T12:00:00.000Z'),
        },
      ])

    prisma.charge.updateMany = jest.fn().mockResolvedValue({ count: 0 })

    jest
      .spyOn(service, 'sendPaymentReminderWhatsApp')
      .mockResolvedValue({} as any)

    const result = await service.automateOverdueLifecycle('org-1')

    expect(result).toEqual({ ok: true, updated: 0 })
    expect(timeline.logInTransaction).not.toHaveBeenCalled()
    expect(service.sendPaymentReminderWhatsApp).not.toHaveBeenCalled()
  })

  it('emite CHARGE_OVERDUE somente quando vence a transição atômica PENDING para OVERDUE', async () => {
    const { service, prisma, timeline } = buildService()

    prisma.charge.findMany = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'ch-new-overdue',
          orgId: 'org-1',
          customerId: 'c-1',
          serviceOrderId: 'so-1',
          amountCents: 2500,
          status: 'PENDING',
          dueDate: new Date('2026-08-20T12:00:00.000Z'),
        },
      ])

    prisma.charge.updateMany = jest.fn().mockResolvedValue({ count: 1 })

    jest
      .spyOn(service, 'sendPaymentReminderWhatsApp')
      .mockResolvedValue({} as any)

    const result = await service.automateOverdueLifecycle('org-1')

    expect(result).toEqual({ ok: true, updated: 1 })
    expect(prisma.charge.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ch-new-overdue',
        orgId: 'org-1',
        status: 'PENDING',
        dueDate: { lt: expect.any(Date) },
      },
      data: { status: 'OVERDUE' },
    })
    expect(timeline.logInTransaction).toHaveBeenCalledTimes(1)
    expect(timeline.logInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        action: 'CHARGE_OVERDUE',
        chargeId: 'ch-new-overdue',
        metadata: expect.objectContaining({
          previousStatus: 'PENDING',
          nextStatus: 'OVERDUE',
        }),
      }),
      prisma,
    )
    expect(service.sendPaymentReminderWhatsApp).toHaveBeenCalledTimes(1)
    expect(service.sendPaymentReminderWhatsApp).toHaveBeenCalledWith(
      'ch-new-overdue',
    )
  })

  it('emite CHARGE_CREATED e mantém SERVICE_ORDER_CHARGE_CREATED ao vincular cobrança com O.S.', async () => {
    const { service, prisma, idempotency } = buildService()
    idempotency.begin.mockResolvedValue({ mode: 'execute', recordId: 'idem-1' })
    prisma.serviceOrder.findFirst.mockResolvedValue({
      id: 'so-1',
      customerId: 'c-1',
      status: 'DONE',
    })
    prisma.charge.findFirst.mockResolvedValue(null)
    prisma.charge.create.mockResolvedValue({
      id: 'ch-1',
      customerId: 'c-1',
      serviceOrderId: 'so-1',
      amountCents: 1000,
    })

    await service.ensureChargeForServiceOrderDone({
      orgId: 'org-1',
      serviceOrderId: 'so-1',
      customerId: 'c-1',
      amountCents: 1000,
    })

    expect((service as any).timeline.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CHARGE_CREATED',
        serviceOrderId: 'so-1',
        chargeId: 'ch-1',
      }),
    )
    expect((service as any).timeline.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVICE_ORDER_CHARGE_CREATED',
        serviceOrderId: 'so-1',
        chargeId: 'ch-1',
      }),
    )
  })

})

describe('FinanceService cancelCharge', () => {
  const buildService = () => {
    const prisma = {
      charge: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    } as any
    const timeline = { log: jest.fn().mockResolvedValue(undefined) } as any
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any
    const service = new FinanceService(
      prisma,
      {} as any,
      timeline,
      {} as any,
      { requestId: 'req-1', correlationId: 'corr-1' } as any,
      {} as any,
      { increment: jest.fn() } as any,
      audit,
      { enqueue: jest.fn() } as any,
    )
    return { service, prisma, timeline, audit }
  }

  it('cancela cobrança sem apagar registro e registra timeline/auditoria', async () => {
    const { service, prisma, timeline, audit } = buildService()
    const charge = {
      id: 'ch-1',
      status: 'PENDING',
      updatedAt: new Date('2026-06-23T10:00:00.000Z'),
      customerId: 'cus-1',
      serviceOrderId: 'os-1',
      amountCents: 1500,
      canceledAt: null,
      canceledByUserId: null,
      cancellationReason: null,
    }
    const canceled = { ...charge, status: 'CANCELED', cancellationReason: 'Duplicada' }
    prisma.charge.findFirst.mockResolvedValueOnce(charge).mockResolvedValueOnce(canceled)
    prisma.charge.updateMany.mockResolvedValue({ count: 1 })

    await expect(
      service.cancelCharge({
        orgId: 'org-1',
        id: 'ch-1',
        actorUserId: 'user-1',
        cancellationReason: 'Duplicada',
        expectedUpdatedAt: charge.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(canceled)

    expect(prisma.charge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'ch-1', orgId: 'org-1' }),
      data: expect.objectContaining({
        status: 'CANCELED',
        canceledByUserId: 'user-1',
        cancellationReason: 'Duplicada',
      }),
    }))
    expect((prisma.charge as any).delete).toBeUndefined()
    expect(timeline.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CHARGE_CANCELED',
      orgId: 'org-1',
      chargeId: 'ch-1',
      customerId: 'cus-1',
      serviceOrderId: 'os-1',
      metadata: expect.objectContaining({
        previousStatus: 'PENDING',
        nextStatus: 'CANCELED',
        cancellationReason: 'Duplicada',
      }),
    }))
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CHARGE_CANCELED',
      entityType: 'Charge',
      entityId: 'ch-1',
    }))
  })

  it('não cancela cobrança paga', async () => {
    const { service, prisma } = buildService()
    prisma.charge.findFirst.mockResolvedValue({
      id: 'ch-1',
      status: 'PAID',
      customerId: 'cus-1',
      serviceOrderId: null,
      amountCents: 1500,
      updatedAt: new Date(),
    })

    await expect(
      service.cancelCharge({ orgId: 'org-1', id: 'ch-1', cancellationReason: 'Erro operacional' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.charge.updateMany).not.toHaveBeenCalled()
  })

  it('exige motivo útil e limita tamanho', async () => {
    const { service } = buildService()

    await expect(
      service.cancelCharge({ orgId: 'org-1', id: 'ch-1', cancellationReason: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException)

    await expect(
      service.cancelCharge({ orgId: 'org-1', id: 'ch-1', cancellationReason: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('FinanceService operational queue', () => {
  const buildQueueService = () => {
    const prisma = {
      charge: { findMany: jest.fn() },
      timelineEvent: { findMany: jest.fn() },
      whatsAppMessage: { findMany: jest.fn() },
    } as any
    const timeline = { log: jest.fn().mockResolvedValue(undefined) } as any
    const service = new FinanceService(
      prisma,
      {} as any,
      timeline,
      {} as any,
      { requestId: 'req-queue', correlationId: 'corr-queue' } as any,
      {} as any,
      { increment: jest.fn() } as any,
      {} as any,
      { enqueue: jest.fn() } as any,
    )
    return { service, prisma, timeline }
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('ordena vencidas por impacto, risco e contato e calcula ação recomendada', async () => {
    const { service, prisma } = buildQueueService()
    prisma.charge.findMany.mockResolvedValue([
      { id: 'low', orgId: 'org-a', customerId: 'c-low', amountCents: 10000, status: 'OVERDUE', dueDate: new Date('2026-06-20T00:00:00Z'), payments: [], customer: { name: 'Baixo' } },
      { id: 'high', orgId: 'org-a', customerId: 'c-high', amountCents: 200000, status: 'OVERDUE', dueDate: new Date('2026-06-10T00:00:00Z'), payments: [], customer: { name: 'Alto' } },
      { id: 'future', orgId: 'org-a', customerId: 'c-future', amountCents: 300000, status: 'PENDING', dueDate: new Date('2026-07-10T00:00:00Z'), payments: [], customer: { name: 'Futuro' } },
    ])
    prisma.timelineEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ customerId: 'c-high', metadata: { nextState: 'RESTRICTED' } }])
    prisma.whatsAppMessage.findMany.mockResolvedValue([])

    const result = await service.getOperationalQueue('org-a', { limit: 50 })

    expect(prisma.charge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org-a', status: { in: ['PENDING', 'OVERDUE'] } },
      take: 200,
    }))
    expect(result.items.map((item: any) => item.id)).toEqual(['high', 'low', 'future'])
    expect(result.items[0].financialOperationalSummary).toMatchObject({
      priority: 'HIGH',
      daysOverdue: 13,
      riskLevel: 'RESTRICTED',
      recommendedAction: 'CALL_CUSTOMER',
      recommendedActionTarget: 'CUSTOMER',
    })
    expect(result.items[0].nextBestCollectionAction).toBe('CALL_CUSTOMER')
  })

  it('limita a fila a 50 itens e não depende de orgId do cliente', async () => {
    const { service, prisma } = buildQueueService()
    prisma.charge.findMany.mockResolvedValue(Array.from({ length: 55 }, (_, index) => ({
      id: `ch-${index}`,
      orgId: 'org-safe',
      customerId: `c-${index}`,
      amountCents: 1000 + index,
      status: 'PENDING',
      dueDate: new Date('2026-06-24T00:00:00Z'),
      payments: [],
      customer: { name: `Cliente ${index}` },
    })))
    prisma.timelineEvent.findMany.mockResolvedValue([])
    prisma.whatsAppMessage.findMany.mockResolvedValue([])

    const result = await service.getOperationalQueue('org-safe', { limit: 999 })

    expect(result.items).toHaveLength(50)
    expect(prisma.charge.findMany.mock.calls[0][0].where.orgId).toBe('org-safe')
  })
})

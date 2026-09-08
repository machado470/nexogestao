import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

function makeReq(token = "token-1", authHeader?: string) {
  return {
    headers: {
      cookie: `nexo_token=${token}`,
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    cookies: { nexo_token: token },
  } as any;
}

function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as any;
}

function financeListCharge(id: string) {
  const date = "2026-09-07T12:00:00.000Z";
  return {
    id,
    orgId: "org-1",
    customerId: "customer-1",
    idempotencyKey: null,
    serviceOrderId: null,
    amountCents: 1000,
    currency: "BRL",
    status: "PENDING",
    dueDate: date,
    paidAt: null,
    canceledAt: null,
    cancellationReason: null,
    canceledByUserId: null,
    notes: null,
    createdAt: date,
    updatedAt: date,
    customer: {
      id: "customer-1", orgId: "org-1", name: "Cliente", phone: "+5511999999999",
      email: null, cpfCnpj: null, address: null, notes: null, active: true,
      createdAt: date, updatedAt: date,
    },
    serviceOrder: null,
    payments: [],
    paidAmountCents: 0,
    balanceCents: 1000,
    daysOverdue: null,
    evaluatedAt: date,
  };
}

describe("BFF↔API contract - lote 1", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("session.me chama /me e normaliza dados essenciais", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: "u1",
              orgId: "org-ctx",
              role: "ADMIN",
              email: "admin@nexo.dev",
            },
          },
        }),
        { status: 200 }
      )
    );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: null,
    } as any);
    const result = await caller.session.me();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/me$/),
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "u1",
        organizationId: "org-ctx",
        role: "ADMIN",
        email: "admin@nexo.dev",
      })
    );
  });

  it("nexo.me retorna UNAUTHORIZED sem sessão", async () => {
    const caller = appRouter.createCaller({
      req: { headers: {}, cookies: {} },
      res: makeRes(),
      user: null,
    } as any);
    await expect(caller.nexo.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("nexo.me chama /me com bearer do usuário autenticado", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 })
      );

    const caller = appRouter.createCaller({
      req: makeReq("cookie-token", "Bearer forged-token"),
      res: makeRes(),
      user: { token: "trusted-user-token", validated: true },
    } as any);
    await caller.nexo.me();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer trusted-user-token",
        }),
      })
    );
  });

  it("serviceOrders.list preserva a decisão operacional oficial sem aceitar tenant do client", async () => {
    const operationalDecision = { isOverdue: true, overdueDays: 3, isStalled: false, chargeOverdue: false, operationalStatus: "RISCO", priority: "P0", riskLabel: "Atrasada", nextAction: { type: "start", label: "Iniciar agora", reason: "Atrasada sem execução" } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "so-1", operationalDecision }] }), { status: 200 }));
    const caller = appRouter.createCaller({ req: makeReq(), res: makeRes(), user: { token: "trusted-user-token", validated: true, organizationId: "org-trusted" } } as any);
    await expect(caller.nexo.serviceOrders.list({ page: 1, limit: 20, orgId: "org-forged" } as any)).resolves.toEqual([{ id: "so-1", operationalDecision }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/service-orders?page=1&limit=20");
    expect(String(url)).not.toContain("orgId");
    expect(options).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer trusted-user-token" }) }));
  });

  it("timeline.listByOrg preserva cursor/filtro e normaliza o envelope oficial", async () => {
    const event = {
      id: "event-1",
      action: "CHARGE_CREATED",
      createdAt: "2026-08-29T10:00:00.000Z",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { ok: true, data: [event] } }),
          { status: 200 }
        )
      );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "trusted-user-token", validated: true },
    } as any);

    await expect(
      caller.nexo.timeline.listByOrg({
        limit: 12,
        action: "CHARGE_CREATED",
        cursor: "2026-08-29T10:00:00.000Z_event-1",
      })
    ).resolves.toEqual([event]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/timeline?limit=12&action=CHARGE_CREATED&cursor=2026-08-29T10%3A00%3A00.000Z_event-1"
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer trusted-user-token",
        }),
      })
    );
  });

  it("nexo.settings.get e update usam /organization-settings e preservam payload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "Oficina Antiga",
            timezone: "America/Sao_Paulo",
            currency: "BRL",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "Oficina Nova",
            timezone: "UTC",
            currency: "BRL",
          }),
          { status: 200 }
        )
      );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);

    const getResult = await caller.nexo.settings.get();
    const updateResult = await caller.nexo.settings.update({
      name: "Oficina Nova",
      timezone: "UTC",
      orgId: "evil-org",
    });

    expect(getResult).toEqual({
      name: "Oficina Antiga",
      timezone: "America/Sao_Paulo",
      currency: "BRL",
    });
    expect(updateResult).toEqual({
      name: "Oficina Nova",
      timezone: "UTC",
      currency: "BRL",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/organization-settings$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer t1" }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/organization-settings$/),
      expect.objectContaining({ method: "PATCH" })
    );
    const [, patchOptions] = fetchMock.mock.calls[1];
    expect(JSON.parse(String((patchOptions as RequestInit).body))).toEqual({
      name: "Oficina Nova",
      timezone: "UTC",
    });
  });

  it("analytics.assigneeWarningSummary usa endpoint tenant-scoped, valida ISO e rejeita orgId do client", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          totals: { shown: 2, confirmed: 1, confirmationRatePct: 50 },
        }),
        { status: 200 }
      )
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await caller.analytics.assigneeWarningSummary({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-30T00:00:00.000Z",
    });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/analytics/assignee-warning-summary?from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-30T00%3A00%3A00.000Z"
    );
    expect(String(url)).not.toContain("orgId");
    await expect(
      caller.analytics.assigneeWarningSummary({ from: "not-iso" } as any)
    ).rejects.toBeDefined();
    await expect(
      caller.analytics.assigneeWarningSummary({
        from: "2026-05-30T00:00:00.000Z",
        to: "2026-05-01T00:00:00.000Z",
      })
    ).rejects.toBeDefined();
    await expect(
      caller.analytics.assigneeWarningSummary({ orgId: "forged" } as any)
    ).rejects.toBeDefined();
  });

  it("analytics.assigneeWarningSummary normaliza envelope duplo da API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            ok: true,
            data: {
              totals: { shown: 0, confirmed: 0, confirmationRatePct: null },
              byContext: [],
              byWarningType: [],
            },
          },
        }),
        { status: 200 }
      )
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await expect(caller.analytics.assigneeWarningSummary()).resolves.toEqual({
      totals: { shown: 0, confirmed: 0, confirmationRatePct: null },
      byContext: [],
      byWarningType: [],
    });
  });

  it("people.operationalSummary usa endpoint tenant-scoped sem aceitar orgId do client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ people: [] }), { status: 200 })
      );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await caller.people.operationalSummary();

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/people\/operational-summary$/);
    expect((options as RequestInit).body).toBeUndefined();
    expect(String(url)).not.toContain("orgId");
  });

  it("people.operationalSummary retorna contrato operacional e aceita envelope ou array direto", async () => {
    const person = {
      personId: "person-1",
      name: "Ana",
      role: "TECH",
      status: "ACTIVE",
      openServiceOrdersCount: 2,
      overdueServiceOrdersCount: 1,
      todayAppointmentsCount: 1,
      futureAppointmentsCount: 3,
      dailyServiceOrderCapacity: 4,
      dailyAppointmentCapacity: 2,
      serviceOrderCapacityUsagePct: 50,
      appointmentCapacityUsagePct: 50,
      capacityStatus: "UNDER_CAPACITY",
      availabilityStatus: "AVAILABLE",
      loadStatus: "NORMAL",
      operationalStatus: "RISCO",
      priority: "P1",
      interventionReason: "1 O.S. atrasada(s) atribuída(s).",
      recommendedActionLabel: "Ver O.S. atrasadas",
      recommendedActionTarget: "SERVICE_ORDERS",
      operationalSummaryText: "Ana executa 2 O.S. aberta(s), com 1 atraso(s).",
      capacitySummaryText: "Capacidade UNDER_CAPACITY: O.S. 50%, agenda 50%.",
      riskSummaryText: "1 O.S. atrasada(s) atribuída(s).",
      customers: {
        activeCustomersCount: 2,
        attendedCustomersCount: 1,
        customersWithOpenServiceOrdersCount: 1,
        customersWithOverdueServiceOrdersCount: 1,
      },
      appointments: {
        nextAppointments: [
          {
            id: "appt-1",
            customerName: "Cliente A",
            startsAt: "2026-05-31T12:00:00.000Z",
            status: "SCHEDULED",
          },
        ],
        delayedAppointmentsCount: null,
        conflictsCount: null,
      },
      serviceOrders: {
        completedServiceOrdersCount: 1,
        averageCompletionMinutes: 45,
        completionRatePct: 50,
        recentServiceOrders: [
          {
            id: "so-1",
            number: "so-1",
            customerName: "Cliente A",
            status: "DONE",
            dueAt: null,
            completedAt: "2026-05-30T12:00:00.000Z",
          },
        ],
      },
      timeline: {
        lastEvents: [
          {
            id: "evt-1",
            eventType: "SERVICE_ORDER_COMPLETED",
            entityType: "SERVICE_ORDER",
            entityId: "so-1",
            title: "O.S. concluída",
            description: "O.S. concluída",
            createdAt: "2026-05-30T12:00:00.000Z",
          },
        ],
      },
      risk: {
        riskScore: 0,
        operationalRiskScore: 10,
        operationalState: "NORMAL",
        riskTrend: null,
        riskReasons: [],
      },
      finance: {
        receivedAmountFromAssignedServiceOrders: 1000,
        pendingAmountFromAssignedServiceOrders: 2000,
        overdueAmountFromAssignedServiceOrders: 3000,
        paidChargesCountFromAssignedServiceOrders: 1,
        pendingChargesCountFromAssignedServiceOrders: 2,
        overdueChargesCountFromAssignedServiceOrders: 3,
        financeAttributionNote: "não representa comissão",
      },
      whatsapp: {
        assignedConversationsCount: 1,
        waitingOperatorConversationsCount: 0,
        failedMessagesCount: 1,
        sentMessagesCount: 2,
        lastConversationAt: null,
        whatsappAttributionNote: "vínculo por assignedUserId",
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { people: [person] } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([person]), { status: 200 })
      );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await expect(caller.people.operationalSummary()).resolves.toEqual({
      people: [expect.objectContaining(person)],
    });
    await expect(caller.people.operationalSummary()).resolves.toEqual({
      people: [expect.objectContaining(person)],
    });
  });

  it("people.operationalSummary aceita finance e whatsapp nulos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          people: [
            {
              personId: "person-1",
              name: "Ana",
              status: "ACTIVE",
              operationalStatus: "NORMAL",
              priority: "P3",
              interventionReason: null,
              recommendedActionLabel: null,
              recommendedActionTarget: null,
              customers: undefined,
              appointments: undefined,
              serviceOrders: undefined,
              timeline: undefined,
              risk: undefined,
              finance: null,
              whatsapp: null,
            },
          ],
        }),
        { status: 200 }
      )
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await expect(caller.people.operationalSummary()).resolves.toEqual({
      people: [expect.objectContaining({ finance: null, whatsapp: null })],
    });
  });

  it("people availability exceptions usam endpoints tenant-scoped e rejeitam orgId do client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "ex-1" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);
    await caller.people.listAvailabilityExceptions({ personId: "person-1" });
    await caller.people.createAvailabilityException({
      personId: "person-1",
      startsAt: "2026-05-30T12:00:00.000Z",
      endsAt: "2026-05-30T14:00:00.000Z",
      reason: "Consulta",
    });
    await caller.people.deleteAvailabilityException({
      personId: "person-1",
      exceptionId: "ex-1",
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/people\/person-1\/availability-exceptions$/),
        expect.stringMatching(
          /\/people\/person-1\/availability-exceptions\/ex-1$/
        ),
      ])
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    ).toEqual({
      startsAt: "2026-05-30T12:00:00.000Z",
      endsAt: "2026-05-30T14:00:00.000Z",
      reason: "Consulta",
    });
    await expect(
      caller.people.createAvailabilityException({
        personId: "person-1",
        startsAt: "2026-05-30T12:00:00.000Z",
        endsAt: "2026-05-30T14:00:00.000Z",
        orgId: "forged",
      } as any)
    ).rejects.toBeDefined();
  });

  it("people.assignees usa endpoint operacional tenant-scoped do calendário", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: [{ id: "p1", name: "Ana" }] }),
          { status: 200 }
        )
      );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    const result = await caller.people.assignees();

    expect(result).toEqual([{ id: "p1", name: "Ana" }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/people\/assignees$/);
    expect(String(url)).not.toContain("orgId");
    expect((options as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer t1" })
    );
  });

  it("people.list e people.statsLinked usam endpoints corretos e não aceitam orgId do client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "p1" }] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { linked: 3, unlinked: 1 } }), {
          status: 200,
        })
      );

    const caller = appRouter.createCaller({
      req: makeReq("cookie-token", "Bearer forged-token"),
      res: makeRes(),
      user: {
        token: "trusted-user-token",
        validated: true,
        organizationId: "org-trusted",
      },
    } as any);

    const list = await caller.people.list();
    const stats = await caller.people.statsLinked();

    expect(list).toEqual([{ id: "p1" }]);
    expect(stats).toEqual({ linked: 3, unlinked: 1 });

    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls[0]).toMatch(/\/people$/);
    expect(calledUrls[1]).toMatch(/\/people\/stats\/linked$/);
    expect(calledUrls.join(" ")).not.toContain("orgId=");

    for (const [, options] of fetchMock.mock.calls) {
      expect((options as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer trusted-user-token" })
      );
    }
  });

  it("finance.charges.list normaliza envelope simples data.items/meta", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            items: [financeListCharge("ch-1")],
            meta: { page: 1, limit: 20, total: 1, pages: 1 },
          },
        }),
        { status: 200 }
      )
    );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    const result = await caller.finance.charges.list({ page: 1, limit: 20 });

    expect(result).toEqual({
      data: [financeListCharge("ch-1")],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it("finance.charges.list normaliza envelope duplo data.data.items/meta", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            ok: true,
            data: {
              items: [financeListCharge("ch-2")],
              meta: { page: 1, limit: 20, total: 1, pages: 1 },
            },
          },
        }),
        { status: 200 }
      )
    );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    const result = await caller.finance.charges.list({ page: 1, limit: 20 });

    expect(result).toEqual({
      data: [financeListCharge("ch-2")],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it("finance.charges.list mantém falha clara para payload inválido", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { ok: true, data: { items: null, meta: null } },
        }),
        { status: 200 }
      )
    );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    await expect(
      caller.finance.charges.list({ page: 1, limit: 20 })
    ).rejects.toBeDefined();
  });

  it("propaga erro de autenticação da API como UNAUTHORIZED", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "token expired", code: "AUTH_EXPIRED" }),
        { status: 401 }
      )
    );

    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    await expect(caller.nexo.settings.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("BFF↔API contract - pagamento manual", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("finance.charges.pay repassa paidAt e notes sem aceitar orgId do client", async () => {
    const operation = {
      status: "executed",
      reason: "payment_recorded",
      idempotencyKey: "idempotency-1",
      executionKey: null,
      correlationId: null,
      requestId: null,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true, paymentId: "pay-1", idempotent: false, operation, degraded: null } }), {
        status: 200,
      })
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await caller.finance.charges.pay({
      chargeId: "ch-1",
      amountCents: 1000,
      method: "PIX",
      paidAt: "2026-01-15T12:00:00.000Z",
      notes: "Pago no caixa",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/finance\/charges\/ch-1\/pay$/);
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      method: "PIX",
      amountCents: 1000,
      paidAt: "2026-01-15T12:00:00.000Z",
      notes: "Pago no caixa",
    });
    expect(String((options as RequestInit).body)).not.toContain("orgId");
  });

  it("finance.charges.cancel usa endpoint de cancelamento sem orgId do client", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: {
          id: "ch-1",
          status: "CANCELED",
          canceledAt: "2026-06-23T10:01:00.000Z",
          canceledByUserId: null,
          cancellationReason: "Cobrança duplicada",
        } }),
        {
          status: 200,
        }
      )
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true, organizationId: "org-trusted" },
    } as any);

    await caller.finance.charges.cancel({
      chargeId: "ch-1",
      cancellationReason: "Cobrança duplicada",
      expectedUpdatedAt: "2026-06-23T10:00:00.000Z",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/finance\/charges\/ch-1\/cancel$/);
    expect((options as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      cancellationReason: "Cobrança duplicada",
      expectedUpdatedAt: "2026-06-23T10:00:00.000Z",
    });
    expect(String((options as RequestInit).body)).not.toContain("orgId");
  });

  it("finance.charges.cancel valida motivo obrigatório", async () => {
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    await expect(
      caller.finance.charges.cancel({
        chargeId: "ch-1",
        cancellationReason: " ",
      })
    ).rejects.toBeDefined();
  });

  it("finance.charges.pay rejeita paidAt inválido no BFF", async () => {
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { token: "t1", validated: true },
    } as any);
    await expect(
      caller.finance.charges.pay({
        chargeId: "ch-1",
        amountCents: 1000,
        method: "PIX",
        paidAt: "data-invalida",
      })
    ).rejects.toBeDefined();
  });
});

describe("finance.operationalQueue contract", () => {
  it("repassa apenas limit e nunca orgId vindo do client", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: any, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ok: true,
              data: { items: [], meta: { limit: 50, total: 0 } },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: { validated: true } as any,
    });

    await caller.finance.operationalQueue({ limit: 50 });

    expect(calls[0].url).toMatch(/\/finance\/operational-queue\?limit=50$/);
    expect(calls[0].url).not.toContain("orgId=");
  });
});

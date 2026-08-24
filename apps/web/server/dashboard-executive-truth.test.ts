import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

function caller() {
  return appRouter.createCaller({
    req: { headers: { cookie: "nexo_token=cookie-token" }, cookies: {} },
    res: {},
    user: {
      token: "trusted-token",
      validated: true,
      organizationId: "org-from-session",
    },
  } as any);
}

const validKpis = {
  totalCustomers: 0,
  createdCustomers: 0,
  totalServiceOrders: 0,
  openServiceOrders: 0,
  overdueServiceOrders: 0,
  weeklyRevenueInCents: 0,
  paymentsReceivedCount: 0,
  comparison: {
    revenueReceivedPct: null,
    completedServiceOrdersPct: null,
    overdueChargesPct: null,
    failedMessagesPct: null,
  },
  pendingPaymentsInCents: 0,
  inProgressOrders: 0,
  completedOrders: 0,
  completedServices: 0,
  chargesGenerated: 0,
  delayedOrders: 0,
  riskTickets: 0,
  totalRevenueInCents: 0,
  paidRevenueInCents: 0,
  pendingRevenueInCents: 0,
  governance: {
    score: null,
    level: null,
    lastUpdated: null,
    source: "NO_DATA",
    availability: "NO_DATA",
    reason: "Sem dados",
    factors: [],
  },
  whatsappSignals: {
    failedMessages: 0,
    customersNoResponse: 0,
    ignoredCharges: 0,
  },
};

const validAlerts = {
  operationalQueue: [],
  overdueOrders: { count: 0, items: [] },
  overdueCharges: { count: 0, totalAmountCents: 0, items: [] },
  todayServices: { count: 0, items: [] },
  customersWithPending: { count: 0, items: [] },
  doneOrdersWithoutCharge: { count: 0, totalAmountCents: 0, items: [] },
};

describe("Dashboard BFF executive truth", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("preserva contratos vazios válidos de kpis e alerts com o token validado", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validKpis), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validAlerts), { status: 200 })
      );

    await expect(caller().dashboard.kpis()).resolves.toEqual(validKpis);
    await expect(caller().dashboard.alerts()).resolves.toEqual(validAlerts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer trusted-token",
          }),
        })
      );
      expect(
        (init?.headers as Record<string, string>).Authorization
      ).not.toContain("cookie-token");
    }
  });

  it.each(["kpis", "alerts"] as const)(
    "rejeita null e payload inválido em dashboard.%s",
    async procedure => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("null", { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ unexpected: true }), { status: 200 })
        );
      await expect(caller().dashboard[procedure]()).rejects.toBeDefined();
      await expect(caller().dashboard[procedure]()).rejects.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

  it("não converte falha upstream de kpis ou alerts em objeto vazio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "upstream unavailable" }), {
        status: 503,
      })
    );
    await expect(caller().dashboard.kpis()).rejects.toBeDefined();
    await expect(caller().dashboard.alerts()).rejects.toBeDefined();
  });

  it("consulta estado pela API /v1, encaminha autenticação e preserva UNKNOWN", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
        dashboardState: "EMPTY",
        operationalState: "UNKNOWN",
        source: "NO_DATA",
        evidenceAt: null,
        availability: "NO_DATA",
        reason: "Nenhuma avaliação operacional concluída",
        evaluatedRecords: 0,
        }),
        { status: 200 }
      )
    );
    await expect(caller().dashboard.operationalState()).resolves.toEqual(
      expect.objectContaining({
        dashboardState: "EMPTY",
        operationalState: "UNKNOWN",
        source: "NO_DATA",
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/governance\/operational-state$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer trusted-token",
        }),
      })
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("orgId");
  });

  it("consulta sinais e ação nas rotas /v1 sem aceitar orgId do navegador", async () => {
    const nextBestAction = {
      signalId: "signal-org-from-session",
      actionType: "COLLECT_OVERDUE_CHARGE",
      title: "Cobrança vencida pendente de ação",
      reason: "CHARGE_OVERDUE",
      impact: "Afeta caixa e previsibilidade financeira.",
      suggestedAction: "Cobrar cliente.",
      area: "FINANCE",
      entityType: "Charge",
      entityId: "charge-org-from-session",
      serviceOrderId: null,
      chargeId: "charge-org-from-session",
      messageId: null,
      routeHint: "/finances?view=charges",
      source: "FINANCE",
      detectedAt: "2026-08-15T00:00:00.000Z",
      metadata: { severity: "WARNING", priorityScore: 70 },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            orgId: "org-from-session",
            generatedAt: "2026-08-15T00:00:00.000Z",
            totalSignals: 0,
            signals: [],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
        success: true,
        data: nextBestAction,
          }),
          { status: 200 }
        )
      );
    const api = caller().dashboard;
    await expect(api.operationalSignals({ limit: 8 })).resolves.toEqual(
      expect.objectContaining({ signals: [], totalSignals: 0 })
    );
    await expect(api.nextBestAction()).resolves.toEqual(nextBestAction);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/internal\/operational-signals\?limit=8$/
    );
    expect(String(fetchMock.mock.calls[1][0])).toMatch(
      /\/v1\/internal\/operational-signals\/next-best-action$/
    );
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).includes("orgId"))
    ).toBe(true);
    await expect(
      api.operationalSignals({ limit: 8, orgId: "org-evil" } as any)
    ).rejects.toBeDefined();
  });

  it("não converte falha upstream em estado, ação ou lista vazia", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "upstream unavailable" }), {
        status: 503,
      })
    );
    await expect(caller().dashboard.operationalState()).rejects.toBeDefined();
    await expect(
      caller().dashboard.operationalSignals({ limit: 8 })
    ).rejects.toBeDefined();
    await expect(caller().dashboard.nextBestAction()).rejects.toBeDefined();
  });

  it("rejeita contrato inválido em vez de fabricar sucesso", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ operationalState: "A", source: "NO_DATA" }),
        { status: 200 }
      )
    );
    await expect(caller().dashboard.operationalState()).rejects.toBeDefined();
  });
});

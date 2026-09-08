import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const orgId = "20000000-0000-4000-8000-000000000001";
const customerId = "10000000-0000-4000-8000-000000000001";
const context = {
  req: {
    headers: { cookie: "nexo_token=trusted" },
    cookies: { nexo_token: "trusted" },
  },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: { token: "trusted", validated: true, organizationId: orgId },
} as any;

const customer = {
  id: customerId,
  name: "Ana Souza",
  phone: "5511999999999",
  email: null,
  cpfCnpj: null,
  address: "Rua Um, 10",
  notes: null,
  active: true,
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T11:00:00.000Z",
};

const operationalSummary = {
  evaluatedAt: "2026-09-08T12:00:00.000Z",
  portfolio: {
    operationalStatus: "ATENÇÃO",
    totalCustomers: 1,
    normalCustomers: 0,
    attentionCustomers: 1,
    riskCustomers: 0,
    criticalCustomers: 0,
  },
  customers: [
    {
      customerId,
      customerName: "Ana Souza",
      active: true,
      operationalStatus: "ATENÇÃO",
      priority: "P1",
      riskScore: 20,
      riskState: "WARNING",
      riskSignal: "Cobrança vencida",
      interventionReason: "Existe cobrança vencida.",
      recommendedActionLabel: "Revisar cobrança",
      recommendedActionTarget: "FINANCES",
      contributors: ["OVERDUE_CHARGES"],
      breakdown: [
        {
          code: "OVERDUE_CHARGES",
          label: "Cobrança vencida",
          description: "Existe cobrança vencida.",
          points: 20,
          value: 1,
          threshold: 1,
        },
      ],
      factors: { overdueCharges: 1 },
      explanation: ["Existe cobrança vencida."],
      evaluatedAt: "2026-09-08T12:00:00.000Z",
    },
  ],
};

function respond(body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

describe("customers output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ["getById", (caller: any) => caller.customers.getById({ id: customerId })],
    [
      "create",
      (caller: any) =>
        caller.customers.create({ name: customer.name, phone: customer.phone }),
    ],
    [
      "update",
      (caller: any) =>
        caller.customers.update({
          id: customerId,
          name: customer.name,
          expectedUpdatedAt: customer.updatedAt,
        }),
    ],
  ])(
    "valida %s, preserva nulls legítimos e remove orgId",
    async (_name, invoke) => {
      respond({ success: true, data: { ...customer, orgId } });

      await expect(invoke(appRouter.createCaller(context))).resolves.toEqual(
        customer
      );
    }
  );

  it("valida list e seu alias nexo.* sobre o envelope paginado real", async () => {
    respond({
      data: [customer],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
    await expect(
      appRouter.createCaller(context).customers.list()
    ).resolves.toEqual([customer]);

    vi.restoreAllMocks();
    respond({
      data: [customer],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
    await expect(
      appRouter.createCaller(context).nexo.customers.list()
    ).resolves.toEqual([customer]);
  });

  it("fecha o workspace composto e não expõe identidade tenant", async () => {
    const workspace = {
      customer: { ...customer, orgId },
      appointments: [],
      serviceOrders: [],
      charges: [],
      timeline: [],
      totalSpentCents: 0,
    };
    respond({ success: true, data: workspace });
    await expect(
      appRouter.createCaller(context).customers.workspace({ id: customerId })
    ).resolves.toEqual({
      ...workspace,
      customer,
    });
  });

  it("rejeita workspace incompatível em HTTP 200", async () => {
    respond({ success: true, data: { customer, appointments: null } });
    await expect(
      appRouter.createCaller(context).customers.workspace({ id: customerId })
    ).rejects.toBeTruthy();
  });

  it("preserva integralmente a decisão operacional oficial e o alias nexo.*", async () => {
    respond({ success: true, data: operationalSummary });
    await expect(
      appRouter.createCaller(context).customers.operationalSummary()
    ).resolves.toEqual(operationalSummary);

    vi.restoreAllMocks();
    respond({ success: true, data: operationalSummary });
    await expect(
      appRouter.createCaller(context).nexo.customers.operationalSummary()
    ).resolves.toEqual(operationalSummary);
  });

  it.each([
    ["campo obrigatório ausente", { ...customer, name: undefined }],
    ["ID inválido", { ...customer, id: "not-a-uuid" }],
    ["timestamp inválido", { ...customer, updatedAt: "hoje" }],
    ["tipo errado", { ...customer, active: "true" }],
    ["campo extra", { ...customer, internalSecret: "não expor" }],
  ])("rejeita customer com %s mesmo em HTTP 200", async (_name, invalid) => {
    respond({ success: true, data: invalid });
    await expect(
      appRouter.createCaller(context).customers.getById({ id: customerId })
    ).rejects.toBeTruthy();
  });

  it.each([
    [
      "status inválido",
      {
        ...operationalSummary,
        portfolio: {
          ...operationalSummary.portfolio,
          operationalStatus: "UNKNOWN",
        },
      },
    ],
    [
      "prioridade inválida",
      {
        ...operationalSummary,
        customers: [{ ...operationalSummary.customers[0], priority: "P9" }],
      },
    ],
    [
      "decisão inválida",
      {
        ...operationalSummary,
        customers: [
          {
            ...operationalSummary.customers[0],
            recommendedActionTarget: "DASHBOARD",
          },
        ],
      },
    ],
    ["timestamp inválido", { ...operationalSummary, evaluatedAt: "agora" }],
    ["payload inesperado", { ...operationalSummary, debug: true }],
    [
      "coleção obrigatória ausente",
      { ...operationalSummary, customers: undefined },
    ],
    [
      "fatos operacionais ausentes",
      {
        ...operationalSummary,
        customers: [
          { ...operationalSummary.customers[0], contributors: undefined },
        ],
      },
    ],
  ])("rejeita operationalSummary com %s", async (_name, invalid) => {
    respond({ success: true, data: invalid });
    await expect(
      appRouter.createCaller(context).customers.operationalSummary()
    ).rejects.toBeTruthy();
  });

  it("preserva recomendação legitimamente indisponível como null", async () => {
    const unavailable = {
      ...operationalSummary,
      customers: [
        {
          ...operationalSummary.customers[0],
          interventionReason: null,
          recommendedActionLabel: null,
          recommendedActionTarget: null,
        },
      ],
    };
    respond({ success: true, data: unavailable });
    await expect(
      appRouter.createCaller(context).customers.operationalSummary()
    ).resolves.toEqual(unavailable);
  });

  it.each([
    ["envelope malformado", { success: true }],
    ["payload nulo", { success: true, data: null }],
  ])("rejeita %s", async (_name, body) => {
    respond(body);
    await expect(
      appRouter.createCaller(context).customers.getById({ id: customerId })
    ).rejects.toBeTruthy();
  });
});

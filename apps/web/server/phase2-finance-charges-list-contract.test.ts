import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const context = {
  req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: { token: "trusted", validated: true },
} as any;

const occurredAt = "2026-09-07T12:00:00.000Z";

function historicalCharge() {
  return {
    id: "charge-1",
    orgId: "org-1",
    customerId: "customer-1",
    idempotencyKey: null,
    serviceOrderId: "service-order-1",
    amountCents: 15000,
    currency: "BRL",
    status: "PENDING",
    dueDate: occurredAt,
    paidAt: null,
    canceledAt: null,
    cancellationReason: null,
    canceledByUserId: null,
    notes: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    customer: {
      id: "customer-1",
      orgId: "org-1",
      name: "Cliente Real",
      phone: "+5511999999999",
      email: null,
      cpfCnpj: null,
      address: null,
      notes: null,
      active: true,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
    serviceOrder: {
      id: "service-order-1",
      orgId: "org-1",
      customerId: "customer-1",
      idempotencyKey: null,
      appointmentId: null,
      assignedToPersonId: null,
      title: "Manutenção",
      description: null,
      status: "DONE",
      priority: 2,
      scheduledFor: null,
      startedAt: occurredAt,
      finishedAt: occurredAt,
      amountCents: 15000,
      dueDate: null,
      cancellationReason: null,
      outcomeSummary: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
    payments: [{ amountCents: 0, paidAt: occurredAt, method: "PIX" }],
    paidAmountCents: 0,
    balanceCents: 15000,
    daysOverdue: null,
    evaluatedAt: occurredAt,
  };
}

const meta = { page: 1, limit: 20, total: 1, pages: 1 };

function mockList(items: unknown[], envelope: "simple" | "double" = "simple") {
  const payload = { items, meta: { ...meta, total: items.length, pages: items.length ? 1 : 0 } };
  const body = envelope === "double"
    ? { success: true, data: { ok: true, data: payload } }
    : { data: payload };
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  );
}

function caller() {
  return appRouter.createCaller(context);
}

describe("Phase 2 finance.charges.list output contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("aceita o payload histórico real e preserva a transformação items/meta", async () => {
    const charge = historicalCharge();
    mockList([charge]);

    await expect(caller().finance.charges.list({ page: 1, limit: 20 })).resolves.toEqual({
      data: [charge],
      pagination: meta,
    });
  });

  it("aceita lista vazia no envelope simples existente", async () => {
    mockList([]);
    await expect(caller().finance.charges.list()).resolves.toEqual({
      data: [],
      pagination: { ...meta, total: 0, pages: 0 },
    });
  });

  it("aceita valores monetários zero, datas ISO, nullability e todos os status válidos", async () => {
    for (const status of ["PENDING", "PAID", "OVERDUE", "CANCELED"] as const) {
      const charge = historicalCharge();
      charge.status = status;
      charge.amountCents = 0;
      charge.balanceCents = 0;
      charge.serviceOrder!.amountCents = 0;
      mockList([charge]);
      await expect(caller().finance.charges.list()).resolves.toMatchObject({ data: [charge] });
      vi.restoreAllMocks();
    }
  });

  it.each([
    ["campo obrigatório ausente", (charge: any) => { delete charge.currency; }],
    ["tipo monetário inválido", (charge: any) => { charge.amountCents = "15000"; }],
    ["data inválida", (charge: any) => { charge.dueDate = "07/09/2026"; }],
    ["status inválido", (charge: any) => { charge.status = "REFUNDED"; }],
    ["customer aninhado inválido", (charge: any) => { charge.customer.active = "yes"; }],
    ["serviceOrder aninhada inválida", (charge: any) => { charge.serviceOrder.status = "FINISHED"; }],
  ])("rejeita %s vindo do upstream", async (_label, mutate) => {
    const charge = historicalCharge();
    mutate(charge);
    mockList([charge]);
    await expect(caller().finance.charges.list()).rejects.toBeTruthy();
  });

  it("preserva o envelope duplo existente", async () => {
    const charge = historicalCharge();
    mockList([charge], "double");
    await expect(caller().finance.charges.list()).resolves.toEqual({
      data: [charge],
      pagination: meta,
    });
  });

});

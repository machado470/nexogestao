import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const orderId = "10000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const timestamp = "2026-09-08T12:00:00.000Z";
const decision = {
  isOverdue: false, overdueDays: 0, isStalled: false, chargeOverdue: false,
  operationalStatus: "NORMAL", priority: "P2", riskLabel: "Sem bloqueio crítico",
  nextAction: { type: "start", label: "Iniciar", reason: "Pronta para execução" },
};
const mutationOrder = {
  id: orderId, customerId, appointmentId: null, assignedToPersonId: null,
  title: "Instalação", description: null, status: "OPEN", priority: 2,
  scheduledFor: null, startedAt: null, finishedAt: null, amountCents: 0,
  dueDate: null, cancellationReason: null, outcomeSummary: null,
  createdAt: timestamp, updatedAt: timestamp,
  customer: { id: customerId, name: "Ana", phone: null }, assignedTo: null,
};
const order = {
  ...mutationOrder,
  appointment: null,
  financialSummary: { hasCharge: false, chargeId: null, chargeStatus: null, chargeAmountCents: null, chargeDueDate: null, paidAt: null },
  operationalDecision: decision,
};
const list = { data: [order], pagination: { page: 1, limit: 20, total: 1, pages: 1 } };

function caller() {
  return appRouter.createCaller({
    req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: { token: "trusted", validated: true, organizationId: customerId },
  } as any);
}
function respond(payload: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, data: payload }), { status: 200 }));
}

describe("service-order output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("validates list, preserves official decision, zero and nulls, and strips internal identity", async () => {
    respond({ ...list, data: [{ ...order, orgId: customerId, idempotencyKey: "private" }] });
    await expect(caller().serviceOrders.list()).resolves.toEqual(list);
  });

  it("validates detail through the nexo alias", async () => {
    respond(order);
    await expect(caller().nexo.serviceOrders.getById({ id: orderId })).resolves.toEqual(order);
  });

  it.each(["create", "update"])("validates %s mutation output", async (mutation) => {
    respond({ ...mutationOrder, orgId: customerId, idempotencyKey: "private" });
    const promise = mutation === "create"
      ? caller().serviceOrders.create({ customerId, title: "Instalação" })
      : caller().serviceOrders.update({ id: orderId, title: "Instalação", expectedUpdatedAt: timestamp });
    await expect(promise).resolves.toEqual(mutationOrder);
  });

  it("validates charge generation output", async () => {
    respond({ created: true, chargeId: orderId });
    await expect(caller().serviceOrders.generateCharge({ id: orderId })).resolves.toEqual({ created: true, chargeId: orderId });
  });

  it.each([
    ["invalid status", { ...order, status: "UNKNOWN" }],
    ["invalid UUID", { ...order, id: "so-1" }],
    ["invalid timestamp", { ...order, updatedAt: "now" }],
    ["invalid money", { ...order, amountCents: -1 }],
    ["missing field", { ...order, title: undefined }],
    ["incomplete decision", { ...order, operationalDecision: { ...decision, nextAction: undefined } }],
    ["invalid priority", { ...order, operationalDecision: { ...decision, priority: "P9" } }],
    ["invalid next action", { ...order, operationalDecision: { ...decision, nextAction: { ...decision.nextAction, type: "delete" } } }],
    ["extra field", { ...order, diagnostics: { stack: "private" } }],
  ])("rejects HTTP 200 with %s", async (_label, invalid) => {
    respond({ ...list, data: [invalid] });
    await expect(caller().serviceOrders.list()).rejects.toBeTruthy();
  });

  it.each([["null payload", null], ["malformed envelope", { success: true }], ["missing pagination", { data: [order] }]])("rejects %s", async (_label, payload) => {
    respond(payload);
    await expect(caller().serviceOrders.list()).rejects.toBeTruthy();
  });
});

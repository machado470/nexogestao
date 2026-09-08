import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const timestamp = "2026-09-08T12:00:00.000Z";
const operation = {
  status: "executed",
  reason: "official_result",
  idempotencyKey: "idempotency-1",
  executionKey: null,
  correlationId: null,
  requestId: "request-1",
};

function caller() {
  return appRouter.createCaller({
    req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: { token: "trusted", validated: true, organizationId: "org-trusted" },
  } as any);
}

function respond(data: unknown, envelope: "api" | "double" | "raw" = "api") {
  const body = envelope === "double"
    ? { success: true, data: { ok: true, data } }
    : envelope === "raw" ? data : { data: { ok: true, data } };
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  );
}

const createdCharge = () => ({
  id: "charge-1",
  orgId: "org-trusted",
  customerId: "customer-1",
  serviceOrderId: null,
  amountCents: 12500,
  status: "PENDING",
  dueDate: timestamp,
  idempotent: false,
  operation,
  degraded: null,
  customer: { id: "customer-1", name: "Campo excedente da entidade Prisma" },
});

const updatedCharge = () => ({
  id: "charge-1",
  orgId: "org-trusted",
  amountCents: 12500,
  status: "PENDING",
  dueDate: timestamp,
  paidAt: null,
  notes: null,
  updatedAt: timestamp,
  createdAt: timestamp,
});

const canceledCharge = () => ({
  id: "charge-1",
  orgId: "org-trusted",
  status: "CANCELED",
  canceledAt: timestamp,
  canceledByUserId: null,
  cancellationReason: "Cobrança duplicada",
  amountCents: 0,
});

const paidCharge = () => ({
  ok: true,
  paymentId: "payment-1",
  idempotent: false,
  operation,
  degraded: null,
});

describe("finance critical mutation output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns only the validated create contract from the global API envelope", async () => {
    respond(createdCharge());
    await expect(caller().finance.charges.create({
      customerId: "customer-1",
      amountCents: 12500,
      dueDate: new Date(timestamp),
    })).resolves.toEqual({
      id: "charge-1",
      customerId: "customer-1",
      serviceOrderId: null,
      amountCents: 12500,
      status: "PENDING",
      dueDate: timestamp,
      idempotent: false,
      operation,
      degraded: null,
    });
  });

  it("accepts the existing double envelope and preserves legitimate nulls on update", async () => {
    respond(updatedCharge(), "double");
    await expect(caller().finance.charges.update({ id: "charge-1", notes: "Nota" }))
      .resolves.toMatchObject({ paidAt: null, notes: null, amountCents: 12500 });
  });

  it("preserves cancellation nullability and strips unrelated upstream fields", async () => {
    const response = canceledCharge();
    response.canceledAt = null as any;
    response.cancellationReason = null as any;
    respond(response);
    await expect(caller().finance.charges.cancel({
      chargeId: "charge-1",
      cancellationReason: "Cobrança duplicada",
    })).resolves.toEqual({
      id: "charge-1",
      status: "CANCELED",
      canceledAt: null,
      canceledByUserId: null,
      cancellationReason: null,
    });
  });

  it("validates payment facts and a legitimate degraded result", async () => {
    const response = paidCharge();
    response.degraded = {
      channel: "whatsapp",
      reason: "whatsapp_send_failed",
      fallback: "message_queued",
      status: "retry_scheduled",
    } as any;
    respond(response);
    await expect(caller().finance.charges.pay({
      chargeId: "charge-1",
      amountCents: 12500,
      method: "PIX",
    })).resolves.toEqual(response);
  });

  it.each([
    ["create missing required field", "create", () => { const value = createdCharge(); delete (value as any).id; return value; }],
    ["create invalid monetary type", "create", () => ({ ...createdCharge(), amountCents: "12500" })],
    ["update invalid timestamp", "update", () => ({ ...updatedCharge(), updatedAt: "08/09/2026" })],
    ["cancel invalid status", "cancel", () => ({ ...canceledCharge(), status: "PAID" })],
    ["pay malformed payload", "pay", () => ({ unexpected: true })],
    ["pay invalid payment id", "pay", () => ({ ...paidCharge(), paymentId: 123 })],
  ])("rejects HTTP 200 with %s", async (_label, mutation, payload) => {
    respond(payload());
    const api = caller().finance.charges;
    const promise = mutation === "create"
      ? api.create({ customerId: "customer-1", amountCents: 12500, dueDate: new Date(timestamp) })
      : mutation === "update"
        ? api.update({ id: "charge-1", notes: "Nota" })
        : mutation === "cancel"
          ? api.cancel({ chargeId: "charge-1", cancellationReason: "Duplicada" })
          : api.pay({ chargeId: "charge-1", amountCents: 12500, method: "PIX" });
    await expect(promise).rejects.toBeTruthy();
  });

  it("rejects a malformed success envelope instead of fabricating payment success", async () => {
    respond({ success: true }, "raw");
    await expect(caller().finance.charges.pay({
      chargeId: "charge-1",
      amountCents: 12500,
      method: "PIX",
    })).rejects.toBeTruthy();
  });
});

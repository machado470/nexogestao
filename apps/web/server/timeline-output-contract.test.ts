import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const id = "10000000-0000-4000-8000-000000000001";
const entityId = "20000000-0000-4000-8000-000000000001";
const occurredAt = "2026-09-08T12:00:00.000Z";
const event = {
  id,
  eventType: "SERVICE_ORDER_STARTED",
  occurredAt,
  actor: { name: "Ana" },
  entity: { type: "service_order", id: entityId, href: `/service-orders?serviceOrderId=${entityId}` },
  module: null,
  severity: null,
  title: null,
  description: "Execução iniciada",
  consequence: null,
  recommendedAction: null,
  origin: "operational",
  metadata: { amountCents: 0, status: "IN_PROGRESS" },
};

function caller() {
  return appRouter.createCaller({
    req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: { token: "trusted", validated: true, organizationId: entityId },
  } as any);
}

function respond(payload: unknown, envelope: "ok" | "double" | "raw" = "ok") {
  const body = envelope === "double"
    ? { success: true, data: { ok: true, data: payload } }
    : envelope === "raw" ? payload : { ok: true, data: payload };
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

describe("timeline output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(["listByOrg", "alias"])("validates official events through %s and preserves order", async (kind) => {
    respond([{ ...event, orgId: entityId }, { ...event, id: entityId, actor: null, entity: null }], "double");
    const api = kind === "alias" ? caller().nexo.timeline : caller().timeline;
    await expect(api.listByOrg({ limit: 20 })).resolves.toEqual([
      event,
      { ...event, id: entityId, actor: null, entity: null },
    ]);
  });

  it("validates customer and service-order timelines", async () => {
    respond([event]);
    await expect(caller().timeline.listByCustomer({ customerId: entityId })).resolves.toEqual([event]);
    vi.restoreAllMocks();
    respond([event], "raw");
    await expect(caller().timeline.listByServiceOrder({ serviceOrderId: entityId })).resolves.toEqual([event]);
  });

  it.each([
    ["invalid UUID", { ...event, id: "event-1" }],
    ["invalid timestamp", { ...event, occurredAt: "today" }],
    ["invalid event type", { ...event, eventType: "service-order-started" }],
    ["invalid entity type", { ...event, entity: { ...event.entity, type: "tenant" } }],
    ["missing required field", { ...event, description: undefined }],
    ["unexpected metadata", { ...event, metadata: { rawPayload: { secret: true } } }],
    ["diagnostics", { ...event, diagnostics: { stack: "private" } }],
  ])("rejects HTTP 200 with %s", async (_label, payload) => {
    respond([payload]);
    await expect(caller().timeline.listByOrg()).rejects.toBeTruthy();
  });

  it.each([["null payload", null], ["malformed envelope", { success: true }]])("rejects %s", async (_label, body) => {
    respond(body, "raw");
    await expect(caller().timeline.listByOrg()).rejects.toBeTruthy();
  });
});

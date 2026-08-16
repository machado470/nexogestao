import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

function createCtx(org = "org-a") {
  return { req: { headers: {} }, res: {}, user: { id: 1, organizationId: org, role: "admin", token: "session-token", validated: true } } as any;
}
const item = {
  id: "00000000-0000-4000-8000-000000000001", type: "CUSTOMER_CREATED", title: "Cliente criado",
  message: "Cliente criado.", severity: "INFO", source: "customers", entityType: "CUSTOMER",
  entityId: "c1", routeHint: "/customers/c1", metadata: { customerId: "c1" },
  occurredAt: "2026-08-16T10:00:00Z", createdAt: "2026-08-16T10:00:00Z", read: false, readAt: null,
};

describe("notification BFF persistent authority", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });

  it("uses /v1 API and session bearer instead of Prisma or memory", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ items: [item], total: 1, page: 1, pages: 1, unreadCount: 1 }) });
    const result = await appRouter.createCaller(createCtx()).dashboard.notificationCenter.list({ page: 1, limit: 10, category: "all" });
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/v1/notifications?"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
    }));
  });

  it("preserves upstream errors rather than returning empty/zero", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => JSON.stringify({ message: "database unavailable" }) });
    await expect(appRouter.createCaller(createCtx()).dashboard.notificationCenter.unreadCount()).rejects.toThrow("database unavailable");
  });

  it("rejects authenticated session without organization", async () => {
    await expect(appRouter.createCaller({ ...createCtx(), user: { ...createCtx().user, organizationId: undefined } } as any).dashboard.notifications({ limit: 10 })).rejects.toThrow("Sessão sem organização");
  });

  it("governance changeRiskLevel does not invent a notification or mutation", async () => {
    await expect(appRouter.createCaller(createCtx()).governance.changeRiskLevel({ entityId: "c1", previousLevel: "LOW", newLevel: "HIGH" }))
      .rejects.toThrow("não há mutação confirmada");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

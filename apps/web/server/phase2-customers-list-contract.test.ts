import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const authenticatedOrgId = "20000000-0000-4000-8000-000000000001";
const context = {
  req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: { token: "trusted", validated: true, organizationId: authenticatedOrgId },
} as any;

describe("Phase 2 customers.list input contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ["sem filtros", undefined, ""],
    ["com paginação e busca", { page: 2, limit: 300, search: "Cliente" }, "?page=2&limit=300&search=Cliente"],
  ])("preserva o input histórico %s", async (_label, input, expectedQuery) => {
    const response = { data: [{ id: "customer-from-authenticated-org", orgId: authenticatedOrgId }], meta: { page: 1, limit: 20, total: 1, pages: 1 } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 })
    );
    const caller = appRouter.createCaller(context);

    await expect(caller.customers.list(input as any)).resolves.toEqual(response.data);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/customers${expectedQuery}`);
  });

  it.each([
    { orgId: "20000000-0000-4000-8000-000000000002" },
    { tenantId: "20000000-0000-4000-8000-000000000002" },
    { organizationId: "20000000-0000-4000-8000-000000000002" },
    { page: 1, extra: true },
  ])("rejeita autoridade tenant e chaves extras antes do upstream: %j", async (input) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(context);

    await expect(caller.customers.list(input as any)).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { page: 0 },
    { page: 10_001 },
    { limit: 0 },
    { limit: 501 },
    { search: "x".repeat(201) },
  ])("rejeita paginação ou busca fora dos limites: %j", async (input) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(context);

    await expect(caller.customers.list(input as any)).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mantém o alias nexo.* no mesmo contrato estrito", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(context);

    await expect(caller.nexo.customers.list({ orgId: "spoofed" } as any)).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const authenticatedOrgId = "20000000-0000-4000-8000-000000000001";
const context = {
  req: {
    headers: { cookie: "nexo_token=trusted" },
    cookies: { nexo_token: "trusted" },
  },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: {
    token: "trusted",
    validated: true,
    organizationId: authenticatedOrgId,
  },
} as any;

describe("Phase 2 onboarding mutation input contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(["createCustomer", "createService", "createCharge"] as const)(
    "encaminha apenas a etapa oficial %s",
    async step => {
      const response = { requiresOnboarding: true, steps: {} };
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify(response), { status: 200 })
        );
      const caller = appRouter.createCaller(context);

      await expect(caller.onboarding.completeStep({ step })).resolves.toEqual(
        response
      );
      const request = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(String(request.body))).toEqual({ step });
    }
  );

  it.each([
    { step: "customer" },
    { step: "createCustomer", payload: { orgId: "spoofed" } },
    { step: "createCharge", orgId: "20000000-0000-4000-8000-000000000002" },
  ])(
    "rejeita etapa, payload ou autoridade tenant não oficiais: %j",
    async input => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const caller = appRouter.createCaller(context);

      await expect(
        caller.onboarding.completeStep(input as any)
      ).rejects.toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("preserva o encerramento com corpo vazio e rejeita campos extras", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ requiresOnboarding: false, steps: {} }), {
          status: 200,
        })
      );
    const caller = appRouter.createCaller(context);

    await expect(caller.onboarding.complete({})).resolves.toMatchObject({
      requiresOnboarding: false,
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    ).toEqual({});

    fetchMock.mockClear();
    await expect(
      caller.onboarding.complete({ orgId: "spoofed" } as any)
    ).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mantém o alias nexo.* no mesmo contrato estrito", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(context);

    await expect(
      caller.nexo.onboarding.completeStep({
        step: "createCharge",
        extra: true,
      } as any)
    ).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

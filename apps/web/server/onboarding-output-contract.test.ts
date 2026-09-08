import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const context = {
  req: {
    headers: { cookie: "nexo_token=trusted" },
    cookies: { nexo_token: "trusted" },
  },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: {
    token: "trusted",
    validated: true,
    organizationId: "20000000-0000-4000-8000-000000000001",
  },
} as any;

const validStatus = {
  requiresOnboarding: true,
  steps: {
    createCustomer: true,
    createService: false,
    createCharge: false,
  },
};

function respond(payload: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), { status: 200 })
  );
}

describe("Onboarding output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ["direto", validStatus],
    ["envelope data", { data: validStatus }],
    ["envelope success", { success: true, data: validStatus }],
    ["envelope ok aninhado", { data: { ok: true, data: validStatus } }],
  ])("aceita status válido no formato %s", async (_name, payload) => {
    respond(payload);

    await expect(
      appRouter.createCaller(context).onboarding.status()
    ).resolves.toEqual(validStatus);
  });

  it("preserva null legítimo retornado quando a organização não existe", async () => {
    respond({ success: true, data: null });

    await expect(
      appRouter.createCaller(context).onboarding.status()
    ).resolves.toBeNull();
  });

  it("valida completeStep pela mesma fonte autoritativa via alias nexo", async () => {
    respond({ data: validStatus });

    await expect(
      appRouter.createCaller(context).nexo.onboarding.completeStep({
        step: "createCustomer",
      })
    ).resolves.toEqual(validStatus);
  });

  it("valida o estado real devolvido por complete sem fabricar conclusão", async () => {
    respond({ ok: true, data: validStatus });

    await expect(
      appRouter.createCaller(context).onboarding.complete({})
    ).resolves.toEqual(validStatus);
  });

  it.each([
    ["campo obrigatório ausente", { steps: validStatus.steps }],
    ["step obrigatório ausente", { requiresOnboarding: true, steps: { createCustomer: true, createService: false } }],
    ["step desconhecido", { ...validStatus, steps: { ...validStatus.steps, unknown: false } }],
    ["boolean inválido", { ...validStatus, requiresOnboarding: "false" }],
    ["objeto extra", { ...validStatus, metadata: { source: "internal" } }],
    ["identidade tenant orgId", { ...validStatus, orgId: "20000000-0000-4000-8000-000000000001" }],
    ["identidade tenantId", { ...validStatus, tenantId: "20000000-0000-4000-8000-000000000001" }],
    ["payload null em envelope não canônico", { data: null, unexpected: true }],
    ["envelope malformado", { success: true }],
  ])("rejeita HTTP 200 com output inválido: %s", async (_name, payload) => {
    respond(payload);

    await expect(
      appRouter.createCaller(context).onboarding.completeStep({
        step: "createCustomer",
      })
    ).rejects.toBeTruthy();
  });
});

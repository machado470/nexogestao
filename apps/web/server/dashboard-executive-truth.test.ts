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

describe("Dashboard BFF executive truth", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("consulta estado pela API /v1, encaminha autenticação e preserva UNKNOWN", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        operationalState: "UNKNOWN",
        source: "NO_DATA",
        evidenceAt: null,
        availability: "NO_DATA",
        reason: "Nenhuma avaliação operacional concluída",
        evaluatedRecords: 0,
      }), { status: 200 })
    );
    await expect(caller().dashboard.operationalState()).resolves.toEqual(
      expect.objectContaining({ operationalState: "UNKNOWN", source: "NO_DATA" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/governance\/operational-state$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer trusted-token" }),
      })
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("orgId");
  });

  it("consulta sinais e ação nas rotas /v1 sem aceitar orgId do navegador", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        orgId: "org-from-session", generatedAt: "2026-08-15T00:00:00.000Z",
        totalSignals: 0, signals: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("null", { status: 200 }));
    const api = caller().dashboard;
    await expect(api.operationalSignals({ limit: 8 })).resolves.toEqual(
      expect.objectContaining({ signals: [], totalSignals: 0 })
    );
    await expect(api.nextBestAction()).resolves.toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/v1\/internal\/operational-signals\?limit=8$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/v1\/internal\/operational-signals\/next-best-action$/);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("orgId"))).toBe(true);
    await expect(api.operationalSignals({ limit: 8, orgId: "org-evil" } as any)).rejects.toBeDefined();
  });

  it("não converte falha upstream em estado, ação ou lista vazia", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 503 })
    );
    await expect(caller().dashboard.operationalState()).rejects.toBeDefined();
    await expect(caller().dashboard.operationalSignals({ limit: 8 })).rejects.toBeDefined();
    await expect(caller().dashboard.nextBestAction()).rejects.toBeDefined();
  });

  it("rejeita contrato inválido em vez de fabricar sucesso", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ operationalState: "A", source: "NO_DATA" }), { status: 200 })
    );
    await expect(caller().dashboard.operationalState()).rejects.toBeDefined();
  });
});

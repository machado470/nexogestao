import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

function caller() {
  return appRouter.createCaller({
    req: {
      headers: { cookie: "nexo_token=cookie-token" },
      cookies: {},
    },
    res: {},
    user: {
      token: "trusted-token",
      validated: true,
      organizationId: "org-from-session",
    },
  } as any);
}

const summary = {
  lastRunAt: "2026-08-24T20:00:00.000Z",
  evaluated: 5,
  warnings: 1,
  correctives: 1,
  institutionalRiskScore: 20,
  restrictedCount: 0,
  suspendedCount: 0,
  openCorrectivesCount: 1,
  durationMs: 120,
  trend: [],
};

const run = {
  id: "run-1",
  orgId: "org-from-session",
  evaluated: 5,
  warnings: 1,
  correctives: 1,
  institutionalRiskScore: 20,
  restrictedCount: 0,
  suspendedCount: 0,
  openCorrectivesCount: 1,
  durationMs: 120,
  startedAt: "2026-08-24T19:59:59.000Z",
  finishedAt: "2026-08-24T20:00:00.000Z",
  createdAt: "2026-08-24T20:00:00.000Z",
  bucket: "2026-08-24T20",
};

describe("Governance BFF truth contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("preserva summary e runs válidos do backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(summary), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([run]), { status: 200 })
      );

    await expect(
      caller().governance.summary()
    ).resolves.toEqual(summary);

    await expect(
      caller().governance.runs({ limit: 12 })
    ).resolves.toEqual([run]);
  });

  it("não converte contrato inválido em summary ou lista vazia", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("null", { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
        })
      );

    await expect(
      caller().governance.summary()
    ).rejects.toBeDefined();

    await expect(
      caller().governance.runs({ limit: 12 })
    ).rejects.toBeDefined();
  });

  it("não mascara falha upstream como dados válidos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "upstream unavailable" }),
        { status: 503 }
      )
    );

    await expect(
      caller().governance.summary()
    ).rejects.toBeDefined();

    await expect(
      caller().governance.runs({ limit: 12 })
    ).rejects.toBeDefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const context = {
  req: { headers: {}, cookies: {} },
  res: {},
  user: {
    token: "trusted-token",
    validated: true,
    organizationId: "org-session",
  },
} as any;

const stages = [
  "customers",
  "appointments",
  "service-orders",
  "charges",
  "payments",
].map((key, index) => ({
  key,
  label: ["Cliente", "Agendamento", "O.S.", "Cobrança", "Pagamento"][index],
  state: "unavailable",
  volume: index,
  reason: "Política agregada indisponível.",
  evidence: {
    source: ["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT"][
      index
    ],
    description: "Fonte persistida.",
  },
  referenceTimestamp: null,
  navigationTarget: [
    "/customers",
    "/appointments",
    "/service-orders",
    "/finances?view=charges",
    "/finances?view=paid",
  ][index],
}));

describe("Dashboard BFF executive pipeline", () => {
  it("valida e preserva o contrato autoritativo sem enviar tenant pelo navegador", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { generatedAt: "2026-08-30T00:00:00.000Z", stages },
          }),
          { status: 200 }
        )
      );
    const result = await appRouter
      .createCaller(context)
      .dashboard.executivePipeline();
    expect(result.stages.map(stage => stage.key)).toEqual(
      stages.map(stage => stage.key)
    );
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/dashboard\/executive-pipeline$/
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("orgId");
  });

  it("rejeita reordenação e estado fora do contrato", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          generatedAt: "2026-08-30T00:00:00.000Z",
          stages: [...stages].reverse(),
        }),
        { status: 200 }
      )
    );
    await expect(
      appRouter.createCaller(context).dashboard.executivePipeline()
    ).rejects.toBeDefined();
  });
});

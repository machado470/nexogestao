import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const context = {
  req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: { token: "trusted", validated: true, organizationId: "20000000-0000-4000-8000-000000000001" },
} as any;

const policy = {
  allowAutomaticCharge: true, allowWhatsAppAuto: true, allowOverdueReminderAuto: true,
  allowFinanceTeamNotifications: true, allowGovernanceFollowup: true,
  allowChargeFollowupCreation: true, allowRiskReviewEscalation: true,
  maxRetries: 3, throttleWindowMs: 30_000,
};

describe("execution auxiliary output contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("aceita mode canônico e rejeita campo excedente", async () => {
    const caller = appRouter.createCaller(context);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: { mode: "automatic", policy } }), { status: 200 }));
    await expect(caller.executions.mode()).resolves.toEqual({ mode: "automatic", policy });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ mode: "automatic", policy, orgId: context.user.organizationId }), { status: 200 }));
    await expect(caller.executions.mode()).rejects.toBeTruthy();
  });

  it("não mascara contador ausente no state summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      pending: 0, executed: 1, failed: 0, blocked: 0, blockedRecent: 0, throttled: 0,
    }), { status: 200 }));
    await expect(appRouter.createCaller(context).executions.stateSummary()).rejects.toBeTruthy();
  });

  it("remove diagnostics, metadata e orgId dos históricos públicos", async () => {
    const event = {
      id: "10000000-0000-4000-8000-000000000001", actionId: "collect", decisionId: "rule-1",
      entityType: "charge", entityId: "entity-1", eventType: "EXECUTION_EXECUTED", status: "executed",
      intent: "recover_revenue", priority: "high", correlationId: "corr-1", reasonCode: null,
      mode: "automatic", result: { outcome: "success" }, timestamp: "2026-09-08T01:00:00.000Z",
      metadata: { orgId: context.user.organizationId }, diagnostics: { executionKey: "private", orgId: context.user.organizationId },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([event]), { status: 200 }));
    const [output] = await appRouter.createCaller(context).nexo.executions.events();
    expect(output).not.toHaveProperty("metadata");
    expect(output).not.toHaveProperty("diagnostics");
    expect(JSON.stringify(output)).not.toContain(context.user.organizationId);
  });

  it("rejeita run-once com boolean fabricado ou correlationId inválido", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      orgs: 1, totalCandidates: 1, executed: 1, blocked: 0, blockedRecent: 0, failed: 0,
      skipped: 0, debugExecution: "false", blockedByReason: {}, correlationId: "not-a-uuid",
    }), { status: 200 }));
    await expect(appRouter.createCaller(context).executions.runOnce()).rejects.toBeTruthy();
  });
});

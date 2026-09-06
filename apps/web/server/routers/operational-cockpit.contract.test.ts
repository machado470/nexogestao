import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const operations = readFileSync(new URL("./operational.ts", import.meta.url), "utf8");
const transport = readFileSync(new URL("../_core/nexoClient.ts", import.meta.url), "utf8");
const cockpit = readFileSync(new URL("../../client/src/pages/OperationalCockpitPage.tsx", import.meta.url), "utf8");

describe("operational cockpit boundary", () => {
  it("uses authenticated BFF routes and POST mutations", () => {
    expect(transport).toContain('Authorization: `Bearer ${token}`');
    expect(operations).toContain('"/internal/operational-actions/execute"');
    expect(operations).toContain('authedPost(ctx as NexoContext');
  });
  it("rejects client-owned identity fields", () => {
    expect(() => operationalInput.parse({ actionType: "RECALCULATE_RISK", entityType: "person", entityId: "p", orgId: "other" })).toThrow();
  });
  it("browser has no direct internal fetch", () => {
    expect(cockpit).not.toMatch(/fetch\s*\(\s*["'`]\/internal\//);
    expect(cockpit).toContain("trpc.nexo.operations.summary.useQuery");
  });
});

const operationalInput = (await import("zod")).z.object({
  actionType: (await import("zod")).z.enum(["RETRY_WHATSAPP_MESSAGE", "SEND_PAYMENT_REMINDER", "RECALCULATE_RISK", "RUN_GOVERNANCE_CHECK"]),
  entityType: (await import("zod")).z.string().min(1), entityId: (await import("zod")).z.string().min(1),
}).strict();

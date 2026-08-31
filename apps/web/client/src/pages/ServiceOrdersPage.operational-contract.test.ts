import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "ServiceOrdersPage.tsx"), "utf8");
const api = readFileSync(
  resolve(
    __dirname,
    "../../../../api/src/service-orders/service-orders.service.ts"
  ),
  "utf8"
);

describe("ServiceOrders official operational contract guardrail", () => {
  it("keeps decisions and time thresholds owned by the API", () => {
    expect(api).toContain("resolveServiceOrderOperationalDecision");
    expect(api).toContain("operationalDecision:");
    expect(api).toContain("overdueDays:");
    expect(api).toContain("nextAction:");
    expect(page).toContain("order?.operationalDecision");
    expect(page).toContain("operationalDecision?.nextAction");
    expect(page).toContain("operationalDecision?.operationalStatus");
    expect(page).toContain("operationalDecision?.priority");
    expect(page).toContain("decisionAvailable: Boolean(operationalDecision)");
    expect(page).toContain("operationalDecision?.overdueDays");
    expect(page).toContain("operationalDecision?.isStalled");
    expect(page).toContain("operationalDecision?.riskLabel");
    expect(page).toContain('item.nextAction?.type === "charge"');
    expect(page).toContain("item.priority !== priorityFilter");
    expect(page).toContain("Filtering never changes");
    expect(page).not.toContain("function getPrimaryAction");
    expect(page).not.toContain("function getRiskLabel");
    expect(page).not.toContain("function getServiceOrderOperationalStatus");
    expect(page).not.toContain("function getServiceOrderPriority");
    expect(page).not.toContain("Date.now() - dueDate.getTime()");
    expect(page).not.toContain("const score =");
    expect(page).not.toContain(".sort((a, b)");
    expect(page).not.toContain("item.raw?.priority");
    expect(page).not.toContain('deadlineFilter === "today"');
    expect(page).not.toContain('deadlineFilter === "next_7_days"');
    expect(page).not.toContain('status === "DONE" && !item.hasCharge');
  });

  it("renders explicit unavailability instead of manufacturing a decision", () => {
    expect(page).toContain("Decisão operacional indisponível");
    expect(page).toContain("nenhuma ação foi inferida");
    expect(page).toContain(
      "operationalStatus: operationalDecision?.operationalStatus ?? null"
    );
    expect(page).toContain("priority: operationalDecision?.priority ?? null");
    expect(page).toContain(
      "nextAction: operationalDecision?.nextAction ?? null"
    );
    expect(page).not.toContain(
      'operationalStatus: operationalDecision?.operationalStatus ?? "ATENÇÃO"'
    );
    expect(page).not.toContain(
      'priority: operationalDecision?.priority ?? "P1"'
    );
  });
});

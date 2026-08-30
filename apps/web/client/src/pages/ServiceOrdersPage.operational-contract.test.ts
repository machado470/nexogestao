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
    expect(page).not.toContain("function getPrimaryAction");
    expect(page).not.toContain("function getRiskLabel");
    expect(page).not.toContain("function getServiceOrderOperationalStatus");
    expect(page).not.toContain("function getServiceOrderPriority");
    expect(page).not.toContain("Date.now() - dueDate.getTime()");
  });
});

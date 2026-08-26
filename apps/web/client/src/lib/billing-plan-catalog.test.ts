import { describe, expect, it } from "vitest";
import {
  formatPlanQuota,
  normalizeBillingPlanCatalog,
  listEnabledPlanFeatures,
} from "./billing-plan-catalog";

describe("billing canonical plan catalog", () => {
  it("normaliza e ordena somente planos comerciais conhecidos", () => {
    expect(
      normalizeBillingPlanCatalog([
        {
          name: "PRO",
          displayName: "Pro",
          priceCents: 19900,
          quotas: { users: 10 },
          commercialLimits: {},
          features: { advanced_automation: true },
        },
        {
          name: "STARTER",
          displayName: "Basic",
          priceCents: 9900,
          quotas: { users: 5 },
          commercialLimits: {},
          features: {},
        },
        {
          name: "LEGACY",
          displayName: "Legacy",
          priceCents: 1,
        },
      ]).map(plan => plan.name)
    ).toEqual(["STARTER", "PRO"]);
  });

  it("representa limites ilimitados sem inventar valor comercial", () => {
    expect(formatPlanQuota(999999)).toBe("Ilimitado");
    expect(formatPlanQuota(30)).toBe("30");
    expect(formatPlanQuota(undefined)).toBe("Não informado");
  });

  it("humaniza apenas features habilitadas", () => {
    expect(
      listEnabledPlanFeatures({
        advanced_automation: true,
        priority_support: false,
      })
    ).toEqual(["Automação avançada"]);
  });
});

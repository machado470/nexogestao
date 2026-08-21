import { describe, expect, it } from "vitest";
import {
  formatCurrencyCents,
  formatQuotaCount,
  humanizePlanFeatures,
  normalizePlanCatalog,
} from "./plan-catalog";

describe("canonical billing plan catalog", () => {
  it("normaliza catálogo e mantém ordem comercial canônica", () => {
    const result = normalizePlanCatalog([
      {
        name: "PRO",
        displayName: "Pro",
        priceCents: 19900,
        quotas: {
          customers: 100,
          appointments: 2000,
          messages: 5000,
          serviceOrders: 1000,
          users: 10,
          storage: 5000,
        },
        commercialLimits: { automation_executions: 15000 },
        features: { advanced_automation: true },
      },
      {
        name: "STARTER",
        displayName: "Basic",
        priceCents: 9900,
        quotas: {
          customers: 30,
          appointments: 200,
          messages: 500,
          serviceOrders: 100,
          users: 5,
          storage: 500,
        },
        commercialLimits: {},
        features: {},
      },
    ]);

    expect(result.map(plan => plan.name)).toEqual(["STARTER", "PRO"]);
    expect(result[0]?.priceCents).toBe(9900);
    expect(result[1]?.quotas.customers).toBe(100);
  });

  it("não inventa catálogo quando o payload é inválido", () => {
    expect(normalizePlanCatalog(null)).toEqual([]);
    expect(normalizePlanCatalog([{ name: "PRO", priceCents: 19900 }])).toEqual([]);
  });

  it("humaniza valores comerciais sem criar capacidades fictícias", () => {
    expect(formatCurrencyCents(19900)).toContain("199");
    expect(formatCurrencyCents(undefined)).toBe("—");
    expect(formatQuotaCount(999999)).toBe("Ilimitados");
    expect(
      humanizePlanFeatures({
        advanced_automation: true,
        premium_integrations: false,
      })
    ).toEqual(["Autoexecução operacional"]);
  });
});

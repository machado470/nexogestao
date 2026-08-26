import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PricingPage.tsx", import.meta.url),
  "utf8"
);

describe("PricingPage canonical commercial catalog contract", () => {
  it("usa billing.plans como fonte de preço, limites e recursos", () => {
    expect(source).toContain("trpc.billing.plans.useQuery");
    expect(source).toContain("normalizeBillingPlanCatalog");
    expect(source).toContain("formatPlanPrice");
    expect(source).toContain("formatPlanQuota");
    expect(source).toContain("Catálogo comercial indisponível");
  });

  it("não mantém preços comerciais estáticos antigos", () => {
    expect(source).not.toContain('price: "R$');
    expect(source).not.toContain("R$ 149");
    expect(source).not.toContain("R$ 349");
    expect(source).not.toContain('price: "Sob consulta"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PricingPage.tsx", import.meta.url),
  "utf8"
);

describe("PricingPage canonical commercial contract", () => {
  it("consome catálogo público oficial", () => {
    expect(source).toContain("trpc.billing.plans.useQuery");
    expect(source).toContain("normalizePlanCatalog");
    expect(source).toContain("formatCurrencyCents");
  });

  it("não mantém preços e quotas comerciais paralelos", () => {
    expect(source).not.toContain('price: "R$ 149"');
    expect(source).not.toContain('price: "R$ 349"');
    expect(source).not.toContain('price: "Sob consulta"');
    expect(source).not.toContain('"Até 300 clientes"');
    expect(source).not.toContain('"Até 1.500 clientes"');
    expect(source).not.toContain('"Até 2.500 mensagens/mês"');
    expect(source).not.toContain('"Até 10.000 mensagens/mês"');
  });

  it("não inventa fallback comercial quando a fonte oficial falha", () => {
    expect(source).toContain("Catálogo comercial indisponível");
    expect(source).toContain(
      "Não exibimos preços ou limites alternativos"
    );
  });
});

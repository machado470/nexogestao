import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./BillingPage.tsx", import.meta.url),
  "utf8"
);

describe("BillingPage internal page architecture contract", () => {
  it("usa o shell canônico sem PageWrapper legado", () => {
    expect(source).toContain('<AppPageShell className="gap-3">');
    expect(source).not.toContain("PageWrapper");
  });
});

describe("BillingPage operational subscription contract", () => {
  it("usa linguagem operacional premium para assinatura", () => {
    expect(source).toContain("Controle da assinatura do Nexo");
    expect(source).toContain("Qual plano eu tenho, quanto pago, quando renova");
    expect(source).toContain("<OperationalPanel");
    expect(source).toContain("<OperationalKpiCard");
    expect(source).toContain("<OperationalActionPanel");
  });

  it("mantém histórico como evidência sem criar dados fictícios", () => {
    expect(source).toContain("Histórico da assinatura");
    expect(source).toContain("<OperationalTimelineItem");
    expect(source).toContain("Nenhum histórico fictício foi criado");
  });

  it("consome catálogo comercial canônico sem preços ou quotas locais", () => {
    expect(source).toContain("trpc.billing.plans.useQuery");
    expect(source).toContain("normalizePlanCatalog");
    expect(source).toContain("formatCurrencyCents");
    expect(source).toContain("formatQuotaCount");
    expect(source).toContain("Catálogo comercial indisponível");

    expect(source).not.toContain("PLAN_META");
    expect(source).not.toContain("priceCents: 19900");
    expect(source).not.toContain("priceCents: 49900");
    expect(source).not.toContain("priceCents: 99900");
    expect(source).not.toContain('customers: "500 clientes"');
    expect(source).not.toContain('customers: "2.000 clientes"');
    expect(source).not.toContain("Automações essenciais");
  });
});

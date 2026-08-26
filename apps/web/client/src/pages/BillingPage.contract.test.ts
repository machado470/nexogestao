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
});

describe("BillingPage canonical commercial catalog contract", () => {
  it("consome billing.plans sem preços e limites comerciais locais", () => {
    expect(source).toContain("trpc.billing.plans.useQuery");
    expect(source).toContain("normalizeBillingPlanCatalog");
    expect(source).toContain("Catálogo comercial indisponível");
    expect(source).not.toContain("PLAN_META");
    expect(source).not.toContain("49900");
    expect(source).not.toContain("99900");
    expect(source).toContain("Valor não informado");
    expect(source).not.toContain("currentPlanMeta?.priceCents ?? 0");
  });
});

describe("BillingPage checkout boundary contract", () => {
  it("envia somente o nome canônico do plano ao checkout", () => {
    expect(source).toContain("planName: plan");
    expect(source).toContain('if (plan === "FREE")');
    expect(source).not.toContain("PLAN_PRICE_ID");
    expect(source).not.toContain("price_starter");
    expect(source).not.toContain("price_pro");
    expect(source).not.toContain("price_business");
    expect(source).not.toContain("priceId");
  });
});

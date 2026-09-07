import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./FinancesPage.tsx", import.meta.url),
  "utf8"
);

describe("FinancesPage authoritative finance contract", () => {
  it("consome carteira, indicadores e fila oficiais sem motor financeiro local", () => {
    expect(source).toContain("finance.charges.list.useQuery");
    expect(source).toContain("finance.charges.stats.useQuery");
    expect(source).toContain("finance.operationalQueue.useQuery");
    for (const forbidden of [
      "computeDaysOverdue",
      "computeDaysUntilDue",
      "getFinanceOperationalStatus",
      "getChargePriority",
      "getChargeRisk",
      "getChargePrimaryAction",
      "aggregateOperationalHealth",
      "compareOperationalPriority",
      "Date.now()",
      "new Date()",
      "overdueCount >=",
      "overdueDays >=",
      "amountCents >= 500000",
    ])
      expect(source).not.toContain(forbidden);
  });

  it("mostra ausência honestamente e preserva retry independente", () => {
    expect(source).toContain('"Indisponível"');
    expect(source).toContain('"Atraso não calculado"');
    expect(source).toContain('"Não classificada"');
    expect(source).toContain('"Não informado"');
    expect(source).toContain('"Sem recomendação oficial"');
    expect(source).toContain("Sua sessão continua válida");
    expect(source).toContain("Indicadores indisponíveis");
    expect(source).toContain("Fila indisponível");
  });

  it("envia pagamento exato e idempotente sem identidade do navegador", () => {
    expect(source).toContain("amountCents: exactAmount");
    expect(source).toContain("idempotencyKey: crypto.randomUUID()");
    expect(source).not.toMatch(/\borgId\s*:/);
    expect(source).not.toMatch(/\brole\s*:/);
  });

  it("usa composição, tabela, filtros e formulários modais canônicos", () => {
    for (const primitive of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppFiltersBar",
      "AppDataTable",
      "AppStatusBadge",
      "AppForm",
      "AppField",
      "AppFieldGroup",
      "AppFormActions",
      "FormModal",
    ])
      expect(source).toContain(primitive);
    expect(source).not.toMatch(/className="fixed\s+inset/);
    expect(source).not.toContain("window.prompt");
  });

  it("mantém zero distinto de indisponibilidade e usa formatação monetária canônica", () => {
    expect(source).toContain(
      'typeof value === "number" ? formatCurrency(value) : "Indisponível"'
    );
    expect(source).toContain('typeof (metric as any)?.count === "number"');
    expect(source).not.toMatch(
      /(?:amountCents|balanceCents|paidAmountCents)\s*\|\|\s*0/
    );
  });

  it("preserva a ordem oficial e não introduz Billing ou armazenamento local", () => {
    expect(source).toContain("queue.map(");
    expect(source).not.toContain("queue.sort(");
    expect(source).not.toMatch(
      /billing\.(?:status|plans|limits)|checkout|subscriptionStatus/i
    );
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("preserva os dados após erro e fecha somente depois da confirmação do backend", () => {
    expect(source).toContain("await pay.mutateAsync");
    expect(source).toMatch(
      /await pay\.mutateAsync[\s\S]*await refresh\(\);\s*setPaying\(null\)/
    );
    expect(source).toContain("setPaymentError(error?.message");
    expect(source).toContain(
      'aria-describedby={paymentError ? "payment-error" : undefined}'
    );
    expect(source).toContain("initialFocusRef={paymentInputRef}");
  });

  it("só navega quando a fila fornece alvo oficial", () => {
    expect(source).toContain('recommendedActionTarget === "CUSTOMER"');
    expect(source).toContain('recommendedActionTarget === "CHARGE"');
    expect(source).not.toContain("customerById");
    expect(source).not.toContain("serviceOrderById");
  });
});

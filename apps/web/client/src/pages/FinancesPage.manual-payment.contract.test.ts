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
    expect(source).toContain('"Não calculada"');
    expect(source).toContain('"Não avaliado"');
    expect(source).toContain('"Não classificada"');
    expect(source).toContain('"Não informado"');
    expect(source).toContain('"Sem recomendação oficial"');
    expect(source).toContain("Sua sessão continua válida");
    expect(source).toContain("Tentar indicadores novamente");
    expect(source).toContain("Tentar fila novamente");
  });

  it("envia pagamento exato e idempotente sem identidade do navegador", () => {
    expect(source).toContain("amountCents: exactAmount");
    expect(source).toContain("idempotencyKey: crypto.randomUUID()");
    expect(source).not.toMatch(/\borgId\s*:/);
    expect(source).not.toMatch(/\brole\s*:/);
  });

  it("só navega quando a fila fornece alvo oficial", () => {
    expect(source).toContain('recommendedActionTarget === "CUSTOMER"');
    expect(source).toContain('recommendedActionTarget === "CHARGE"');
    expect(source).not.toContain("customerById");
    expect(source).not.toContain("serviceOrderById");
  });
});

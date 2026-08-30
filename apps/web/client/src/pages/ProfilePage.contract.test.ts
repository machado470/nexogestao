import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ProfilePage.tsx", import.meta.url),
  "utf8"
);

describe("ProfilePage internal page architecture contract", () => {
  it("usa o shell canônico sem PageWrapper legado", () => {
    expect(source).toContain("<AppPageShell>");
    expect(source).toContain("<AppOperationalHeader");
    expect(source).not.toContain("PageWrapper");
  });
});

describe("ProfilePage operational identity contract", () => {
  it("posiciona o perfil como identidade operacional do usuário", () => {
    expect(source).toContain("Identidade operacional");
    expect(source).toContain("Quem sou dentro da operação");
    expect(source).toContain("<OperationalWorkloadBar");
    expect(source).toContain("<OperationalActionPanel");
  });

  it("mostra atividade recente como timeline/evidência individual", () => {
    expect(source).toContain("Minha atividade recente");
    expect(source).toContain("<OperationalTimelineItem");
    expect(source).toContain("Nenhum evento individual retornado");
  });

  it("consome a decisão individual autoritativa de People", () => {
    expect(source).toContain(
      "trpc.people.operationalSummary.useQuery(undefined"
    );
    expect(source).toContain("person?.recommendedActionLabel");
    expect(source).toContain("person.priority");
    expect(source).toContain("person.operationalStatus");
    expect(source).toContain("person?.availabilityStatus");
    expect(source).toContain("person?.serviceOrderCapacityUsagePct");
  });

  it("não mantém motor operacional, tenant ou preferências fictícias no browser", () => {
    expect(source).not.toContain("Date.now()");
    expect(source).not.toContain("assignedWorkload");
    expect(source).not.toContain("criticalPendingCount");
    expect(source).not.toContain("delayedOrders");
    expect(source).not.toContain("overdueAppointments");
    expect(source).not.toContain("useOperationalMemoryState");
    expect(source).not.toMatch(/orgId\s*:/);
    expect(source).not.toMatch(/role\s*:/);
  });

  it("mantém fallbacks honestos quando a autoridade não responde", () => {
    expect(source).toContain("Dados operacionais indisponíveis");
    expect(source).toContain(
      "Nenhum estado, risco, prioridade ou capacidade foi presumido."
    );
    expect(source).toContain("Próxima ação não calculada");
    expect(source).toContain(
      "Dado financeiro não disponível ou não calculado."
    );
    expect(source).toContain("Tentar novamente");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./GovernancePage.tsx", import.meta.url),
  "utf8"
);

describe("GovernancePage truth and resilience contract", () => {
  it("consumes the authoritative governance contracts", () => {
    expect(source).toContain("trpc.governance.operationalState.useQuery");
    expect(source).toContain("trpc.governance.autoScore.useQuery");
    expect(source).toContain("trpc.governance.summary.useQuery");
    expect(source).toContain("trpc.governance.runs.useQuery");
    expect(source).toContain("trpc.dashboard.operationalSignals.useQuery");
    expect(source).toContain("trpc.dashboard.nextBestAction.useQuery");
  });

  it("renders all canonical states and never computes a transition", () => {
    for (const state of [
      "NORMAL",
      "WARNING",
      "RESTRICTED",
      "SUSPENDED",
      "UNKNOWN",
    ])
      expect(source).toContain(state);
    expect(source).toContain("O estado não pode ser alterado nesta tela");
    expect(source).not.toContain("persistOperationalStateTransition");
    expect(source).not.toContain("force-normal");
    expect(source).not.toMatch(/riskScore\s*[<>]=?/);
    expect(source).not.toContain("changeRiskLevel");
  });

  it("distinguishes loading, empty, error and partial unavailability", () => {
    expect(source).toContain("AppPageLoadingState");
    expect(source).toContain("AppPageEmptyState");
    expect(source).toContain("AppPageErrorState");
    expect(source).toContain("Indisponibilidade parcial");
    expect(source).toContain("Isso não equivale a fonte indisponível");
    expect(source).toContain("Tentar novamente");
  });

  it("shows automatic score factors, proven risk areas, evidence and existing action", () => {
    expect(source).toContain("Score automático");
    expect(source).toContain("Sinais que justificam a nota");
    expect(source).toContain("Riscos comprováveis");
    expect(source).toContain("Operacionais");
    expect(source).toContain("Financeiros");
    expect(source).toContain("Organizacionais");
    expect(source).toContain("Próxima melhor ação");
    expect(source).toContain("Ação administrativa existente no produto");
    expect(source).toContain("Histórico e evidências");
    expect(source).toContain("Abrir Timeline");
  });

  it("provides contextual, accessible and responsive navigation", () => {
    expect(source).toContain('aria-label="Filtrar riscos por área"');
    expect(source).toContain("aria-pressed");
    expect(source).toContain("routeForSignal");
    expect(source).toContain("sm:grid-cols");
    expect(source).toContain("lg:grid-cols");
    expect(source).toContain("var(--app-surface-2)");
  });
});

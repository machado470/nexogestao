import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./GovernancePage.tsx", import.meta.url),
  "utf8"
);

describe("GovernancePage passive operational authority contract", () => {
  it("uses the canonical page primitives", () => {
    for (const primitive of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppStatusBadge",
      "AppAlert",
      "AppPageLoadingState",
      "AppPageErrorState",
      "AppPageEmptyState",
    ])
      expect(source).toContain(primitive);
    expect(source).not.toContain("AppPageHeader");
    expect(source).not.toContain("AppSectionCard");
  });

  it("consumes only official decisions, evidence and execution sources", () => {
    expect(source).toContain("trpc.governance.operationalState.useQuery");
    expect(source).toContain("trpc.governance.autoScore.useQuery");
    expect(source).toContain("trpc.governance.runs.useQuery");
    expect(source).toContain("trpc.dashboard.operationalSignals.useQuery");
    expect(source).toContain("trpc.dashboard.nextBestAction.useQuery");
  });

  it("preserves every official state without a NORMAL fallback", () => {
    for (const state of [
      "NORMAL",
      "WARNING",
      "RESTRICTED",
      "SUSPENDED",
      "UNKNOWN",
    ])
      expect(source).toContain(state);
    expect(source).not.toMatch(/operationalState\s*\?\?\s*["']NORMAL["']/);
    expect(source).toContain("Nenhum estado foi presumido");
  });

  it("does not implement operational decision logic or reorder signals", () => {
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("signalArea");
    expect(source).not.toContain("routeForSignal");
    expect(source).not.toMatch(/\.sort\s*\(/);
    expect(source).not.toMatch(/riskScore\s*[<>]=?/);
    expect(source).not.toMatch(/threshold/i);
    expect(source).not.toContain("changeRiskLevel");
  });

  it("preserves evidence and the one official action destination", () => {
    expect(source).toContain("signal.reason");
    expect(source).toContain("signal.summary");
    expect(source).toContain("signal.impact");
    expect(source).toContain("signal.source");
    expect(source).toContain("signal.detectedAt");
    expect(source).toContain("navigate(nextAction.routeHint)");
    expect(source).not.toContain("navigate(routeForSignal");
  });

  it("distinguishes loading, errors, unavailable contracts and legitimate emptiness", () => {
    expect(source).toContain("Indisponibilidade parcial");
    expect(source).toContain("Contrato de estado indisponível");
    expect(source).toContain("Nenhum sinal retornado");
    expect(source).toContain("Histórico indisponível");
    expect(source).toContain("Sem recomendação ativa");
  });

  it("keeps narrow viewports and controls accessible", () => {
    expect(source).toContain("minmax(0,1fr)");
    expect(source).toContain("break-words");
    expect(source).toContain("break-all");
    expect(source).toContain('aria-label="Sinais operacionais oficiais"');
    expect(source).toContain("aria-label={`Abrir destino oficial:");
  });
});

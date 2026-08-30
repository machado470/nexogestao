import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./TimelinePage.tsx", import.meta.url),
  "utf8"
);

describe("Timeline — Centro de Evidências Operacionais autoritativo", () => {
  it("keeps the technical metadata secondary and avoids raw tables", () => {
    expect(source).toContain("Centro de Evidências Operacionais");
    expect(source).toContain("Metadata técnica segura");
    expect(source).not.toContain("<table");
  });

  it("renders honest missing-field and unknown-event states", () => {
    expect(source).toContain("Evento não classificado");
    expect(source).toContain("Não informado");
    expect(source).toContain("Não classificado");
    expect(source).toContain("Não disponível");
    expect(source).toContain("não significa operação saudável");
  });

  it("does not include the former local classification and recommendation engine", () => {
    expect(source).not.toContain("eventSeverity");
    expect(source).not.toContain("eventModule");
    expect(source).not.toContain("eventOperationalConsequence");
    expect(source).not.toContain("eventRecommendedAction");
    expect(source).not.toContain("Date.now()");
  });

  it("only navigates using the official API target and never automates", () => {
    expect(source).toContain("event.entity!.href");
    expect(source).toContain("Sem CTA: vínculo oficial não informado");
    expect(source).not.toContain("executeAction");
  });

  it("preserves authenticated identity during partial source failure and offers retry", () => {
    expect(source).toContain("Sessão autenticada:");
    expect(source).toContain("A identidade autenticada foi preservada");
    expect(source).toContain("query.refetch()");
  });
});

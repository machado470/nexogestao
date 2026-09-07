import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./TimelinePage.tsx", import.meta.url),
  "utf8"
);

describe("Timeline — golden standard audit trail", () => {
  it("uses the canonical internal-page composition", () => {
    for (const component of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppFiltersBar",
      "AppSectionBlock",
      "AppStatusBadge",
    ]) {
      expect(source).toContain(component);
    }
    expect(source).toContain('title="Timeline"');
    expect(source).toContain('title="Trilha de auditoria"');
  });

  it("keeps the audit evidence continuous and readable instead of rendering giant cards or raw JSON", () => {
    expect(source).toContain('<ol className="relative"');
    expect(source).toContain("Ver metadados da evidência");
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("<table");
  });

  it("preserves official ordering and navigation", () => {
    expect(source).toContain("A ordem relativa é exatamente a recebida");
    expect(source).toContain("events.filter(");
    expect(source).not.toContain("filteredEvents.sort");
    expect(source).toContain("event.entity!.href");
  });

  it("provides labeled factual filters and clear page states", () => {
    expect(source).toContain('htmlFor="timeline-search"');
    expect(source).toContain('ariaLabel="Tipo de evento"');
    expect(source).toContain('ariaLabel="Módulo ou entidade"');
    expect(source).toContain('ariaLabel="Responsável ou ator"');
    expect(source).toContain("query.refetch()");
    expect(source).toContain("Nenhum evento correspondente");
    expect(source).toContain("Nenhum estado alternativo foi presumido");
  });

  it("does not introduce browser-side operational decisions", () => {
    for (const forbidden of [
      "eventSeverity",
      "eventModule",
      "eventOperationalConsequence",
      "eventRecommendedAction",
      "Date.now()",
      "executeAction",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "ServiceOrdersPage.tsx"), "utf8");

describe("ServiceOrdersPage golden-standard composition", () => {
  it("uses the canonical shell, operational header and legitimate global CTA", () => {
    expect(page).toContain("<AppPageShell");
    expect(page).toContain("<AppOperationalHeader");
    expect(page).toContain("Nova O.S.");
    expect(page).toContain("disabled={customersQuery.isError}");
    expect(page).not.toContain("Hero executivo da O.S.");
    expect(page).not.toContain("Saúde operacional");
    expect(page).not.toContain("Maior risco");
  });

  it("keeps factual filters together and structurally stackable on small screens", () => {
    expect(page).toContain("<AppFiltersBar");
    expect(page).toContain("flex-col items-stretch");
    expect(page).toContain('id="service-order-search"');
    expect(page).toContain('ariaLabel="Filtrar por cliente"');
    expect(page).toContain('ariaLabel="Filtrar por responsável"');
    expect(page).toContain('ariaLabel="Filtrar por prazo"');
    expect(page).toContain('ariaLabel="Filtrar por prioridade"');
    expect(page).toContain('{ value: "P0", label: "Prioridade P0" }');
  });

  it("renders canonical main loading, error and legitimate empty states", () => {
    expect(page).toContain("<AppPageLoadingState");
    expect(page).toContain("<AppPageErrorState");
    expect(page).toContain("<AppPageEmptyState");
    expect(page).toContain("Nenhuma ordem encontrada");
    expect(page).toContain("Falha ao carregar ordens de serviço.");
  });

  it("preserves partial auxiliary failures without hiding the valid queue", () => {
    expect(page).toContain("Dados auxiliares parcialmente indisponíveis");
    expect(page).toContain("A lista principal continua disponível");
    expect(page).toContain("customersQuery.refetch()");
    expect(page).toContain("peopleQuery.refetch()");
  });

  it("keeps the official next action visible and secondary actions in the canonical menu", () => {
    expect(page).toContain('item.nextAction?.label ?? "Decisão indisponível"');
    expect(page).toContain("<AppRowActionsDropdown");
    expect(page).toContain('label: "Editar O.S."');
    expect(page).toContain('label: "Enviar WhatsApp"');
    expect(page).toContain('label: "Abrir cliente"');
  });

  it("isolates Timeline loading, error, empty and retry states", () => {
    expect(page).toContain('aria-labelledby="service-order-timeline-title"');
    expect(page).toContain("timelineQuery.isLoading");
    expect(page).toContain("timelineQuery.error");
    expect(page).toContain("Os fatos e ações da O.S. permanecem disponíveis");
    expect(page).toContain("timelineQuery.refetch()");
    expect(page).toContain("Sem eventos na Timeline");
    expect(page).not.toContain("Fallback contextual");
  });

  it("preserves legitimate monetary zero and never uses legacy routers", () => {
    expect(page).toContain("cents === null || cents === undefined");
    expect(page).toContain("Number(order.amountCents)");
    expect(page).not.toContain("linkedCharge?.amountCents ?? 0");
    expect(page).not.toContain("trpc.nexo.");
  });

  it("uses canonical fields, surfaces and dropdowns throughout the O.S. workspace", () => {
    expect(page).toContain("<AppInput");
    expect(page).toContain("<AppSelect");
    expect(page).toContain("<AppInfoCard");
    expect(page).toContain("<AppDropdown");
    expect(page).not.toContain("<details");
    expect(page).not.toContain("<article");
    expect(page).not.toContain("<select");
  });

});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/AppointmentsPage.tsx", "utf8");
const compact = source.replace(/\s+/g, " ");

describe("AppointmentsPage operational contract", () => {
  it("renders the operational-list hierarchy without placeholder decision panels", () => {
    const sections = [
      'title="Contexto da agenda"',
      'title="Filtros"',
      'title="Agenda operacional"',
      'title="Detalhe e evidências"',
      'aria-label="Navegação contextual de agendamentos"',
    ];
    sections.forEach(text => expect(source).toContain(text));
    sections
      .slice(1)
      .forEach((text, index) =>
        expect(source.indexOf(sections[index])).toBeLessThan(
          source.indexOf(text)
        )
      );
    expect(source).not.toContain("Atenção operacional indisponível");
    expect(source).not.toContain("Próxima ação indisponível");
    expect(source).not.toContain("Disponibilidade e capacidade indisponíveis");
  });

  it("separates legitimate zero from loading and unavailable context", () => {
    expect(compact).toContain("appointmentsQuery.isLoading ? (");
    expect(compact).toContain(") : appointmentsQuery.isError ? (");
    expect(compact).toContain("appointmentsQuery.isSuccess ? (");
    expect(source).toContain("factualCounts.total");
    expect(source).toContain(
      "A fonte principal de agendamentos está indisponível"
    );
  });

  it("keeps auxiliary failures inside the affected operation", () => {
    expect(source).toContain("Vínculos com O.S. indisponíveis");
    expect(source).toContain("Cadastro de clientes indisponível");
    expect(source).toContain("Responsáveis indisponíveis");
    expect(source).toContain(
      "Evidências indisponíveis; os fatos do agendamento permanecem visíveis"
    );
    expect(source).toContain("timelineQuery.refetch()");
  });

  it("exposes the primary row action and preserves legitimate secondary actions", () => {
    expect(compact).toMatch(
      /onClick=\{\(\) =>\s*void updateStatus\(row\.id, "CONFIRMED"\)/
    );
    [
      "Novo agendamento",
      "Abrir detalhe",
      "Editar/Remarcar",
      "Cancelar",
      "Abrir O.S.",
      "Criar O.S.",
      "Abrir cliente",
      "WhatsApp",
    ].forEach(action => expect(source).toContain(action));
    expect(source).toContain("<FormModal");
    expect(source).toContain("<CreateServiceOrderModal");
    expect(source).toContain("AppRowActionsDropdown");
  });

  it("uses only factual presentation filters and preserves official order", () => {
    expect(source).toContain('aria-label="Filtros de apresentação"');
    expect(source).toContain('aria-label="Filtrar por texto"');
    expect(source).toContain('aria-label="Filtrar por data"');
    expect(source).toContain('aria-label="Filtrar por responsável"');
    expect(source).toContain("Limpar filtros");
    expect(source).toContain("a ordem original do contrato é preservada");
  });

  it("does not calculate operational decisions locally", () => {
    expect(source).not.toMatch(/Date\.now\s*\(/);
    expect(source).not.toMatch(/new Date\s*\(\s*\)/);
    expect(source).not.toMatch(/\.sort\s*\(/);
    expect(source).not.toMatch(
      /riskScore|deriveAppointmentPriority|nextActionLabel|hasConflict|startsSoon|isOverdue|capacityRemaining|capacityUsage/i
    );
    expect(source).not.toMatch(/priorityOrder|riskOrder|conflict.*some\s*\(/i);
  });

  it("keeps the modal payload and assignment safeguards", () => {
    expect(compact).toContain(
      'assignedToPersonId: form.assignedToPersonId === "unassigned" ? null : form.assignedToPersonId'
    );
    expect(source).toContain("PersonAssignmentWarning");
    expect(source).toContain("assigneeWarningTelemetry.trackConfirmed");
    expect(source).toContain("expectedUpdatedAt");
  });

  it("uses the Nexo visual foundation and no forbidden visual system", () => {
    [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppFiltersBar",
      "AppStatusBadge",
      "AppPageLoadingState",
      "AppPageErrorState",
      "AppPageEmptyState",
    ].forEach(component => expect(source).toContain(component));
    expect(source).not.toMatch(/flowbite/i);
    expect(source).not.toMatch(/gradient|backdrop-blur|shadow-\[/i);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(source).not.toContain("dark:");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/AppointmentsPage.tsx", "utf8");

describe("AppointmentsPage operational contract", () => {
  it("renders the official decision hierarchy", () => {
    const sections = [
      "Contexto da agenda",
      "Disponibilidade e capacidade",
      "Atenção operacional oficial",
      "Próxima ação oficial",
      "Indicadores factuais",
      "Filtros de apresentação",
      "Agenda operacional",
      "Evidências e navegação contextual",
    ];
    sections.forEach(text => expect(source).toContain(text));
    sections
      .slice(1)
      .forEach((text, index) =>
        expect(source.indexOf(sections[index])).toBeLessThan(
          source.indexOf(text)
        )
      );
  });

  it("makes missing official contracts explicit", () => {
    expect(source).toContain("Disponibilidade e capacidade indisponíveis");
    expect(source).toContain("Atenção operacional indisponível");
    expect(source).toContain("Próxima ação indisponível");
    expect(source).toContain("Nenhum resultado é calculado no navegador");
    expect(source).toContain(
      "Status e horários não são convertidos em decisão"
    );
  });

  it("keeps auxiliary failure as an honest partial reading", () => {
    expect(source).toContain("Leitura parcial.");
    expect(source.replace(/\s+/g, " ")).toContain(
      "Os agendamentos disponíveis continuam fiéis à fonte principal"
    );
    expect(source.replace(/\s+/g, " ")).toContain(
      "Evidências indisponíveis; os fatos do agendamento permanecem visíveis"
    );
    expect(source).toContain("appointmentsQuery.isError");
  });

  it("preserves legitimate actions and official modal primitives", () => {
    [
      "Novo agendamento",
      "Abrir",
      "Confirmar",
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

  it("uses text, date, persisted status and responsible only as presentation filters", () => {
    expect(source).toContain('aria-label="Filtros de apresentação"');
    expect(source).toContain('aria-label="Filtrar por texto"');
    expect(source).toContain('aria-label="Filtrar por data"');
    expect(source).toContain('aria-label="Filtrar por responsável"');
    expect(source).toContain("statusFilter");
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

  it("uses the visual foundation and no forbidden visual system", () => {
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
  });
});

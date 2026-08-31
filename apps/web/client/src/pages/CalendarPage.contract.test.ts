import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/CalendarPage.tsx", "utf8");
const compact = source.replace(/\s+/g, " ");

describe("CalendarPage official temporal-exploration contract", () => {
  it("follows the official information hierarchy", () => {
    const labels = [
      "Navegação temporal",
      "Disponibilidade e capacidade oficiais",
      "Controles de visualização",
      "Indicadores factuais",
      "Filtrar por texto",
      "Grade do calendário",
      "Detalhe do evento selecionado",
      "Evidências e navegação contextual",
    ];
    labels.forEach(label => expect(source).toContain(label));
    labels
      .slice(1)
      .forEach((label, index) =>
        expect(source.indexOf(labels[index])).toBeLessThan(
          source.indexOf(label)
        )
      );
  });

  it("preserves day, week and month views plus explicit period navigation", () => {
    ["timeGridDay", "timeGridWeek", "dayGridMonth"].forEach(view =>
      expect(source).toContain(view)
    );
    expect(source).toContain('movePeriod("prev")');
    expect(source).toContain('movePeriod("today")');
    expect(source).toContain('movePeriod("next")');
    expect(source).toContain("datesSet={onDatesSet}");
  });

  it("keeps filters factual and presentational", () => {
    expect(source).toContain('aria-label="Filtrar por texto"');
    expect(source).toContain('aria-label="Filtrar por responsável"');
    expect(source).toContain('aria-label="Filtrar por status"');
    expect(source).toContain("item.assignedToPersonId === teamFilter");
    expect(source).toContain("item.status === statusFilter");
    expect(source).toContain("includes(search)");
  });

  it("reads official capacity and availability without calculating them", () => {
    expect(source).toContain("trpc.people.operationalSummary.useQuery");
    [
      "availabilityStatus",
      "capacityStatus",
      "appointmentCapacityUsagePct",
      "todayAppointmentsCount",
      "dailyAppointmentCapacity",
    ].forEach(field => expect(source).toContain(field));
    expect(source).toContain(
      "Capacidade e disponibilidade indisponíveis na fonte oficial"
    );
    expect(source).not.toMatch(/dailyAppointmentCapacity\s*-/);
    expect(source).not.toMatch(
      /todayAppointmentsCount\s*\/\s*person\.dailyAppointmentCapacity/
    );
    expect(source).not.toContain("capacityRemaining");
  });

  it("degrades auxiliary failures as an honest partial reading", () => {
    expect(source).toContain("Leitura parcial.");
    expect(source).toContain("partialSources");
    expect(source).toContain("officialCapacityQuery.isError");
    expect(compact).toContain(
      "A grade permanece baseada somente nos agendamentos retornados"
    );
  });

  it("preserves legitimate event and contextual actions", () => {
    [
      "Novo agendamento",
      "Abrir agendamento",
      "Editar / remarcar",
      "Confirmar no agendamento",
      "Cancelar no agendamento",
      "Abrir O.S.",
      "Abrir cliente",
      "Ver Agendamentos",
      "Abrir Timeline oficial",
    ].forEach(action => expect(source).toContain(action));
  });

  it("keeps time math limited to formatting, chronology and duration presentation", () => {
    expect(source).toContain("formatDateTime");
    expect(source).toContain("durationLabel");
    expect(compact).toMatch(
      /\.sort\( \(a, b\) => new Date\(a\.startsAt\)\.getTime\(\) - new Date\(b\.startsAt\)\.getTime\(\) \)/
    );
    expect(source).toContain(
      "Sobreposições são organizadas apenas pelo layout visual"
    );
    expect(source).toContain("nowIndicator");
    expect(source).not.toContain("Date.now");
  });

  it("has semantic guardrails against local operational decisions", () => {
    [
      "conflictIds",
      "delayedIds",
      "capacityRemaining",
      "OperationalRiskCard",
      "NextBestActionCard",
      "Próxima melhor ação",
      "Sem risco crítico",
      "Atraso detectado",
      "Conflito visual detectado",
      "sobrecarreg",
    ].forEach(forbidden => expect(source).not.toContain(forbidden));
  });

  it("uses the official visual foundation and a readable mobile list", () => {
    [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppFiltersBar",
      "AppStatusBadge",
      "AppPageLoadingState",
      "AppPageErrorState",
      "AppPageEmptyState",
      "CreateAppointmentModal",
    ].forEach(component => expect(source).toContain(component));
    expect(source).toContain("Agenda em lista para telas pequenas");
    expect(source).not.toContain("flowbite");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});

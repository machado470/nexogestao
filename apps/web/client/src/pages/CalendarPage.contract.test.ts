import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = () => readFileSync("client/src/pages/CalendarPage.tsx", "utf8");
const commandLayerSource = () =>
  readFileSync("client/src/components/app/OperationalCommandLayer.tsx", "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("CalendarPage operational time-control contract", () => {
  it("posiciona calendário como centro de controle do tempo, não Google Calendar genérico", () => {
    const calendar = source();

    expect(calendar).toContain("Centro de controle do tempo da operação");
    expect(calendar).toContain("Visão estratégica do tempo");
    expect(calendar).toContain("distribuição, conflitos, vazios e sobrecarga");
    expect(calendar).not.toContain("Google Calendar");
  });

  it("remove chips genéricos e mostra sinais reais no hero", () => {
    const calendar = source();

    expect(calendar).not.toContain("AGUARDANDO AÇÃO");
    expect(calendar).toContain("heroSignals");
    expect(calendar).toContain("atraso(s) detectado(s)");
    expect(calendar).toContain("sem responsável");
    expect(calendar).toContain("janelas livres");
    expect(calendar).toContain("conflitos");
    expect(calendar).toContain("Operação do tempo monitorada");
  });

  it("usa pipeline humanizado e helpers sem alterar o significado técnico", () => {
    const calendar = source();
    const normalized = compact(calendar);

    expect(normalized).toContain(
      "Tempo → Agendamentos → Responsáveis → Ordens de Serviço → Execução → Evidências → Governança"
    );
    for (const label of [
      'label: "Tempo"',
      'label: "Agendamentos"',
      'label: "Responsáveis"',
      'label: "Ordens de Serviço"',
      'label: "Execução"',
      'label: "Evidências"',
      'label: "Governança"',
    ]) {
      expect(calendar).toContain(label);
    }
    expect(calendar).toContain("Eventos preparados para execução");
    expect(calendar).toContain("Equipe vinculada aos eventos");
    expect(calendar).toContain("Eventos reais derivados do calendário");
    expect(calendar).toContain("Sinais antes de afetar o controle operacional");
  });

  it("mantém grade visual/fallback, painel lateral vivo e ficha operacional", () => {
    const calendar = source();

    expect(calendar).toContain("Calendário visual interativo");
    expect(calendar).toContain("periodSummary");
    expect(calendar).toContain("Ficha operacional do evento");
    expect(calendar).toContain("Cliente");
    expect(calendar).toContain("Serviço");
    expect(calendar).toContain("Horário");
    expect(calendar).toContain("Duração");
    expect(calendar).toContain("Responsável");
    expect(calendar).toContain("Próxima ação");
    expect(compact(calendar)).toContain("Exibindo próximo evento crítico");
  });

  it("usa CTAs seguros e não promete automação falsa", () => {
    const calendar = source();

    expect(calendar).toContain("Abrir agendamento");
    expect(calendar).toContain("Revisar agenda");
    expect(calendar).toContain("Ver semana");
    expect(calendar).toContain("Ver e vincular");
    expect(calendar).toContain("Abrir Timeline oficial");
    expect(calendar).toContain("Revisar capacidade");
    expect(calendar).toContain("Ver conflitos");
    expect(calendar).toContain("Ver janelas livres");
    expect(calendar).not.toContain("Agendamento #");
    expect(calendar).not.toContain("Confirmar");
    expect(calendar).not.toContain("Executar");
    expect(calendar).not.toContain("Automatizar");
    expect(calendar).not.toContain("Rebalancear equipe");
  });

  it("transforma distribuição em leitura operacional", () => {
    const calendar = source();

    expect(calendar).toContain("Eventos no período");
    expect(calendar).toContain("Preparados para executar");
    expect(calendar).toContain("Precisam de atenção");
    expect(calendar).toContain("Finalizados");
    expect(calendar).toContain("Cancelados");
    expect(calendar).toContain("Janelas livres");
  });

  it("não fabrica prova operacional nem expõe metadados técnicos na leitura principal", () => {
    const calendar = source();

    expect(calendar).toContain(
      "Fallback seguro: eventos derivados de agendamentos com datas reais; não substitui Timeline oficial."
    );
    expect(calendar).toContain(".slice(0, 5)");
    expect(calendar).toContain("tone:");
    expect(calendar).toContain('item.status === "NO_SHOW"');
    expect(calendar).toContain('item.status === "CANCELED"');
    expect(calendar).not.toContain("eventType");
    expect(calendar).not.toContain("payload");
    expect(calendar).not.toContain("metadata");
  });

  it("compacta alertas, reordena ficha e simplifica comandos", () => {
    const calendar = source();
    const normalized = compact(calendar);

    expect(calendar).toContain(".slice(0, 3)");
    expect(calendar).toContain("Consequência: pode impactar O.S. e prova");
    expect(
      normalized.indexOf('["Próxima ação", "Abrir agendamento"]')
    ).toBeLessThan(normalized.indexOf('"O.S."'));
    const commandLayer = commandLayerSource();
    expect(commandLayer).toContain("Problema");
    expect(commandLayer).toContain("Consequência");
    expect(commandLayer).not.toContain("Motivo:");
    expect(commandLayer).not.toContain("Impacto esperado");
  });

  it("declara grade operacional com período útil e janelas livres calculadas", () => {
    const calendar = source();

    expect(calendar).toContain("availabilityMarkers");
    expect(calendar).toContain("Janela livre calculada");
    expect(calendar).toContain('slotMinTime="07:00:00"');
    expect(calendar).toContain("businessHours");
    expect(calendar).toContain("não agendamento real");
  });

  it("preserva a grade com indisponibilidade parcial e filtros acessíveis", () => {
    const calendar = source();

    expect(calendar).toContain("Indisponibilidade parcial");
    expect(calendar).toContain("const isLoading = appointmentsQuery.isLoading");
    expect(calendar).toContain("const hasError = appointmentsQuery.isError");
    expect(calendar).toContain('aria-label="Período do calendário"');
    expect(calendar).toContain('aria-label="Filtrar por responsável"');
    expect(calendar).toContain('aria-label="Filtrar por status"');
    expect(calendar).toContain('aria-label="Filtrar por cliente"');
  });
});

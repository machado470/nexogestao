import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/AppointmentsPage.tsx", "utf8");
const selectedExperience = source.slice(source.indexOf("{selected ? ("));
const flowSource = source.slice(
  source.indexOf("const appointmentFlowStages"),
  source.indexOf("const appointmentTimelineEvents")
);
const embeddedTimelineSource = source.slice(
  source.indexOf("const appointmentTimelineEvents"),
  source.indexOf("function goToWhatsAppAppointment")
);

describe("AppointmentsPage as operational execution entry", () => {
  it("exposes the appointment executive hero and real operational CTAs", () => {
    expect(source).toContain("Hero executivo do agendamento");
    [
      "Abrir cliente",
      "Abrir agendamento",
      "Remarcar/editar",
      "Abrir O.S.",
      "Criar O.S.",
      "WhatsApp",
      "Abrir financeiro",
    ].forEach(cta => expect(source).toContain(cta));
    expect(source).toContain("md:text-5xl");
    expect(source).toContain("Data e hora");
    expect(source).toContain("Duração");
    expect(source).toContain("Sinal principal");
    expect(source).toContain("Próxima ação:");
  });

  it("uses one decision and next action block with human operational language", () => {
    expect(source).toContain("Decisão e próxima ação");
    expect(source).toContain("Estado operacional");
    expect(source).toContain("Maior risco agora");
    expect(source).toContain("Motivo:");
    expect(source).toContain("Impacto:");
    expect(source).toContain("Nota de segurança:");
    expect(source).not.toContain('title="Decisão do sistema"');
    expect(source).not.toContain("<NexoPriorityPanel");
    expect(source.match(/Decisão e próxima ação/g) ?? []).toHaveLength(1);
  });

  it("adds execution preparation between decision and the operational pipeline", () => {
    expect(source).toContain("Preparação da execução");
    [
      "Cliente vinculado",
      "Confirmação pendente",
      "Responsável definido",
      "O.S. vinculada",
      "Cobrança pendente",
      "Evidência/Timeline disponível",
      "Canal WhatsApp disponível",
      "Sem evidência oficial retornada",
    ].forEach(text => expect(source).toContain(text));
    expect(selectedExperience.indexOf("Decisão e próxima ação")).toBeLessThan(
      selectedExperience.indexOf("Preparação da execução")
    );
    expect(selectedExperience.indexOf("Preparação da execução")).toBeLessThan(
      selectedExperience.indexOf("Fluxo de entrada do agendamento")
    );
  });

  it("keeps the main pipeline limited to Cliente → Agendamento → O.S. → Cobrança → Pagamento", () => {
    ["Cliente", "Agendamento", "O.S.", "Cobrança", "Pagamento"].forEach(stage =>
      expect(flowSource).toContain(`label: "${stage}"`)
    );
    expect(source).toContain(
      "Cliente → Agendamento → O.S. → Cobrança → Pagamento"
    );
    expect(flowSource).not.toContain('label: "Timeline"');
    expect(flowSource).not.toContain('label: "Risco"');
    expect(flowSource).not.toContain('id: "timeline"');
    expect(flowSource).not.toContain('id: "risk"');
    expect(flowSource).toContain("Cliente vinculado");
    expect(source).toContain("Sem O.S.");
    expect(source).toContain("O.S. aberta");
    expect(source).toContain("Em execução");
    expect(source).toContain("Concluída");
    expect(source).toContain("Cobrança pendente");
    expect(source).toContain("Cobrança vencida");
    expect(source).toContain("Cobrança paga");
    expect(flowSource).toContain("Aguardando pagamento");
    expect(flowSource).toContain("Pagamento recebido");
  });

  it("orders selected detail and timeline before supporting operational list", () => {
    expect(
      selectedExperience.indexOf("Hero executivo do agendamento")
    ).toBeLessThan(selectedExperience.indexOf("Decisão e próxima ação"));
    expect(selectedExperience.indexOf("Decisão e próxima ação")).toBeLessThan(
      selectedExperience.indexOf("Preparação da execução")
    );
    expect(selectedExperience.indexOf("Preparação da execução")).toBeLessThan(
      selectedExperience.indexOf("Timeline humanizada do agendamento")
    );
    expect(
      selectedExperience.indexOf("Timeline humanizada do agendamento")
    ).toBeLessThan(
      selectedExperience.indexOf("Fluxo de entrada do agendamento")
    );
    expect(
      selectedExperience.indexOf("Timeline humanizada do agendamento")
    ).toBeLessThan(
      selectedExperience.indexOf("Outros agendamentos da operação")
    );
    expect(
      selectedExperience.indexOf("Timeline humanizada do agendamento")
    ).toBeLessThan(selectedExperience.indexOf("Radar operacional"));
  });

  it("humanizes embedded timeline events and hides raw technical fields", () => {
    [
      "Agendamento criado",
      "Agendamento confirmado",
      "Agendamento alterado",
      "Agendamento cancelado",
      "O.S. criada",
      "Mensagem enviada",
      "Cobrança criada",
      "Evento operacional registrado",
    ].forEach(text => expect(source).toContain(text));
    expect(embeddedTimelineSource).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(embeddedTimelineSource).not.toContain("metadata");
    expect(embeddedTimelineSource).not.toContain("entityId");
    expect(embeddedTimelineSource).not.toContain("eventType cru");
  });

  it("keeps operational summary, honest incidents, empty filter copy and no fake automation", () => {
    [
      "Hoje",
      "Confirmados",
      "Não confirmados",
      "Atrasados",
      "Concluídos",
    ].forEach(metric => expect(source).toContain(metric));
    expect(source).toContain("Radar operacional");
    expect(source).toContain("Resolver");
    expect(source).not.toContain("Resolver incidente");
    expect(source).toContain('title="Resumo operacional"');
    expect(source).toContain("text-[1.65rem]");
    expect(source).toContain("px-3 py-2 text-left");
    expect(source).toContain("relative z-30 shrink-0 gap-2 overflow-visible");
    expect(source).toContain("absolute right-0 z-50 mt-2 grid");
    expect(source).toContain(
      "Fonte atual não entrega resposta do cliente nesta tela"
    );
    expect(source).toContain("Nenhum agendamento para o filtro atual");
    expect(source).toContain("não cria fluxo novo de comunicação");
    expect(source).not.toContain("automação automática");
    expect(source).not.toContain("disparo automático");
  });
});

describe("AppointmentsPage final polish guardrails", () => {
  it("mantém filtros completos e degrada apenas fontes complementares", () => {
    expect(source).toContain('aria-label="Filtrar por cliente"');
    expect(source).toContain('aria-label="Filtrar por responsável"');
    expect(source).toContain('customerFilter !== "all"');
    expect(source).toContain("Indisponibilidade parcial");
    expect(source).toContain("const loading = appointmentsQuery.isLoading");
    expect(source).toContain("const hasError = appointmentsQuery.isError");
    expect(source).toContain('params.get("appointmentId") ?? params.get("id")');
    expect(source).toContain('queryParams.action !== "reschedule"');
    expect(source).toContain("const timelineCustomerId = useMemo");
    expect(source).toContain("{ customerId: timelineCustomerId, limit: 25 }");
  });

  it("does not duplicate the open appointment CTA across operational sections", () => {
    expect(source.match(/>\s*Abrir agendamento\s*</g) ?? []).toHaveLength(1);
  });

  it("keeps wallet as compact command-center lines instead of an administrative table", () => {
    expect(source).toContain("Outros agendamentos da operação");
    expect(source).toContain("Carteira operacional de agendamentos");
    expect(source).toContain("lg:grid-cols-[150px_1.4fr_1fr_150px_220px]");
    expect(source).toContain("walletNeedsInternalScroll");
    expect(source).toContain('data-contract-wallet-dynamic-height="true"');
    expect(source).toContain(
      'data-contract-wallet-scroll-only-when-many="true"'
    );
    expect(source).toContain("max-h-[560px] overflow-y-auto pr-1");
    expect(source).not.toContain("<thead>");
    expect(source).not.toContain("<th>");
    expect(source).not.toContain("AppDataTable");
  });

  it("does not expose raw backend identifiers or enum states in operational slices", () => {
    const operatorFacingSource = `${flowSource}\n${embeddedTimelineSource}`;
    expect(operatorFacingSource).not.toMatch(
      /\b(?:IN_PROGRESS|PENDING|COMPLETED|CANCELLED|FAILED|PROCESSING)\b/
    );
    expect(operatorFacingSource).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(operatorFacingSource).not.toMatch(/\b[a-f0-9]{12,}\b/i);
  });
});

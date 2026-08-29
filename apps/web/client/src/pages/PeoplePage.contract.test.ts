import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PeoplePage.tsx", import.meta.url),
  "utf8"
);
const editModal = readFileSync(
  new URL("../components/EditPersonModal.tsx", import.meta.url),
  "utf8"
);
const compactSource = source.replace(/\s+/g, " ");

describe("PeoplePage human operation center contract", () => {
  it("mantém apenas quatro áreas principais na narrativa operacional", () => {
    [
      "Centro de Responsáveis da Operação",
      'title="Fluxo humano-operacional"',
      'title="Agora na operação"',
      'title="Saúde da equipe"',
    ].forEach(text => expect(source).toContain(text));
    expect(source).not.toContain('title="O que fazer agora"');
    expect(source).not.toContain('title="Capacidade da operação"');
    expect(source).not.toContain('title="Evolução da equipe"');
  });

  it("funde hero e responsável quando há uma única pessoa", () => {
    expect(source).toContain("people.length === 1 && leadPerson");
    expect(source).toContain('data-testid="people-single-responsible-hero"');
    expect(source).toContain("é a responsável ativa pela execução");
    expect(source).toContain(
      "Nenhum atraso, sobrecarga ou indisponibilidade exige intervenção"
    );
    expect(source).toContain("Responsável ativa pela execução");
    expect(source).toContain("text-3xl font-semibold tracking-tight");
    expect(source).toContain(
      "Carga {leadPerson.serviceOrderCapacityUsagePct ?? 0}%"
    );
    expect(source).toContain("Última atividade:");
    expect(source).toContain("Ver detalhe");
    expect(source).toContain("Timeline");
    expect(source).toContain("Nova pessoa");
  });

  it("não duplica responsável único, ranking nem filtros para baixo volume", () => {
    expect(source).toContain("shouldShowSupportingPeople = people.length > 1");
    expect(source).toContain("shouldShowPeopleFilters = people.length > 3");
    expect(source).toContain("{shouldShowSupportingPeople ? (");
    expect(source).toContain("{shouldShowPeopleFilters ? (");
    expect(source).toContain("people.length > 1 ?");
    expect(source).not.toContain("<AppDataTable");
  });

  it("mostra empty state operacional forte para zero responsáveis sem saúde falsa", () => {
    expect(source).toContain('data-testid="people-empty-hero"');
    expect(source).toContain("Sem responsáveis operacionais");
    expect(source).toContain(
      "Cadastre responsáveis para que O.S., agendamentos e execução"
    );
    expect(compactSource).toContain("header.totalPeople === 0 ? null");
    expect(compactSource).toContain(
      'people.length === 0 ? "sem dono operacional"'
    );
  });

  it("renderiza fluxo humano-operacional conectado com zeros honestos", () => {
    expect(source).toContain(
      "Como as pessoas sustentam agenda, O.S., cobranças e evidências do Nexo."
    );
    expect(source).toContain("<OperationalFlow");
    expect(source).toContain('variant="rail"');
    expect(source).toContain('label: "Responsáveis"');
    expect(source).toContain('label: "Agendamentos"');
    expect(source).toContain("value: `${header.todayAppointments} hoje`");
    expect(source).toContain('label: "O.S."');
    expect(source).toContain("value: `${header.openServiceOrders} ativas`");
    expect(source).toContain("formatMoneyFallback()");
    expect(source).toContain('label: "Timeline"');
    expect(source).toContain("sem dado financeiro inventado");
  });

  it("funde próxima ação e último evento em Agora na operação", () => {
    expect(source).toContain('title="Agora na operação"');
    expect(source).toContain(
      "Ação recomendada conectada ao último acontecimento relevante."
    );
    expect(source).toContain('data-testid="people-healthy-next-action"');
    expect(source).toContain("✓ Equipe equilibrada");
    expect(source).toContain("Nenhuma intervenção necessária neste momento.");
    expect(source).toContain('display="compactHealthy"');
    expect(source).toContain(
      'variant={hasOperationalProblem ? "default" : "compact"}'
    );
    expect(source).toContain('data-testid="people-team-activity"');
    expect(source).toContain("Último evento:");
    expect(source).toContain("Operação voltou ao estado saudável");
    expect(source).toContain(
      "Governança reavaliou a equipe e manteve a leitura"
    );
  });

  it("compacta capacidade, evolução e sinais dentro de Saúde da equipe", () => {
    expect(source).toContain('title="Saúde da equipe"');
    expect(source).toContain("Capacidade sob controle");
    expect(source).toContain("Gargalos atuais de capacidade");
    expect(source).toContain("sem gargalos · sem indisponibilidades previstas");
    expect(source).toContain("hasCompactTeamHealth");
    expect(source).toContain('data-testid="people-compact-team-health"');
    expect(source).toContain(
      "histórico ainda em formação · nenhum alerta recente"
    );
    expect(compactSource).toContain("!hasCompactTeamHealth ? (");
    expect(compactSource).toContain(
      "Ainda não existe histórico suficiente para gerar indicadores confiáveis."
    );
    expect(source).toContain("sem inventar métricas");
    expect(source).toContain("Abrir Timeline");
    expect(source).toContain(
      "Nenhum alerta de atribuição registrado recentemente."
    );
    expect(source).toContain(
      'data-testid="people-capacity-availability-assignments"'
    );
    expect(source).toContain('data-testid="people-performance-impact"');
    expect(source).toContain('data-testid="assignee-warning-summary"');
  });

  it("humaniza timeline e preserva fallbacks honestos sem enum cru", () => {
    expect(source).toContain("timelineActionLabels");
    expect(source).toContain("unsafeTimelineEnumPattern");
    expect(source).toContain("humanizeTimelineText");
    expect(source).toContain("Evento operacional registrado");
    expect(source).toContain("Aguardando vínculo financeiro");
    expect(source).toContain('value == null ? "Não configurada"');
    expect(source).toContain('value == null ? "Uso indisponível"');
    expect(source).not.toContain("Math.random");
  });

  it("consome status e prioridade autoritativos sem reclassificar operação no frontend", () => {
    const peopleRouter = readFileSync(
      new URL("../../../server/routers/people.ts", import.meta.url),
      "utf8"
    );

    expect(peopleRouter).toContain(
      'operationalStatus: z.enum(["NORMAL", "ATENÇÃO", "RISCO", "CRÍTICO"])'
    );
    expect(peopleRouter).toContain(
      'priority: z.enum(["P0", "P1", "P2", "P3"])'
    );

    expect(source).not.toContain("function derivePersonOperationalStatus(");
    expect(source).not.toContain("function derivePersonPriority(");

    expect(source).not.toContain(
      "header.overdueServiceOrders >= 5 || header.overloadedPeople >= 2"
    );

    expect(source).toContain("person.operationalStatus");
    expect(source).toContain("person.priority");
    expect(source).toContain("operationalStatus: AppOperationalStatus;");
    expect(source).toContain("priority: AppPriorityLevel;");
    expect(source).toContain(
      "const teamHealth = deriveTeamHealth(people, header);"
    );
    expect(source).toContain(
      'people.some(person => person.operationalStatus !== "NORMAL")'
    );
  });

  it("consome contrato operacional consolidado sem reclassificação local", () => {
    expect(source).toContain("operationalStatus: AppOperationalStatus;");
    expect(source).toContain("priority: AppPriorityLevel;");
    expect(source).toContain("interventionReason: string | null;");
    expect(source).toContain("recommendedActionLabel: string | null;");
    expect(source).toContain("operationalSummaryText?: string | null");
    expect(source).toContain("capacitySummaryText?: string | null");
    expect(source).toContain("riskSummaryText?: string | null");
    expect(source).toContain("activeCustomersCount: number");
    expect(source).toContain("nextAppointments: PersonNextAppointment[]");
    expect(source).toContain("completedServiceOrdersCount: number");
    expect(source).toContain("lastEvents: PersonTimelineEvent[]");
    expect(source).toContain('data-testid="people-linked-customers"');
    expect(source).toContain('data-testid="people-next-appointments"');
    expect(source).toContain('data-testid="people-recent-execution"');
    expect(source).toContain('data-testid="people-operational-proof"');
    expect(source).toContain('data-testid="people-individual-risk"');
    expect(source).toContain('data-testid="people-recommended-action"');
  });

  it("usa recomendação operacional do backend e deixa o frontend apenas rotear a ação", () => {
    const peopleRouter = readFileSync(
      new URL("../../../server/routers/people.ts", import.meta.url),
      "utf8"
    );

    expect(peopleRouter).toContain(
      "interventionReason: z.string().nullable()"
    );
    expect(peopleRouter).toContain(
      "recommendedActionLabel: z.string().nullable()"
    );
    expect(peopleRouter).toMatch(
      /recommendedActionTarget:\s*z\s*\.enum\(\["PERSON", "SERVICE_ORDERS", "APPOINTMENTS", "TIMELINE"\]\)\s*\.nullable\(\)/
    );

    expect(source).not.toContain("function buildPeopleNextBestAction(");
    expect(source).not.toContain("const overduePerson =");
    expect(source).not.toContain("const overloadedPerson =");
    expect(source).not.toContain("const unavailablePerson =");

    expect(source).not.toContain('"Resolver atrasos atribuídos"');
    expect(source).not.toContain('"Redistribuir carga"');
    expect(source).not.toContain('"Revisar disponibilidade"');

    expect(source).toContain("person.recommendedActionLabel");
    expect(source).toContain("person.recommendedActionTarget");
    expect(source).toContain("person.interventionReason");
    expect(source).toContain("function recommendedActionHandler(");
    expect(source).toContain(
      'person.recommendedActionTarget === "TIMELINE"'
    );
  });

  it("renderiza blocos opcionais de financeiro relacionado e comunicação atribuída sem comissão ou venda inventada", () => {
    expect(source).toContain('data-testid="people-related-finance"');
    expect(source).toContain('data-testid="people-related-finance-empty"');
    expect(source).toContain('data-testid="people-attributed-communication"');
    expect(source).toContain("receivedAmountFromAssignedServiceOrders");
    expect(source).toContain("pendingAmountFromAssignedServiceOrders");
    expect(source).toContain("overdueAmountFromAssignedServiceOrders");
    expect(source).toContain("financeAttributionNote");
    expect(source).toContain("assignedConversationsCount");
    expect(source).toContain("failedMessagesCount");
    expect(source).toContain("lastConversationAt");
    expect(source).toContain("não são comissão nem venda atribuída");
    expect(source).not.toContain("produtividade financeira individual");
  });

  it("mantém sinais de atribuição com erro parcial e retry", () => {
    expect(source).toContain('data-testid="assignee-warning-summary-error"');
    expect(source).toContain("Sinais de atribuição indisponíveis agora.");
    expect(source).toContain(
      "A visão principal continua usando carga, agenda e O.S."
    );
    expect(source).toContain("Tentar novamente");
  });

  it("preserva edição de capacidade e indisponibilidade sem nova mutação operacional", () => {
    expect(editModal).toContain("dailyServiceOrderCapacity,");
    expect(editModal).toContain("dailyAppointmentCapacity,");
    expect(editModal).toContain(
      "workloadNotes: formData.workloadNotes.trim() || null"
    );
    expect(source).toContain(
      "trpc.people.createAvailabilityException.useMutation"
    );
    expect(source).toContain(
      "trpc.people.deleteAvailabilityException.useMutation"
    );
    expect(source).toContain("createAvailabilityException.mutate({");
    expect(source).toContain("deleteAvailabilityException.mutate({");
    expect(source).not.toContain("trpc.people.redistribute");
  });
});

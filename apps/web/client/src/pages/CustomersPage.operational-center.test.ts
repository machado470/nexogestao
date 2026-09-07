import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/CustomersPage.tsx", "utf8");
const commandLayerSource = readFileSync(
  "client/src/components/app/OperationalCommandLayer.tsx",
  "utf8"
);
const embeddedTimelineSource = source.slice(
  source.indexOf("<NexoEvidenceTimeline")
);
describe("CustomersPage operational client center", () => {
  it("follows the official operational hierarchy", () => {
    const markers = [
      "Centro Operacional do Cliente",
      "AppOperationalHeader",
      "Decisão e próxima ação",
      'aria-label="Filtros de apresentação"',
      "Carteira operacional",
      "Evidências e navegação contextual",
    ];
    markers.forEach(marker => expect(source).toContain(marker));
  });

  it("shows unavailable decision instead of inferring normality", () => {
    expect(source).toContain("Decisão operacional indisponível");
    expect(source).toContain("Estado operacional indisponível");
    expect(source).toContain(
      "O resumo operacional oficial não está disponível para este cliente."
    );
  });

  it("keeps only text and registration status as presentation filters", () => {
    expect(source).toContain("Presentation-only transformation");
    expect(source).toContain(
      'type CustomerFilter = "all" | "active" | "inactive"'
    );
    expect(source).toContain("profile.customer.active !== true");
    expect(source).toContain("profile.customer.active !== false");
    expect(source).not.toContain("parseCurrencyFilterToCents");
    expect(source).not.toContain("parseDateFilterBoundary");
    expect(source).not.toContain('activeFilter === "risk"');
  });

  it("guards against local thresholds, rankings and next-action calculation", () => {
    expect(source).not.toMatch(/riskScore\s*[-+<>=]/);
    expect(source).not.toMatch(/sort\([^)]*priority/);
    expect(source).not.toMatch(/sil[eê]ncio prolongado/i);
    expect(source).toContain(
      "selectedOperationalSummary?.recommendedActionLabel"
    );
    expect(source).toContain("summary?.recommendedActionTarget");
  });

  it("positions Clientes as the customer operational center", () => {
    expect(source).toContain("Centro Operacional do Cliente");
    expect(source).toContain("Hero Executivo do Cliente");
    expect(source).toContain("Sinal principal:");
    expect(source).toContain("Decisão e próxima ação");
    expect(source).not.toContain("Saúde do cliente");
    expect(source).not.toContain("Mini-dashboard com financeiro");
  });

  it("moves the selected customer experience before the operational wallet", () => {
    expect(source).toContain('"grid grid-cols-1 gap-4 2xl:grid-cols-12"');
    expect(source).toContain('selectedProfile ? "order-1" : undefined');
    expect(source).toContain('"order-1 2xl:col-span-12"');
    expect(source).toContain('"order-2 2xl:col-span-12"');
    expect(source).toContain("Outros clientes da carteira");
  });

  it("uses one combined decision/action block instead of separated decision and NBA blocks", () => {
    expect(source).toContain("Decisão e próxima ação");
    expect(source).not.toContain('title="Decisão do sistema"');
    expect(source).not.toContain("Próxima melhor ação");
    expect(source).not.toContain("<NexoPriorityPanel");
    expect(source).not.toContain('title="Resumo do cliente"');
    expect(source).not.toContain("<AppStatCard");
    expect(source).not.toContain("<AppNextBestActionBlock");
    expect(source).not.toContain("primaryIntervention");
    expect(source).not.toContain("detectOperationalInterventions");
  });

  it("does not reconstruct a customer pipeline from auxiliary data", () => {
    expect(source).not.toContain("<NexoOperationalPipeline");
    expect(source).not.toContain("customerOperationalFlowStages");
    expect(source).toContain(
      "Preserve the order returned by the workspace contract"
    );
    expect(source).not.toContain("Date.now()");
  });

  it("humanizes the embedded customer timeline and does not render raw technical identifiers", () => {
    expect(source).toContain("Mensagem enviada");
    expect(source).toContain("Contato operacional registrado com o cliente.");
    expect(source).toContain("Agendamento criado");
    expect(source).toContain("O.S. concluída");
    expect(source).toContain("Pagamento registrado no histórico do cliente.");
    expect(commandLayerSource).toContain("getEvidenceTimelineIcon");
    expect(embeddedTimelineSource).not.toContain("MESSAGE_SENT");
    expect(embeddedTimelineSource).not.toContain("WHATSAPP_MESSAGE_SENT");
    expect(embeddedTimelineSource).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(embeddedTimelineSource).not.toContain("eventType");
    expect(embeddedTimelineSource).not.toContain("entityId");
  });

  it("keeps WhatsApp inline condensed and exposes real primary CTAs", () => {
    expect(source).not.toContain("<textarea");

    const heroStart = source.indexOf("Hero Executivo do Cliente");
    const decisionStart = source.indexOf("Decisão e próxima ação", heroStart);
    const heroSource = source.slice(heroStart, decisionStart);

    ["Abrir WhatsApp", "Agendar", "Nova O.S.", "Cobrar"].forEach(cta =>
      expect(heroSource).toContain(cta)
    );

    expect(heroSource).toContain("openCustomerWhatsApp");
    expect(heroSource).toContain("setCreateAppointmentOpen(true)");
    expect(heroSource).toContain("setCreateServiceOrderOpen(true)");
    expect(heroSource).toContain(
      "navigate(`/finances?customerId=${activeCustomerId}`)"
    );

    expect(source).toContain("Ver timeline");
  });

  it("shows service-order ownership and delay in the operational wallet", () => {
    expect(source).toContain("Responsável / atraso");
    expect(source).toContain("activeServiceOrder");
    expect(source).toContain("getServiceOrderResponsibleName");
    expect(source).toContain("formatServiceOrderDelay");
    expect(source).toContain("assignedToPersonId");
    expect(source).toContain("Atraso:");
    expect(source).toContain("Sem responsável");
    expect(source).toContain("Responsável não identificado");
    expect(source).toContain("Sem O.S. aberta");
  });

  it("exposes canonical active and inactive customer filters", () => {
    expect(source).toContain('| "active"');
    expect(source).toContain('| "inactive"');
    expect(source).toContain('{ key: "active", label: "Ativos" }');
    expect(source).toContain('{ key: "inactive", label: "Inativos" }');
    expect(source).toContain(
      'activeFilter === "active" && profile.customer.active !== true'
    );
    expect(source).toContain(
      'activeFilter === "inactive" && profile.customer.active !== false'
    );
  });

  it("shows active status separately from operational health", () => {
    expect(source).toContain(
      "function getCustomerActiveStatus(active: unknown)"
    );
    expect(source).toContain('label: "Ativo"');
    expect(source).toContain('label: "Inativo"');
    expect(source).toContain('label: "Status não informado"');
    expect(source).toContain(
      "{...getCustomerActiveStatus(profile.customer.active)}"
    );
    expect(source).toContain(
      "getCustomerActiveStatus(\n                                  profile.customer.active"
    );
  });

  it("shows canonical last completed service and next appointment together", () => {
    expect(source).toContain(
      'order => String(order.status ?? "").toUpperCase() === "COMPLETED"'
    );
    expect(source).toContain("const lastService = serviceOrders.find(");
    expect(source).toContain("lastService,");
    expect(source).not.toContain("lastService: serviceOrders[0]");
    expect(source).toContain('Último serviço:{" "}');
    expect(source).toContain('Próximo agendamento:{" "}');
    expect(source).toContain("Sem serviço concluído");
    expect(source).toContain("Sem agenda futura");
    expect(source).toContain(
      "profile.lastService.updatedAt ??\n                                      profile.lastService.createdAt"
    );
  });

  it("shows the canonical last completed service in the customer hero", () => {
    const heroStart = source.indexOf("Hero Executivo do Cliente");
    const decisionStart = source.indexOf("Decisão e próxima ação", heroStart);
    const heroSource = source.slice(heroStart, decisionStart);

    expect(heroSource).toContain('title="Último serviço"');
    expect(heroSource).toContain("workspaceLastCompletedServiceOrder");
    expect(heroSource).toContain(
      "workspaceLastCompletedServiceOrder.updatedAt ??"
    );
    expect(heroSource).toContain(
      "workspaceLastCompletedServiceOrder.createdAt"
    );
    expect(heroSource).toContain('"Sem serviço concluído"');
    expect(heroSource).toContain('ctaLabel="Ver O.S."');
  });

  it("preserves canonical total spent, including legitimate zero", () => {
    expect(source).toContain("totalSpentCents?: number;");
    expect(source).toContain("raw.totalSpentCents !== null");
    expect(source).toContain("raw.totalSpentCents !== undefined");
    expect(source).toContain(
      "const workspaceTotalSpentCents = workspace.totalSpentCents"
    );
    expect(source).toContain('title="Total gasto"');
    expect(source).toContain("workspaceTotalSpentCents === undefined");
    expect(source).toContain("formatCurrency(workspaceTotalSpentCents)");
    expect(source).toContain('"Financeiro indisponível"');
  });

  it("keeps the operational wallet command-centered with real CTAs", () => {
    expect(source).toContain("Carteira operacional");
    expect(source).toContain("Contexto / status");
    expect(source).toContain("Próxima ação");
    expect(source).toContain("Financeiro");
    expect(source).toContain("Mais ações");
    expect(source).toContain("AppPagination");
  });

  it("keeps auxiliary failures non-blocking without overriding authoritative operational health", () => {
    expect(source).toContain("Leitura operacional parcial");
    expect(source).toContain("Clientes carregados, mas");
    expect(source).toContain("Estado operacional e risco");
    expect(source).toContain("resumo oficial");
    expect(source).toContain("unavailableAuxiliaryData");
    expect(source).toContain("hasIncompleteOperationalData");
    expect(source).toContain('label: "cobranças"');
    expect(source).toContain('label: "ordens de serviço"');
    expect(source).toContain('label: "agendamentos"');
    expect(source).toContain("Tentar novamente");
    expect(source).toContain("renderAuthoritativeCustomerStatus");
    expect(source).toContain("customersOperationalSummaryQuery");
    expect(source).not.toContain('label: "Leitura parcial"');
    expect(source).toContain("Financeiro indisponível");
    expect(source).toContain("O.S. indisponíveis");
    expect(source).toContain("Agenda indisponível");
  });

  it("does not block already loaded customers while auxiliary data is loading", () => {
    expect(source).toContain("Complementando sinais operacionais");
    expect(source).toContain("pendingAuxiliaryData");
    expect(source).toContain("de completar os detalhes auxiliares da carteira");
    expect(source).toContain('aria-live="polite"');
  });

  it("filters only by factual registration state and official decision fields", () => {
    expect(source).toContain('id="customer-priority-filter"');
    expect(source).toContain('id="customer-risk-filter"');
    expect(source).toContain(
      "profile.operationalSummary?.priority !== priorityFilter"
    );
    expect(source).toContain(
      "profile.operationalSummary?.riskState !== riskFilter"
    );
    expect(source).not.toContain("differenceInDays");
  });

  it("isolates Timeline loading, empty and error states from customer data", () => {
    expect(source).toContain("trpc.timeline.listByCustomer.useQuery");
    expect(source).toContain("timelineQuery.isLoading");
    expect(source).toContain("timelineQuery.error");
    expect(source).toContain("Tentar Timeline novamente");
    expect(source).toContain(
      "Os dados e as ações do cliente permanecem acessíveis"
    );
  });
});

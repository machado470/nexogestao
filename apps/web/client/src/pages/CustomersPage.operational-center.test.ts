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
  it("positions Clientes as the customer operational center", () => {
    expect(source).toContain("Centro Operacional do Cliente");
    expect(source).toContain("Hero Executivo do Cliente");
    expect(source).toContain("Sinal principal:");
    expect(source).toContain("Decisão e próxima ação");
    expect(source).toContain("Painel operacional do cliente");
    expect(source).toContain("Mini-dashboard com financeiro");
    expect(source).toContain("saúde do cliente.");
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

  it("keeps the client pipeline focused on operational flow instead of raw cadastro", () => {
    ["Cliente", "Agendamento", "O.S.", "Cobrança", "Pagamento"].forEach(stage =>
      expect(source).toContain(`label: "${stage}"`)
    );
    expect(source).toContain(
      "Cliente → Agendamento → O.S. → Cobrança → Pagamento"
    );
    expect(source).toContain("Editar cadastro");
    expect(source).not.toContain('id: "timeline"');
    expect(source).not.toContain('id: "risk"');
    expect(source).not.toContain(
      'selectedProfile?.contact ?? "Cadastro carregado."'
    );
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
    expect(source).toContain("function getCustomerActiveStatus(active: unknown)");
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

  it("filters customers by pending balance value range", () => {
    expect(source).toContain(
      "function parseCurrencyFilterToCents(value: string)"
    );
    expect(source).toContain('"nexo.customers.balance-min.v2"');
    expect(source).toContain('"nexo.customers.balance-max.v2"');
    expect(source).toContain("profile.pendingCents < minBalanceCents");
    expect(source).toContain("profile.pendingCents > maxBalanceCents");
    expect(source).toContain('placeholder="Mín. R$"');
    expect(source).toContain('placeholder="Máx. R$"');
    expect(source).toContain("Saldo financeiro");
    expect(source).toContain("Limpar intervalo de valor");
    expect(source).toContain("Mais filtros · valor");
  });

  it("filters customers by last operational activity period", () => {
    expect(source).toContain("function parseDateFilterBoundary(");
    expect(source).toContain('"nexo.customers.period-start.v2"');
    expect(source).toContain('"nexo.customers.period-end.v2"');
    expect(source).toContain(
      "const lastInteractionTimestamp = profile.lastInteractionAt?.getTime()"
    );
    expect(source).toContain(
      "lastInteractionTimestamp < periodStartTimestamp"
    );
    expect(source).toContain(
      "lastInteractionTimestamp > periodEndTimestamp"
    );
    expect(source).toContain("Última atividade");
    expect(source).toContain('aria-label="Período inicial"');
    expect(source).toContain('aria-label="Período final"');
    expect(source).toContain("Limpar período");
    expect(source).toContain("Mais filtros · período");
  });

  it("shows canonical last completed service and next appointment together", () => {
    expect(source).toContain(
      'order => String(order.status ?? "").toUpperCase() === "COMPLETED"'
    );
    expect(source).toContain("const lastService = serviceOrders.find(");
    expect(source).toContain("lastService,");
    expect(source).not.toContain("lastService: serviceOrders[0]");
    expect(source).toContain("context: profile.activeServiceOrder");
    expect(source).toContain('Último serviço:{" "}');
    expect(source).toContain('Próximo agendamento:{" "}');
    expect(source).toContain("Sem serviço concluído");
    expect(source).toContain("Sem agenda futura");
    expect(source).toContain(
      "profile.lastService.updatedAt ??\n                                      profile.lastService.createdAt"
    );
  });

  it("shows an explicit badge for customers in the first 30 days", () => {
    expect(source).toContain("const customerNewWindowDays = 30;");
    expect(source).toContain("function isNewCustomer(customer: Customer)");
    expect(source).toContain("const createdAt = toDate(customer.createdAt)");
    expect(source).toContain(
      "const windowMs = customerNewWindowDays * 24 * 60 * 60 * 1000"
    );
    expect(source).toContain("return ageMs >= 0 && ageMs <= windowMs");
    expect(
      source.match(/AppStatusBadge label="Novo" tone="info"/g)?.length
    ).toBe(2);
  });

  it("keeps the operational wallet command-centered with real CTAs", () => {
    expect(source).toContain("Carteira operacional");
    expect(source).toContain("Contexto / status");
    expect(source).toContain("Próxima ação");
    expect(source).toContain("Financeiro");
    expect(source).toContain("Mais ações");
    expect(source).toContain("AppPagination");
  });
});

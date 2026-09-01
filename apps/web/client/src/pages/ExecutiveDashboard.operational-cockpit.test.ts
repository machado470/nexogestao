import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ExecutiveDashboard decision center", () => {
  const source = readFileSync(
    "client/src/pages/ExecutiveDashboard.tsx",
    "utf8"
  );

  it("renders the operational structure in decision order", () => {
    const sections = [
      "Operação hoje",
      "Atenção imediata",
      "Próxima melhor ação",
      "KPIs operacionais",
      "Fluxo operacional",
      "Fila operacional",
      "Pulso da operação",
      "Acessos rápidos contextuais",
    ];
    sections.forEach(section => expect(source).toContain(section));
    const renderedSections = sections
      .slice(1)
      .map(section =>
        source.search(new RegExp(`<AppSectionBlock\\s+title="${section}"`))
      );
    renderedSections.forEach((position, index) => {
      expect(position).toBeGreaterThan(-1);
      if (index > 0)
        expect(position).toBeGreaterThan(renderedSections[index - 1]);
    });

    expect(source).not.toContain('title="Bloco executivo"');

    const governancePosition = source.indexOf("<NexoGovernanceDecisionCard");
    const pulsePosition = source.indexOf('title="Pulso da operação"');

    expect(governancePosition).toBeGreaterThan(pulsePosition);
  });

  it("limits immediate attention and the queue instead of rendering giant lists", () => {
    expect(source).toContain(".slice(0, 5)");
    expect(source).toContain(".slice(0, 10)");
    expect(source).not.toContain("<table");
    expect(source).toContain("Impacto: {item.impact}");
    expect(source).toContain("Responsável:");
    expect(source).not.toContain("Motivo:</strong>");
  });

  it("keeps zero and missing states honest without repeating noisy fallbacks", () => {
    expect(source).toContain("Sem pagamentos registrados no período.");
    expect(source).toContain("Evidência: ${stage.evidence.description}");
    expect(source).toContain(
      "Alguns itens não retornaram responsável pela fonte atual."
    );
    expect(source).toContain("Responsável não informado");
    expect(source).toContain("item.responsibleMissing");
  });

  it("uses the real next best action endpoint and an honest empty state", () => {
    expect(source).toContain("trpc.dashboard.nextBestAction.useQuery");
    expect(source).toContain("Nenhuma ação prioritária encontrada.");
    expect(source).toContain(
      "Nenhuma ação prioritária retornada para o período."
    );
    expect(source).not.toContain("Monitorar operação");
    expect(source).not.toContain('fetch("/internal');
  });

  it("gives every KPI context and CTA routes to its owning module", () => {
    expect(source).toContain("Indicadores de apoio para decidir rápido.");
    expect(source).toContain("/finances?view=paid");
    expect(source).toContain("/service-orders?status=open");
    expect(source).toContain("/finances?view=charges&status=overdue");
    expect(source).toContain("/whatsapp");
  });

  it("shows the authoritative pipeline without rebuilding stages from KPI counts", () => {
    expect(source).toContain("executivePipelineQuery.data?.stages");
    expect(source).toContain("label: stage.label");
    expect(source).toContain("value: String(stage.volume)");
    expect(source).toContain(
      "Gargalos do fluxo Cliente → Agendamento → O.S. → Cobrança → Pagamento."
    );
    expect(source).toContain("state: stage.state");
    expect(source).not.toContain(
      'readNullableNumber(metrics, "paymentsReceivedCount") === null'
    );
  });

  it("uses the real backend comparison and renders honest pulse readings", () => {
    [
      "revenueReceivedPct",
      "completedServiceOrdersPct",
      "overdueChargesPct",
      "failedMessagesPct",
    ].forEach(field => expect(source).toContain(field));
    expect(source).toContain("melhorou");
    expect(source).toContain("piorou");
    expect(source).toContain("estável em relação ao período anterior");
    expect(source).toContain("sem base histórica suficiente");
    expect(source).toContain("describeMicroTrend");
    expect(source).toContain("Sem base histórica suficiente");
    expect(source).toContain(
      "Tendências e sinais qualitativos depois da fila operacional."
    );
    expect(source).not.toContain(
      "Tendência histórica: indisponível neste lote"
    );
  });

  it("uses the light transversal queue exposed by dashboard alerts as operational incidents", () => {
    expect(source).toContain("alerts.operationalQueue");
    expect(source).toContain("OVERDUE_SERVICE_ORDER");
    expect(source).toContain("OVERDUE_CHARGE");
    expect(source).toContain("UNCONFIRMED_APPOINTMENT");
    expect(source).toContain("CUSTOMER_AWAITING_RESPONSE");
    expect(source).toContain('path: "/appointments"');
    expect(source).toContain('path: "/whatsapp"');
    expect(source).toContain(
      "Itens que exigem execução, ordenados por urgência."
    );
    expect(source).toContain("Atraso confirmado pela fonte oficial");
    expect(source).toContain("Vencimento confirmado pela fonte oficial");
    expect(source).not.toContain("Date.now()");
    expect(source).toContain("Valor não informado pela fonte");
  });

  it("humanizes timeline evidence and does not show raw technical events", () => {
    expect(source).toContain("humanizeEvent");
    expect(source).toContain("Cobrança não enviada");
    expect(source).toContain("Lembrete de cobrança bloqueado");
    expect(source).toContain("Pagamento recebido");
    expect(source).toContain("SERVICE_ORDER_COMPLETED");
    expect(source).not.toContain("Cobrança bloqueada");
    expect(source).not.toContain("Follow-up bloqueado");
  });

  it("enriches the operational state with compact real mini metrics", () => {
    expect(source).toContain("operationStateMetrics");
    expect(source).toContain("O.S. atrasadas");
    expect(source).toContain("Cobranças vencidas");
    expect(source).toContain("Riscos críticos");
    expect(source).toContain("Gargalo");
  });

  it("does not disguise errors as a healthy empty operation", () => {
    expect(source).toContain("Não foi possível ler a operação");
    expect(source).toContain("não assume que está tudo bem");
    expect(source).toContain(
      "A operação não cria alertas ou recomendações fictícias"
    );
  });

  it("keeps valid sections visible when an auxiliary source is unavailable", () => {
    expect(source).toContain("const isPartiallyUnavailable");
    expect(source).toContain("Leitura parcial.");
    expect(source).toContain("ausência de sinal não indica operação");
    expect(source).toContain("saudável.");
    expect(source).toContain("Tentar fontes indisponíveis novamente");
    expect(source).toContain(
      "const pageError = kpisQuery.isError && alertsQuery.isError"
    );
    expect(source).toContain("Tentar próxima ação novamente");
  });

  it("degrades independent official contracts without manufacturing empty success", () => {
    expect(source).toContain("KPIs indisponíveis");
    expect(source).toContain("Nenhum valor zero foi fabricado");
    expect(source).toContain("Fluxo operacional indisponível");
    expect(source).toContain("Fila operacional indisponível");
    expect(source).toContain("não representa uma fila vazia");
  });

  it("shows the authoritative state verbatim and contextualizes the current role", () => {
    expect(source).toContain("Estado: {operationLevel}");
    expect(source).toContain("Visão administrativa");
    expect(source).toContain("Visão de gestão");
    expect(source).toContain("Visão operacional");
    expect(source).toContain("Visão de consulta");
  });

  it("keeps governance grade separate from authoritative operational state", () => {
    expect(source).toContain("trpc.dashboard.operationalState.useQuery");
    expect(source).toContain('?? "UNKNOWN"');
    expect(source).toContain("executiveDashboardStateLabel[dashboardState]");
    expect(source).not.toContain("normalizeOperationLevel");
    expect(source).not.toMatch(/pageError\s*\?\s*"SUSPENDED"/);
    expect(source).not.toMatch(/attention\.length[\s\S]{0,100}"NORMAL"/);
  });

  it("renders explicit dashboard states and a real onboarding CTA", () => {
    expect(source).toContain("resolveExecutiveDashboardState");
    expect(source).toContain('dashboardState !== "EMPTY"');
    expect(source).toContain("Ainda não há dados operacionais");
    expect(source).toContain("Cadastrar ou importar primeiro cliente");
    expect(source).toContain('navigate("/customers")');
  });

  it("diferencia erro de ação, vazio e ação real sem CTA fictício", () => {
    expect(source).toContain("Não foi possível consultar a próxima ação.");
    expect(source).toContain("nextBestAction.routeHint");
    expect(source).toContain("nextBestAction.suggestedAction");
    expect(source).not.toContain("Abrir ação prioritária");
    expect(source).not.toContain("fallbackAction");
  });

  it("never reconstructs operational decisions from auxiliary counts", () => {
    expect(source).toContain("return signals.slice(0, 5).map(fromSignal)");
    expect(source).not.toContain("severityWeight");
    expect(source).not.toContain(".sort((a, b)");
    expect(source).not.toContain("const bottleneck");
    expect(source).not.toContain('? "ATTENTION" : undefined');
    expect(source).toContain("operationalStateQuery.data?.dashboardState");
    expect(source).toContain("trpc.dashboard.executivePipeline.useQuery");
    expect(source).toContain("state: stage.state");
    expect(source).toContain("value: String(stage.volume)");
    expect(source).toContain("stage.referenceTimestamp");
    expect(source).not.toMatch(
      /stage\.volume[\s\S]{0,120}\?\s*["'](?:done|active|warning|blocked|idle)["']/
    );
    expect(source).toContain("Nenhum risco foi inferido a partir de KPIs");
  });

  it("does not keep the previous mocked operational fixtures", () => {
    expect(source).not.toContain("defaultAttentionItems");
    expect(source).not.toContain("defaultQueue");
    expect(source).not.toContain("operationalPipeline");
    expect(source).not.toContain("pulseSignals");
    expect(source).not.toContain("187400");
  });
});

describe("dashboard BFF error semantics", () => {
  const routerSource = readFileSync("server/routers/dashboard.ts", "utf8");

  it("propagates metrics and alerts failures instead of returning fake empty success", () => {
    const dashboardReadSection = routerSource.slice(
      routerSource.indexOf("kpis:"),
      routerSource.indexOf("operationalState:")
    );
    expect(dashboardReadSection).not.toContain("catch");
    expect(dashboardReadSection).not.toContain(
      "return {} as Record<string, unknown>"
    );
  });
});

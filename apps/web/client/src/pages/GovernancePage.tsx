import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
} from "@/components/internal-page-system";
import {
  AppPageHeader,
  AppPageShell,
  AppSectionCard,
  AppStatusBadge,
} from "@/components/app-system";
import { trpc } from "@/lib/trpc";
import { setBootPhase } from "@/lib/bootPhase";
import { useRenderWatchdog } from "@/hooks/useRenderWatchdog";

type Area = "all" | "operational" | "financial" | "organizational";
type OperationalState =
  | "NORMAL"
  | "WARNING"
  | "RESTRICTED"
  | "SUSPENDED"
  | "UNKNOWN";

const stateView: Record<
  OperationalState,
  {
    label: string;
    title: string;
    tone: "success" | "warning" | "danger" | "neutral";
  }
> = {
  NORMAL: { label: "NORMAL", title: "Operação normal", tone: "success" },
  WARNING: { label: "WARNING", title: "Operação em atenção", tone: "warning" },
  RESTRICTED: {
    label: "RESTRICTED",
    title: "Operação restrita",
    tone: "danger",
  },
  SUSPENDED: { label: "SUSPENDED", title: "Operação suspensa", tone: "danger" },
  UNKNOWN: {
    label: "UNKNOWN",
    title: "Estado ainda desconhecido",
    tone: "neutral",
  },
};

function formatDate(value: unknown) {
  if (!value) return "Sem registro";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : date.toLocaleString("pt-BR");
}

function signalArea(area: string): Exclude<Area, "all"> {
  const value = area.toLowerCase();
  if (
    value.includes("financ") ||
    value.includes("cobran") ||
    value.includes("caixa")
  )
    return "financial";
  if (
    value.includes("pessoa") ||
    value.includes("equipe") ||
    value.includes("organiz")
  )
    return "organizational";
  return "operational";
}

function routeForSignal(signal: {
  serviceOrderId?: string | null;
  chargeId?: string | null;
  messageId?: string | null;
}) {
  if (signal.chargeId)
    return `/finances?chargeId=${encodeURIComponent(signal.chargeId)}&source=governance`;
  if (signal.serviceOrderId)
    return `/service-orders?orderId=${encodeURIComponent(signal.serviceOrderId)}&source=governance`;
  if (signal.messageId)
    return `/whatsapp?messageId=${encodeURIComponent(signal.messageId)}&source=governance`;
  return "/timeline?module=governance";
}

function sourceLabel(source: string) {
  if (source === "NO_DATA") return "Sem dados avaliáveis";
  if (source === "RISK_ENGINE") return "Motor de risco";
  if (source === "GOVERNANCE_RUN") return "Execução de governança";
  if (source === "UNAVAILABLE") return "Fonte indisponível";
  return source;
}

export default function GovernancePage() {
  setBootPhase("PAGE:Governança");
  useRenderWatchdog("GovernancePage");
  const [, navigate] = useLocation();
  const initialArea =
    typeof window === "undefined"
      ? "all"
      : new URLSearchParams(window.location.search).get("area");
  const [area, setArea] = useState<Area>(
    ["operational", "financial", "organizational"].includes(initialArea ?? "")
      ? (initialArea as Area)
      : "all"
  );

  const stateQuery = trpc.governance.operationalState.useQuery(undefined, {
    retry: false,
  });
  const scoreQuery = trpc.governance.autoScore.useQuery(undefined, {
    retry: false,
  });
  const summaryQuery = trpc.governance.summary.useQuery(undefined, {
    retry: false,
  });
  const runsQuery = trpc.governance.runs.useQuery(
    { limit: 12 },
    { retry: false }
  );
  const signalsQuery = trpc.dashboard.operationalSignals.useQuery(
    { limit: 50 },
    { retry: false }
  );
  const nextActionQuery = trpc.dashboard.nextBestAction.useQuery(undefined, {
    retry: false,
  });
  const queries = [
    stateQuery,
    scoreQuery,
    summaryQuery,
    runsQuery,
    signalsQuery,
    nextActionQuery,
  ];
  const loading = queries.some(query => query.isLoading);
  const coreError =
    stateQuery.isError && scoreQuery.isError && summaryQuery.isError;
  const unavailable = queries.filter(query => query.isError).length;

  const setAreaFilter = (next: Area) => {
    setArea(next);
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search
    );
    if (next === "all") params.delete("area");
    else params.set("area", next);
    navigate(`/governance${params.size ? `?${params.toString()}` : ""}`, {
      replace: true,
    });
  };
  const retry = () =>
    void Promise.all(
      queries.filter(query => query.isError).map(query => query.refetch())
    );
  const refresh = () => void Promise.all(queries.map(query => query.refetch()));

  const signals = useMemo(
    () =>
      (signalsQuery.data?.signals ?? []).map(signal => ({
        ...signal,
        riskArea: signalArea(signal.area),
      })),
    [signalsQuery.data]
  );
  const filteredSignals =
    area === "all"
      ? signals
      : signals.filter(signal => signal.riskArea === area);
  const state = stateQuery.data?.operationalState ?? "UNKNOWN";
  const presentation = stateView[state];
  const score = scoreQuery.data;
  const runs = runsQuery.data ?? [];
  const nextAction = nextActionQuery.data;

  return (
    <AppPageShell className="gap-4 p-3 md:p-5">
      <AppPageHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)]">
              Governança e risco
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
              Centro de supervisão operacional
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
              Estado canônico, nota automática, riscos comprováveis e evidências
              oficiais — somente leitura.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={queries.some(query => query.isFetching)}
            aria-label="Atualizar todas as fontes de governança"
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar sinais
          </Button>
        </div>
      </AppPageHeader>

      {loading ? (
        <AppPageLoadingState
          title="Carregando governança"
          description="Consultando estado, score, riscos e evidências oficiais."
        />
      ) : null}
      {coreError && !loading ? (
        <AppPageErrorState
          title="Governança indisponível"
          description="As fontes centrais não responderam. Nenhum estado ou risco foi presumido."
          actionLabel="Tentar novamente"
          onAction={retry}
        />
      ) : null}

      {!loading && !coreError ? (
        <>
          {unavailable > 0 ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-xl border border-[var(--app-warning)]/40 bg-[var(--app-warning)]/10 p-4 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <strong className="text-[var(--text-primary)]">
                  Indisponibilidade parcial.
                </strong>{" "}
                {unavailable} fonte(s) falharam; “sem sinal” não será usado para
                substituir a falha.
              </span>
              <Button variant="outline" size="sm" onClick={retry}>
                Tentar fontes novamente
              </Button>
            </div>
          ) : null}

          <AppSectionCard className="overflow-hidden p-0">
            <div className="grid lg:grid-cols-[1fr_360px]">
              <section className="p-4 md:p-6" aria-labelledby="state-heading">
                <div className="flex flex-wrap items-center gap-2">
                  <AppStatusBadge
                    label={`Estado: ${presentation.label}`}
                    tone={presentation.tone}
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    Fonte:{" "}
                    {stateQuery.isError
                      ? "Indisponível"
                      : sourceLabel(stateQuery.data?.source ?? "NO_DATA")}
                  </span>
                </div>
                <h2
                  id="state-heading"
                  className="mt-3 text-2xl font-semibold text-[var(--text-primary)]"
                >
                  {presentation.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {stateQuery.isError
                    ? "A fonte do estado operacional está indisponível; UNKNOWN é exibido sem inferência local."
                    : (stateQuery.data?.reason ??
                      "O backend não informou uma justificativa.")}
                </p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Evidência
                    </dt>
                    <dd className="font-medium text-[var(--text-primary)]">
                      {formatDate(stateQuery.data?.evidenceAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Registros avaliados
                    </dt>
                    <dd className="font-medium text-[var(--text-primary)]">
                      {stateQuery.data?.evaluatedRecords ?? "Indisponível"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Disponibilidade
                    </dt>
                    <dd className="font-medium text-[var(--text-primary)]">
                      {stateQuery.isError
                        ? "Fonte indisponível"
                        : stateQuery.data?.availability === "NO_DATA"
                          ? "Sem dados avaliáveis"
                          : "Dado disponível"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 rounded-lg border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3 text-xs text-[var(--text-secondary)]">
                  <ShieldCheck
                    className="mr-2 inline size-4"
                    aria-hidden="true"
                  />
                  O estado não pode ser alterado nesta tela. Transições
                  permanecem sob a autoridade única do backend.
                </p>
              </section>
              <aside
                className="border-t border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-4 md:p-6 lg:border-l lg:border-t-0"
                aria-labelledby="score-heading"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--app-accent)]">
                  Score automático
                </p>
                <h2
                  id="score-heading"
                  className="mt-2 text-4xl font-semibold text-[var(--text-primary)]"
                >
                  {scoreQuery.isError ? "—" : (score?.level ?? "Sem nota")}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {score?.score == null
                    ? scoreQuery.isError
                      ? "Fonte indisponível"
                      : (score?.reason ?? "Ausência de dados avaliáveis")
                    : `${score.score}/100 · ${sourceLabel(score.source)}`}
                </p>
                <ul
                  className="mt-4 space-y-2"
                  aria-label="Sinais que justificam a nota"
                >
                  {(score?.factors ?? []).map(factor => (
                    <li
                      key={factor.name}
                      className="flex justify-between gap-3 text-xs"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {factor.name}
                      </span>
                      <strong className="text-right text-[var(--text-primary)]">
                        {factor.value ?? "Sem sinal"}
                        <span className="block font-normal text-[var(--text-muted)]">
                          {factor.reference}
                        </span>
                      </strong>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </AppSectionCard>

          <nav
            aria-label="Filtrar riscos por área"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {(
              [
                ["all", "Todos"],
                ["operational", "Operacionais"],
                ["financial", "Financeiros"],
                ["organizational", "Organizacionais"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={area === value ? "default" : "outline"}
                size="sm"
                aria-pressed={area === value}
                onClick={() => setAreaFilter(value)}
              >
                {label}
              </Button>
            ))}
          </nav>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
            <AppSectionCard className="p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Riscos comprováveis
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Sinais retornados pelo contrato operacional; a interface não
                aplica thresholds.
              </p>
              {signalsQuery.isError ? (
                <AppPageErrorState
                  title="Fonte de riscos indisponível"
                  description="Não é possível afirmar que não há riscos enquanto a fonte estiver indisponível."
                  actionLabel="Tentar novamente"
                  onAction={() => void signalsQuery.refetch()}
                />
              ) : filteredSignals.length === 0 ? (
                <AppPageEmptyState
                  title="Nenhum sinal nesta área"
                  description="A consulta foi concluída e não retornou sinal para o filtro atual. Isso não equivale a fonte indisponível."
                />
              ) : (
                <ul className="mt-4 grid gap-3">
                  {filteredSignals.map(signal => (
                    <li
                      key={signal.id}
                      className="rounded-xl border border-[var(--app-border-subtle)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <AppStatusBadge
                          label={signal.severity}
                          tone={
                            signal.severity === "CRITICAL"
                              ? "danger"
                              : signal.severity === "WARNING"
                                ? "warning"
                                : "neutral"
                          }
                        />
                        <span className="text-xs text-[var(--text-muted)]">
                          {signal.area}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold text-[var(--text-primary)]">
                        {signal.title}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {signal.summary ?? "Resumo não fornecido."}
                      </p>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Impacto: {signal.impact ?? "Não informado pela fonte."}
                      </p>
                      <Button
                        className="mt-3"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(routeForSignal(signal))}
                      >
                        Investigar contexto{" "}
                        <ArrowRight
                          className="ml-2 size-4"
                          aria-hidden="true"
                        />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </AppSectionCard>

            <AppSectionCard className="p-4 md:p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Próxima melhor ação
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Ação administrativa existente no produto.
              </p>
              {nextActionQuery.isError ? (
                <AppPageErrorState
                  title="Ação indisponível"
                  description="A recomendação oficial não pôde ser consultada."
                  actionLabel="Tentar novamente"
                  onAction={() => void nextActionQuery.refetch()}
                />
              ) : nextAction ? (
                <div className="mt-3">
                  <AppStatusBadge label={nextAction.area} tone="warning" />
                  <h3 className="mt-3 font-semibold text-[var(--text-primary)]">
                    {nextAction.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {nextAction.reason}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    <strong>Impacto:</strong> {nextAction.impact}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    <strong>Ação sugerida:</strong> {nextAction.suggestedAction}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => navigate(nextAction.routeHint)}
                  >
                    Abrir ação existente
                  </Button>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    A navegação abre o fluxo administrativo existente; nenhuma
                    ação é executada automaticamente.
                  </p>
                </div>
              ) : (
                <AppPageEmptyState
                  title="Sem próxima ação"
                  description="A fonte respondeu sem recomendação administrativa ativa."
                />
              )}
            </AppSectionCard>
          </div>

          <AppSectionCard className="p-4 md:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Histórico e evidências
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Execuções oficiais que sustentam a leitura. A Timeline
                  preserva o detalhe auditável.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate("/timeline?module=governance")}
              >
                Abrir Timeline
              </Button>
            </div>
            {runsQuery.isError ? (
              <AppPageErrorState
                title="Evidências indisponíveis"
                description="O histórico não foi substituído por uma lista vazia."
                actionLabel="Tentar novamente"
                onAction={() => void runsQuery.refetch()}
              />
            ) : runs.length === 0 ? (
              <AppPageEmptyState
                title="Nenhuma evidência registrada"
                description="A fonte respondeu, mas ainda não há execução oficial de governança."
              />
            ) : (
              <ol className="mt-4 grid gap-3">
                {runs.map(run => (
                  <li
                    key={run.id}
                    className="grid gap-2 rounded-xl border border-[var(--app-border-subtle)] p-4 sm:grid-cols-[auto_1fr_auto]"
                  >
                    <FileCheck2
                      className="size-5 text-[var(--app-accent)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        Execução {run.bucket}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {run.evaluated} avaliados · {run.warnings} alertas ·{" "}
                        {run.correctives} corretivas · risco institucional{" "}
                        {run.institutionalRiskScore}
                      </p>
                    </div>
                    <time
                      className="text-xs text-[var(--text-muted)]"
                      dateTime={run.finishedAt}
                    >
                      <Clock3
                        className="mr-1 inline size-3"
                        aria-hidden="true"
                      />
                      {formatDate(run.finishedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </AppSectionCard>

          <AppSectionCard className="p-4 md:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-5 text-[var(--app-warning)]"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-semibold text-[var(--text-primary)]">
                  Limites atuais do contrato
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Risco organizacional individual e evidências por entidade só
                  aparecem quando retornados pelas fontes atuais. A interface
                  não cria endpoint, política, score, estado, normalização
                  forçada ou regra de risco para preencher ausências.
                </p>
              </div>
            </div>
          </AppSectionCard>
        </>
      ) : null}
    </AppPageShell>
  );
}

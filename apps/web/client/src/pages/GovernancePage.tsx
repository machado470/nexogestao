import { useLocation } from "wouter";
import { ArrowRight, Clock3, FileCheck2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AppAlert,
  AppAlertDescription,
  AppAlertTitle,
  AppPageShell,
} from "@/components/app-system";
import {
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";
import { useRenderWatchdog } from "@/hooks/useRenderWatchdog";
import { setBootPhase } from "@/lib/bootPhase";
import { trpc } from "@/lib/trpc";

const STATE_LABELS = {
  NORMAL: "NORMAL · operação normal",
  WARNING: "WARNING · operação em atenção",
  RESTRICTED: "RESTRICTED · operação restrita",
  SUSPENDED: "SUSPENDED · operação suspensa",
  UNKNOWN: "UNKNOWN · estado desconhecido",
} as const;

function formatDate(value: unknown) {
  if (!value) return "Não informada";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : date.toLocaleString("pt-BR");
}

function sourceLabel(source: string | undefined) {
  if (!source) return "Não informada";
  const labels: Record<string, string> = {
    NO_DATA: "Sem dados avaliáveis",
    RISK_ENGINE: "Motor de risco",
    GOVERNANCE_RUN: "Execução de governança",
    PERSISTED_OPERATIONAL_STATE: "Estado operacional persistido",
    UNAVAILABLE: "Fonte indisponível",
  };
  return labels[source] ?? source;
}

export default function GovernancePage() {
  setBootPhase("PAGE:Governança");
  useRenderWatchdog("GovernancePage");
  const [, navigate] = useLocation();

  const stateQuery = trpc.governance.operationalState.useQuery(undefined, {
    retry: false,
  });
  const scoreQuery = trpc.governance.autoScore.useQuery(undefined, {
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
    runsQuery,
    signalsQuery,
    nextActionQuery,
  ];
  const unavailable = queries.filter(query => query.isError).length;
  const refresh = () => void Promise.all(queries.map(query => query.refetch()));
  const retryUnavailable = () =>
    void Promise.all(
      queries.filter(query => query.isError).map(query => query.refetch())
    );
  const stateData = stateQuery.data;
  const state = stateData?.operationalState;
  const nextAction = nextActionQuery.data;

  return (
    <AppPageShell className="gap-4 p-3 md:p-5">
      <AppOperationalHeader
        title="Governança e risco operacional"
        description="Estado, razões, sinais, decisões e execuções fornecidos pelas fontes oficiais — somente leitura."
        primaryAction={
          <Button
            variant="outline"
            onClick={refresh}
            disabled={queries.some(query => query.isFetching)}
            aria-label="Atualizar fontes oficiais de governança"
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
        contextChips={
          stateQuery.isLoading ? (
            <AppStatusBadge label="Carregando estado oficial" />
          ) : stateQuery.isError || !state ? (
            <AppStatusBadge label="Estado oficial indisponível" />
          ) : (
            <>
              <AppStatusBadge label={STATE_LABELS[state]} />
              <span className="text-xs text-[var(--text-muted)]">
                Referência: {formatDate(stateData?.evidenceAt)}
              </span>
            </>
          )
        }
      />

      {unavailable > 0 ? (
        <AppAlert role="status">
          <AppAlertTitle>Indisponibilidade parcial</AppAlertTitle>
          <AppAlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {unavailable} fonte(s) não responderam. Falhas não são tratadas
              como ausência de risco nem como estado normal.
            </span>
            <Button variant="outline" size="sm" onClick={retryUnavailable}>
              Tentar novamente
            </Button>
          </AppAlertDescription>
        </AppAlert>
      ) : null}

      <AppSectionBlock
        title="Situação atual"
        subtitle="A decisão operacional vigente e a justificativa emitida pela fonte autoritativa."
      >
        {stateQuery.isLoading ? (
          <AppPageLoadingState
            title="Carregando estado oficial"
            description="Consultando a decisão operacional vigente."
          />
        ) : stateQuery.isError ? (
          <AppPageErrorState
            title="Estado operacional indisponível"
            description="A fonte autoritativa não respondeu. Nenhum estado foi presumido."
            actionLabel="Tentar novamente"
            onAction={() => void stateQuery.refetch()}
          />
        ) : !stateQuery.data ? (
          <AppPageEmptyState
            title="Contrato de estado indisponível"
            description="A consulta terminou sem um contrato de decisão operacional utilizável."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <AppStatusBadge
                label={STATE_LABELS[stateQuery.data.operationalState]}
              />
              <h2 className="mt-3 text-xl font-semibold text-[var(--text-primary)]">
                {stateQuery.data.reason ?? "Justificativa não informada"}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Origem: {sourceLabel(stateQuery.data.source)}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Referência</dt>
                <dd className="break-words font-medium text-[var(--text-primary)]">
                  {formatDate(stateQuery.data.evidenceAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">
                  Registros avaliados
                </dt>
                <dd className="font-medium text-[var(--text-primary)]">
                  {stateQuery.data.evaluatedRecords}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">
                  Disponibilidade oficial
                </dt>
                <dd className="break-words font-medium text-[var(--text-primary)]">
                  {stateQuery.data.availability}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Sinais e evidências"
        subtitle="Sinais na ordem fornecida pelo backend, sem reclassificação, pontuação ou ordenação no navegador."
      >
        {signalsQuery.isLoading ? (
          <AppPageLoadingState title="Carregando sinais oficiais" />
        ) : signalsQuery.isError ? (
          <AppPageErrorState
            title="Sinais indisponíveis"
            description="Não é possível afirmar que não há sinais enquanto a fonte estiver indisponível."
            actionLabel="Tentar novamente"
            onAction={() => void signalsQuery.refetch()}
          />
        ) : (signalsQuery.data?.signals.length ?? 0) === 0 ? (
          <AppPageEmptyState
            title="Nenhum sinal retornado"
            description="A fonte respondeu sem sinais operacionais ativos."
          />
        ) : (
          <ol
            className="divide-y divide-[var(--border-subtle)]"
            aria-label="Sinais operacionais oficiais"
          >
            {signalsQuery.data?.signals.map(signal => (
              <li key={signal.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AppStatusBadge label={signal.severity} />
                  <span className="text-xs text-[var(--text-muted)]">
                    {signal.area}
                  </span>
                </div>
                <h3 className="mt-2 break-words font-semibold text-[var(--text-primary)]">
                  {signal.title}
                </h3>
                {signal.reason ? (
                  <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                    <strong>Razão:</strong> {signal.reason}
                  </p>
                ) : null}
                {signal.summary ? (
                  <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                    {signal.summary}
                  </p>
                ) : null}
                {signal.impact ? (
                  <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                    <strong>Impacto informado:</strong> {signal.impact}
                  </p>
                ) : null}
                <p className="mt-2 break-all text-xs text-[var(--text-muted)]">
                  Origem: {sourceLabel(signal.source)} · ID: {signal.id}
                  {signal.detectedAt
                    ? ` · Detectado em ${formatDate(signal.detectedAt)}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </AppSectionBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSectionBlock
          title="Decisão recomendada pelo sistema"
          subtitle="Próxima ação oficial; abrir o destino não executa a ação automaticamente."
        >
          {nextActionQuery.isLoading ? (
            <AppPageLoadingState title="Carregando decisão oficial" />
          ) : nextActionQuery.isError ? (
            <AppPageErrorState
              title="Decisão indisponível"
              description="A recomendação oficial não pôde ser consultada."
              actionLabel="Tentar novamente"
              onAction={() => void nextActionQuery.refetch()}
            />
          ) : !nextAction ? (
            <AppPageEmptyState
              title="Sem recomendação ativa"
              description="A fonte respondeu sem próxima ação oficial. Isso não representa uma ação executada."
            />
          ) : (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AppStatusBadge label={nextAction.area} />
                <span className="break-all text-xs text-[var(--text-muted)]">
                  Origem: {sourceLabel(nextAction.source)}
                </span>
              </div>
              <h3 className="mt-3 break-words font-semibold text-[var(--text-primary)]">
                {nextAction.title}
              </h3>
              <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">
                <strong>Razão:</strong> {nextAction.reason}
              </p>
              <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                <strong>Impacto:</strong> {nextAction.impact}
              </p>
              <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                <strong>Recomendação:</strong> {nextAction.suggestedAction}
              </p>
              <Button
                className="mt-4 max-w-full"
                onClick={() => navigate(nextAction.routeHint)}
                aria-label={`Abrir destino oficial: ${nextAction.title}`}
              >
                Abrir destino oficial
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </AppSectionBlock>

        <AppSectionBlock
          title="Avaliação automática oficial"
          subtitle="Nota e fatores já calculados pelo backend; não determina o estado operacional exibido acima."
        >
          {scoreQuery.isLoading ? (
            <AppPageLoadingState title="Carregando avaliação oficial" />
          ) : scoreQuery.isError ? (
            <AppPageErrorState
              title="Avaliação indisponível"
              description="A fonte da avaliação automática não respondeu."
              actionLabel="Tentar novamente"
              onAction={() => void scoreQuery.refetch()}
            />
          ) : !scoreQuery.data || scoreQuery.data.availability === "NO_DATA" ? (
            <AppPageEmptyState
              title="Sem avaliação disponível"
              description={
                scoreQuery.data?.reason ??
                "A fonte respondeu sem dados avaliáveis."
              }
            />
          ) : (
            <div>
              <p className="text-3xl font-semibold text-[var(--text-primary)]">
                {scoreQuery.data.level ?? "Sem classificação"}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Nota oficial: {scoreQuery.data.score ?? "Não informada"}/100 ·{" "}
                {sourceLabel(scoreQuery.data.source)}
              </p>
              <dl className="mt-4 divide-y divide-[var(--border-subtle)]">
                {scoreQuery.data.factors.map(factor => (
                  <div
                    key={factor.name}
                    className="grid gap-1 py-2 sm:grid-cols-[1fr_auto] sm:gap-4"
                  >
                    <dt className="break-words text-sm text-[var(--text-secondary)]">
                      {factor.name}
                    </dt>
                    <dd className="break-words text-sm font-medium text-[var(--text-primary)] sm:text-right">
                      {factor.value ?? "Sem sinal"}
                      <span className="block text-xs font-normal text-[var(--text-muted)]">
                        {factor.reference}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </AppSectionBlock>
      </div>

      <AppSectionBlock
        title="Histórico de execuções"
        subtitle="Execuções de governança na ordem oficial. O contrato atual não fornece ator, transição de estado ou razão por execução."
        ctaLabel="Abrir Timeline"
        onCtaClick={() => navigate("/timeline?module=governance")}
      >
        {runsQuery.isLoading ? (
          <AppPageLoadingState title="Carregando execuções oficiais" />
        ) : runsQuery.isError ? (
          <AppPageErrorState
            title="Histórico indisponível"
            description="A falha da fonte não foi substituída por uma lista vazia."
            actionLabel="Tentar novamente"
            onAction={() => void runsQuery.refetch()}
          />
        ) : (runsQuery.data?.length ?? 0) === 0 ? (
          <AppPageEmptyState
            title="Nenhuma execução registrada"
            description="A fonte respondeu, mas ainda não há execução oficial de governança."
          />
        ) : (
          <ol
            className="divide-y divide-[var(--border-subtle)]"
            aria-label="Execuções oficiais de governança"
          >
            {runsQuery.data?.map(run => (
              <li
                key={run.id}
                className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <FileCheck2
                  className="size-5 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="break-all font-medium text-[var(--text-primary)]">
                    Execução {run.id}
                  </p>
                  <p className="break-words text-sm text-[var(--text-secondary)]">
                    Resultado informado: {run.evaluated} avaliados ·{" "}
                    {run.warnings} alertas · {run.correctives} corretivas ·
                    risco institucional {run.institutionalRiskScore}
                  </p>
                  <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                    Referência: {run.bucket}
                  </p>
                </div>
                <time
                  className="text-xs text-[var(--text-muted)]"
                  dateTime={run.finishedAt}
                >
                  <Clock3 className="mr-1 inline size-3" aria-hidden="true" />
                  {formatDate(run.finishedAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </AppSectionBlock>

      <AppAlert>
        <AppAlertTitle>Limites do contrato atual</AppAlertTitle>
        <AppAlertDescription>
          Não há política informativa, ator, estado anterior/posterior, razão
          por execução nem destino por sinal nos contratos consumidos. Esses
          dados são omitidos; a interface não os reconstrói.
        </AppAlertDescription>
      </AppAlert>
    </AppPageShell>
  );
}

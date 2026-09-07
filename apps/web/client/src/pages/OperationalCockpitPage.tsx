import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import {
  AppInfoCard,
  AppPageShell,
  AppSectionCard,
  AppStatCard,
  AppStatusBadge,
} from "@/components/app-system";
import {
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
} from "@/components/internal-page-system";
import { Button } from "@/components/ui/button";
import { presentationStatusLabel } from "@/lib/presentation-status";
import { trpc } from "@/lib/trpc";

type Severity = "INFO" | "WARNING" | "CRITICAL";

type Incident = {
  id: string;
  title: string;
  severity: Severity;
  description: string;
};

type Queue = {
  queue: string;
  degraded: boolean;
  waiting: number;
  failed: number;
};

type ActionState = "idle" | "loading" | "success" | "error";

const severityTone: Record<Severity, "info" | "warning" | "danger"> = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "danger",
};

export default function OperationalCockpitPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const summary = trpc.operations.summary.useQuery(undefined, {
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const incidents = trpc.operations.incidents.useQuery(undefined, {
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const refresh = async () => {
    await Promise.all([summary.refetch(), incidents.refetch()]);
  };

  const criticalIncidents = useMemo(
    () => getCriticalIncidents(incidents.data ?? []),
    [incidents.data]
  );

  const degradedQueues = useMemo(
    () => getDegradedQueues(summary.data?.queues ?? []),
    [summary.data?.queues]
  );

  const dlqItems = useMemo(
    () =>
      (summary.data?.dlq ?? []).filter(
        item => item.backlog > 0 || item.failed > 0
      ),
    [summary.data?.dlq]
  );

  const loading = summary.isLoading || incidents.isLoading;
  const error = summary.error ?? incidents.error;
  const summaryStatus = summary.data?.status ?? null;

  return (
    <AppPageShell className="gap-4">
      <AppOperationalHeader
        density="compact"
        title="Cockpit Operacional / SRE"
        description="Leitura rápida para ação operacional: incidentes, degradações, backlog e recuperação."
        primaryAction={
          <Button
            size="sm"
            disabled={summary.isFetching || incidents.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>
        }
        secondaryActions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoRefresh(value => !value)}
          >
            {autoRefresh
              ? "Auto-refresh ligado"
              : "Auto-refresh desligado"}
          </Button>
        }
      />

      {loading ? (
        <AppPageLoadingState description="Carregando sinais operacionais..." />
      ) : null}

      {error ? (
        <AppPageErrorState
          description={error.message}
          onAction={() => void refresh()}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <section
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Resumo do cockpit operacional"
          >
            <AppStatCard
              label="Status geral"
              value={
                summaryStatus
                  ? presentationStatusLabel(summaryStatus)
                  : "Indisponível"
              }
              delta={
                <AppStatusBadge
                  label={
                    summaryStatus
                      ? presentationStatusLabel(summaryStatus)
                      : "Sem leitura"
                  }
                  tone={
                    summaryStatus === "ok"
                      ? "success"
                      : summaryStatus === "degraded"
                        ? "warning"
                        : "neutral"
                  }
                />
              }
            />

            <AppStatCard
              label="Incidentes ativos"
              value={
                incidents.data
                  ? String(incidents.data.length)
                  : "Indisponível"
              }
              delta={
                <AppStatusBadge
                  label={
                    incidents.data
                      ? criticalIncidents.length
                        ? `${criticalIncidents.length} crítico(s)`
                        : "Sem críticos"
                      : "Sem leitura"
                  }
                  tone={
                    incidents.data && criticalIncidents.length
                      ? "danger"
                      : "neutral"
                  }
                />
              }
            />

            <AppStatCard
              label="Filas degradadas"
              value={
                summary.data
                  ? String(degradedQueues.length)
                  : "Indisponível"
              }
              delta={
                <AppStatusBadge
                  label={
                    summary.data
                      ? degradedQueues.length
                        ? "Degradação informada"
                        : "Sem degradação"
                      : "Sem leitura"
                  }
                  tone={
                    summary.data && degradedQueues.length
                      ? "warning"
                      : "neutral"
                  }
                />
              }
            />
          </section>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <AppSectionBlock
              title="Incidentes ativos"
              subtitle="Severidade e descrição retornadas pelo backend operacional."
              compact
            >
              {incidents.data?.length ? (
                <AppSectionCard className="space-y-2 p-3">
                  {incidents.data.map(item => (
                    <OperationalRow
                      key={item.id}
                      label={item.title}
                      meta={item.description}
                      icon={
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      }
                      badge={
                        <AppStatusBadge
                          label={presentationStatusLabel(item.severity)}
                          tone={severityTone[item.severity]}
                        />
                      }
                    />
                  ))}
                </AppSectionCard>
              ) : (
                <AppPageEmptyState
                  title="Nenhum incidente ativo"
                  description="A fonte oficial não retornou incidentes ativos."
                />
              )}
            </AppSectionBlock>

            <AppSectionBlock
              title="Filas degradadas"
              subtitle="Somente filas marcadas como degradadas pelo backend."
              compact
            >
              {degradedQueues.length ? (
                <AppSectionCard className="space-y-2 p-3">
                  {degradedQueues.map(item => (
                    <OperationalRow
                      key={item.queue}
                      label={formatQueueName(item.queue)}
                      meta={`${item.waiting} aguardando · ${item.failed} falhas`}
                      badge={
                        <AppStatusBadge
                          label="Degradada"
                          tone="warning"
                        />
                      }
                    />
                  ))}
                </AppSectionCard>
              ) : (
                <AppPageEmptyState
                  title="Nenhuma fila degradada"
                  description="Nenhuma fila foi marcada como degradada pela fonte oficial."
                />
              )}
            </AppSectionBlock>

            <AppSectionBlock
              title="DLQ / backlog"
              subtitle="Backlog e falhas exibidos como fatos, sem severidade fabricada no navegador."
              compact
            >
              {dlqItems.length ? (
                <AppSectionCard className="space-y-2 p-3">
                  {dlqItems.map(item => (
                    <OperationalRow
                      key={item.queue}
                      label={formatQueueName(item.queue)}
                      meta={`${item.backlog} aguardando · ${item.failed} falhas`}
                      badge={
                        <AppStatusBadge
                          label="DLQ"
                          tone="neutral"
                        />
                      }
                    />
                  ))}
                </AppSectionCard>
              ) : (
                <AppPageEmptyState
                  title="Sem itens em DLQ"
                  description="Nenhum backlog ou falha foi retornado para a DLQ."
                />
              )}
            </AppSectionBlock>
          </div>
        </>
      ) : null}

      <AppInfoCard className="text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">
          Recovery / replay
        </p>
        <p className="mt-1">
          O retry genérico de DLQ está indisponível. Replays somente são
          oferecidos quando uma entrega identificada e elegível é confirmada
          pelo backend.
        </p>
      </AppInfoCard>
    </AppPageShell>
  );
}

function OperationalRow({
  label,
  meta,
  badge,
  icon,
}: {
  label: string;
  meta: string;
  badge: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2 last:border-none last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-[var(--text-primary)]">
          {label}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">{meta}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {icon}
        {badge}
      </div>
    </div>
  );
}

export function getCriticalIncidents(items: Incident[]) {
  return items.filter(item => item.severity === "CRITICAL");
}

export function getDegradedQueues(items: Queue[]) {
  return items.filter(item => item.degraded);
}

export function shouldBlockOperationalAction(
  current: ActionState | undefined,
  hasConcurrentAction: boolean
) {
  return current === "loading" || hasConcurrentAction;
}

export function formatQueueName(queue: string) {
  return queue
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

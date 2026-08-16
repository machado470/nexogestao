import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppOperationalHeader, AppPageErrorState, AppPageLoadingState } from "@/components/internal-page-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presentationStatusLabel } from "@/lib/presentation-status";
import { trpc } from "@/lib/trpc";

type Severity = "INFO" | "WARNING" | "CRITICAL";
type Incident = { id: string; title: string; severity: Severity; description: string };
type Queue = { queue: string; degraded: boolean; waiting: number; failed: number };
type ActionState = "idle" | "loading" | "success" | "error";

export default function OperationalCockpitPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const summary = trpc.nexo.operations.summary.useQuery(undefined, { refetchInterval: autoRefresh ? 30_000 : false });
  const incidents = trpc.nexo.operations.incidents.useQuery(undefined, { refetchInterval: autoRefresh ? 30_000 : false });
  const refresh = async () => { await Promise.all([summary.refetch(), incidents.refetch()]); };
  const criticalIncidents = useMemo(() => getCriticalIncidents(incidents.data ?? []), [incidents.data]);
  const degradedQueues = useMemo(() => getDegradedQueues(summary.data?.queues ?? []), [summary.data?.queues]);
  const loading = summary.isLoading || incidents.isLoading;
  const error = summary.error ?? incidents.error;

  return (
    <div className="space-y-4">
      <AppOperationalHeader density="compact" title="Cockpit Operacional / SRE" description="Leitura rápida para ação operacional: incidentes, degradações, backlog e recuperação."
        primaryAction={<Button size="sm" disabled={summary.isFetching || incidents.isFetching} onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Atualizar</Button>}
        secondaryActions={<Button size="sm" variant="outline" onClick={() => setAutoRefresh(v => !v)}>{autoRefresh ? "Auto-refresh ligado" : "Auto-refresh desligado"}</Button>} />
      {loading ? <AppPageLoadingState description="Carregando sinais operacionais..." /> : null}
      {error ? <AppPageErrorState description={error.message} onAction={() => void refresh()} /> : null}
      {!loading && !error ? <>
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MiniCard title="Status geral" value={presentationStatusLabel(summary.data?.status ?? "degraded")} tone={summary.data?.status === "ok" ? "INFO" : "WARNING"} />
          <MiniCard title="Incidentes ativos" value={String(incidents.data?.length ?? 0)} tone={criticalIncidents.length ? "CRITICAL" : "INFO"} />
          <MiniCard title="Filas degradadas" value={String(degradedQueues.length)} tone={degradedQueues.length ? "WARNING" : "INFO"} />
        </section>
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <ListCard title="Incidentes ativos" empty="Nenhum incidente ativo.">{(incidents.data ?? []).map(item => <Row key={item.id} label={item.title} meta={item.description} severity={item.severity} />)}</ListCard>
          <ListCard title="Filas degradadas" empty="Nenhuma fila degradada.">{degradedQueues.map(item => <Row key={item.queue} label={formatQueueName(item.queue)} meta={`${item.waiting} aguardando · ${item.failed} falhas`} severity="WARNING" />)}</ListCard>
          <ListCard title="DLQ / backlog" empty="Sem itens em DLQ.">{(summary.data?.dlq ?? []).filter(item => item.backlog > 0 || item.failed > 0).map(item => <Row key={item.queue} label={formatQueueName(item.queue)} meta={`${item.backlog} aguardando · ${item.failed} falhas`} severity={item.backlog > 0 ? "CRITICAL" : "WARNING"} />)}</ListCard>
        </section>
      </> : null}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">Recovery / replay</p>
        <p className="mt-1">O retry genérico de DLQ está indisponível. Replays somente são oferecidos quando uma entrega identificada e elegível é confirmada pelo backend.</p>
      </section>
    </div>
  );
}

function Badge({ severity }: { severity: Severity }) { return <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold", severity === "CRITICAL" ? "bg-rose-500/15 text-rose-600" : severity === "WARNING" ? "bg-amber-500/15 text-amber-600" : "bg-zinc-500/10 text-zinc-600")}>{presentationStatusLabel(severity)}</span>; }
function MiniCard({ title, value, tone }: { title: string; value: string; tone: Severity }) { return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"><p className="text-xs text-[var(--text-secondary)]">{title}</p><div className="mt-2 flex items-center justify-between"><p className="text-lg font-semibold">{value}</p><Badge severity={tone} /></div></div>; }
function ListCard({ title, children, empty }: { title: string; children: ReactNode[]; empty: string }) { return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"><p className="text-sm font-semibold">{title}</p><div className="mt-2 space-y-2">{children.length ? children : <p className="text-sm text-[var(--text-secondary)]">{empty}</p>}</div></div>; }
function Row({ label, meta, severity }: { label: string; meta: string; severity: Severity }) { return <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 last:border-none"><div className="min-w-0"><p className="truncate text-sm">{label}</p><p className="text-xs text-[var(--text-secondary)]">{meta}</p></div><div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-[var(--text-secondary)]" /><Badge severity={severity} /></div></div>; }
export function getCriticalIncidents(items: Incident[]) { return items.filter(i => i.severity === "CRITICAL"); }
export function getDegradedQueues(items: Queue[]) { return items.filter(q => q.degraded); }
export function shouldBlockOperationalAction(current: ActionState | undefined, hasConcurrentAction: boolean) { return current === "loading" || hasConcurrentAction; }
export function formatQueueName(queue: string) { return queue.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase()); }

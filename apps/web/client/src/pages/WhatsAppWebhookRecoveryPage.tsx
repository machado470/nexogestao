import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/app-modal-system";
import {
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPageShell,
  AppSectionBlock,
} from "@/components/internal-page-system";
import {
  AppCheckbox,
  AppInput,
  AppSectionCard,
  AppSelect,
  AppStatCard,
  AppStatusBadge as AppToneStatusBadge,
} from "@/components/app-system";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  WEBHOOK_STATUSES,
  buildWebhookEventListParams,
  canReplayEvent,
  defaultWebhookFilters,
  filterEventsBySearch,
  forceReplayRequiresConfirmation,
  formatOldestFailedAge,
  formatWebhookDate,
  getErrorPreview,
  getMetadata,
  getReplayMode,
  toArrayMetric,
  type WebhookEvent,
  type WebhookFilters,
} from "./WhatsAppWebhookRecovery.logic";

type ReplayDialogState =
  | { kind: "single"; event: WebhookEvent; force: boolean }
  | { kind: "selected"; events: WebhookEvent[]; force: boolean }
  | null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getItems(payload: unknown): WebhookEvent[] {
  const record = asRecord(payload);
  const items = Array.isArray(record.items) ? record.items : [];
  return items.filter((item): item is WebhookEvent => Boolean(item && typeof item === "object" && "id" in item));
}

function getNextCursor(payload: unknown) {
  const record = asRecord(payload);
  return typeof record.nextCursor === "string" ? record.nextCursor : null;
}

function statusTone(status?: string | null): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "PROCESSED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PROCESSING") return "warning";
  if (status === "RECEIVED") return "info";
  return "neutral";
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    RECEIVED: "Recebido",
    PROCESSING: "Processando",
    PROCESSED: "Processado",
    FAILED: "Falhou",
  };
  return labels[String(status)] ?? "Desconhecido";
}

function getStatNumber(stats: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim()) return Number(value) || 0;
  }
  return 0;
}

export function DlqSummaryCards({ statsPayload }: { statsPayload: unknown }) {
  const stats = asRecord(statsPayload);
  const failedCount = getStatNumber(stats, ["failedCount", "failed", "totalFailed", "count"]);
  const oldestFailed = stats.oldestFailedAt ?? stats.oldestFailedAgeSeconds ?? stats.oldestFailedAge ?? null;
  const byProvider = toArrayMetric(stats.failedByProvider ?? stats.byProvider);
  const byOrg = toArrayMetric(stats.failedByOrg ?? stats.byOrg ?? stats.failedByOrganization);
  const attempts = asRecord(stats.retryAttempts ?? stats.retryAttemptsSummary ?? stats.attempts);
  const maxAttempts = getStatNumber(attempts, ["max", "maxAttempts"]);
  const avgAttempts = getStatNumber(attempts, ["avg", "average", "averageAttempts"]);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Resumo da DLQ">
      <AppStatCard
        icon={<ShieldAlert className="h-5 w-5" />}
        label="Falhas na DLQ"
        value={failedCount}
        helper={failedCount > 0 ? "Priorize estes eventos antes do próximo pico." : "Nenhuma falha aguardando ação."}
      />
      <AppStatCard
        icon={<Clock3 className="h-5 w-5" />}
        label="Falha mais antiga"
        value={formatOldestFailedAge(oldestFailed as string | number | null)}
        helper="Idade operacional do item parado há mais tempo."
      />
      <AppStatCard
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Por provedor"
        value={byProvider.length ? byProvider.map(item => `${item.label}: ${item.value}`).join(" · ") : "—"}
        helper="Distribuição das falhas por origem do webhook."
      />
      <AppStatCard
        icon={<RotateCcw className="h-5 w-5" />}
        label="Tentativas"
        value={maxAttempts || avgAttempts ? `máx. ${maxAttempts || "—"} · méd. ${avgAttempts || "—"}` : "—"}
        helper={byOrg.length ? `Org: ${byOrg.map(item => `${item.label}: ${item.value}`).join(" · ")}` : "Resumo de retries do backend."}
      />
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
      {label}
      {children}
    </label>
  );
}


export function WebhookFilterToolbar({
  filters,
  onChange,
  onApply,
  onReset,
}: {
  filters: WebhookFilters;
  onChange: (filters: WebhookFilters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const update = (patch: Partial<WebhookFilters>) => onChange({ ...filters, ...patch });

  return (
    <AppFiltersBar className="gap-3">
      <div className="flex flex-1 flex-wrap gap-3">
        <FilterField label="Status">
          <AppSelect
            value={filters.status}
            onValueChange={value =>
              update({
                status: value as WebhookFilters["status"],
              })
            }
            ariaLabel="Filtrar webhooks por status"
            options={[
              { value: "ALL", label: "Todos" },
              ...WEBHOOK_STATUSES.map(status => ({
                value: status,
                label: statusLabel(status),
              })),
            ]}
          />
        </FilterField>
        <FilterField label="Provider">
          <AppInput value={filters.provider} onChange={event => update({ provider: event.target.value })} placeholder="whatsapp-cloud" />
        </FilterField>
        <FilterField label="Trace ID">
          <AppInput value={filters.traceId} onChange={event => update({ traceId: event.target.value })} placeholder="trace_..." />
        </FilterField>
        <FilterField label="Provider message ID">
          <AppInput value={filters.providerMessageId} onChange={event => update({ providerMessageId: event.target.value })} placeholder="wamid..." />
        </FilterField>
        <FilterField label="Criado de">
          <AppInput type="datetime-local" value={filters.createdAtFrom} onChange={event => update({ createdAtFrom: event.target.value })} />
        </FilterField>
        <FilterField label="Criado até">
          <AppInput type="datetime-local" value={filters.createdAtTo} onChange={event => update({ createdAtTo: event.target.value })} />
        </FilterField>
        <FilterField label="Busca local">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <AppInput className="pl-9" value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="erro, id, trace..." />
          </div>
        </FilterField>
      </div>
      <div className="flex items-end gap-2 self-end">
        <Button type="button" variant="ghost" onClick={onReset}>Limpar</Button>
        <Button type="button" onClick={onApply}>Aplicar filtros</Button>
      </div>
    </AppFiltersBar>
  );
}

function EventTable({
  events,
  selectedIds,
  selectedId,
  onToggle,
  onSelect,
  onReplay,
}: {
  events: WebhookEvent[];
  selectedIds: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (event: WebhookEvent) => void;
  onReplay: (event: WebhookEvent) => void;
}) {
  return (
    <AppSectionCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full nexo-data-table text-sm">
          <thead>
            <tr>
              <th className="w-10"><span className="sr-only">Selecionar</span></th>
              <th>Status</th>
              <th>Provider</th>
              <th>Trace ID</th>
              <th>Provider msg</th>
              <th>Retries</th>
              <th>Criado</th>
              <th>Processado</th>
              <th>Erro</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id} className={cn("cursor-pointer", selectedId === event.id && "bg-[var(--accent-soft)]/60")} onClick={() => onSelect(event)}>
                <td onClick={click => click.stopPropagation()}>
                  <AppCheckbox
                    aria-label={`Selecionar evento ${event.id}`}
                    checked={selectedIds.has(event.id)}
                    onCheckedChange={() => onToggle(event.id)}
                    disabled={!canReplayEvent(event)}
                  />
                </td>
                <td><AppToneStatusBadge label={statusLabel(event.status)} tone={statusTone(event.status)} /></td>
                <td>{event.provider ?? "—"}</td>
                <td className="font-mono text-xs">{event.traceId ?? "—"}</td>
                <td className="font-mono text-xs">{event.providerMessageId ?? "—"}</td>
                <td>{event.retryAttempts ?? 0}</td>
                <td>{formatWebhookDate(event.createdAt)}</td>
                <td>{formatWebhookDate(event.processedAt)}</td>
                <td className="max-w-[260px] text-[var(--text-muted)]">{getErrorPreview(event.errorMessage)}</td>
                <td>
                  <Button type="button" size="sm" variant={event.status === "FAILED" ? "primary" : "ghost"} disabled={!canReplayEvent(event)} onClick={click => { click.stopPropagation(); onReplay(event); }}>
                    {event.status === "FAILED" ? "Reprocessar" : "Forçar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppSectionCard>
  );
}

function DetailPanel({ event, detailPayload, isLoading, onReplay }: { event: WebhookEvent | null; detailPayload: unknown; isLoading: boolean; onReplay: (event: WebhookEvent) => void }) {
  const detail = (asRecord(detailPayload).id ? asRecord(detailPayload) : event) as WebhookEvent | null;
  const metadata = getMetadata(detail);
  const metadataEntries = metadata ? Object.entries(metadata).slice(0, 8) : [];

  if (!event) {
    return (
      <AppSectionCard className="lg:sticky lg:top-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Inspeção segura</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Selecione um evento para ver metadados normalizados, ciclo de status e elegibilidade de replay sem expor payload bruto.</p>
      </AppSectionCard>
    );
  }

  return (
    <AppSectionCard className="space-y-4 lg:sticky lg:top-4" aria-label="Detalhe do webhook">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Evento {event.id}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Detalhe operacional fornecido pelo BFF/backend.</p>
        </div>
        <AppToneStatusBadge label={statusLabel(detail?.status)} tone={statusTone(detail?.status)} />
      </div>

      {isLoading ? <p className="text-sm text-[var(--text-muted)]">Carregando detalhe...</p> : null}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-[var(--text-muted)]">Provider</dt><dd className="font-medium text-[var(--text-primary)]">{detail?.provider ?? "—"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Retries</dt><dd className="font-medium text-[var(--text-primary)]">{detail?.retryAttempts ?? 0}</dd></div>
        <div className="col-span-2"><dt className="text-[var(--text-muted)]">Trace ID</dt><dd className="break-all font-mono text-xs text-[var(--text-primary)]">{detail?.traceId ?? "—"}</dd></div>
        <div className="col-span-2"><dt className="text-[var(--text-muted)]">Provider message ID</dt><dd className="break-all font-mono text-xs text-[var(--text-primary)]">{detail?.providerMessageId ?? "—"}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Criado</dt><dd>{formatWebhookDate(detail?.createdAt)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">Processado</dt><dd>{formatWebhookDate(detail?.processedAt)}</dd></div>
      </dl>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Ciclo de status</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {WEBHOOK_STATUSES.map(status => (
            <span key={status} className={cn("rounded-full border px-2.5 py-1", detail?.status === status ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]" : "border-[var(--border-subtle)] text-[var(--text-muted)]")}>
              {statusLabel(status)}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Metadados normalizados</p>
        {metadataEntries.length ? (
          <dl className="mt-2 space-y-2 text-sm">
            {metadataEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 rounded-lg bg-[var(--surface-elevated)] px-3 py-2">
                <dt className="text-[var(--text-muted)]">{key}</dt>
                <dd className="max-w-[220px] truncate text-right text-[var(--text-primary)]">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-2 text-sm text-[var(--text-muted)]">Nenhum metadado normalizado disponível.</p>}
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Erro</p>
        <p className="mt-2 text-sm text-[var(--text-primary)]">{getErrorPreview(detail?.errorMessage, 180)}</p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Replay seguro</p>
          <p className="text-xs text-[var(--text-muted)]">{canReplayEvent(detail) ? (forceReplayRequiresConfirmation(detail) ? "Exige confirmação explícita." : "Elegível para replay padrão.") : "Backend marcou como indisponível."}</p>
        </div>
        <Button type="button" size="sm" disabled={!canReplayEvent(detail)} onClick={() => detail && onReplay(detail)}>
          {detail?.status === "FAILED" ? "Reprocessar" : "Forçar replay"}
        </Button>
      </div>

      <details className="rounded-xl border border-dashed border-[var(--border-subtle)] p-3 text-sm text-[var(--text-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Diagnóstico seguro (sem payload bruto)</summary>
        <p className="mt-2">Esta tela mostra apenas metadados normalizados retornados pelo BFF. Payload bruto completo permanece protegido no backend.</p>
      </details>
    </AppSectionCard>
  );
}

export default function WhatsAppWebhookRecoveryPage() {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState<WebhookFilters>(defaultWebhookFilters);
  const [appliedFilters, setAppliedFilters] = useState<WebhookFilters>(defaultWebhookFilters);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [replayDialog, setReplayDialog] = useState<ReplayDialogState>(null);

  const listParams = useMemo(() => buildWebhookEventListParams(appliedFilters, cursor), [appliedFilters, cursor]);
  const dlqStatsQuery = trpc.whatsapp.webhookDlqStats.useQuery(undefined);
  const eventsQuery = trpc.whatsapp.listWebhookEvents.useQuery(listParams);
  const detailQuery = trpc.whatsapp.getWebhookEvent.useQuery(
    { id: selectedEvent?.id ?? "" },
    { enabled: Boolean(selectedEvent?.id) }
  );

  const replaySingle = trpc.whatsapp.replayWebhookEvent.useMutation();
  const replaySelected = trpc.whatsapp.replayWebhookEvents.useMutation();

  const events = useMemo(() => filterEventsBySearch(getItems(eventsQuery.data), appliedFilters.search), [eventsQuery.data, appliedFilters.search]);
  const nextCursor = getNextCursor(eventsQuery.data);
  const selectedEvents = events.filter(event => selectedIds.has(event.id));
  const failedSelectedCount = selectedEvents.filter(event => event.status === "FAILED").length;

  const refresh = async () => {
    await Promise.all([
      utils.whatsapp.listWebhookEvents.invalidate(),
      utils.whatsapp.webhookDlqStats.invalidate(),
      selectedEvent?.id ? utils.whatsapp.getWebhookEvent.invalidate({ id: selectedEvent.id }) : Promise.resolve(),
    ]);
  };

  const requestSingleReplay = (event: WebhookEvent) => {
    if (!canReplayEvent(event)) {
      toast.error("Evento não elegível para replay pelo backend.");
      return;
    }
    const force = getReplayMode(event) === "force";
    setReplayDialog({ kind: "single", event, force });
  };

  const requestSelectedReplay = () => {
    const replayable = selectedEvents.filter(canReplayEvent);
    if (!replayable.length) {
      toast.message("Selecione eventos falhos elegíveis para replay.");
      return;
    }
    const force = replayable.some(forceReplayRequiresConfirmation);
    setReplayDialog({ kind: "selected", events: replayable, force });
  };

  const confirmReplay = async () => {
    if (!replayDialog) return;
    try {
      if (replayDialog.kind === "single") {
        await replaySingle.mutateAsync({ id: replayDialog.event.id, force: replayDialog.force || undefined });
        toast.success(replayDialog.force ? "Force replay solicitado." : "Replay solicitado com segurança.");
      } else {
        await replaySelected.mutateAsync({ ids: replayDialog.events.map(event => event.id), force: replayDialog.force || undefined });
        toast.success(`${replayDialog.events.length} eventos enviados para replay.`);
        setSelectedIds(new Set());
      }
      setReplayDialog(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar replay.");
    }
  };

  const applyFilters = () => {
    setCursor(null);
    setAppliedFilters(filters);
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setCursor(null);
    setFilters(defaultWebhookFilters);
    setAppliedFilters(defaultWebhookFilters);
    setSelectedIds(new Set());
  };

  return (
    <AppPageShell className="space-y-4">
      <AppOperationalHeader
        title="Recuperação de webhooks WhatsApp"
        description="Monitore a DLQ, investigue eventos normalizados e reexecute mensagens com confirmação para ações sensíveis."
        primaryAction={<Button type="button" onClick={() => void refresh()}>Atualizar</Button>}
        secondaryActions={<Button type="button" variant="ghost" disabled={!selectedEvents.length} onClick={requestSelectedReplay}>Reprocessar selecionados ({failedSelectedCount || selectedEvents.length})</Button>}
        contextChips={<><AppToneStatusBadge label="Fonte: backend/BFF" tone="info" /><AppToneStatusBadge label="Payload bruto oculto" tone="neutral" /></>}
      />

      {dlqStatsQuery.isLoading ? <AppPageLoadingState title="Carregando DLQ" description="Buscando estatísticas de falhas no backend." /> : null}
      {dlqStatsQuery.isError ? <AppPageErrorState title="DLQ indisponível" description={dlqStatsQuery.error.message} onAction={() => void dlqStatsQuery.refetch()} /> : <DlqSummaryCards statsPayload={dlqStatsQuery.data} />}

      <WebhookFilterToolbar filters={filters} onChange={setFilters} onApply={applyFilters} onReset={resetFilters} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AppSectionBlock title="Eventos de webhook" subtitle="Falhas aparecem primeiro por padrão. Selecione uma linha para inspecionar sem abrir o payload bruto.">
          {eventsQuery.isLoading ? <AppPageLoadingState title="Carregando eventos" description="Consultando eventos normalizados no BFF." /> : null}
          {eventsQuery.isError ? <AppPageErrorState title="Não foi possível listar eventos" description={eventsQuery.error.message} onAction={() => void eventsQuery.refetch()} /> : null}
          {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 ? (
            <AppPageEmptyState title="Nenhum evento encontrado" description="Ajuste filtros ou mantenha o padrão FAILED para monitorar a DLQ operacional." />
          ) : null}
          {events.length ? <EventTable events={events} selectedIds={selectedIds} selectedId={selectedEvent?.id ?? null} onToggle={id => setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={setSelectedEvent} onReplay={requestSingleReplay} /> : null}
          {nextCursor ? <div className="mt-3 flex justify-end"><Button type="button" variant="ghost" onClick={() => setCursor(nextCursor)}>Carregar próxima página</Button></div> : null}
        </AppSectionBlock>

        <DetailPanel event={selectedEvent} detailPayload={detailQuery.data} isLoading={detailQuery.isLoading} onReplay={requestSingleReplay} />
      </div>

      <ConfirmModal
        open={Boolean(replayDialog)}
        onOpenChange={nextOpen => {
          if (!nextOpen) setReplayDialog(null);
        }}
        title={
          replayDialog?.force
            ? "Confirmar force replay"
            : "Confirmar replay"
        }
        description={
          replayDialog?.kind === "selected"
            ? `${replayDialog.events.length} evento(s) serão reenfileirados. ${
                replayDialog.force
                  ? "Há eventos fora de FAILED; confirme explicitamente para evitar duplicidade."
                  : "Somente eventos elegíveis serão enviados."
              }`
            : replayDialog
              ? `Evento ${replayDialog.event.id} será reenfileirado. ${
                  replayDialog.force
                    ? "Esta ação pode duplicar efeitos e exige confirmação."
                    : "O backend preserva a segurança do replay."
                }`
              : ""
        }
        confirmLabel={
          replayDialog?.force
            ? "Confirmar force replay"
            : "Confirmar replay"
        }
        isPending={
          replaySingle.isPending || replaySelected.isPending
        }
        onConfirm={() => void confirmReplay()}
      />
    </AppPageShell>
  );
}

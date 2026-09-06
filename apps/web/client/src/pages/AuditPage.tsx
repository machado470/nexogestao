import { useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardList, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";

export const AUDIT_PAGE_SIZE = 25;

type AuditEvent = {
  id: string;
  createdAt: string;
  actorName?: string | null;
  actorPersonId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  orgId: string;
  metadata?: unknown;
};

type AuditPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type AuditSummary = {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  byActor: Array<{ actorPersonId?: string | null; count: number }>;
};

type AuditFilters = {
  from?: string;
  to?: string;
  actorPersonId?: string;
  action?: string;
};

const EMPTY_PAGINATION: AuditPagination = { page: 1, limit: AUDIT_PAGE_SIZE, total: 0, pages: 0 };
const EMPTY_SUMMARY: AuditSummary = { total: 0, byAction: [], byActor: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapEnvelope(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  if (isRecord(payload.data) && (Array.isArray(payload.data.data) || isRecord(payload.data.pagination))) {
    return payload.data;
  }
  return payload;
}

export function normalizeAuditList(payload: unknown): { events: AuditEvent[]; pagination: AuditPagination } {
  const envelope = unwrapEnvelope(payload);
  if (!isRecord(envelope)) return { events: [], pagination: EMPTY_PAGINATION };

  const events = Array.isArray(envelope.data) ? envelope.data as AuditEvent[] : [];
  const pagination = isRecord(envelope.pagination) ? envelope.pagination : {};

  return {
    events,
    pagination: {
      page: Number(pagination.page) || 1,
      limit: Number(pagination.limit) || AUDIT_PAGE_SIZE,
      total: Number(pagination.total) || 0,
      pages: Number(pagination.pages) || 0,
    },
  };
}

export function normalizeAuditSummary(payload: unknown): AuditSummary {
  const envelope = isRecord(payload) && isRecord(payload.data) && "total" in payload.data
    ? payload.data
    : payload;
  if (!isRecord(envelope)) return EMPTY_SUMMARY;

  return {
    total: Number(envelope.total) || 0,
    byAction: Array.isArray(envelope.byAction) ? envelope.byAction as AuditSummary["byAction"] : [],
    byActor: Array.isArray(envelope.byActor) ? envelope.byActor as AuditSummary["byActor"] : [],
  };
}

export function getAuditEventMetadata(event: AuditEvent | null): unknown {
  return event?.metadata ?? null;
}

export function getAuditEmptyState(events: AuditEvent[], isLoading: boolean): boolean {
  return !isLoading && events.length === 0;
}

export function getNextAuditPage(currentPage: number, totalPages: number): number {
  return Math.min(currentPage + 1, Math.max(totalPages, 1));
}

function toStartOfDayIso(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00.000`).toISOString() : undefined;
}

function toEndOfDayIso(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function formatMetadata(metadata: unknown) {
  return JSON.stringify(metadata ?? null, null, 2);
}

function CompactRanking({ items }: { items: Array<{ label: string; count: number }> }) {
  if (!items.length) return <span className="text-sm text-[var(--text-muted)]">Sem dados</span>;

  return (
    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
      {items.slice(0, 3).map(item => (
        <li key={item.label} className="flex items-center justify-between gap-3">
          <span className="truncate" title={item.label}>{item.label}</span>
          <strong className="text-[var(--text-primary)]">{item.count}</strong>
        </li>
      ))}
    </ul>
  );
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState({ from: "", to: "", actorPersonId: "", action: "" });
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [last24HoursFrom] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const { isAuthenticated, role } = useAuth();
  const canLoadAudit = isAuthenticated && role === "ADMIN";

  const listQuery = trpc.audit.listEvents.useQuery(
    { page, limit: AUDIT_PAGE_SIZE, ...filters },
    { enabled: canLoadAudit, retry: false }
  );
  const summaryQuery = trpc.audit.getSummary.useQuery(
    { from: filters.from, to: filters.to },
    { enabled: canLoadAudit, retry: false }
  );
  const last24HoursQuery = trpc.audit.getSummary.useQuery(
    { from: last24HoursFrom },
    { enabled: canLoadAudit, retry: false }
  );

  const { events, pagination } = useMemo(() => normalizeAuditList(listQuery.data), [listQuery.data]);
  const summary = useMemo(() => normalizeAuditSummary(summaryQuery.data), [summaryQuery.data]);
  const last24HoursSummary = useMemo(() => normalizeAuditSummary(last24HoursQuery.data), [last24HoursQuery.data]);

  const frequentActions = summary.byAction.map(item => ({ label: item.action, count: item.count }));
  const activeUsers = summary.byActor.map(item => ({
    label: item.actorPersonId || "Sistema",
    count: item.count,
  }));
  const isSummaryLoading = summaryQuery.isLoading || last24HoursQuery.isLoading;
  const hasError = listQuery.isError || summaryQuery.isError || last24HoursQuery.isError;

  function applyFilters() {
    setPage(1);
    setFilters({
      from: toStartOfDayIso(draftFilters.from),
      to: toEndOfDayIso(draftFilters.to),
      actorPersonId: draftFilters.actorPersonId.trim() || undefined,
      action: draftFilters.action.trim() || undefined,
    });
  }

  function clearFilters() {
    setDraftFilters({ from: "", to: "", actorPersonId: "", action: "" });
    setFilters({});
    setPage(1);
  }

  function retry() {
    void listQuery.refetch();
    void summaryQuery.refetch();
    void last24HoursQuery.refetch();
  }

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="audit-admin-page">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Administração</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Auditoria Administrativa</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          Consulte quem fez o quê dentro do sistema. Esta área é independente da Timeline operacional.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de auditoria">
        <Card className="gap-3 py-4"><CardHeader className="px-4"><CardTitle className="text-sm">Total de eventos</CardTitle></CardHeader><CardContent className="px-4 text-2xl font-semibold">{isSummaryLoading ? "…" : summary.total}</CardContent></Card>
        <Card className="gap-3 py-4"><CardHeader className="px-4"><CardTitle className="text-sm">Últimas 24h</CardTitle></CardHeader><CardContent className="px-4 text-2xl font-semibold">{isSummaryLoading ? "…" : last24HoursSummary.total}</CardContent></Card>
        <Card className="gap-3 py-4"><CardHeader className="px-4"><CardTitle className="text-sm">Tipos mais frequentes</CardTitle></CardHeader><CardContent className="px-4"><CompactRanking items={frequentActions} /></CardContent></Card>
        <Card className="gap-3 py-4"><CardHeader className="px-4"><CardTitle className="text-sm">Usuários mais ativos</CardTitle></CardHeader><CardContent className="px-4"><CompactRanking items={activeUsers} /></CardContent></Card>
      </section>

      <Card className="gap-4 py-4">
        <CardHeader className="px-4"><CardTitle className="text-base">Filtros disponíveis</CardTitle></CardHeader>
        <CardContent className="grid gap-3 px-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm text-[var(--text-secondary)]">Período inicial<Input type="date" value={draftFilters.from} onChange={event => setDraftFilters(current => ({ ...current, from: event.target.value }))} /></label>
          <label className="space-y-1 text-sm text-[var(--text-secondary)]">Período final<Input type="date" value={draftFilters.to} onChange={event => setDraftFilters(current => ({ ...current, to: event.target.value }))} /></label>
          <label className="space-y-1 text-sm text-[var(--text-secondary)]">Usuário<Input placeholder="ID do usuário" value={draftFilters.actorPersonId} onChange={event => setDraftFilters(current => ({ ...current, actorPersonId: event.target.value }))} /></label>
          <label className="space-y-1 text-sm text-[var(--text-secondary)]">Tipo de evento<Input placeholder="Ex.: CUSTOMER_UPDATED" value={draftFilters.action} onChange={event => setDraftFilters(current => ({ ...current, action: event.target.value }))} /></label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <Button type="button" onClick={applyFilters}><Search />Aplicar filtros</Button>
            <Button type="button" variant="neutral" onClick={clearFilters}><X />Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {hasError ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Não foi possível carregar a auditoria.</strong><p className="mt-1">Tente novamente. Se o erro persistir, confirme sua sessão administrativa.</p><Button type="button" variant="neutral" className="mt-3" onClick={retry}>Tentar novamente</Button></div>
        </div>
      ) : null}

      <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="text-base">Eventos de auditoria</CardTitle></CardHeader>
        <CardContent className="px-4">
          {listQuery.isLoading ? (
            <div className="space-y-3 py-4" aria-label="Carregando eventos de auditoria">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-[var(--surface-elevated)]" />)}
            </div>
          ) : getAuditEmptyState(events, listQuery.isLoading) ? (
            <Empty><EmptyHeader><EmptyMedia variant="icon"><ClipboardList /></EmptyMedia><EmptyTitle>Nenhum evento encontrado</EmptyTitle><EmptyDescription>Não há eventos de auditoria para os filtros selecionados.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Data/Hora</TableHead><TableHead>Usuário</TableHead><TableHead>Evento</TableHead><TableHead>Entidade</TableHead><TableHead>Entidade ID</TableHead><TableHead>Organização</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.map(event => (
                  <TableRow key={event.id} className="cursor-pointer" tabIndex={0} onClick={() => setSelectedEvent(event)} onKeyDown={keyboardEvent => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") setSelectedEvent(event); }}>
                    <TableCell>{formatDateTime(event.createdAt)}</TableCell><TableCell>{event.actorName || event.actorPersonId || "Sistema"}</TableCell><TableCell className="font-medium">{event.action}</TableCell><TableCell>{event.entityType}</TableCell><TableCell>{event.entityId || "—"}</TableCell><TableCell>{event.orgId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {!listQuery.isLoading && events.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 pt-4 text-sm text-[var(--text-secondary)]">
            <span>Página {pagination.page} de {Math.max(pagination.pages, 1)} · {pagination.total} evento(s)</span>
            <div className="flex gap-2"><Button type="button" variant="neutral" size="sm" disabled={page <= 1} onClick={() => setPage(current => Math.max(current - 1, 1))}><ChevronLeft />Anterior</Button><Button type="button" variant="neutral" size="sm" disabled={pagination.pages <= page} onClick={() => setPage(current => getNextAuditPage(current, pagination.pages))}>Próxima<ChevronRight /></Button></div>
          </div>
        ) : null}
      </Card>

      <Dialog open={Boolean(selectedEvent)} onOpenChange={open => { if (!open) setSelectedEvent(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detalhe do evento de auditoria</DialogTitle><DialogDescription>Metadata completo registrado para o evento selecionado.</DialogDescription></DialogHeader>
          {selectedEvent ? <div className="space-y-3 overflow-auto px-6 pb-6 text-sm"><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">Evento</dt><dd className="font-medium">{selectedEvent.action}</dd></div><div><dt className="text-[var(--text-muted)]">Data/Hora</dt><dd>{formatDateTime(selectedEvent.createdAt)}</dd></div><div><dt className="text-[var(--text-muted)]">Usuário</dt><dd>{selectedEvent.actorName || selectedEvent.actorPersonId || "Sistema"}</dd></div><div><dt className="text-[var(--text-muted)]">Organização</dt><dd>{selectedEvent.orgId}</dd></div><div><dt className="text-[var(--text-muted)]">Entidade</dt><dd>{selectedEvent.entityType}</dd></div><div><dt className="text-[var(--text-muted)]">Entidade ID</dt><dd>{selectedEvent.entityId || "—"}</dd></div></dl><div><h3 className="mb-2 font-semibold">Metadata</h3><pre className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">{formatMetadata(getAuditEventMetadata(selectedEvent))}</pre></div></div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

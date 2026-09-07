import { useMemo, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  Fingerprint,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useLocation } from "wouter";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AppPageShell, AppSelect } from "@/components/app-system";
import {
  AppContextChip,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";

export type OfficialTimelineEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
  actor: { name: string } | null;
  entity: { type: string; id: string; href: string } | null;
  module: string | null;
  severity: string | null;
  title: string | null;
  description: string | null;
  consequence: string | null;
  recommendedAction: string | null;
  origin: string | null;
  metadata: Record<string, string | number | boolean>;
};

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: "Pagamento recebido",
  CHARGE_CREATED: "Cobrança criada",
  SERVICE_ORDER_STARTED: "Ordem de serviço iniciada",
  SERVICE_ORDER_COMPLETED: "Ordem de serviço concluída",
  APPOINTMENT_CANCELLED: "Agendamento cancelado",
  APPOINTMENT_CONFIRMED: "Agendamento confirmado",
  MESSAGE_SENT: "Mensagem enviada",
  MESSAGE_FAILED: "Mensagem com falha",
  RISK_UPDATED: "Risco atualizado",
  GOVERNANCE_RUN_COMPLETED: "Verificação de governança concluída",
  OPERATIONAL_STATE_CHANGED: "Estado operacional alterado",
};

const ENTITY_LABELS: Record<string, string> = {
  customer: "Cliente",
  service_order: "Ordem de serviço",
  appointment: "Agendamento",
  charge: "Cobrança",
};

const METADATA_LABELS: Record<string, string> = {
  amountCents: "Valor (centavos)",
  currency: "Moeda",
  previousState: "Estado anterior",
  nextState: "Novo estado",
  riskLevel: "Nível de risco informado",
  score: "Pontuação informada",
  result: "Resultado",
  status: "Status",
  reasonCode: "Código do motivo",
  origin: "Origem",
};

export function officialEventLabel(event: OfficialTimelineEvent) {
  return (
    event.title ?? EVENT_LABELS[event.eventType] ?? "Evento não classificado"
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function safeMetadataEntries(event: OfficialTimelineEvent) {
  return Object.entries(event.metadata ?? {}).filter(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  );
}

export function hasOfficialCta(event: OfficialTimelineEvent) {
  return Boolean(event.entity?.id && event.entity?.href);
}

function eventMatchesSearch(event: OfficialTimelineEvent, search: string) {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  if (!term) return true;
  return [
    officialEventLabel(event),
    event.eventType,
    event.description,
    event.actor?.name,
    event.entity?.type,
    event.entity?.id,
    event.module,
    event.origin,
    ...safeMetadataEntries(event).flatMap(([key, value]) => [
      key,
      String(value),
    ]),
  ].some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
}

export default function TimelinePage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [module, setModule] = useState("all");
  const [actor, setActor] = useState("all");

  const query = trpc.timeline.listByOrg.useQuery(
    { limit: PAGE_SIZE },
    { enabled: isAuthenticated, retry: false }
  );
  const events = normalizeArrayPayload<OfficialTimelineEvent>(query.data);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map(event => event.eventType))).sort(),
    [events]
  );
  const modules = useMemo(
    () =>
      Array.from(
        new Set(events.map(event => event.module).filter(Boolean) as string[])
      ).sort(),
    [events]
  );
  const actors = useMemo(
    () =>
      Array.from(
        new Set(
          events.map(event => event.actor?.name).filter(Boolean) as string[]
        )
      ).sort(),
    [events]
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        event =>
          eventMatchesSearch(event, search) &&
          (eventType === "all" || event.eventType === eventType) &&
          (module === "all" || event.module === module) &&
          (actor === "all" || event.actor?.name === actor)
      ),
    [actor, events, eventType, module, search]
  );
  const hasActiveFilters = Boolean(
    search.trim() || eventType !== "all" || module !== "all" || actor !== "all"
  );

  const clearFilters = () => {
    setSearch("");
    setEventType("all");
    setModule("all");
    setActor("all");
  };

  return (
    <AppPageShell>
      <AppOperationalHeader
        title="Timeline"
        description="Trilha cronológica de fatos e evidências oficiais para auditoria e rastreabilidade da operação."
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={`mr-2 size-3.5 ${query.isFetching ? "animate-spin" : ""}`}
            />
            Atualizar eventos
          </Button>
        }
        contextChips={
          query.isSuccess ? (
            <>
              <AppContextChip tone="accent">
                {events.length}{" "}
                {events.length === 1
                  ? "evento retornado"
                  : "eventos retornados"}
              </AppContextChip>
              {hasActiveFilters ? (
                <AppContextChip>
                  {filteredEvents.length} no filtro atual
                </AppContextChip>
              ) : null}
            </>
          ) : null
        }
      />

      <AppFiltersBar className="gap-3 p-3 md:p-4">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
            <Label htmlFor="timeline-search">Buscar nas evidências</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                id="timeline-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Tipo, descrição, entidade..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de evento</Label>
            <AppSelect
              ariaLabel="Tipo de evento"
              value={eventType}
              onValueChange={setEventType}
              options={[
                { value: "all", label: "Todos os tipos" },
                ...eventTypes.map(value => ({
                  value,
                  label: EVENT_LABELS[value] ?? value,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Módulo ou entidade</Label>
            <AppSelect
              ariaLabel="Módulo ou entidade"
              value={module}
              onValueChange={setModule}
              options={[
                { value: "all", label: "Todos os módulos" },
                ...modules.map(value => ({ value, label: value })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável ou ator</Label>
            <AppSelect
              ariaLabel="Responsável ou ator"
              value={actor}
              onValueChange={setActor}
              options={[
                { value: "all", label: "Todos os atores" },
                ...actors.map(value => ({ value, label: value })),
              ]}
            />
          </div>
        </div>
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        ) : null}
      </AppFiltersBar>

      <AppSectionBlock
        title="Trilha de auditoria"
        subtitle="A ordem relativa é exatamente a recebida da fonte oficial."
      >
        {query.isLoading ? (
          <AppPageLoadingState
            title="Carregando eventos"
            description="Consultando a trilha oficial sem interromper o restante da página."
          />
        ) : query.isError ? (
          <AppPageErrorState
            title="Não foi possível carregar a Timeline"
            description="A fonte oficial de eventos está indisponível. Nenhum estado alternativo foi presumido."
            onAction={() => query.refetch()}
          />
        ) : filteredEvents.length === 0 ? (
          <AppPageEmptyState
            title="Nenhum evento correspondente"
            description={
              hasActiveFilters
                ? "Não existem eventos correspondentes aos filtros aplicados no recorte retornado."
                : "Ainda não existem eventos na trilha retornada pela fonte oficial."
            }
          />
        ) : (
          <ol className="relative" aria-label="Eventos da Timeline">
            {filteredEvents.map((event, index) => {
              const metadata = safeMetadataEntries(event);
              return (
                <li
                  key={event.id}
                  className="relative grid min-w-0 gap-3 pb-6 pl-8 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6"
                >
                  {index < filteredEvents.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-[7px] top-4 w-px bg-[var(--border-subtle)]"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 size-[15px] rounded-full border-[3px] border-[var(--surface-base)] bg-[var(--accent-primary)] outline outline-1 outline-[var(--border-emphasis)]"
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-primary)]">
                        {event.eventType}
                      </span>
                      {event.severity ? (
                        <AppStatusBadge label={event.severity} />
                      ) : null}
                      {event.module ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          {event.module}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-[var(--text-primary)] md:text-[15px]">
                      {officialEventLabel(event)}
                    </h3>
                    {event.description ? (
                      <p className="mt-1 break-words text-sm leading-6 text-[var(--text-secondary)]">
                        {event.description}
                      </p>
                    ) : null}

                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <UserRound className="size-3.5 shrink-0 text-[var(--text-muted)]" />
                        <dt className="sr-only">Ator</dt>
                        <dd className="truncate">
                          {event.actor?.name ?? "Ator não informado"}
                        </dd>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Fingerprint className="size-3.5 shrink-0 text-[var(--text-muted)]" />
                        <dt className="sr-only">Entidade relacionada</dt>
                        <dd className="break-all">
                          {event.entity
                            ? `${ENTITY_LABELS[event.entity.type] ?? event.entity.type} · ${event.entity.id}`
                            : "Entidade não informada"}
                        </dd>
                      </div>
                      {event.origin ? (
                        <div>
                          <dt className="sr-only">Origem</dt>
                          <dd>Origem: {event.origin}</dd>
                        </div>
                      ) : null}
                    </dl>

                    {metadata.length > 0 ? (
                      <details className="mt-3 text-xs text-[var(--text-secondary)]">
                        <summary className="w-fit cursor-pointer rounded-sm font-medium text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]">
                          Ver metadados da evidência
                        </summary>
                        <dl className="mt-2 grid gap-x-6 gap-y-2 rounded-lg bg-[var(--surface-subtle)] p-3 sm:grid-cols-2">
                          {metadata.map(([key, value]) => (
                            <div key={key} className="min-w-0">
                              <dt className="font-medium text-[var(--text-muted)]">
                                {METADATA_LABELS[key] ?? key}
                              </dt>
                              <dd className="break-words text-[var(--text-primary)]">
                                {String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ) : null}

                    {hasOfficialCta(event) ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(event.entity!.href)}
                      >
                        Abrir {ENTITY_LABELS[event.entity!.type] ?? "entidade"}
                        <ExternalLink className="ml-2 size-3.5" />
                      </Button>
                    ) : null}
                  </div>

                  <time
                    dateTime={event.occurredAt}
                    className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--text-secondary)] md:row-start-1 md:justify-self-end"
                  >
                    <CalendarClock className="size-3.5" />
                    {formatDateTime(event.occurredAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </AppSectionBlock>
    </AppPageShell>
  );
}

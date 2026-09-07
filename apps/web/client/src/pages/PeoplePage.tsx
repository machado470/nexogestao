import { useMemo, useState } from "react";
import { CalendarClock, Trash2, Wrench } from "lucide-react";
import { useLocation } from "wouter";
import CreatePersonModal from "@/components/CreatePersonModal";
import EditPersonModal from "@/components/EditPersonModal";
import { Button } from "@/components/ui/button";
import {
  AppOperationalStatusBadge,
  AppPageShell,
  AppPriorityBadge,
  AppRowActionsDropdown,
  AppSectionCard,
  AppStatusBadge,
  type AppOperationalStatus,
  type AppPriorityLevel,
} from "@/components/app-system";
import {
  AppContextWorkspace,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
} from "@/components/internal-page-system";
import { useAuth } from "@/contexts/AuthContext";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type LoadStatus = "IDLE" | "NORMAL" | "BUSY" | "OVERLOADED";
type CapacityStatus = "UNDER_CAPACITY" | "AT_CAPACITY" | "OVER_CAPACITY";
type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE_NOW" | "UNAVAILABLE_SOON";
type RecommendedActionTarget =
  | "PERSON"
  | "SERVICE_ORDERS"
  | "APPOINTMENTS"
  | "TIMELINE";

type AvailabilityException = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

type PersonNextAppointment = {
  id: string;
  customerName?: string | null;
  startsAt: string;
  status: string;
};

type PersonRecentServiceOrder = {
  id: string;
  number?: string | null;
  customerName?: string | null;
  status: string;
  dueAt?: string | null;
  completedAt?: string | null;
};

type PersonTimelineEvent = {
  id: string;
  eventType?: string | null;
  title?: string | null;
  description?: string | null;
  createdAt: string;
};

type TeamTimelineEvent = {
  id?: string;
  action?: string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  entityName?: string | null;
  customerName?: string | null;
  actorName?: string | null;
  personName?: string | null;
  createdAt?: string | null;
  occurredAt?: string | null;
};

type OperationalPerson = {
  personId: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "INVITED";
  openServiceOrdersCount: number;
  overdueServiceOrdersCount: number;
  futureAppointmentsCount: number;
  todayAppointmentsCount: number;
  lastActivityAt?: string | null;
  loadStatus: LoadStatus;
  dailyServiceOrderCapacity: number | null;
  dailyAppointmentCapacity: number | null;
  workloadNotes?: string | null;
  serviceOrderCapacityUsagePct: number | null;
  appointmentCapacityUsagePct: number | null;
  capacityStatus: CapacityStatus;
  availabilityStatus: AvailabilityStatus;
  currentAvailabilityException?: AvailabilityException | null;
  nextAvailabilityException?: AvailabilityException | null;
  operationalStatus: AppOperationalStatus;
  priority: AppPriorityLevel;
  interventionReason: string | null;
  recommendedActionLabel: string | null;
  recommendedActionTarget: RecommendedActionTarget | null;
  operationalSummaryText?: string | null;
  capacitySummaryText?: string | null;
  customers?: {
    activeCustomersCount: number;
    attendedCustomersCount: number;
    customersWithOpenServiceOrdersCount: number;
    customersWithOverdueServiceOrdersCount: number;
  };
  appointments?: { nextAppointments: PersonNextAppointment[] };
  serviceOrders?: {
    completedServiceOrdersCount: number;
    averageCompletionMinutes?: number | null;
    completionRatePct?: number | null;
    recentServiceOrders: PersonRecentServiceOrder[];
  };
  timeline?: { lastEvents: PersonTimelineEvent[] };
};

type RegistrationFilter = "all" | OperationalPerson["status"];
type AvailabilityFilter = "all" | AvailabilityStatus;
type PriorityFilter = "all" | AppPriorityLevel;

const availabilityLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Disponível",
  UNAVAILABLE_NOW: "Indisponível agora",
  UNAVAILABLE_SOON: "Indisponível em breve",
};

const capacityLabels: Record<CapacityStatus, string> = {
  UNDER_CAPACITY: "Dentro da capacidade",
  AT_CAPACITY: "No limite oficial",
  OVER_CAPACITY: "Acima da capacidade",
};

const loadLabels: Record<LoadStatus, string> = {
  IDLE: "Sem carga atribuída",
  NORMAL: "Carga normal",
  BUSY: "Carga alta",
  OVERLOADED: "Sobrecarregado",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatOfficialNumber(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined
    ? "Indisponível"
    : `${value}${suffix}`;
}

function registrationLabel(status: OperationalPerson["status"]) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "INACTIVE") return "Inativo";
  if (status === "SUSPENDED") return "Suspenso";
  return "Convidado";
}

function runOfficialRecommendation(
  person: OperationalPerson,
  actions: {
    openPerson: () => void;
    navigate: (path: string) => void;
  }
) {
  switch (person.recommendedActionTarget) {
    case "SERVICE_ORDERS":
      actions.navigate(`/service-orders?personId=${person.personId}`);
      return;
    case "APPOINTMENTS":
      actions.navigate(`/appointments?personId=${person.personId}`);
      return;
    case "TIMELINE":
      actions.navigate(`/timeline?personId=${person.personId}`);
      return;
    default:
      actions.openPerson();
  }
}

function timelineTitle(event: TeamTimelineEvent) {
  return (
    event.title ??
    event.description ??
    event.action ??
    event.type ??
    "Evento operacional registrado"
  );
}

export default function PeoplePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isInitializing, role } = useAuth();
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [registrationFilter, setRegistrationFilter] =
    useState<RegistrationFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const summaryQuery = trpc.people.operationalSummary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const timelineQuery = trpc.timeline.listByOrg.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: false }
  );
  const exceptionsQuery = trpc.people.listAvailabilityExceptions.useQuery(
    { personId: selectedPersonId ?? "" },
    { enabled: isAuthenticated && Boolean(selectedPersonId), retry: false }
  );
  const createAvailabilityException =
    trpc.people.createAvailabilityException.useMutation({
      onSuccess: async () => {
        setStartsAt("");
        setEndsAt("");
        setReason("");
        await Promise.all([
          utils.people.operationalSummary.invalidate(),
          utils.people.listAvailabilityExceptions.invalidate(),
        ]);
      },
    });
  const deleteAvailabilityException =
    trpc.people.deleteAvailabilityException.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.people.operationalSummary.invalidate(),
          utils.people.listAvailabilityExceptions.invalidate(),
        ]);
      },
    });

  const payload = normalizeObjectPayload<{ people?: OperationalPerson[] }>(
    summaryQuery.data
  );
  const people = normalizeArrayPayload<OperationalPerson>(payload?.people);
  const selectedPerson =
    people.find(person => person.personId === selectedPersonId) ?? null;
  const exceptions = normalizeArrayPayload<AvailabilityException>(
    exceptionsQuery.data
  );
  const teamTimelineEvents = normalizeArrayPayload<TeamTimelineEvent>(
    normalizeObjectPayload<{ events?: TeamTimelineEvent[] }>(timelineQuery.data)
      ?.events ?? timelineQuery.data
  ).slice(0, 5);

  const roles = useMemo(
    () =>
      Array.from(new Set(people.map(person => person.role).filter(Boolean))),
    [people]
  );
  // Presentation-only filters preserve the relative order returned by
  // people.operationalSummary. No ranking or operational classification occurs here.
  const filteredPeople = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    return people.filter(person => {
      if (registrationFilter !== "all" && person.status !== registrationFilter)
        return false;
      if (
        availabilityFilter !== "all" &&
        person.availabilityStatus !== availabilityFilter
      )
        return false;
      if (priorityFilter !== "all" && person.priority !== priorityFilter)
        return false;
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      if (!search) return true;
      return `${person.name} ${person.role} ${person.email ?? ""} ${person.phone ?? ""}`
        .toLowerCase()
        .includes(search);
    });
  }, [
    availabilityFilter,
    people,
    priorityFilter,
    queryText,
    registrationFilter,
    roleFilter,
  ]);

  const refresh = () => void summaryQuery.refetch();
  const submitAvailability = () => {
    if (!selectedPersonId || !startsAt || !endsAt) return;
    createAvailabilityException.mutate({
      personId: selectedPersonId,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      reason: reason.trim() || null,
    });
  };

  if (isInitializing) {
    return (
      <AppPageShell>
        <AppPageLoadingState title="Carregando equipe operacional" />
      </AppPageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppPageShell>
        <AppPageErrorState
          description="Sua sessão expirou. Entre novamente para supervisionar a equipe."
          actionLabel="Entrar novamente"
          onAction={() => navigate("/login")}
        />
      </AppPageShell>
    );
  }

  return (
    <AppPageShell className="gap-3">
      <AppOperationalHeader
        title="Equipe"
        description="Disponibilidade, capacidade e recomendações oficiais para gerir responsáveis sem reconstruir decisões no navegador."
        density="compact"
        primaryAction={
          <Button onClick={() => setCreateOpen(true)}>Nova pessoa</Button>
        }
        contextChips={
          <>
            <AppStatusBadge
              label={`${people.length} pessoa(s)`}
              tone="neutral"
            />
            {summaryQuery.data ? (
              <AppStatusBadge
                label="Resumo operacional atualizado"
                tone="success"
              />
            ) : (
              <AppStatusBadge
                label="Resumo operacional indisponível"
                tone="warning"
              />
            )}
          </>
        }
      />

      <AppFiltersBar className="min-w-0 flex-col items-stretch gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <label htmlFor="people-search" className="sr-only">
            Buscar pessoas
          </label>
          <input
            id="people-search"
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            placeholder="Buscar por nome, função ou contato"
            className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
          />
        </div>
        <label htmlFor="people-role-filter" className="sr-only">
          Filtrar por função
        </label>
        <select
          id="people-role-filter"
          value={roleFilter}
          onChange={event => setRoleFilter(event.target.value)}
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
        >
          <option value="all">Todas as funções</option>
          {roles.map(personRole => (
            <option key={personRole} value={personRole}>
              {personRole}
            </option>
          ))}
        </select>
        <label htmlFor="people-status-filter" className="sr-only">
          Filtrar por situação cadastral
        </label>
        <select
          id="people-status-filter"
          value={registrationFilter}
          onChange={event =>
            setRegistrationFilter(event.target.value as RegistrationFilter)
          }
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
        >
          <option value="all">Todas as situações</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
          <option value="SUSPENDED">Suspensos</option>
          <option value="INVITED">Convidados</option>
        </select>
        <label htmlFor="people-availability-filter" className="sr-only">
          Filtrar por disponibilidade oficial
        </label>
        <select
          id="people-availability-filter"
          value={availabilityFilter}
          onChange={event =>
            setAvailabilityFilter(event.target.value as AvailabilityFilter)
          }
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
        >
          <option value="all">Toda disponibilidade</option>
          {Object.entries(availabilityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="people-priority-filter" className="sr-only">
          Filtrar por prioridade oficial
        </label>
        <select
          id="people-priority-filter"
          value={priorityFilter}
          onChange={event =>
            setPriorityFilter(event.target.value as PriorityFilter)
          }
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
        >
          <option value="all">Todas as prioridades</option>
          {(["P0", "P1", "P2", "P3"] as const).map(priority => (
            <option key={priority} value={priority}>
              Prioridade {priority}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">
          {filteredPeople.length} resultado(s)
        </span>
      </AppFiltersBar>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        <AppSectionBlock
          title="Equipe operacional"
          subtitle="Pessoas na ordem oficial, com disponibilidade, capacidade, contexto e recomendação."
          className="min-w-0 xl:col-span-7"
          compact
        >
          {summaryQuery.isLoading ? (
            <AppPageLoadingState description="Carregando equipe..." />
          ) : summaryQuery.error ? (
            <AppPageErrorState
              description="O resumo operacional da equipe está indisponível; nenhuma normalidade foi inferida."
              actionLabel="Tentar novamente"
              onAction={refresh}
            />
          ) : people.length === 0 ? (
            <AppPageEmptyState
              title="Nenhuma pessoa cadastrada"
              description="Cadastre uma pessoa para formar a equipe operacional."
            />
          ) : filteredPeople.length === 0 ? (
            <AppPageEmptyState
              title="Nenhum resultado"
              description="Nenhuma pessoa corresponde aos filtros factuais e oficiais selecionados."
            />
          ) : (
            <div className="space-y-2" data-testid="people-operational-list">
              {filteredPeople.map(person => {
                const hasRecommendation = Boolean(
                  person.recommendedActionLabel &&
                  person.recommendedActionTarget
                );
                return (
                  <article
                    key={person.personId}
                    className={cn(
                      "min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3",
                      selectedPersonId === person.personId &&
                        "border-[var(--accent-primary)] bg-[var(--accent-soft)]/25"
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedPersonId(person.personId)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {person.name}
                          </h3>
                          <AppStatusBadge
                            label={registrationLabel(person.status)}
                            tone={
                              person.status === "ACTIVE" ? "success" : "neutral"
                            }
                          />
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {person.role} ·{" "}
                          {person.email ??
                            person.phone ??
                            "Contato não informado"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <AppOperationalStatusBadge
                            status={person.operationalStatus}
                          />
                          <AppPriorityBadge priority={person.priority} />
                          <AppStatusBadge
                            label={
                              availabilityLabels[person.availabilityStatus]
                            }
                            tone={
                              person.availabilityStatus === "AVAILABLE"
                                ? "success"
                                : "warning"
                            }
                          />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                          {person.interventionReason ??
                            person.operationalSummaryText ??
                            "Justificativa operacional indisponível"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Capacidade oficial: O.S.{" "}
                          {formatOfficialNumber(
                            person.dailyServiceOrderCapacity,
                            "/dia"
                          )}{" "}
                          · Agenda{" "}
                          {formatOfficialNumber(
                            person.dailyAppointmentCapacity,
                            "/dia"
                          )}{" "}
                          · {capacityLabels[person.capacityStatus]}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                          size="sm"
                          disabled={!hasRecommendation}
                          onClick={() =>
                            runOfficialRecommendation(person, {
                              openPerson: () =>
                                setSelectedPersonId(person.personId),
                              navigate,
                            })
                          }
                        >
                          {person.recommendedActionLabel ??
                            "Recomendação indisponível"}
                        </Button>
                        <AppRowActionsDropdown
                          triggerLabel={`Ações de ${person.name}`}
                          items={[
                            {
                              label: "Abrir detalhe",
                              tone: "primary",
                              onSelect: () =>
                                setSelectedPersonId(person.personId),
                            },
                            {
                              label: "Editar pessoa",
                              onSelect: () => setEditPersonId(person.personId),
                            },
                            {
                              label: "Abrir agenda",
                              onSelect: () =>
                                navigate(
                                  `/appointments?personId=${person.personId}`
                                ),
                            },
                            {
                              label: "Abrir O.S.",
                              onSelect: () =>
                                navigate(
                                  `/service-orders?personId=${person.personId}`
                                ),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AppSectionBlock>

        <AppContextWorkspace
          title="Detalhe da pessoa"
          subtitle="Contexto oficial e fatos relacionados à pessoa selecionada."
          className="min-w-0 xl:col-span-5"
        >
          {!selectedPerson ? (
            <AppPageEmptyState
              title="Selecione uma pessoa"
              description="Escolha alguém na equipe para consultar o contexto operacional."
            />
          ) : (
            <div className="min-w-0 space-y-3">
              <AppSectionCard className="min-w-0 space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">
                      {selectedPerson.name}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {selectedPerson.role} ·{" "}
                      {selectedPerson.email ??
                        selectedPerson.phone ??
                        "Contato não informado"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditPersonId(selectedPerson.personId)}
                  >
                    Editar pessoa
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppOperationalStatusBadge
                    status={selectedPerson.operationalStatus}
                  />
                  <AppPriorityBadge priority={selectedPerson.priority} />
                  <AppStatusBadge
                    label={
                      availabilityLabels[selectedPerson.availabilityStatus]
                    }
                    tone={
                      selectedPerson.availabilityStatus === "AVAILABLE"
                        ? "success"
                        : "warning"
                    }
                  />
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Capacidade de O.S.
                    </dt>
                    <dd>
                      {formatOfficialNumber(
                        selectedPerson.dailyServiceOrderCapacity,
                        "/dia"
                      )}{" "}
                      ·{" "}
                      {formatOfficialNumber(
                        selectedPerson.serviceOrderCapacityUsagePct,
                        "% usado"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Capacidade de agenda
                    </dt>
                    <dd>
                      {formatOfficialNumber(
                        selectedPerson.dailyAppointmentCapacity,
                        "/dia"
                      )}{" "}
                      ·{" "}
                      {formatOfficialNumber(
                        selectedPerson.appointmentCapacityUsagePct,
                        "% usado"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Carga oficial
                    </dt>
                    <dd>{loadLabels[selectedPerson.loadStatus]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Última atividade factual
                    </dt>
                    <dd>{formatDateTime(selectedPerson.lastActivityAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      O.S. abertas
                    </dt>
                    <dd>{selectedPerson.openServiceOrdersCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">
                      Agenda hoje
                    </dt>
                    <dd>{selectedPerson.todayAppointmentsCount}</dd>
                  </div>
                </dl>
              </AppSectionCard>

              <AppSectionCard
                className="space-y-3 p-4"
                data-testid="people-official-recommendation"
              >
                <p className="nexo-overline">Recomendação oficial</p>
                <h3 className="text-base font-semibold">
                  {selectedPerson.recommendedActionLabel ??
                    "Recomendação indisponível"}
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {selectedPerson.interventionReason ??
                    "Justificativa operacional indisponível"}
                </p>
                <Button
                  disabled={
                    !selectedPerson.recommendedActionLabel ||
                    !selectedPerson.recommendedActionTarget
                  }
                  onClick={() =>
                    runOfficialRecommendation(selectedPerson, {
                      openPerson: () =>
                        setSelectedPersonId(selectedPerson.personId),
                      navigate,
                    })
                  }
                >
                  {selectedPerson.recommendedActionLabel ??
                    "Recomendação indisponível"}
                </Button>
              </AppSectionCard>

              <AppSectionCard className="space-y-2 p-4">
                <h3 className="font-semibold">Relacionamento operacional</h3>
                <p className="text-sm">
                  Clientes ativos:{" "}
                  {formatOfficialNumber(
                    selectedPerson.customers?.activeCustomersCount
                  )}
                </p>
                <p className="text-sm">
                  O.S. concluídas:{" "}
                  {formatOfficialNumber(
                    selectedPerson.serviceOrders?.completedServiceOrdersCount
                  )}
                </p>
                <p className="text-sm">
                  Taxa de conclusão oficial:{" "}
                  {formatOfficialNumber(
                    selectedPerson.serviceOrders?.completionRatePct,
                    "%"
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/appointments?personId=${selectedPerson.personId}`
                      )
                    }
                  >
                    <CalendarClock className="mr-1.5 h-4 w-4" />
                    Abrir agenda
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/service-orders?personId=${selectedPerson.personId}`
                      )
                    }
                  >
                    <Wrench className="mr-1.5 h-4 w-4" />
                    Abrir O.S.
                  </Button>
                </div>
              </AppSectionCard>

              {role === "ADMIN" ? (
                <AppSectionCard
                  className="space-y-3 p-4"
                  data-testid="availability-exception-form"
                >
                  <h3 className="font-semibold">Registrar indisponibilidade</h3>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <label className="text-sm">
                      Início
                      <input
                        type="datetime-local"
                        value={startsAt}
                        onChange={event => setStartsAt(event.target.value)}
                        className="mt-1 w-full min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2"
                      />
                    </label>
                    <label className="text-sm">
                      Fim
                      <input
                        type="datetime-local"
                        value={endsAt}
                        onChange={event => setEndsAt(event.target.value)}
                        className="mt-1 w-full min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    Motivo
                    <input
                      value={reason}
                      maxLength={200}
                      onChange={event => setReason(event.target.value)}
                      className="mt-1 w-full min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2"
                    />
                  </label>
                  <Button
                    disabled={
                      !startsAt ||
                      !endsAt ||
                      createAvailabilityException.isPending
                    }
                    onClick={submitAvailability}
                  >
                    Adicionar indisponibilidade
                  </Button>
                </AppSectionCard>
              ) : null}

              <AppSectionCard className="space-y-2 p-4">
                <h3 className="font-semibold">
                  Indisponibilidades registradas
                </h3>
                {exceptionsQuery.isLoading ? (
                  <AppPageLoadingState description="Carregando indisponibilidades..." />
                ) : exceptionsQuery.error ? (
                  <AppPageErrorState
                    description="Indisponibilidades indisponíveis; o estado oficial da pessoa permanece visível."
                    actionLabel="Tentar novamente"
                    onAction={() => void exceptionsQuery.refetch()}
                  />
                ) : exceptions.length === 0 ? (
                  <AppPageEmptyState
                    title="Nenhum registro"
                    description="Nenhuma indisponibilidade foi retornada."
                  />
                ) : (
                  exceptions.map(exception => (
                    <div
                      key={exception.id}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] p-2 text-sm"
                    >
                      <span className="min-w-0 break-words">
                        {formatDateTime(exception.startsAt)} até{" "}
                        {formatDateTime(exception.endsAt)} ·{" "}
                        {exception.reason ?? "Sem motivo informado"}
                      </span>
                      {role === "ADMIN" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remover indisponibilidade de ${selectedPerson.name}`}
                          onClick={() =>
                            deleteAvailabilityException.mutate({
                              personId: selectedPerson.personId,
                              exceptionId: exception.id,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </AppSectionCard>
            </div>
          )}
        </AppContextWorkspace>
      </div>

      <AppSectionBlock
        title="Evidências da equipe"
        subtitle="Timeline histórica; não participa da decisão operacional atual."
        compact
      >
        {timelineQuery.isLoading ? (
          <AppPageLoadingState description="Carregando Timeline..." />
        ) : timelineQuery.error ? (
          <AppPageErrorState
            description="A Timeline está indisponível. Equipe, detalhe e recomendações oficiais permanecem acessíveis."
            actionLabel="Tentar Timeline novamente"
            onAction={() => void timelineQuery.refetch()}
          />
        ) : teamTimelineEvents.length === 0 ? (
          <AppPageEmptyState
            title="Timeline sem eventos"
            description="Nenhuma evidência histórica foi retornada."
          />
        ) : (
          <div className="space-y-2">
            {teamTimelineEvents.map((event, index) => (
              <article
                key={event.id ?? `event-${index}`}
                className="rounded-lg border border-[var(--border-subtle)] p-3"
              >
                <h3 className="text-sm font-semibold">
                  {timelineTitle(event)}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {event.personName ?? event.actorName ?? "Equipe"} ·{" "}
                  {event.entityName ?? event.customerName ?? "Operação"} ·{" "}
                  {formatDateTime(event.occurredAt ?? event.createdAt)}
                </p>
              </article>
            ))}
            <Button variant="outline" onClick={() => navigate("/timeline")}>
              Abrir Timeline completa
            </Button>
          </div>
        )}
      </AppSectionBlock>

      <CreatePersonModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <EditPersonModal
        open={Boolean(editPersonId)}
        personId={editPersonId}
        onClose={() => setEditPersonId(null)}
        onSaved={refresh}
      />
    </AppPageShell>
  );
}

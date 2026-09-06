import { useMemo, useRef, useState } from "react";
import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { ChevronLeft, ChevronRight, Plus, RefreshCcw } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CreateAppointmentModal } from "@/components/CreateAppointmentModal";
import {
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPageShell,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";

type ViewMode = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

type Appointment = {
  id: string;
  customerId: string;
  assignedToPersonId?: string | null;
  customer?: { id?: string; name?: string } | null;
  startsAt: string;
  endsAt?: string | null;
  status: "SCHEDULED" | "CONFIRMED" | "DONE" | "CANCELED" | "NO_SHOW";
  title?: string | null;
  notes?: string | null;
  serviceOrderId?: string | null;
  serviceOrder?: { id?: string | null } | null;
  serviceOrders?: Array<{ id?: string | null }> | null;
};

type Person = { id: string; name?: string | null; fullName?: string | null };
type OfficialPersonSummary = {
  personId: string;
  name: string;
  todayAppointmentsCount?: number | null;
  dailyAppointmentCapacity?: number | null;
  appointmentCapacityUsagePct?: number | null;
  capacityStatus?: string | null;
  availabilityStatus?: string | null;
  capacitySummaryText?: string | null;
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  DONE: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

const STATUS_COLOR: Record<Appointment["status"], string> = {
  SCHEDULED: "var(--warning)",
  CONFIRMED: "var(--success)",
  DONE: "var(--success)",
  CANCELED: "var(--danger)",
  NO_SHOW: "var(--text-secondary)",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function durationLabel(item: Appointment) {
  if (!item.endsAt) return "Não informada";
  const start = new Date(item.startsAt).getTime();
  const end = new Date(item.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "Não informada";
  return `${Math.round((end - start) / 60000)} min`;
}

function serviceOrderLink(item: Appointment) {
  const id =
    item.serviceOrderId ??
    item.serviceOrder?.id ??
    item.serviceOrders?.find(order => order.id)?.id;
  return id
    ? `/service-orders?id=${id}`
    : `/service-orders?appointmentId=${item.id}`;
}

function officialLabel(value?: string | null) {
  if (!value) return "Indisponível na fonte oficial";
  return value.replace(/_/g, " ").toLocaleLowerCase("pt-BR");
}

export default function CalendarPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const calendarRef = useRef<FullCalendar>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [periodTitle, setPeriodTitle] = useState("Período atual");
  const [viewMode, setViewMode] = useOperationalMemoryState<ViewMode>(
    "nexo.calendar.view.v2",
    "timeGridWeek"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textFilter, setTextFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const appointmentsQuery = trpc.appointments.list.useQuery(
    teamFilter === "all"
      ? { limit: 1000 }
      : { assignedToPersonId: teamFilter, limit: 1000 },
    { enabled: isAuthenticated, retry: false }
  );
  const customersQuery = trpc.customers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const peopleQuery = trpc.people.assignees.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const officialCapacityQuery = trpc.people.operationalSummary.useQuery(
    undefined,
    { enabled: isAuthenticated, retry: false }
  );

  const appointments = useMemo(
    () => normalizeArrayPayload<Appointment>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const customers = useMemo(
    () =>
      normalizeArrayPayload<{ id: string; name: string }>(customersQuery.data),
    [customersQuery.data]
  );
  const people = useMemo(
    () => normalizeArrayPayload<Person>(peopleQuery.data),
    [peopleQuery.data]
  );
  const officialPeople = useMemo(
    () =>
      normalizeArrayPayload<OfficialPersonSummary>(
        officialCapacityQuery.data?.people
      ),
    [officialCapacityQuery.data]
  );

  const filteredAppointments = useMemo(() => {
    const search = textFilter.trim().toLocaleLowerCase("pt-BR");
    return appointments
      .filter(
        item => teamFilter === "all" || item.assignedToPersonId === teamFilter
      )
      .filter(item => statusFilter === "all" || item.status === statusFilter)
      .filter(item => {
        if (!search) return true;
        return [item.customer?.name, item.title, item.notes].some(value =>
          String(value ?? "")
            .toLocaleLowerCase("pt-BR")
            .includes(search)
        );
      })
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      );
  }, [appointments, statusFilter, teamFilter, textFilter]);

  const events = useMemo<EventInput[]>(
    () =>
      filteredAppointments.map(item => ({
        id: item.id,
        title: `${item.customer?.name ?? "Cliente não informado"} · ${item.title ?? "Serviço não informado"}`,
        start: item.startsAt,
        end: item.endsAt ?? undefined,
        backgroundColor: STATUS_COLOR[item.status],
        borderColor: STATUS_COLOR[item.status],
        extendedProps: {
          customerName: item.customer?.name ?? "Cliente não informado",
          serviceName: item.title ?? "Serviço não informado",
          statusLabel: STATUS_LABEL[item.status],
        },
      })),
    [filteredAppointments]
  );

  const selected = appointments.find(item => item.id === selectedId) ?? null;
  const selectedPerson = selected?.assignedToPersonId
    ? people.find(person => person.id === selected.assignedToPersonId)
    : null;
  const officialScope =
    teamFilter === "all"
      ? officialPeople
      : officialPeople.filter(person => person.personId === teamFilter);

  const factualCounts = useMemo(
    () => ({
      total: filteredAppointments.length,
      confirmed: filteredAppointments.filter(
        item => item.status === "CONFIRMED"
      ).length,
      done: filteredAppointments.filter(item => item.status === "DONE").length,
      canceled: filteredAppointments.filter(item => item.status === "CANCELED")
        .length,
    }),
    [filteredAppointments]
  );

  const changeView = (next: ViewMode) => {
    setViewMode(next);
    calendarRef.current?.getApi().changeView(next);
  };
  const movePeriod = (direction: "prev" | "today" | "next") => {
    calendarRef.current?.getApi()[direction]();
  };
  const onDatesSet = (arg: DatesSetArg) => {
    setPeriodTitle(arg.view.title);
    setViewMode(arg.view.type as ViewMode);
  };
  const refetchAll = () => {
    void Promise.all([
      appointmentsQuery.refetch(),
      customersQuery.refetch(),
      peopleQuery.refetch(),
      officialCapacityQuery.refetch(),
    ]);
  };

  const partialSources = [
    customersQuery.isError ? "clientes" : null,
    peopleQuery.isError ? "responsáveis" : null,
    officialCapacityQuery.isError
      ? "capacidade e disponibilidade oficiais"
      : null,
  ].filter(Boolean) as string[];

  return (
    <AppPageShell>
      <AppOperationalHeader
        title="Calendário"
        description="Exploração temporal dos agendamentos persistidos, sem decisões operacionais locais."
        primaryAction={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo agendamento
          </Button>
        }
        secondaryActions={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCcw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        }
        contextChips={
          <>
            <AppStatusBadge label={periodTitle} />
            <AppStatusBadge
              label={`${factualCounts.total} evento(s) exibido(s)`}
            />
          </>
        }
      >
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Navegação temporal"
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() => movePeriod("prev")}
            aria-label="Período anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => movePeriod("today")}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => movePeriod("next")}
            aria-label="Próximo período"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {periodTitle}
          </span>
        </div>
      </AppOperationalHeader>

      {partialSources.length > 0 && !appointmentsQuery.isError ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 p-4 text-sm text-[var(--text-secondary)]"
        >
          <strong className="text-[var(--text-primary)]">
            Leitura parcial.
          </strong>{" "}
          Indisponibilidade em {partialSources.join(", ")}. A grade permanece
          baseada somente nos agendamentos retornados.
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <AppSectionBlock
          title="Disponibilidade e capacidade oficiais"
          subtitle="Valores exibidos diretamente pelo resumo operacional; o calendário não calcula vagas, margem ou horário livre."
        >
          {officialCapacityQuery.isLoading ? (
            <AppPageLoadingState description="Carregando capacidade e disponibilidade oficiais..." />
          ) : officialCapacityQuery.isError || officialScope.length === 0 ? (
            <div
              role="status"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--text-secondary)]"
            >
              Capacidade e disponibilidade indisponíveis na fonte oficial para
              este recorte.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {officialScope.map(person => (
                <article
                  key={person.personId}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4"
                >
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    {person.name}
                  </h3>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        Disponibilidade oficial
                      </dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {officialLabel(person.availabilityStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        Capacidade oficial
                      </dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {officialLabel(person.capacityStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Uso oficial</dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {person.appointmentCapacityUsagePct == null
                          ? "Indisponível na fonte oficial"
                          : `${person.appointmentCapacityUsagePct}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        Agendamentos hoje / limite diário
                      </dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {person.todayAppointmentsCount == null ||
                        person.dailyAppointmentCapacity == null
                          ? "Indisponível na fonte oficial"
                          : `${person.todayAppointmentsCount} / ${person.dailyAppointmentCapacity}`}
                      </dd>
                    </div>
                  </dl>
                  {person.capacitySummaryText ? (
                    <p className="mt-3 text-xs text-[var(--text-secondary)]">
                      {person.capacitySummaryText}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </AppSectionBlock>

        <AppSectionBlock
          title="Controles de visualização"
          subtitle="Escolha a escala temporal sem alterar os fatos persistidos."
        >
          <div
            className="flex flex-wrap gap-2"
            aria-label="Visualizações do calendário"
          >
            {(
              [
                ["timeGridDay", "Dia"],
                ["timeGridWeek", "Semana"],
                ["dayGridMonth", "Mês"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={viewMode === value ? "default" : "outline"}
                onClick={() => changeView(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </AppSectionBlock>

        <AppSectionBlock
          title="Indicadores factuais"
          subtitle="Contagens dos status persistidos no recorte apresentado."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Eventos", factualCounts.total],
              ["Confirmados", factualCounts.confirmed],
              ["Concluídos", factualCounts.done],
              ["Cancelados", factualCounts.canceled],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3"
              >
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-xl font-semibold text-[var(--text-primary)]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </AppSectionBlock>

        <AppFiltersBar>
          <input
            aria-label="Filtrar por texto"
            value={textFilter}
            onChange={event => setTextFilter(event.target.value)}
            placeholder="Cliente, serviço ou observação"
            className="h-9 min-w-56 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
          />
          <select
            aria-label="Filtrar por responsável"
            value={teamFilter}
            onChange={event => setTeamFilter(event.target.value)}
            disabled={peopleQuery.isError}
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="all">Todos os responsáveis</option>
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name ?? person.fullName ?? "Responsável"}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="all">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </AppFiltersBar>

        {appointmentsQuery.isLoading ? (
          <AppPageLoadingState description="Carregando agendamentos do calendário..." />
        ) : null}
        {appointmentsQuery.isError ? (
          <AppPageErrorState
            description="Não foi possível carregar os agendamentos do calendário."
            onAction={refetchAll}
          />
        ) : null}
        {!appointmentsQuery.isLoading && !appointmentsQuery.isError ? (
          <div className="grid gap-4 xl:grid-cols-12">
            <AppSectionBlock
              title="Grade do calendário"
              subtitle="Sobreposições são organizadas apenas pelo layout visual da grade."
              className="xl:col-span-8"
            >
              {filteredAppointments.length === 0 ? (
                <AppPageEmptyState
                  title="Nenhum evento encontrado"
                  description="Ajuste os filtros factuais ou crie um agendamento."
                />
              ) : null}
              <div className="hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 md:block">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView={viewMode}
                  headerToolbar={false}
                  events={events}
                  datesSet={onDatesSet}
                  eventClick={(arg: EventClickArg) =>
                    setSelectedId(arg.event.id)
                  }
                  locale="pt-br"
                  allDaySlot={false}
                  slotMinTime="07:00:00"
                  slotMaxTime="19:00:00"
                  nowIndicator
                  height="auto"
                  eventContent={info => (
                    <div className="p-1 text-xs">
                      <strong>{info.timeText}</strong>
                      <span className="block truncate">
                        {info.event.extendedProps.customerName}
                      </span>
                      <span className="block truncate">
                        {info.event.extendedProps.statusLabel}
                      </span>
                    </div>
                  )}
                />
              </div>
              <div
                className="space-y-2 md:hidden"
                aria-label="Agenda em lista para telas pequenas"
              >
                {filteredAppointments.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-left"
                  >
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      {formatDateTime(item.startsAt)}
                    </span>
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {item.customer?.name ?? "Cliente não informado"} ·{" "}
                      {item.title ?? "Serviço não informado"}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {STATUS_LABEL[item.status]}
                    </span>
                  </button>
                ))}
              </div>
            </AppSectionBlock>

            <AppSectionBlock
              title="Detalhe do evento selecionado"
              subtitle="Fatos persistidos e navegação para ações legítimas."
              className="xl:col-span-4"
            >
              {selected ? (
                <div className="space-y-4">
                  <dl className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4">
                    {[
                      ["Cliente", selected.customer?.name ?? "Não informado"],
                      ["Serviço", selected.title ?? "Não informado"],
                      ["Início", formatDateTime(selected.startsAt)],
                      ["Fim", formatDateTime(selected.endsAt)],
                      ["Duração", durationLabel(selected)],
                      [
                        "Responsável",
                        selectedPerson?.name ??
                          selectedPerson?.fullName ??
                          "Não atribuído",
                      ],
                      ["Status", STATUS_LABEL[selected.status]],
                      [
                        "O.S.",
                        selected.serviceOrderId ||
                        selected.serviceOrder?.id ||
                        selected.serviceOrders?.some(order => order.id)
                          ? "Vínculo retornado"
                          : "Sem vínculo retornado",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="py-2">
                        <dt className="text-xs text-[var(--text-muted)]">
                          {label}
                        </dt>
                        <dd className="text-sm font-medium text-[var(--text-primary)]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/appointments?id=${selected.id}&source=calendar`
                        )
                      }
                    >
                      Abrir agendamento
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/appointments?id=${selected.id}&action=reschedule&source=calendar`
                        )
                      }
                    >
                      Editar / remarcar
                    </Button>
                    {selected.status === "SCHEDULED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/appointments?id=${selected.id}&source=calendar`
                          )
                        }
                      >
                        Confirmar no agendamento
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/appointments?id=${selected.id}&source=calendar`
                        )
                      }
                    >
                      Cancelar no agendamento
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(serviceOrderLink(selected))}
                    >
                      Abrir O.S.
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/customers?id=${selected.customerId}&source=calendar`
                        )
                      }
                    >
                      Abrir cliente
                    </Button>
                  </div>
                </div>
              ) : (
                <AppPageEmptyState
                  title="Nenhum evento selecionado"
                  description="Selecione um evento na grade ou na lista para ver seus fatos e ações."
                />
              )}
            </AppSectionBlock>
          </div>
        ) : null}

        <AppSectionBlock
          title="Evidências e navegação contextual"
          subtitle="A agenda é uma leitura temporal; a Timeline continua sendo a fonte de evidências operacionais."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
            <p>
              Eventos exibidos derivam dos agendamentos persistidos. Fontes
              auxiliares ausentes são declaradas como leitura parcial.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/appointments?source=calendar")}
              >
                Ver Agendamentos
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/timeline?source=calendar")}
              >
                Abrir Timeline oficial
              </Button>
            </div>
          </div>
        </AppSectionBlock>
      </div>

      <CreateAppointmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={refetchAll}
        customers={customers}
      />
    </AppPageShell>
  );
}

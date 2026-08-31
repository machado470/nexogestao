import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";
import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/app-modal-system";
import {
  AppField,
  AppForm,
  AppInput,
  AppPageShell,
  AppRowActionsDropdown,
  AppSelect,
  AppStatusBadge,
} from "@/components/app-system";
import {
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPagination,
  AppSectionBlock,
} from "@/components/internal-page-system";
import CreateServiceOrderModal from "@/components/CreateServiceOrderModal";
import { PersonAssignmentWarning } from "@/components/PersonAssignmentWarning";
import { useAssigneeWarningTelemetry } from "@/hooks/useAssigneeWarningTelemetry";

type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CANCELED"
  | "DONE"
  | "NO_SHOW";

type AppointmentRow = {
  id?: string;
  customerId?: string;
  customer?: { id?: string; name?: string };
  assignedToPersonId?: string | null;
  personId?: string | null;
  title?: string | null;
  notes?: string | null;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  updatedAt?: string | null;
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
    : "Horário não informado";
}

function durationLabel(startsAt?: string | null, endsAt?: string | null) {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);
  if (!start || !end || end <= start) return "Duração não informada";
  return `${Math.round((end.getTime() - start.getTime()) / 60000)} min`;
}

function statusPresentation(status?: string | null) {
  const value = String(status ?? "SCHEDULED").toUpperCase();
  if (value === "CONFIRMED")
    return { label: "Confirmado", tone: "success" as const };
  if (value === "CANCELED")
    return { label: "Cancelado", tone: "danger" as const };
  if (value === "DONE") return { label: "Concluído", tone: "info" as const };
  if (value === "NO_SHOW")
    return { label: "Não compareceu", tone: "warning" as const };
  return { label: "Agendado", tone: "neutral" as const };
}

function dateValue(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AppointmentsPage() {
  const operationalSeverityContract: OperationalSeverity = "healthy";
  void operationalSeverityContract;
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const params = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? ""),
    [location]
  );
  const routeCustomerId = params.get("customerId");
  const routeAppointmentId = params.get("appointmentId") ?? params.get("id");
  const routeAction = params.get("action");

  const [queryText, setQueryText] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    routeAppointmentId
  );
  const [page, setPage] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<AppointmentRow | null>(null);
  const [openServiceOrderModal, setOpenServiceOrderModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const openedRouteAction = useRef<string | null>(null);
  const pageSize = 8;

  const appointmentsQuery = trpc.nexo.appointments.list.useQuery(
    responsibleFilter === "all"
      ? { limit: 100 }
      : { assignedToPersonId: responsibleFilter, limit: 100 },
    { enabled: isAuthenticated, retry: false }
  );
  const customersQuery = trpc.nexo.customers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const peopleQuery = trpc.people.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const serviceOrdersQuery = trpc.nexo.serviceOrders.list.useQuery(
    { page: 1, limit: 100 },
    { enabled: isAuthenticated, retry: false }
  );

  const appointments = useMemo(
    () => normalizeArrayPayload<AppointmentRow>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const customers = useMemo(
    () => normalizeArrayPayload<any>(customersQuery.data),
    [customersQuery.data]
  );
  const people = useMemo(
    () => normalizeArrayPayload<any>(peopleQuery.data),
    [peopleQuery.data]
  );
  const serviceOrders = useMemo(
    () => normalizeArrayPayload<any>(serviceOrdersQuery.data),
    [serviceOrdersQuery.data]
  );
  const customerNames = useMemo(
    () =>
      new Map(
        customers.map(item => [String(item.id), String(item.name ?? "Cliente")])
      ),
    [customers]
  );
  const peopleNames = useMemo(
    () =>
      new Map(
        people.map(item => [
          String(item.id),
          String(item.name ?? "Responsável"),
        ])
      ),
    [people]
  );
  const orderByAppointment = useMemo(
    () =>
      new Map(
        serviceOrders
          .filter(item => item?.appointmentId)
          .map(item => [String(item.appointmentId), item])
      ),
    [serviceOrders]
  );

  // Transformação exclusivamente visual: associa nomes e vínculos persistidos.
  // Não deriva atraso, conflito, risco, prioridade, capacidade ou próxima ação.
  const rows = useMemo(
    () =>
      appointments.map(item => {
        const customerId = String(item.customerId ?? item.customer?.id ?? "");
        const responsibleId = String(
          item.assignedToPersonId ?? item.personId ?? ""
        );
        return {
          item,
          id: String(item.id ?? ""),
          customerId,
          customerName:
            item.customer?.name ??
            customerNames.get(customerId) ??
            "Cliente não identificado",
          responsibleId,
          responsibleName: peopleNames.get(responsibleId) ?? "Sem responsável",
          status: String(item.status ?? "SCHEDULED").toUpperCase(),
          order: orderByAppointment.get(String(item.id ?? "")) ?? null,
        };
      }),
    [appointments, customerNames, orderByAppointment, peopleNames]
  );

  // Filtros selecionam somente fatos persistidos; a ordem original do contrato é preservada.
  const filteredRows = useMemo(() => {
    const search = queryText.trim().toLocaleLowerCase("pt-BR");
    return rows.filter(row => {
      if (routeCustomerId && row.customerId !== routeCustomerId) return false;
      if (dateFilter && dateValue(row.item.startsAt) !== dateFilter)
        return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (
        search &&
        !`${row.customerName} ${row.item.title ?? ""} ${row.item.notes ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search)
      )
        return false;
      return true;
    });
  }, [dateFilter, queryText, routeCustomerId, rows, statusFilter]);
  const paginatedRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  const selected = rows.find(row => row.id === selectedId) ?? null;

  useEffect(
    () => setPage(1),
    [dateFilter, queryText, responsibleFilter, statusFilter]
  );
  useEffect(() => {
    if (routeAppointmentId) setSelectedId(routeAppointmentId);
  }, [routeAppointmentId]);
  useEffect(() => {
    const key = `${routeAppointmentId ?? ""}:${routeAction ?? ""}`;
    if (
      routeAction !== "reschedule" ||
      !selected ||
      openedRouteAction.current === key
    )
      return;
    openedRouteAction.current = key;
    setEditing(selected.item);
    setOpenModal(true);
  }, [routeAction, routeAppointmentId, selected]);

  const timelineQuery = trpc.nexo.timeline.listByCustomer.useQuery(
    { customerId: selected?.customerId ?? "", limit: 25 },
    { enabled: isAuthenticated && Boolean(selected?.customerId), retry: false }
  );
  const timeline = useMemo(
    () => normalizeArrayPayload<any>(timelineQuery.data),
    [timelineQuery.data]
  );
  const createMutation = trpc.nexo.appointments.create.useMutation();
  const updateMutation = trpc.nexo.appointments.update.useMutation();
  const assigneeWarningTelemetry = useAssigneeWarningTelemetry("APPOINTMENT");
  const [form, setForm] = useState({
    customerId: "",
    date: "",
    time: "",
    status: "SCHEDULED" as AppointmentStatus,
    notes: "",
    assignedToPersonId: "unassigned",
    durationMinutes: "60",
  });

  useEffect(() => {
    if (!openModal) {
      assigneeWarningTelemetry.reset();
      return;
    }
    const start = parseDate(editing?.startsAt);
    const end = parseDate(editing?.endsAt);
    setForm({
      customerId: String(
        editing?.customerId ?? editing?.customer?.id ?? routeCustomerId ?? ""
      ),
      date: start ? start.toISOString().slice(0, 10) : "",
      time: start ? start.toISOString().slice(11, 16) : "",
      status: String(
        editing?.status ?? "SCHEDULED"
      ).toUpperCase() as AppointmentStatus,
      notes: String(editing?.notes ?? ""),
      assignedToPersonId: String(
        editing?.assignedToPersonId ?? editing?.personId ?? "unassigned"
      ),
      durationMinutes:
        start && end
          ? String(
              Math.max(
                15,
                Math.round((end.getTime() - start.getTime()) / 60000)
              )
            )
          : "60",
    });
  }, [assigneeWarningTelemetry.reset, editing, openModal, routeCustomerId]);

  async function saveAppointment(event: React.FormEvent) {
    event.preventDefault();
    const startsAt = new Date(`${form.date}T${form.time}`);
    if (!form.customerId || Number.isNaN(startsAt.getTime())) {
      toast.error("Cliente, data e hora são obrigatórios.");
      return;
    }
    const endsAt = new Date(
      startsAt.getTime() +
        Math.max(15, Number(form.durationMinutes) || 60) * 60000
    );
    try {
      const assignedToPersonId =
        form.assignedToPersonId === "unassigned"
          ? undefined
          : form.assignedToPersonId;
      assigneeWarningTelemetry.trackConfirmed(assignedToPersonId, editing?.id);
      if (editing?.id) {
        await updateMutation.mutateAsync({
          id: editing.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: form.status,
          notes: form.notes.trim() || undefined,
          assignedToPersonId:
            form.assignedToPersonId === "unassigned"
              ? null
              : form.assignedToPersonId,
          expectedUpdatedAt: editing.updatedAt ?? undefined,
        });
      } else {
        await createMutation.mutateAsync({
          customerId: form.customerId,
          assignedToPersonId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: form.status,
          notes: form.notes.trim() || undefined,
        });
      }
      await utils.nexo.appointments.list.invalidate();
      setSuccessMessage(
        editing
          ? "Agendamento atualizado com sucesso."
          : "Agendamento criado com sucesso."
      );
      setOpenModal(false);
      setEditing(null);
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao salvar agendamento.");
    }
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    const appointment = appointments.find(item => String(item.id) === id);
    try {
      await updateMutation.mutateAsync({
        id,
        status,
        expectedUpdatedAt: appointment?.updatedAt ?? undefined,
      });
      await utils.nexo.appointments.list.invalidate();
      setSuccessMessage(
        status === "CONFIRMED"
          ? "Agendamento confirmado."
          : "Agendamento cancelado."
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao atualizar status.");
    }
  }

  const partialUnavailable = [
    customersQuery.isError ? "clientes" : null,
    peopleQuery.isError ? "responsáveis" : null,
    serviceOrdersQuery.isError ? "ordens de serviço" : null,
    selected && timelineQuery.isError ? "evidências" : null,
  ].filter(Boolean) as string[];
  const factualCounts = {
    total: appointments.length,
    scheduled: appointments.filter(
      item => String(item.status).toUpperCase() === "SCHEDULED"
    ).length,
    confirmed: appointments.filter(
      item => String(item.status).toUpperCase() === "CONFIRMED"
    ).length,
    done: appointments.filter(
      item => String(item.status).toUpperCase() === "DONE"
    ).length,
  };

  return (
    <AppPageShell>
      <div data-testid="appointments-operational-page" className="contents">
        <AppOperationalHeader
          title="Agendamentos"
          description="Contexto factual da agenda e execução dos compromissos persistidos."
          primaryAction={
            <Button
              onClick={() => {
                setEditing(null);
                setOpenModal(true);
              }}
            >
              Novo agendamento
            </Button>
          }
        />

        <div className="grid gap-4">
          <AppSectionBlock
            title="Contexto da agenda"
            subtitle="A agenda preserva horários, clientes, responsáveis e status retornados pelo contrato."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Escopo</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  {routeCustomerId
                    ? "Cliente selecionado"
                    : "Todos os agendamentos"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">
                  Fonte principal
                </p>
                <p className="font-semibold text-[var(--text-primary)]">
                  appointments.list
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Leitura</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  Fatos persistidos
                </p>
              </div>
            </div>
          </AppSectionBlock>

          <AppSectionBlock
            title="Disponibilidade e capacidade"
            subtitle="Autoridade oficial necessária para interpretar oferta e ocupação."
          >
            <AppPageEmptyState
              title="Disponibilidade e capacidade indisponíveis"
              description="A página não recebeu contrato oficial de disponibilidade ou capacidade. Nenhum resultado é calculado no navegador."
            />
          </AppSectionBlock>

          <AppSectionBlock
            title="Atenção operacional oficial"
            subtitle="Sinais agregados devem vir de uma autoridade de domínio."
          >
            <AppPageEmptyState
              title="Atenção operacional indisponível"
              description="Não há contrato oficial de atraso, conflito, criticidade, risco ou prioridade nesta página. Status e horários não são convertidos em decisão."
            />
          </AppSectionBlock>

          <AppSectionBlock
            title="Próxima ação oficial"
            subtitle="Orientação operacional sem inferências locais."
          >
            <AppPageEmptyState
              title="Próxima ação indisponível"
              description="Nenhuma próxima ação oficial foi fornecida. Use as ações legítimas do agendamento sem interpretá-las como recomendação."
            />
          </AppSectionBlock>

          <AppSectionBlock
            title="Indicadores factuais"
            subtitle="Contagens por status persistido, sem risco ou prioridade derivados."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Total carregado", factualCounts.total],
                ["Agendados", factualCounts.scheduled],
                ["Confirmados", factualCounts.confirmed],
                ["Concluídos", factualCounts.done],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
                >
                  <p className="text-sm text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </AppSectionBlock>

          <AppFiltersBar aria-label="Filtros de apresentação">
            <AppInput
              aria-label="Filtrar por texto"
              placeholder="Buscar cliente ou observação"
              value={queryText}
              onChange={event => setQueryText(event.target.value)}
            />
            <AppInput
              aria-label="Filtrar por data"
              type="date"
              value={dateFilter}
              onChange={event => setDateFilter(event.target.value)}
            />
            <AppSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: "all", label: "Todos os status" },
                { value: "SCHEDULED", label: "Agendado" },
                { value: "CONFIRMED", label: "Confirmado" },
                { value: "DONE", label: "Concluído" },
                { value: "CANCELED", label: "Cancelado" },
                { value: "NO_SHOW", label: "Não compareceu" },
              ]}
            />
            <select
              aria-label="Filtrar por responsável"
              className="h-10 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
              value={responsibleFilter}
              onChange={event => setResponsibleFilter(event.target.value)}
              disabled={peopleQuery.isError}
            >
              <option value="all">Todos os responsáveis</option>
              {people.map(person => (
                <option key={String(person.id)} value={String(person.id)}>
                  {String(person.name ?? "Responsável")}
                </option>
              ))}
            </select>
          </AppFiltersBar>

          {successMessage ? (
            <p role="status" className="text-sm text-[var(--success)]">
              {successMessage}
            </p>
          ) : null}
          {partialUnavailable.length ? (
            <div
              role="status"
              className="rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 p-4 text-sm text-[var(--text-secondary)]"
            >
              <strong>Leitura parcial.</strong> Não foi possível carregar{" "}
              {partialUnavailable.join(", ")}. Os agendamentos disponíveis
              continuam fiéis à fonte principal.
            </div>
          ) : null}

          <AppSectionBlock
            title="Agenda operacional"
            subtitle="Lista factual; filtros não alteram decisão nem reordenam a autoridade oficial."
          >
            {appointmentsQuery.isLoading ? (
              <AppPageLoadingState description="Carregando agendamentos..." />
            ) : appointmentsQuery.isError ? (
              <AppPageErrorState
                description="A fonte principal de agendamentos está indisponível."
                actionLabel="Tentar novamente"
                onAction={() => void appointmentsQuery.refetch()}
              />
            ) : appointments.length === 0 ? (
              <AppPageEmptyState
                title="Sem agendamentos"
                description="Nenhum agendamento foi retornado pela fonte oficial."
              />
            ) : filteredRows.length === 0 ? (
              <AppPageEmptyState
                title="Nenhum resultado"
                description="Nenhum fato persistido corresponde aos filtros de apresentação."
              />
            ) : (
              <>
                <div className="grid gap-2">
                  {paginatedRows.map(row => {
                    const status = statusPresentation(row.item.status);
                    return (
                      <article
                        key={row.id}
                        className="grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 md:grid-cols-[160px_1fr_180px_auto] md:items-center"
                      >
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {formatDateTime(row.item.startsAt)}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {durationLabel(row.item.startsAt, row.item.endsAt)}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {row.customerName}
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {row.item.title ||
                              row.item.notes ||
                              "Sem observação"}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {row.responsibleName}
                          </p>
                        </div>
                        <AppStatusBadge
                          label={status.label}
                          tone={status.tone}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedId(row.id)}
                          >
                            Abrir
                          </Button>
                          <AppRowActionsDropdown
                            triggerLabel="Ações do agendamento"
                            items={[
                              {
                                label: "Confirmar",
                                onSelect: () =>
                                  void updateStatus(row.id, "CONFIRMED"),
                                disabled: !row.id || row.status === "CONFIRMED",
                                tone: "primary",
                              },
                              {
                                label: "Editar/Remarcar",
                                onSelect: () => {
                                  setEditing(row.item);
                                  setOpenModal(true);
                                },
                                disabled: !row.id,
                              },
                              {
                                label: "Cancelar",
                                onSelect: () =>
                                  void updateStatus(row.id, "CANCELED"),
                                disabled: !row.id || row.status === "CANCELED",
                              },
                              {
                                label: row.order?.id
                                  ? "Abrir O.S."
                                  : "Criar O.S.",
                                onSelect: () =>
                                  row.order?.id
                                    ? navigate(
                                        `/service-orders?customerId=${row.customerId}&appointmentId=${row.id}`
                                      )
                                    : (setSelectedId(row.id),
                                      setOpenServiceOrderModal(true)),
                                disabled: !row.id,
                              },
                              { type: "separator" },
                              {
                                label: "Abrir cliente",
                                onSelect: () =>
                                  navigate(
                                    `/customers?customerId=${row.customerId}`
                                  ),
                                disabled: !row.customerId,
                              },
                              {
                                label: "WhatsApp",
                                onSelect: () =>
                                  navigate(
                                    `/whatsapp?customerId=${row.customerId}&appointmentId=${row.id}`
                                  ),
                                disabled: !row.customerId,
                              },
                            ]}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
                <AppPagination
                  currentPage={page}
                  totalItems={filteredRows.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              </>
            )}
          </AppSectionBlock>

          <AppSectionBlock
            title="Evidências e navegação contextual"
            subtitle="Detalhe do agendamento em foco e eventos oficiais relacionados."
          >
            {!selected ? (
              <AppPageEmptyState
                title="Nenhum agendamento em foco"
                description="Abra um item da agenda para consultar seus fatos e evidências."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {selected.customerName}
                    </h3>
                    <AppStatusBadge
                      {...statusPresentation(selected.item.status)}
                    />
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div>
                      <dt className="text-[var(--text-muted)]">Horário</dt>
                      <dd className="text-[var(--text-primary)]">
                        {formatDateTime(selected.item.startsAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Responsável</dt>
                      <dd className="text-[var(--text-primary)]">
                        {selected.responsibleName}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(selected.item);
                        setOpenModal(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(`/customers?customerId=${selected.customerId}`)
                      }
                    >
                      Abrir cliente
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    Evidências oficiais
                  </h3>
                  {timelineQuery.isLoading ? (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">
                      Carregando evidências...
                    </p>
                  ) : timelineQuery.isError ? (
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      Evidências indisponíveis; os fatos do agendamento
                      permanecem visíveis.
                    </p>
                  ) : timeline.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">
                      Nenhuma evidência oficial retornada.
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {timeline.slice(0, 5).map((event, index) => (
                        <li
                          key={String(event.id ?? index)}
                          className="border-l-2 border-[var(--border-subtle)] pl-3 text-sm text-[var(--text-secondary)]"
                        >
                          {String(
                            event.description ??
                              event.summary ??
                              event.action ??
                              "Evento registrado"
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </AppSectionBlock>
        </div>

        <FormModal
          open={openModal}
          onOpenChange={next => {
            setOpenModal(next);
            if (!next) setEditing(null);
          }}
          title={editing ? "Editar agendamento" : "Novo agendamento"}
          description="Operação conectada ao backend"
          closeBlocked={createMutation.isPending || updateMutation.isPending}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="appointment-form"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Salvando..."
                  : "Salvar"}
              </Button>
            </>
          }
        >
          <AppForm id="appointment-form" onSubmit={saveAppointment}>
            <AppField label="Cliente">
              <AppSelect
                value={form.customerId}
                onValueChange={customerId =>
                  setForm(value => ({ ...value, customerId }))
                }
                placeholder="Selecione"
                options={customers.map(item => ({
                  value: String(item.id),
                  label: String(item.name ?? "Cliente"),
                }))}
              />
            </AppField>
            <div className="grid gap-3 md:grid-cols-2">
              <AppField label="Data">
                <AppInput
                  type="date"
                  value={form.date}
                  onChange={event =>
                    setForm(value => ({ ...value, date: event.target.value }))
                  }
                />
              </AppField>
              <AppField label="Hora">
                <AppInput
                  type="time"
                  value={form.time}
                  onChange={event =>
                    setForm(value => ({ ...value, time: event.target.value }))
                  }
                />
              </AppField>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <AppField label="Status">
                <AppSelect
                  value={form.status}
                  onValueChange={status =>
                    setForm(value => ({
                      ...value,
                      status: status as AppointmentStatus,
                    }))
                  }
                  options={[
                    { value: "SCHEDULED", label: "Agendado" },
                    { value: "CONFIRMED", label: "Confirmado" },
                    { value: "DONE", label: "Concluído" },
                    { value: "CANCELED", label: "Cancelado" },
                    { value: "NO_SHOW", label: "Não compareceu" },
                  ]}
                />
              </AppField>
              <AppField label="Duração (min)">
                <AppInput
                  type="number"
                  min={15}
                  value={form.durationMinutes}
                  onChange={event =>
                    setForm(value => ({
                      ...value,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </AppField>
            </div>
            <AppField label="Responsável">
              <AppSelect
                value={form.assignedToPersonId}
                onValueChange={assignedToPersonId =>
                  setForm(value => ({ ...value, assignedToPersonId }))
                }
                options={[
                  { value: "unassigned", label: "Sem responsável" },
                  ...people.map(item => ({
                    value: String(item.id),
                    label: String(item.name ?? "Responsável"),
                  })),
                ]}
              />
              <PersonAssignmentWarning
                personId={
                  form.assignedToPersonId === "unassigned"
                    ? null
                    : form.assignedToPersonId
                }
                onWarningShown={assigneeWarningTelemetry.trackShown}
              />
            </AppField>
            <AppField label="Observação">
              <AppInput
                value={form.notes}
                onChange={event =>
                  setForm(value => ({ ...value, notes: event.target.value }))
                }
              />
            </AppField>
          </AppForm>
        </FormModal>
      </div>
      <CreateServiceOrderModal
        isOpen={openServiceOrderModal}
        onClose={() => setOpenServiceOrderModal(false)}
        onSuccess={() => {
          setSuccessMessage("O.S. criada com sucesso.");
          void utils.nexo.serviceOrders.list.invalidate({
            page: 1,
            limit: 100,
          });
        }}
        customers={customers.map(item => ({
          id: String(item.id),
          name: String(item.name ?? "Cliente"),
        }))}
        people={people.map(item => ({
          id: String(item.id),
          name: String(item.name ?? "Pessoa"),
        }))}
        initialCustomerId={selected?.customerId ?? routeCustomerId}
        appointmentId={selected?.id || undefined}
      />
    </AppPageShell>
  );
}

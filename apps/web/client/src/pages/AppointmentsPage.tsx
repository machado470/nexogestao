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
  AppTextarea,
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
  // Marcador tipado exigido pelo guardrail do Operating System. A página não
  // possui fonte oficial de severidade e, por isso, não renderiza nem deriva uma.
  const officialOperationalSeverity: OperationalSeverity | null = null;
  void officialOperationalSeverity;
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

  const appointmentListInput = useMemo(
    () => ({
      limit: 100,
      ...(responsibleFilter === "all"
        ? {}
        : { assignedToPersonId: responsibleFilter }),
      ...(routeCustomerId ? { customerId: routeCustomerId } : {}),
    }),
    [responsibleFilter, routeCustomerId]
  );
  const appointmentsQuery = trpc.appointments.list.useQuery(
    appointmentListInput,
    { enabled: isAuthenticated, retry: false }
  );
  const customersQuery = trpc.customers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const peopleQuery = trpc.people.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const serviceOrdersQuery = trpc.serviceOrders.list.useQuery(
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

  const timelineQuery = trpc.timeline.listByCustomer.useQuery(
    { customerId: selected?.customerId ?? "", limit: 25 },
    { enabled: isAuthenticated && Boolean(selected?.customerId), retry: false }
  );
  const timeline = useMemo(
    () => normalizeArrayPayload<any>(timelineQuery.data),
    [timelineQuery.data]
  );
  const createMutation = trpc.appointments.create.useMutation();
  const updateMutation = trpc.appointments.update.useMutation();
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
      await utils.appointments.list.invalidate();
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
      await utils.appointments.list.invalidate();
      setSuccessMessage(
        status === "CONFIRMED"
          ? "Agendamento confirmado."
          : "Agendamento cancelado."
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao atualizar status.");
    }
  }

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
          description="Organize o que vai acontecer, quando, com quem e o que precisa ser preparado."
          density="compact"
          contextChips={
            appointmentsQuery.isSuccess ? (
              <span className="text-sm text-[var(--text-secondary)]">
                {appointments.length}{" "}
                {appointments.length === 1
                  ? "agendamento carregado"
                  : "agendamentos carregados"}
                {routeCustomerId
                  ? " para o cliente selecionado"
                  : " no escopo atual"}
              </span>
            ) : null
          }
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

        <div className="grid min-w-0 gap-4">
          {appointmentsQuery.isSuccess ? (
            <AppSectionBlock
              title="Contexto da agenda"
              subtitle="Leitura factual do escopo retornado; nenhuma decisão é reconstruída no navegador."
              compact
            >
              <div className="grid min-w-0 divide-y divide-[var(--border-subtle)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
                {[
                  ["Total no escopo", factualCounts.total],
                  ["Agendados", factualCounts.scheduled],
                  ["Confirmados", factualCounts.confirmed],
                  ["Concluídos", factualCounts.done],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="min-w-0 px-3 py-2 first:pl-0 last:pr-0"
                  >
                    <p className="text-xs text-[var(--text-muted)]">{label}</p>
                    <p className="mt-1 break-words text-xl font-semibold text-[var(--text-primary)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </AppSectionBlock>
          ) : null}

          <AppSectionBlock
            title="Filtros"
            subtitle="Refine apenas por fatos persistidos, sem alterar a ordem recebida."
            compact
          >
            <div role="group" aria-label="Filtros de apresentação">
              <AppFiltersBar className="gap-3">
                <div className="min-w-0 flex-1 basis-full sm:basis-64">
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                    htmlFor="appointment-search"
                  >
                    Busca
                  </label>
                  <AppInput
                    id="appointment-search"
                    aria-label="Filtrar por texto"
                    placeholder="Cliente, serviço ou observação"
                    value={queryText}
                    onChange={event => setQueryText(event.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-36 sm:max-w-48">
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                    htmlFor="appointment-date"
                  >
                    Data
                  </label>
                  <AppInput
                    id="appointment-date"
                    aria-label="Filtrar por data"
                    type="date"
                    value={dateFilter}
                    onChange={event => setDateFilter(event.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-40 sm:max-w-52">
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                    htmlFor="appointment-status"
                  >
                    Status
                  </label>
                  <select
                    id="appointment-status"
                    className="h-10 w-full rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value)}
                  >
                    <option value="all">Todos os status</option>
                    <option value="SCHEDULED">Agendado</option>
                    <option value="CONFIRMED">Confirmado</option>
                    <option value="DONE">Concluído</option>
                    <option value="CANCELED">Cancelado</option>
                    <option value="NO_SHOW">Não compareceu</option>
                  </select>
                </div>
                <div className="min-w-0 flex-1 basis-44 sm:max-w-56">
                  <label
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                    htmlFor="appointment-responsible"
                  >
                    Responsável
                  </label>
                  <select
                    id="appointment-responsible"
                    aria-label="Filtrar por responsável"
                    className="h-10 w-full rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] disabled:opacity-60"
                    value={responsibleFilter}
                    onChange={event => setResponsibleFilter(event.target.value)}
                    disabled={peopleQuery.isError}
                  >
                    <option value="all">
                      {peopleQuery.isError
                        ? "Responsáveis indisponíveis"
                        : "Todos os responsáveis"}
                    </option>
                    {people.map(person => (
                      <option key={String(person.id)} value={String(person.id)}>
                        {String(person.name ?? "Responsável")}
                      </option>
                    ))}
                  </select>
                </div>
                {queryText ||
                dateFilter ||
                statusFilter !== "all" ||
                responsibleFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-end"
                    onClick={() => {
                      setQueryText("");
                      setDateFilter("");
                      setStatusFilter("all");
                      setResponsibleFilter("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </AppFiltersBar>
            </div>
          </AppSectionBlock>

          {successMessage ? (
            <p role="status" className="text-sm text-[var(--success)]">
              {successMessage}
            </p>
          ) : null}

          <AppSectionBlock
            title="Agenda operacional"
            subtitle="Horário, cliente, serviço, responsável e execução em uma única leitura."
            compact
          >
            {serviceOrdersQuery.isError ? (
              <p
                role="status"
                className="mb-3 text-sm text-[var(--text-secondary)]"
              >
                Vínculos com O.S. indisponíveis. A agenda e suas demais ações
                continuam utilizáveis.
              </p>
            ) : null}
            {customersQuery.isError ? (
              <p
                role="status"
                className="mb-3 text-sm text-[var(--text-secondary)]"
              >
                Cadastro de clientes indisponível. Nomes incorporados aos
                agendamentos permanecem visíveis.
              </p>
            ) : null}
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
                <div className="grid min-w-0 gap-2">
                  {paginatedRows.map(row => {
                    const status = statusPresentation(row.item.status);
                    const canConfirm =
                      Boolean(row.id) &&
                      !["CONFIRMED", "CANCELED", "DONE"].includes(row.status);
                    return (
                      <article
                        key={row.id}
                        className="grid min-w-0 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 sm:p-4 lg:grid-cols-[minmax(130px,160px)_minmax(0,1fr)_minmax(120px,160px)_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-[var(--text-primary)]">
                            {formatDateTime(row.item.startsAt)}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {durationLabel(row.item.startsAt, row.item.endsAt)}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-[var(--text-primary)]">
                            {row.customerName}
                          </p>
                          <p className="line-clamp-2 break-words text-sm text-[var(--text-secondary)]">
                            {row.item.title ||
                              row.item.notes ||
                              "Sem serviço ou observação informados"}
                          </p>
                          <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
                            {row.responsibleName}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <AppStatusBadge
                            label={status.label}
                            tone={status.tone}
                          />
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                          {canConfirm ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                void updateStatus(row.id, "CONFIRMED")
                              }
                              disabled={updateMutation.isPending}
                            >
                              Confirmar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedId(row.id)}
                            >
                              Abrir detalhe
                            </Button>
                          )}
                          {canConfirm ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedId(row.id)}
                            >
                              Abrir
                            </Button>
                          ) : null}
                          <AppRowActionsDropdown
                            triggerLabel={`Ações de ${row.customerName}`}
                            items={[
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
                                disabled: !row.id || serviceOrdersQuery.isError,
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
            title="Detalhe e evidências"
            subtitle="Fatos do agendamento em foco e histórico oficial relacionado."
            compact
          >
            {!selected ? (
              <AppPageEmptyState
                title="Nenhum agendamento em foco"
                description="Abra um item para consultar contexto, execução relacionada e evidências."
              />
            ) : (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-semibold text-[var(--text-primary)]">
                      {selected.customerName}
                    </h3>
                    <AppStatusBadge
                      {...statusPresentation(selected.item.status)}
                    />
                  </div>
                  <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[var(--text-muted)]">Data e hora</dt>
                      <dd className="break-words text-[var(--text-primary)]">
                        {formatDateTime(selected.item.startsAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Duração</dt>
                      <dd className="text-[var(--text-primary)]">
                        {durationLabel(
                          selected.item.startsAt,
                          selected.item.endsAt
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Responsável</dt>
                      <dd className="break-words text-[var(--text-primary)]">
                        {selected.responsibleName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">
                        Execução relacionada
                      </dt>
                      <dd className="break-words text-[var(--text-primary)]">
                        {serviceOrdersQuery.isError
                          ? "Vínculo indisponível"
                          : selected.order?.id
                            ? String(selected.order.title ?? "O.S. vinculada")
                            : "Nenhuma O.S. vinculada"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[var(--text-muted)]">
                        Contexto / observação
                      </dt>
                      <dd className="break-words whitespace-pre-wrap text-[var(--text-primary)]">
                        {selected.item.notes ||
                          selected.item.title ||
                          "Não informado"}
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
                      Editar/Remarcar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(`/customers?customerId=${selected.customerId}`)
                      }
                      disabled={!selected.customerId}
                    >
                      Abrir cliente
                    </Button>
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    Evidências oficiais
                  </h3>
                  {timelineQuery.isLoading ? (
                    <AppPageLoadingState description="Carregando evidências..." />
                  ) : timelineQuery.isError ? (
                    <AppPageErrorState
                      description="Evidências indisponíveis; os fatos do agendamento permanecem visíveis."
                      actionLabel="Tentar novamente"
                      onAction={() => void timelineQuery.refetch()}
                    />
                  ) : timeline.length === 0 ? (
                    <AppPageEmptyState
                      title="Sem evidências"
                      description="Nenhuma evidência oficial foi retornada para este cliente."
                    />
                  ) : (
                    <ul className="mt-3 grid min-w-0 gap-2">
                      {timeline.slice(0, 5).map((event, index) => (
                        <li
                          key={String(event.id ?? index)}
                          className="min-w-0 break-words border-l-2 border-[var(--border-subtle)] pl-3 text-sm text-[var(--text-secondary)]"
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

          <nav
            aria-label="Navegação contextual de agendamentos"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="text-[var(--text-muted)]">
              Visão macro do tempo:
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/calendar")}
            >
              Abrir Calendário
            </Button>
          </nav>
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
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  (!editing && customersQuery.isError)
                }
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Salvando..."
                  : "Salvar"}
              </Button>
            </>
          }
        >
          <AppForm id="appointment-form" onSubmit={saveAppointment}>
            {!editing && customersQuery.isError ? (
              <p role="status" className="text-sm text-[var(--danger)]">
                Clientes indisponíveis. A criação fica bloqueada até a fonte
                voltar; nenhum cliente substituto será assumido.
              </p>
            ) : null}
            {peopleQuery.isError ? (
              <p role="status" className="text-sm text-[var(--text-secondary)]">
                Responsáveis indisponíveis. O agendamento ainda pode ser salvo
                sem atribuição.
              </p>
            ) : null}
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
              <AppTextarea
                value={form.notes}
                onChange={event =>
                  setForm(value => ({ ...value, notes: event.target.value }))
                }
                rows={4}
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
          void utils.serviceOrders.list.invalidate({
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

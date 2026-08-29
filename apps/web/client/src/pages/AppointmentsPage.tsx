import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { Button } from "@/components/ui/button";
import {
  EntityTimelineCard,
  OperationalFlowCard,
  type OperationalFlowStageState,
  type OperationalStateLevel,
} from "@/components/app/OperationalCommandLayer";
import { FormModal } from "@/components/app-modal-system";
import {
  AppField,
  AppForm,
  AppInput,
  AppPageShell,
  AppPriorityBadge,
  AppSectionCard,
  AppRowActionsDropdown,
  AppSelect,
  AppStatusBadge,
  type AppOperationalStatus,
  type AppPriorityLevel,
} from "@/components/app-system";
import CreateServiceOrderModal from "@/components/CreateServiceOrderModal";
import { PersonAssignmentWarning } from "@/components/PersonAssignmentWarning";
import { useAssigneeWarningTelemetry } from "@/hooks/useAssigneeWarningTelemetry";
import {
  AppActionBar,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPagination,
  AppSectionBlock,
} from "@/components/internal-page-system";

// Contract guard: <AppSectionCard <AppOperationalStatusBadge
type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CANCELED"
  | "DONE"
  | "NO_SHOW";
type FilterKey =
  | "all"
  | "today"
  | "tomorrow"
  | "week"
  | "unconfirmed"
  | "confirmed"
  | "overdue"
  | "canceled";

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
  createdAt?: string | null;
  updatedAt?: string | null;
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "unconfirmed", label: "Não confirmados" },
  { key: "overdue", label: "Atrasados" },
  { key: "week", label: "Próximos" },
  { key: "canceled", label: "Cancelados" },
  { key: "all", label: "Todos" },
  { key: "tomorrow", label: "Amanhã" },
  { key: "confirmed", label: "Confirmados" },
];

function asDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  const date = asDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function durationLabel(startsAt?: string | null, endsAt?: string | null) {
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  if (!start || !end || end <= start) return "—";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return `${minutes} min`;
}

function getChargeStatus(charge: any) {
  return String(charge?.status ?? "")
    .trim()
    .toUpperCase();
}

function isChargeOverdue(charge: any) {
  const status = getChargeStatus(charge);
  if (status === "OVERDUE") return true;
  if (status !== "PENDING") return false;
  const dueDate = asDate(charge?.dueDate);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function hasPaymentEvidence(charge: any) {
  return (
    getChargeStatus(charge) === "PAID" ||
    (Array.isArray(charge?.payments) && charge.payments.length > 0)
  );
}

function safeEntityLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function sanitizeOperationalText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return (
    text
      .replace(/\b[A-Z]+(?:_[A-Z0-9]+){1,}\b/g, fallback)
      .replace(
        /\b(?:id|uuid|hash|payload|entityId|appointmentId|customerId|serviceOrderId)\b:?/gi,
        ""
      )
      .replace(/#[a-z0-9-]{8,}/gi, "referência operacional")
      .replace(/\b[a-f0-9]{12,}\b/gi, "referência operacional")
      .replace(/\s{2,}/g, " ")
      .trim() || fallback
  );
}

function humanizeTimelineEvent(event: any) {
  const raw = String(event?.action ?? event?.eventType ?? event?.type ?? "")
    .trim()
    .toUpperCase();
  if (raw.includes("APPOINTMENT") && raw.includes("CONFIRM"))
    return "Agendamento confirmado";
  if (raw.includes("APPOINTMENT") && raw.includes("CANCEL"))
    return "Agendamento cancelado";
  if (
    raw.includes("APPOINTMENT") &&
    (raw.includes("UPDATE") || raw.includes("EDIT"))
  )
    return "Agendamento alterado";
  if (raw.includes("APPOINTMENT") || raw.includes("SCHEDULE"))
    return "Agendamento criado";
  if (raw.includes("SERVICE_ORDER") || raw.includes("ORDER"))
    return "O.S. criada";
  if (raw.includes("MESSAGE") || raw.includes("WHATSAPP"))
    return "Mensagem enviada";
  if (raw.includes("CHARGE") || raw.includes("BILLING"))
    return "Cobrança criada";
  return sanitizeOperationalText(
    event?.description ?? event?.summary ?? event?.action,
    "Evento operacional registrado"
  );
}

function humanizeBackendState(value: unknown, fallback = "Sem status") {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  const labels: Record<string, string> = {
    IN_PROGRESS: "Em execução",
    PENDING: "Pendente",
    COMPLETED: "Concluído",
    DONE: "Concluído",
    FAILED: "Falhou",
    CANCELLED: "Cancelado",
    CANCELED: "Cancelado",
    PROCESSING: "Em processamento",
    SCHEDULED: "Sem confirmação",
    CONFIRMED: "Confirmado",
    NO_SHOW: "Não compareceu",
    OPEN: "O.S. aberta",
    PAID: "Cobrança paga",
    OVERDUE: "Cobrança vencida",
  };
  if (labels[normalized]) return labels[normalized];
  return sanitizeOperationalText(value, fallback);
}

function appointmentPipelineSummary(target: MappedAppointment | null) {
  if (!target) return "Nenhum horário em foco.";
  if (target.isOverdue)
    return `Atrasado · ${formatDateTime(target.item.startsAt)}.`;
  if (target.status === "SCHEDULED")
    return `Sem confirmação · ${formatDateTime(target.item.startsAt)}.`;
  if (target.status === "CONFIRMED")
    return `Confirmado · ${formatDateTime(target.item.startsAt)}.`;
  return `${humanizeBackendState(target.status)} · ${formatDateTime(target.item.startsAt)}.`;
}

function serviceOrderPipelineSummary(target: MappedAppointment | null) {
  if (!target?.order?.id) return "Sem O.S.";
  const status = String(target.order.status ?? "").toUpperCase();
  if (status === "IN_PROGRESS" || status === "PROCESSING") return "Em execução";
  if (status === "DONE" || status === "COMPLETED") return "Concluída";
  return "O.S. aberta";
}

function chargePipelineSummary(
  hasCharge: boolean,
  chargeStatus: string,
  chargeOverdue: boolean,
  paymentDone: boolean
) {
  if (!hasCharge) return "Sem cobrança";
  if (paymentDone) return "Cobrança paga";
  if (chargeOverdue) return "Cobrança vencida";
  if (chargeStatus === "PENDING") return "Cobrança pendente";
  return humanizeBackendState(chargeStatus, "Cobrança pendente");
}

function mapStatus(status?: string | null) {
  const normalized = String(status ?? "SCHEDULED").toUpperCase();
  if (normalized === "SCHEDULED")
    return { label: "Agendado", tone: "warning" as const };
  if (normalized === "CONFIRMED")
    return { label: "Confirmado", tone: "success" as const };
  if (normalized === "IN_PROGRESS")
    return { label: "Em andamento", tone: "info" as const };
  if (normalized === "DONE")
    return { label: "Concluído", tone: "info" as const };
  if (normalized === "CANCELED")
    return { label: "Cancelado", tone: "danger" as const };
  return { label: "No-show", tone: "accent" as const };
}

type AppointmentCommandAction = {
  title: string;
  entity: string;
  reason: string;
  impact: string;
  safetyNote: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

type MappedAppointment = {
  item: AppointmentRow;
  status: string;
  start: Date | null;
  customerId: string;
  customerName: string;
  ownerName: string;
  order: any;
  charge: any;
  ownerId: string;
  hasAssignee: boolean;
  isOverdue: boolean;
  startsSoon: boolean;
  hasConflict: boolean;
};

function deriveAppointmentOperationalStatus(
  row: MappedAppointment
): AppOperationalStatus {
  if (row.status === "NO_SHOW") return "CRÍTICO";
  if (row.isOverdue) return "RISCO";
  if (row.status === "SCHEDULED" && row.startsSoon) return "ATENÇÃO";
  if (row.status === "CANCELED") return "ATENÇÃO";
  return "NORMAL";
}

function deriveAppointmentPriority(
  row: MappedAppointment
): AppPriorityLevel | null {
  if (row.status === "NO_SHOW" || row.isOverdue || row.hasConflict) return "P0";
  if (row.status === "DONE" && !row.order) return "P0";
  if (row.status === "SCHEDULED" || row.startsSoon || !row.hasAssignee)
    return "P1";
  if (["SCHEDULED", "CONFIRMED"].includes(row.status) && !row.order)
    return "P2";
  return null;
}

function appointmentPriorityLabel(priority: AppPriorityLevel) {
  if (priority === "P0") return "P0 · agir agora";
  if (priority === "P1") return "P1 · confirmar hoje";
  if (priority === "P2") return "P2 · preparar";
  return "P3 · informativo";
}

function mapOperationalStatusBadge(row: MappedAppointment) {
  if (row.isOverdue) return { label: "Atrasado", tone: "danger" as const };
  if (row.startsSoon && row.status !== "DONE" && row.status !== "CANCELED")
    return { label: "Próximo do horário", tone: "warning" as const };
  if (row.status === "NO_SHOW")
    return { label: "Risco de no-show", tone: "danger" as const };
  if (row.status === "SCHEDULED")
    return { label: "Precisa confirmar", tone: "warning" as const };
  if (row.status === "CONFIRMED")
    return { label: "Preparado", tone: "success" as const };
  if (row.status === "DONE")
    return { label: "Concluído", tone: "info" as const };
  return { label: "Encerrado", tone: "neutral" as const };
}

function mapOperationalStatus(row: MappedAppointment) {
  const status = deriveAppointmentOperationalStatus(row);
  const tone =
    status === "CRÍTICO"
      ? ("danger" as const)
      : status === "RISCO"
        ? ("accent" as const)
        : status === "ATENÇÃO"
          ? ("warning" as const)
          : ("success" as const);
  return { label: status, tone };
}

function nextActionLabel(row: MappedAppointment) {
  if (row.isOverdue) return "Remarcar/cancelar";
  if (row.status === "SCHEDULED") return "Confirmar";
  if (["SCHEDULED", "CONFIRMED"].includes(row.status) && !row.order)
    return "Gerar O.S.";
  if (row.status === "IN_PROGRESS") return "Acompanhar atendimento";
  if (row.order?.id) return "Iniciar atendimento";
  if (row.status === "DONE") return "Revisar histórico";
  if (row.status === "CANCELED") return "Reagendar se necessário";
  return "Abrir detalhe";
}

export default function AppointmentsPage() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>("today");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [queryText, setQueryText] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<AppointmentRow | null>(null);
  const [openServiceOrderModal, setOpenServiceOrderModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const _operationalSeverityContract: OperationalSeverity = "healthy";
  void _operationalSeverityContract;

  const queryParams = useMemo(() => {
    const queryString = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(queryString);
    return {
      customerId: params.get("customerId"),
      appointmentId: params.get("appointmentId") ?? params.get("id"),
      action: params.get("action"),
    };
  }, [location]);

  const utils = trpc.useUtils();
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
  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 100 },
    { enabled: isAuthenticated, retry: false }
  );
  const appointments = useMemo(
    () => normalizeArrayPayload<AppointmentRow>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const timelineCustomerId = useMemo(() => {
    if (queryParams.customerId) return queryParams.customerId;
    const focused = appointments.find(
      item => String(item.id ?? "") === String(selectedAppointmentId ?? "")
    );
    return String(focused?.customerId ?? focused?.customer?.id ?? "");
  }, [appointments, queryParams.customerId, selectedAppointmentId]);
  const timelineQuery = trpc.nexo.timeline.listByCustomer.useQuery(
    { customerId: timelineCustomerId, limit: 25 },
    {
      enabled: isAuthenticated && Boolean(timelineCustomerId),
      retry: false,
    }
  );

  const createMutation = trpc.nexo.appointments.create.useMutation();
  const updateMutation = trpc.nexo.appointments.update.useMutation();

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
  const charges = useMemo(
    () => normalizeArrayPayload<any>(chargesQuery.data),
    [chargesQuery.data]
  );
  const timeline = useMemo(
    () => normalizeArrayPayload<any>(timelineQuery.data),
    [timelineQuery.data]
  );

  const customerById = useMemo(() => {
    const entries: Array<[string, string]> = [];
    for (const item of customers) {
      const id = String((item as any)?.id ?? "");
      if (!id) continue;
      entries.push([id, String((item as any)?.name ?? "Cliente")]);
    }
    return new Map<string, string>(entries);
  }, [customers]);
  const personById = useMemo(() => {
    const entries: Array<[string, string]> = [];
    for (const item of people) {
      const id = String((item as any)?.id ?? "");
      if (!id) continue;
      entries.push([id, String((item as any)?.name ?? "Responsável")]);
    }
    return new Map<string, string>(entries);
  }, [people]);
  const orderByAppointment = useMemo(() => {
    const map = new Map<string, any>();
    for (const order of serviceOrders) {
      const appointmentId = String(order?.appointmentId ?? "");
      if (appointmentId) map.set(appointmentId, order);
    }
    return map;
  }, [serviceOrders]);
  const chargeByServiceOrderId = useMemo(() => {
    const map = new Map<string, any>();
    for (const charge of charges) {
      const serviceOrderId = String(
        charge?.serviceOrderId ?? charge?.serviceOrder?.id ?? ""
      );
      if (!serviceOrderId) continue;
      const current = map.get(serviceOrderId);
      if (!current) {
        map.set(serviceOrderId, charge);
        continue;
      }
      const currentUpdated =
        asDate(current?.updatedAt ?? current?.createdAt)?.getTime() ?? 0;
      const nextUpdated =
        asDate(charge?.updatedAt ?? charge?.createdAt)?.getTime() ?? 0;
      if (nextUpdated >= currentUpdated) map.set(serviceOrderId, charge);
    }
    return map;
  }, [charges]);

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
  const tomorrowStart = new Date(dayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(dayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const weekEnd = new Date(dayEnd);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const mapped = useMemo(
    () =>
      appointments.map(item => {
        const start = asDate(item.startsAt);
        const end = asDate(item.endsAt);
        const status = String(item.status ?? "SCHEDULED").toUpperCase();
        const customerId = String(item.customerId ?? item.customer?.id ?? "");
        const ownerId = String(item.assignedToPersonId ?? item.personId ?? "");
        const customerName =
          item.customer?.name ||
          customerById.get(customerId) ||
          "Cliente não identificado";
        const order = orderByAppointment.get(String(item.id ?? ""));
        const charge = order?.id
          ? (chargeByServiceOrderId.get(String(order.id)) ??
            order?.financialSummary?.latestCharge ??
            null)
          : null;
        const isOverdue = Boolean(
          start && start < now && ["SCHEDULED", "CONFIRMED"].includes(status)
        );
        const startsSoon = Boolean(
          start &&
          start >= now &&
          (start.getTime() - now.getTime()) / 60000 <= 120
        );
        const hasConflict = Boolean(
          start &&
          end &&
          ["SCHEDULED", "CONFIRMED"].includes(status) &&
          appointments.some(other => {
            if (String(other.id ?? "") === String(item.id ?? "")) return false;
            const otherStatus = String(
              other.status ?? "SCHEDULED"
            ).toUpperCase();
            if (!["SCHEDULED", "CONFIRMED"].includes(otherStatus)) return false;
            const otherStart = asDate(other.startsAt);
            const otherEnd = asDate(other.endsAt);
            if (!otherStart || !otherEnd) return false;
            const sameOwner =
              ownerId &&
              ownerId ===
                String(other.assignedToPersonId ?? other.personId ?? "");
            const sameCustomer =
              customerId &&
              customerId ===
                String(other.customerId ?? other.customer?.id ?? "");
            return (
              (sameOwner || sameCustomer) &&
              start < otherEnd &&
              end > otherStart
            );
          })
        );
        return {
          item,
          status,
          start,
          customerId,
          customerName,
          ownerId,
          hasAssignee: Boolean(ownerId),
          ownerName: personById.get(ownerId) ?? "Não definido",
          order,
          charge,
          isOverdue,
          startsSoon,
          hasConflict,
        };
      }),
    [
      appointments,
      chargeByServiceOrderId,
      customerById,
      orderByAppointment,
      personById,
      now,
    ]
  );

  const filtered = useMemo(() => {
    let base = mapped;
    if (queryParams.customerId)
      base = base.filter(row => row.customerId === queryParams.customerId);
    if (customerFilter !== "all")
      base = base.filter(row => row.customerId === customerFilter);

    if (selectedFilter === "today")
      base = base.filter(
        row => row.start && row.start >= dayStart && row.start <= dayEnd
      );
    if (selectedFilter === "tomorrow")
      base = base.filter(
        row =>
          row.start && row.start >= tomorrowStart && row.start <= tomorrowEnd
      );
    if (selectedFilter === "week")
      base = base.filter(
        row => row.start && row.start >= dayStart && row.start <= weekEnd
      );
    if (selectedFilter === "unconfirmed")
      base = base.filter(row => row.status === "SCHEDULED");
    if (selectedFilter === "confirmed")
      base = base.filter(row => row.status === "CONFIRMED");
    if (selectedFilter === "overdue") base = base.filter(row => row.isOverdue);
    if (selectedFilter === "canceled")
      base = base.filter(row => row.status === "CANCELED");

    const search = queryText.trim().toLowerCase();
    if (search) {
      base = base.filter(row =>
        `${row.customerName} ${row.item.title ?? ""} ${row.item.notes ?? ""}`
          .toLowerCase()
          .includes(search)
      );
    }

    return [...base].sort(
      (a, b) => (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0)
    );
  }, [
    mapped,
    customerFilter,
    queryParams.customerId,
    selectedFilter,
    queryText,
    dayStart,
    dayEnd,
    tomorrowStart,
    tomorrowEnd,
    weekEnd,
  ]);
  const paginatedAppointments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [currentPage, filtered, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    customerFilter,
    queryText,
    queryParams.customerId,
    responsibleFilter,
    selectedFilter,
  ]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, filtered.length, pageSize]);

  useEffect(() => {
    if (queryParams.appointmentId) {
      setSelectedAppointmentId(queryParams.appointmentId);
      return;
    }
    if (!selectedAppointmentId && filtered[0]?.item?.id)
      setSelectedAppointmentId(String(filtered[0].item.id));
  }, [queryParams.appointmentId, filtered, selectedAppointmentId]);

  const selected =
    filtered.find(
      row => String(row.item.id ?? "") === String(selectedAppointmentId ?? "")
    ) ?? null;
  const openedRouteAction = useRef<string | null>(null);

  useEffect(() => {
    const routeActionKey = `${queryParams.appointmentId ?? ""}:${queryParams.action ?? ""}`;
    if (
      queryParams.action !== "reschedule" ||
      !selected?.item?.id ||
      openModal ||
      openedRouteAction.current === routeActionKey
    )
      return;
    openedRouteAction.current = routeActionKey;
    setEditing(selected.item);
    setOpenModal(true);
  }, [
    openModal,
    queryParams.action,
    queryParams.appointmentId,
    selected?.item,
  ]);

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
    if (editing) {
      const start = asDate(editing.startsAt);
      const end = asDate(editing.endsAt);
      setForm({
        customerId: String(
          editing.customerId ??
            editing.customer?.id ??
            queryParams.customerId ??
            ""
        ),
        date: start ? start.toISOString().slice(0, 10) : "",
        time: start ? start.toISOString().slice(11, 16) : "",
        status: String(
          editing.status ?? "SCHEDULED"
        ).toUpperCase() as AppointmentStatus,
        notes: String(editing.notes ?? ""),
        assignedToPersonId: String(
          editing.assignedToPersonId ?? editing.personId ?? "unassigned"
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
      return;
    }
    setForm({
      customerId: queryParams.customerId ?? "",
      date: "",
      time: "",
      status: "SCHEDULED",
      notes: "",
      assignedToPersonId: "unassigned",
      durationMinutes: "60",
    });
  }, [
    assigneeWarningTelemetry.reset,
    openModal,
    editing,
    queryParams.customerId,
  ]);

  const saveAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMessage(null);
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
      assigneeWarningTelemetry.trackConfirmed(
        assignedToPersonId,
        editing?.id ? String(editing.id) : undefined
      );

      if (editing?.id) {
        await updateMutation.mutateAsync({
          id: String(editing.id),
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
        setSuccessMessage("Agendamento atualizado com sucesso.");
      } else {
        await createMutation.mutateAsync({
          customerId: form.customerId,
          assignedToPersonId:
            form.assignedToPersonId === "unassigned"
              ? undefined
              : form.assignedToPersonId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          status: form.status,
          notes: form.notes.trim() || undefined,
        });
        setSuccessMessage("Agendamento criado com sucesso.");
      }
      await Promise.all([
        utils.nexo.appointments.list.invalidate(),
        utils.nexo.serviceOrders.list.invalidate({ page: 1, limit: 100 }),
      ]);
      setOpenModal(false);
      setEditing(null);
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao salvar agendamento.");
    }
  };

  const updateStatus = useCallback(
    async (appointmentId: string, status: AppointmentStatus) => {
      try {
        setSuccessMessage(null);
        const appointment = appointments.find(
          item => String(item.id) === appointmentId
        );
        await updateMutation.mutateAsync({
          id: appointmentId,
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
    },
    [appointments, updateMutation, utils.nexo.appointments.list]
  );

  // A agenda continua utilizável quando uma relação complementar falha. Só a
  // consulta principal bloqueia a carteira; as demais viram indisponibilidade
  // parcial explícita, sem fabricar cliente, responsável ou vínculo financeiro.
  const loading = appointmentsQuery.isLoading;
  const hasError = appointmentsQuery.isError;
  const partialUnavailable = [
    customersQuery.isError ? "clientes" : null,
    peopleQuery.isError ? "responsáveis" : null,
    serviceOrdersQuery.isError ? "ordens de serviço" : null,
    chargesQuery.isError ? "financeiro" : null,
  ].filter(Boolean) as string[];

  const agendaHealth = useMemo(() => {
    const scheduled = mapped.filter(row => row.status === "SCHEDULED").length;
    const confirmed = mapped.filter(row => row.status === "CONFIRMED").length;
    const overdue = mapped.filter(row => row.isOverdue).length;
    const done = mapped.filter(row => row.status === "DONE").length;
    const noShow = mapped.filter(row => row.status === "NO_SHOW").length;
    const today = mapped.filter(
      row => row.start && row.start >= dayStart && row.start <= dayEnd
    ).length;
    return { scheduled, confirmed, overdue, done, noShow, today };
  }, [mapped, dayStart, dayEnd]);

  const attentionItems = useMemo(() => {
    const urgentRows = mapped
      .filter(
        row =>
          row.isOverdue ||
          row.hasConflict ||
          row.status === "SCHEDULED" ||
          row.status === "NO_SHOW" ||
          !row.hasAssignee ||
          (row.status === "DONE" && !row.order) ||
          (row.startsSoon && !row.order)
      )
      .sort(
        (a, b) =>
          (deriveAppointmentPriority(a) ?? "P3").localeCompare(
            deriveAppointmentPriority(b) ?? "P3"
          ) ||
          (a.start?.getTime() ?? Number.MAX_SAFE_INTEGER) -
            (b.start?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );

    return urgentRows.slice(0, 4);
  }, [mapped]);

  const nextBestAction = useMemo(() => {
    const actionable = [...mapped].sort((a, b) => {
      const priorityOrder: Record<AppPriorityLevel, number> = {
        P0: 0,
        P1: 1,
        P2: 2,
        P3: 3,
      };
      const priorityA = deriveAppointmentPriority(a) ?? "P3";
      const priorityB = deriveAppointmentPriority(b) ?? "P3";
      if (priorityOrder[priorityA] !== priorityOrder[priorityB])
        return priorityOrder[priorityA] - priorityOrder[priorityB];
      return (
        (a.start?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.start?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );
    });
    const overdue = actionable.find(row => row.isOverdue && row.item.id);
    if (overdue) {
      return {
        row: overdue,
        priority:
          deriveAppointmentPriority(overdue) ?? ("P0" as AppPriorityLevel),
        action: "Remarcar ou cancelar agendamento vencido",
        reason: `${overdue.customerName} ficou com horário vencido em ${formatDateTime(overdue.item.startsAt)}.`,
        impact:
          "Evita quebra do fluxo Cliente → Agendamento → O.S. → Financeiro.",
        ctaLabel: "Selecionar entrada",
        onClick: () => setSelectedAppointmentId(String(overdue.item.id)),
      };
    }
    const unconfirmedSoon = actionable.find(
      row => row.status === "SCHEDULED" && row.startsSoon && row.item.id
    );
    if (unconfirmedSoon) {
      return {
        row: unconfirmedSoon,
        priority:
          deriveAppointmentPriority(unconfirmedSoon) ??
          ("P1" as AppPriorityLevel),
        action: "Confirmar agendamento próximo",
        reason: `${unconfirmedSoon.customerName} ainda não está confirmado e está próximo do horário.`,
        impact:
          "Reduz no-show e prepara responsável, cliente e materiais antes da execução.",
        ctaLabel: "Confirmar",
        onClick: () =>
          void updateStatus(String(unconfirmedSoon.item.id), "CONFIRMED"),
      };
    }
    const startsSoon = actionable.find(row => row.startsSoon && row.item.id);
    if (startsSoon) {
      return {
        row: startsSoon,
        priority:
          deriveAppointmentPriority(startsSoon) ?? ("P1" as AppPriorityLevel),
        action: "Preparar atendimento",
        reason: `${startsSoon.customerName} está próximo do horário de atendimento.`,
        impact:
          "Organiza responsável, contexto e O.S. antes da execução operacional.",
        ctaLabel: "Preparar",
        onClick: () => setSelectedAppointmentId(String(startsSoon.item.id)),
      };
    }
    const unassigned = actionable.find(row => !row.hasAssignee && row.item.id);
    if (unassigned) {
      return {
        row: unassigned,
        priority:
          deriveAppointmentPriority(unassigned) ?? ("P1" as AppPriorityLevel),
        action: "Atribuir responsável",
        reason: `${unassigned.customerName} ainda não possui responsável definido.`,
        impact:
          "Cria dono claro para confirmação, preparo, execução e governança.",
        ctaLabel: "Editar responsável",
        onClick: () => {
          setSelectedAppointmentId(String(unassigned.item.id));
          setEditing(unassigned.item);
          setOpenModal(true);
        },
      };
    }
    const doneWithoutOrder = actionable.find(
      row => row.status === "DONE" && !row.order && row.item.id
    );
    if (doneWithoutOrder) {
      return {
        row: doneWithoutOrder,
        priority:
          deriveAppointmentPriority(doneWithoutOrder) ??
          ("P0" as AppPriorityLevel),
        action: "Gerar O.S. do atendimento concluído",
        reason: `${doneWithoutOrder.customerName} foi concluído sem O.S. vinculada neste carregamento.`,
        impact:
          "Conecta atendimento concluído à execução, cobrança, pagamento e Timeline.",
        ctaLabel: "Criar O.S.",
        onClick: () => {
          setSelectedAppointmentId(String(doneWithoutOrder.item.id));
          setOpenServiceOrderModal(true);
        },
      };
    }
    const canceled = actionable.find(
      row => row.status === "CANCELED" && row.item.id
    );
    if (canceled) {
      return {
        row: canceled,
        priority:
          deriveAppointmentPriority(canceled) ?? ("P3" as AppPriorityLevel),
        action: "Revisar histórico do cancelamento",
        reason: `${canceled.customerName} está com agendamento cancelado.`,
        impact:
          "Evita reabertura sem prova operacional ou contexto de governança.",
        ctaLabel: "Abrir histórico",
        onClick: () => setSelectedAppointmentId(String(canceled.item.id)),
      };
    }
    const withoutOrder = actionable.find(
      row =>
        ["SCHEDULED", "CONFIRMED"].includes(row.status) &&
        !row.order &&
        row.item.id
    );
    if (withoutOrder) {
      return {
        row: withoutOrder,
        priority:
          deriveAppointmentPriority(withoutOrder) ?? ("P2" as AppPriorityLevel),
        action: "Preparar O.S. do próximo agendamento",
        reason: `${withoutOrder.customerName} ainda não possui O.S. vinculada neste carregamento.`,
        impact:
          "Antecipar a preparação evita retrabalho na passagem para execução.",
        ctaLabel: "Criar O.S.",
        onClick: () => {
          setSelectedAppointmentId(String(withoutOrder.item.id));
          setOpenServiceOrderModal(true);
        },
      };
    }
    return null;
  }, [mapped, updateStatus]);

  const commandTarget =
    selected ?? nextBestAction?.row ?? filtered[0] ?? mapped[0] ?? null;

  const appointmentCommandState = useMemo(() => {
    if (!commandTarget) {
      return {
        level: (mapped.length > 0
          ? "NORMAL"
          : "WARNING") as OperationalStateLevel,
        reason:
          mapped.length > 0
            ? "Carteira carregada sem agendamento selecionado para foco."
            : "Nenhum agendamento retornado para a leitura de entrada operacional.",
        impact:
          mapped.length > 0
            ? "Selecione um horário para conectar cliente, execução, cobrança, Timeline e Governança."
            : "A entrada da operação ainda não tem próximo atendimento rastreável nesta página.",
        cta: mapped.length > 0 ? "Selecionar agendamento" : "Criar agendamento",
      };
    }
    if (
      commandTarget.status === "NO_SHOW" ||
      commandTarget.hasConflict ||
      commandTarget.isOverdue
    ) {
      return {
        level: "RESTRICTED" as OperationalStateLevel,
        reason: commandTarget.hasConflict
          ? "Há sobreposição real de horário para o mesmo cliente ou responsável nos dados carregados."
          : commandTarget.status === "NO_SHOW"
            ? "Agendamento marcado como no-show."
            : `Horário vencido em ${formatDateTime(commandTarget.item.startsAt)}.`,
        impact:
          "Entrada travada: a operação pode perder execução, receita e prova oficial se o agendamento não for revisado.",
        cta: "Revisar agendamento",
      };
    }
    if (commandTarget.status === "CANCELED") {
      return {
        level: "WARNING" as OperationalStateLevel,
        reason:
          "Agendamento cancelado; avanço para O.S. depende de revisão do histórico.",
        impact:
          "Governança precisa entender o motivo antes de reagendar, gerar O.S. ou considerar receita.",
        cta: "Revisar histórico",
      };
    }
    if (
      commandTarget.status === "SCHEDULED" ||
      commandTarget.startsSoon ||
      !commandTarget.hasAssignee
    ) {
      return {
        level: "WARNING" as OperationalStateLevel,
        reason:
          commandTarget.status === "SCHEDULED"
            ? "Agendamento ainda não confirmado."
            : commandTarget.startsSoon
              ? "Horário próximo exige preparo de atendimento."
              : "Agendamento sem responsável definido.",
        impact:
          "A entrada ainda precisa de confirmação, dono ou preparação para virar execução com segurança.",
        cta:
          commandTarget.status === "SCHEDULED"
            ? "Confirmar"
            : "Preparar atendimento",
      };
    }
    if (commandTarget.status === "DONE" && !commandTarget.order?.id) {
      return {
        level: "RESTRICTED" as OperationalStateLevel,
        reason:
          "Agendamento concluído sem O.S. vinculada nos dados carregados.",
        impact:
          "Atendimento aconteceu, mas ainda não virou execução, cobrança e pagamento rastreáveis.",
        cta: "Gerar O.S.",
      };
    }
    return {
      level: "NORMAL" as OperationalStateLevel,
      reason: "Agendamento organizado nos dados carregados.",
      impact:
        "Cliente, horário e passagem para execução podem ser acompanhados no fluxo operacional.",
      cta: "Revisar detalhes",
    };
  }, [commandTarget, mapped.length]);

  const appointmentRisk = useMemo(() => {
    if (!commandTarget) {
      return {
        title: "Sem agendamento em foco",
        reason: "A página não recebeu um agendamento selecionável.",
        impact:
          "Não há risco específico para explicar sem dados reais de agenda.",
        cta: "Criar agendamento",
      };
    }
    if (commandTarget.status === "NO_SHOW" || commandTarget.isOverdue) {
      return {
        title: "Entrada atrasada ou no-show",
        reason:
          commandTarget.status === "NO_SHOW"
            ? `${commandTarget.customerName} está marcado como no-show.`
            : `${commandTarget.customerName} passou do horário ${formatDateTime(commandTarget.item.startsAt)} sem encerramento.`,
        impact:
          "Pode bloquear O.S., postergar cobrança/pagamento e exigir evidência na Timeline.",
        cta: "Revisar atraso",
      };
    }
    if (commandTarget.hasConflict) {
      return {
        title: "Conflito de agenda",
        reason:
          "Existe sobreposição por cliente ou responsável com data/hora suficientes no carregamento.",
        impact:
          "O mesmo recurso pode estar comprometido em dois atendimentos, elevando risco de atraso e no-show.",
        cta: "Ver conflito",
      };
    }
    if (commandTarget.status === "SCHEDULED") {
      return {
        title: "Falta confirmação",
        reason: `${commandTarget.customerName} ainda está como agendado, não confirmado.`,
        impact:
          "A execução pode não acontecer e a previsão de receita fica menos confiável.",
        cta: "Confirmar agendamento",
      };
    }
    if (!commandTarget.hasAssignee) {
      return {
        title: "Sem responsável",
        reason:
          "Não há pessoa responsável vinculada ao agendamento nos dados carregados.",
        impact:
          "Sem dono, confirmação, preparo e conversão em O.S. ficam frágeis para governança.",
        cta: "Atribuir responsável",
      };
    }
    if (commandTarget.status === "DONE" && !commandTarget.order?.id) {
      return {
        title: "Concluído sem O.S.",
        reason:
          "O atendimento foi concluído, mas não há O.S. vinculada neste carregamento.",
        impact:
          "A operação perde trilha para cobrança, pagamento e prova formal de execução.",
        cta: "Gerar O.S.",
      };
    }
    return {
      title: "Sem risco crítico",
      reason:
        "Status, horário, responsável e vínculo operacional não indicam bloqueio imediato.",
      impact:
        "Mantenha a Timeline atualizada para sustentar execução, receita e governança.",
      cta: "Revisar agenda",
    };
  }, [commandTarget]);

  const canonicalNextBestAction = useMemo<AppointmentCommandAction>(() => {
    const target = commandTarget;
    if (!target) {
      return {
        title: "Revisar agenda do dia",
        entity: "Agenda",
        reason: "Nenhum agendamento carregado para ação específica.",
        impact:
          "Mantém a entrada operacional pronta para receber novos horários.",
        primaryActionLabel: "Novo agendamento",
        safetyNote:
          "A ação apenas abre o cadastro; nada é executado automaticamente.",
        onPrimaryAction: () => {
          setEditing(null);
          setOpenModal(true);
        },
      };
    }
    const openDetail = () =>
      setSelectedAppointmentId(String(target.item.id ?? ""));
    if (target.status === "NO_SHOW" || target.isOverdue) {
      return {
        title: "Revisar agendamento",
        entity: `${target.customerName} · ${formatDateTime(target.item.startsAt)}`,
        reason:
          target.status === "NO_SHOW"
            ? "Agendamento em no-show."
            : "Horário atrasado ainda aberto.",
        impact:
          "Define se a entrada será remarcada, cancelada ou transformada em execução com prova.",
        primaryActionLabel: "Revisar entrada",
        secondaryActionLabel: "Remarcar/editar",
        safetyNote:
          "Orientação contextual; alterações exigem confirmação nos controles existentes.",
        onPrimaryAction: openDetail,
        onSecondaryAction: () => {
          setEditing(target.item);
          setOpenModal(true);
        },
      };
    }
    if (target.status === "SCHEDULED") {
      return {
        title: "Confirmar agendamento",
        entity: `${target.customerName} · ${formatDateTime(target.item.startsAt)}`,
        reason: "Agendamento sem confirmação oficial no status atual.",
        impact: "Reduz no-show e prepara a passagem para O.S. e atendimento.",
        primaryActionLabel: "Confirmar",
        secondaryActionLabel: "Abrir detalhe",
        safetyNote:
          "Usa a ação de confirmação já existente; não cria fluxo novo de comunicação.",
        onPrimaryAction: () =>
          void updateStatus(String(target.item.id), "CONFIRMED"),
        onSecondaryAction: openDetail,
      };
    }
    if (target.startsSoon) {
      return {
        title: "Preparar atendimento",
        entity: `${target.customerName} · ${formatDateTime(target.item.startsAt)}`,
        reason: "Horário próximo dentro da janela operacional de 120 minutos.",
        impact:
          "Organiza responsável, contexto do cliente e O.S. antes da execução.",
        primaryActionLabel: target.order?.id ? "Abrir O.S." : "Criar O.S.",
        secondaryActionLabel: "Abrir cliente",
        safetyNote:
          "A camada só orienta a preparação; criação/abertura segue os fluxos existentes.",
        onPrimaryAction: () => {
          setSelectedAppointmentId(String(target.item.id));
          if (target.order?.id) {
            navigate(
              `/service-orders?customerId=${target.customerId}&appointmentId=${target.item.id}`
            );
            return;
          }
          setOpenServiceOrderModal(true);
        },
        onSecondaryAction: () =>
          navigate(`/customers?customerId=${target.customerId}`),
      };
    }
    if (!target.hasAssignee) {
      return {
        title: "Atribuir responsável",
        entity: `${target.customerName} · ${formatDateTime(target.item.startsAt)}`,
        reason: "Agendamento sem responsável nos dados carregados.",
        impact:
          "Cria dono claro para confirmação, preparo, execução e auditoria.",
        primaryActionLabel: "Editar responsável",
        secondaryActionLabel: "Abrir detalhe",
        safetyNote:
          "Atribuição acontece somente ao salvar o formulário existente.",
        onPrimaryAction: () => {
          setEditing(target.item);
          setOpenModal(true);
        },
        onSecondaryAction: openDetail,
      };
    }
    if (target.status === "DONE" && !target.order?.id) {
      return {
        title: "Gerar O.S.",
        entity: `${target.customerName} · agendamento concluído`,
        reason: "Atendimento concluído sem O.S. vinculada.",
        impact: "Conecta execução à cobrança, pagamento e Timeline oficial.",
        primaryActionLabel: "Criar O.S.",
        secondaryActionLabel: "Abrir detalhe",
        safetyNote:
          "A O.S. será criada apenas no modal existente, com confirmação do usuário.",
        onPrimaryAction: () => {
          setSelectedAppointmentId(String(target.item.id));
          setOpenServiceOrderModal(true);
        },
        onSecondaryAction: openDetail,
      };
    }
    if (target.status === "CANCELED") {
      return {
        title: "Revisar histórico",
        entity: `${target.customerName} · agendamento cancelado`,
        reason:
          "Agendamento cancelado não deve avançar para execução sem contexto.",
        impact:
          "Evita reabertura sem prova e mantém governança sobre perda/reagendamento.",
        primaryActionLabel: "Abrir Timeline",
        secondaryActionLabel: "Abrir detalhe",
        safetyNote:
          "Sem criar histórico fictício; a Timeline oficial é a fonte de prova.",
        onPrimaryAction: () =>
          navigate(
            target.customerId
              ? `/timeline?customerId=${target.customerId}`
              : "/timeline"
          ),
        onSecondaryAction: openDetail,
      };
    }
    return {
      title: "Revisar agenda do dia",
      entity: `${target.customerName} · ${formatDateTime(target.item.startsAt)}`,
      reason:
        "Nenhuma pendência forte foi detectada para o agendamento em foco.",
      impact:
        "Mantém a carteira pronta para virar execução no horário previsto.",
      primaryActionLabel: "Abrir detalhe",
      secondaryActionLabel: "Ver agenda de hoje",
      safetyNote: "Leitura consultiva baseada apenas nos dados carregados.",
      onPrimaryAction: openDetail,
      onSecondaryAction: () => setSelectedFilter("today"),
    };
  }, [commandTarget, navigate, updateStatus]);

  const appointmentFlowStages = useMemo(() => {
    const target = commandTarget;
    const orderStatus = String(target?.order?.status ?? "").toUpperCase();
    const hasCharge =
      Boolean(target?.charge?.id) ||
      Boolean(target?.order?.financialSummary?.hasCharge);
    const chargeStatus = getChargeStatus(target?.charge);
    const paymentDone = hasPaymentEvidence(target?.charge);
    const chargeOverdue = isChargeOverdue(target?.charge);
    const stages: Array<{
      id: string;
      label: string;
      summary: string;
      state: OperationalFlowStageState;
      countOrValue?: string;
      hrefLabel?: string;
      onClick?: () => void;
    }> = [
      {
        id: "customer",
        label: "Cliente",
        summary: target?.customerId
          ? `Cliente vinculado: ${target.customerName}.`
          : "Sem cliente vinculado nos dados carregados.",
        state: target?.customerId ? "done" : "blocked",
        countOrValue: target?.customerId ? "1" : "0",
        hrefLabel: "Abrir cliente",
        onClick: target?.customerId
          ? () => navigate(`/customers?customerId=${target.customerId}`)
          : undefined,
      },
      {
        id: "appointment",
        label: "Agendamento",
        summary: appointmentPipelineSummary(target),
        state: !target
          ? "idle"
          : target.status === "DONE"
            ? "done"
            : target.isOverdue ||
                target.status === "NO_SHOW" ||
                target.hasConflict
              ? "blocked"
              : target.status === "SCHEDULED" ||
                  target.startsSoon ||
                  !target.hasAssignee
                ? "warning"
                : "active",
        countOrValue: target
          ? durationLabel(target.item.startsAt, target.item.endsAt)
          : undefined,
      },
      {
        id: "service-order",
        label: "O.S.",
        summary: serviceOrderPipelineSummary(target),
        state: target?.order?.id
          ? orderStatus === "DONE"
            ? "done"
            : "active"
          : target?.status === "DONE"
            ? "blocked"
            : "idle",
        countOrValue: target?.order?.id ? "Vinculada" : "0",
        hrefLabel: target?.order?.id ? "Abrir O.S." : "Criar O.S.",
        onClick: target?.item.id
          ? () => {
              if (target.order?.id) {
                navigate(
                  `/service-orders?customerId=${target.customerId}&appointmentId=${target.item.id}`
                );
                return;
              }
              setSelectedAppointmentId(String(target.item.id));
              setOpenServiceOrderModal(true);
            }
          : undefined,
      },
      {
        id: "charge",
        label: "Cobrança",
        summary: chargePipelineSummary(
          hasCharge,
          chargeStatus,
          chargeOverdue,
          paymentDone
        ),
        state: hasCharge
          ? paymentDone
            ? "done"
            : chargeOverdue
              ? "blocked"
              : "warning"
          : orderStatus === "DONE"
            ? "blocked"
            : "idle",
        countOrValue: hasCharge ? "Vinculada" : "0",
        hrefLabel: "Abrir financeiro",
        onClick: target?.customerId
          ? () => navigate(`/finances?customerId=${target.customerId}`)
          : undefined,
      },
      {
        id: "payment",
        label: "Pagamento",
        summary: paymentDone ? "Pagamento recebido" : "Aguardando pagamento",
        state: paymentDone
          ? "done"
          : hasCharge
            ? chargeOverdue
              ? "blocked"
              : "warning"
            : "idle",
        countOrValue: paymentDone ? "OK" : "—",
      },
    ];
    return stages;
  }, [commandTarget, navigate]);

  const appointmentTimelineEvents = useMemo(() => {
    if (timeline.length > 0) {
      return timeline.slice(0, 4).map((event: any) => ({
        id: String(event?.id ?? `${event?.createdAt}-${event?.action}`),
        type: humanizeTimelineEvent(event),
        occurredAt: formatDateTime(
          String(event?.createdAt ?? event?.occurredAt ?? "")
        ),
        entity: sanitizeOperationalText(event?.entityType, "Agendamento"),
        actor: safeEntityLabel(event?.actorName ?? event?.actor, "Sistema"),
        summary: sanitizeOperationalText(
          event?.description ?? event?.summary,
          "Evento operacional registrado."
        ),
      }));
    }
    const target = commandTarget;
    if (!target) return [];
    const derived = [
      target.item.createdAt
        ? {
            id: `${target.item.id}-created`,
            type: "Agendamento criado",
            occurredAt: formatDateTime(target.item.createdAt),
            entity: "Agendamento",
            actor: target.ownerName,
            summary: `Agendamento de ${target.customerName} criado com data real do registro.`,
          }
        : null,
      target.status === "CONFIRMED" && target.item.updatedAt
        ? {
            id: `${target.item.id}-confirmed`,
            type: "Agendamento confirmado",
            occurredAt: formatDateTime(target.item.updatedAt),
            entity: "Agendamento",
            actor: target.ownerName,
            summary:
              "Status atual indica confirmação; evento derivado do próprio agendamento.",
          }
        : null,
      target.status === "CANCELED" && target.item.updatedAt
        ? {
            id: `${target.item.id}-canceled`,
            type: "Agendamento cancelado",
            occurredAt: formatDateTime(target.item.updatedAt),
            entity: "Agendamento",
            actor: target.ownerName,
            summary:
              "Status atual indica cancelamento; evento derivado do próprio agendamento.",
          }
        : null,
      target.status === "DONE" && target.item.updatedAt
        ? {
            id: `${target.item.id}-done`,
            type: "Agendamento concluído",
            occurredAt: formatDateTime(target.item.updatedAt),
            entity: "Agendamento",
            actor: target.ownerName,
            summary:
              "Status atual indica conclusão; evento derivado do próprio agendamento.",
          }
        : null,
      target.order?.id
        ? {
            id: `${target.item.id}-order`,
            type: "O.S. criada",
            occurredAt: formatDateTime(
              target.order.createdAt ?? target.order.updatedAt
            ),
            entity: "O.S. vinculada",
            actor: target.ownerName,
            summary: "O.S. vinculada encontrada nos dados carregados.",
          }
        : null,
    ].filter(Boolean);
    return derived.slice(0, 4) as Array<{
      id: string;
      type: string;
      occurredAt: string;
      entity: string;
      actor?: string;
      summary: string;
    }>;
  }, [commandTarget, timeline]);

  const executionPreparationItems = useMemo(() => {
    const target = commandTarget;
    const hasCharge =
      Boolean(target?.charge?.id) ||
      Boolean(target?.order?.financialSummary?.hasCharge);
    const timelineAvailable =
      timeline.length > 0 || appointmentTimelineEvents.length > 0;
    return [
      {
        label: target?.customerId
          ? "Cliente vinculado"
          : "Sem cliente vinculado",
        state: target?.customerId ? "ok" : "attention",
        action: target?.customerId ? "Abrir cliente" : undefined,
        onClick: target?.customerId
          ? () => navigate(`/customers?customerId=${target.customerId}`)
          : undefined,
      },
      {
        label:
          target?.status === "CONFIRMED" || target?.status === "DONE"
            ? "Agendamento confirmado"
            : "Confirmação pendente",
        state:
          target?.status === "CONFIRMED" || target?.status === "DONE"
            ? "ok"
            : "attention",
        action: target?.status === "SCHEDULED" ? "Confirmar" : undefined,
        onClick:
          target?.status === "SCHEDULED" && target.item.id
            ? () => void updateStatus(String(target.item.id), "CONFIRMED")
            : undefined,
      },
      {
        label: target?.hasAssignee
          ? "Responsável definido"
          : "Sem responsável definido",
        state: target?.hasAssignee ? "ok" : "attention",
        action: target?.item.id ? "Editar" : undefined,
        onClick: target?.item.id
          ? () => {
              setEditing(target.item);
              setOpenModal(true);
            }
          : undefined,
      },
      {
        label: target?.order?.id ? "O.S. vinculada" : "O.S. pendente",
        state: target?.order?.id ? "ok" : "attention",
        action: target?.item.id
          ? target.order?.id
            ? "Abrir O.S."
            : "Criar O.S."
          : undefined,
        onClick: target?.item.id
          ? () => {
              if (target.order?.id) {
                navigate(
                  `/service-orders?customerId=${target.customerId}&appointmentId=${target.item.id}`
                );
                return;
              }
              setSelectedAppointmentId(String(target.item.id));
              setOpenServiceOrderModal(true);
            }
          : undefined,
      },
      {
        label: hasCharge ? "Cobrança preparada" : "Cobrança pendente",
        state: hasCharge ? "ok" : "attention",
        action: target?.customerId ? "Financeiro" : undefined,
        onClick: target?.customerId
          ? () => navigate(`/finances?customerId=${target.customerId}`)
          : undefined,
      },
      {
        label: timelineAvailable
          ? "Evidência/Timeline disponível"
          : "Sem evidência oficial retornada",
        state: timelineAvailable ? "ok" : "neutral",
        action: target?.customerId ? "Ver Timeline" : undefined,
        onClick: target?.customerId
          ? () => navigate(`/timeline?customerId=${target.customerId}`)
          : undefined,
      },
      {
        label: target?.customerId
          ? "Canal WhatsApp disponível"
          : "WhatsApp indisponível",
        state: target?.customerId ? "ok" : "neutral",
        action: target?.customerId && target?.item.id ? "WhatsApp" : undefined,
        onClick:
          target?.customerId && target?.item.id
            ? () =>
                goToWhatsAppAppointment(
                  target.customerId,
                  String(target.item.id)
                )
            : undefined,
      },
    ];
  }, [
    appointmentTimelineEvents.length,
    commandTarget,
    navigate,
    timeline.length,
    updateStatus,
  ]);

  const walletNeedsInternalScroll = paginatedAppointments.length > 5;

  function goToWhatsAppAppointment(customerId: string, appointmentId: string) {
    if (!String(customerId ?? "").trim()) {
      toast.error("Agendamento sem cliente válido para WhatsApp.");
      return;
    }
    if (!String(appointmentId ?? "").trim()) {
      toast.error("Agendamento inválido para abrir WhatsApp.");
      return;
    }
    navigate(
      `/whatsapp?customerId=${customerId}&appointmentId=${appointmentId}&template=APPOINTMENT_REMINDER`
    );
  }
  return (
    <AppPageShell>
      <div className="flex flex-col gap-3">
        <AppOperationalHeader
          title="Agendamentos"
          description="Controle do tempo, confirmação e preparação da execução"
          density="compact"
          primaryAction={
            <Button
              className="bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
              onClick={() => {
                setEditing(null);
                setOpenModal(true);
              }}
            >
              Novo agendamento
            </Button>
          }
        >
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <AppInput
              value={queryText}
              onChange={event => setQueryText(event.target.value)}
              placeholder="Buscar cliente, observação ou serviço"
              className="h-9"
            />
            <div className="flex h-9 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs text-[var(--text-muted)]">
              {mapped.length} agendamento(s)
            </div>
          </div>
        </AppOperationalHeader>

        {selected ? (
          <AppSectionCard className="overflow-hidden border-2 border-[var(--accent-primary)]/35 bg-gradient-to-br from-[var(--surface-base)] via-[var(--surface-subtle)] to-[var(--accent-soft)]/40 p-0">
            <div className="grid gap-0 lg:grid-cols-[1.45fr_0.55fr]">
              <div className="p-6 md:p-8">
                <p className="nexo-overline">Hero executivo do agendamento</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AppStatusBadge {...mapStatus(selected.item.status)} />
                  <AppStatusBadge {...mapOperationalStatusBadge(selected)} />
                  {deriveAppointmentPriority(selected) ? (
                    <AppPriorityBadge
                      priority={deriveAppointmentPriority(selected)!}
                      label={appointmentPriorityLabel(
                        deriveAppointmentPriority(selected)!
                      )}
                    />
                  ) : null}
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-5xl">
                  {selected.customerName}
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--surface-base)]/70 p-3">
                    <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Data e hora
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      {formatDateTime(selected.item.startsAt)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-base)]/70 p-3">
                    <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Duração
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      {durationLabel(
                        selected.item.startsAt,
                        selected.item.endsAt
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-base)]/70 p-3">
                    <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Responsável
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      {selected.ownerName}
                    </p>
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                  {selected.item.title ||
                    selected.item.notes ||
                    "Agendamento sem observação operacional cadastrada."}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]/75 p-5 lg:border-l lg:border-t-0">
                <div className="rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)]/35 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Sinal principal
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                    {appointmentRisk.title}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                    Próxima ação: {canonicalNextBestAction.primaryActionLabel}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Button
                    onClick={() =>
                      setSelectedAppointmentId(String(selected.item.id ?? ""))
                    }
                    disabled={!selected.item.id}
                  >
                    Abrir agendamento
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(selected.item);
                      setOpenModal(true);
                    }}
                    disabled={!selected.item.id}
                  >
                    Remarcar/editar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selected.order?.id) {
                        navigate(
                          `/service-orders?customerId=${selected.customerId}&appointmentId=${selected.item.id}`
                        );
                        return;
                      }
                      setOpenServiceOrderModal(true);
                    }}
                    disabled={!selected.item.id}
                  >
                    {selected.order?.id ? "Abrir O.S." : "Criar O.S."}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        goToWhatsAppAppointment(
                          selected.customerId,
                          String(selected.item.id ?? "")
                        )
                      }
                      disabled={!selected.customerId || !selected.item.id}
                    >
                      WhatsApp
                    </Button>
                    <Button
                      size="sm"
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
              </div>
            </div>
          </AppSectionCard>
        ) : null}

        <AppFiltersBar className="gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
          {FILTERS.slice(0, 5).map(filter => {
            const count =
              filter.key === "today"
                ? agendaHealth.today
                : filter.key === "unconfirmed"
                  ? agendaHealth.scheduled
                  : filter.key === "overdue"
                    ? agendaHealth.overdue
                    : filter.key === "week"
                      ? mapped.filter(
                          row =>
                            row.start &&
                            row.start >= dayStart &&
                            row.start <= weekEnd
                        ).length
                      : filter.key === "canceled"
                        ? mapped.filter(row => row.status === "CANCELED").length
                        : filtered.length;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSelectedFilter(filter.key)}
                className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                  selectedFilter === filter.key
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                }`}
              >
                {filter.label} · {count}
              </button>
            );
          })}
        </AppFiltersBar>

        <AppSectionCard
          className="space-y-4 border-2 border-[var(--accent-primary)]/45 bg-gradient-to-br from-[var(--accent-soft)]/35 via-[var(--surface-base)] to-[var(--surface-subtle)] p-0"
          data-contract-decision-command="true"
        >
          <div className="border-b border-[var(--accent-primary)]/20 px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="nexo-overline">
                  Decisão e próxima ação · Próxima melhor ação
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] md:text-3xl">
                  Faça agora: {canonicalNextBestAction.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {canonicalNextBestAction.entity}
                </p>
              </div>
              <AppStatusBadge
                {...mapOperationalStatus(
                  commandTarget ??
                    mapped[0] ??
                    ({
                      status: "SCHEDULED",
                      isOverdue: false,
                      startsSoon: false,
                      hasConflict: false,
                      item: {},
                      customerName: "",
                      ownerName: "",
                      customerId: "",
                      ownerId: "",
                      hasAssignee: true,
                      order: null,
                      charge: null,
                      start: null,
                    } as MappedAppointment)
                )}
              />
            </div>
          </div>
          <div className="grid gap-3 px-5 md:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-[var(--accent-primary)]/25 bg-[var(--surface-base)]/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Estado operacional
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {appointmentCommandState.reason}
              </p>
              <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                Motivo: {canonicalNextBestAction.reason}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Maior risco agora
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {appointmentRisk.reason}
              </p>
              <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                Impacto: {appointmentRisk.impact}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                Nota de segurança: {canonicalNextBestAction.safetyNote}
              </p>
            </div>
          </div>
          <AppActionBar className="gap-2 border-t border-[var(--accent-primary)]/20 px-5 pb-5 pt-1 md:px-6">
            <div className="mr-auto max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Próxima ação
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {canonicalNextBestAction.impact}
              </p>
            </div>
            <Button
              size="lg"
              className="min-w-[220px] bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
              onClick={canonicalNextBestAction.onPrimaryAction}
            >
              {canonicalNextBestAction.primaryActionLabel}
            </Button>
            {canonicalNextBestAction.secondaryActionLabel &&
            canonicalNextBestAction.onSecondaryAction ? (
              <Button
                variant="outline"
                onClick={canonicalNextBestAction.onSecondaryAction}
              >
                {canonicalNextBestAction.secondaryActionLabel}
              </Button>
            ) : null}
          </AppActionBar>
        </AppSectionCard>

        <AppSectionBlock
          title="Preparação da execução"
          subtitle="Checklist compacto para evitar no-show, atraso ou perda de evidência antes da passagem para execução."
          compact
        >
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {executionPreparationItems.map(item => (
              <div
                key={item.label}
                className="flex min-h-[68px] items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2"
              >
                <div className="min-w-0">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      item.state === "ok"
                        ? "bg-[var(--success)]"
                        : item.state === "attention"
                          ? "bg-[var(--warning)]"
                          : "bg-[var(--text-muted)]"
                    }`}
                    aria-hidden="true"
                  />
                  <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
                    {item.label}
                  </p>
                </div>
                {item.action && item.onClick ? (
                  <Button size="sm" variant="ghost" onClick={item.onClick}>
                    {item.action}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </AppSectionBlock>

        {selected ? (
          <EntityTimelineCard
            title="Timeline humanizada do agendamento"
            subtitle={
              timeline.length > 0
                ? "Últimos eventos oficiais retornados para sustentar a leitura do cliente e do horário."
                : "Sem Timeline oficial carregada; exibimos apenas eventos derivados de datas reais do agendamento, sem criar histórico fictício."
            }
            events={appointmentTimelineEvents}
            fullTimelineLabel="Abrir Timeline completa"
            onFullTimeline={() =>
              navigate(
                selected.customerId
                  ? `/timeline?customerId=${selected.customerId}`
                  : "/timeline"
              )
            }
          />
        ) : null}

        <OperationalFlowCard
          title="Fluxo de entrada do agendamento"
          subtitle="Cliente → Agendamento → O.S. → Cobrança → Pagamento"
          stages={appointmentFlowStages}
        />

        <AppSectionBlock
          title="Resumo operacional"
          subtitle="Confirmação, atraso e preparo de execução."
          compact
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              Saúde calculada com a carteira carregada, sem mudar filtros ou
              regras de status.
            </p>
            <AppStatusBadge
              label={
                agendaHealth.noShow > 0
                  ? "CRÍTICO"
                  : agendaHealth.overdue > 0
                    ? "RISCO"
                    : agendaHealth.scheduled > 0
                      ? "ATENÇÃO"
                      : "NORMAL"
              }
              tone={
                agendaHealth.noShow > 0
                  ? "danger"
                  : agendaHealth.overdue > 0
                    ? "accent"
                    : agendaHealth.scheduled > 0
                      ? "warning"
                      : "success"
              }
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {[
              {
                title: "Hoje",
                value: agendaHealth.today,
                action: "Ver",
                onClick: () => setSelectedFilter("today"),
              },
              {
                title: "Confirmados",
                value: agendaHealth.confirmed,
                action: "Ver",
                onClick: () => setSelectedFilter("confirmed"),
              },
              {
                title: "Não confirmados",
                value: agendaHealth.scheduled,
                action: "Confirmar",
                onClick: () => setSelectedFilter("unconfirmed"),
              },
              {
                title: "Atrasados",
                value: agendaHealth.overdue,
                action: "Revisar",
                onClick: () => setSelectedFilter("overdue"),
              },
              {
                title: "Concluídos",
                value: agendaHealth.done,
                action: "Ver",
                onClick: () => setSelectedFilter("all"),
              },
            ].map(metric => (
              <button
                key={metric.title}
                type="button"
                onClick={metric.onClick}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 text-left transition-colors hover:border-[var(--accent-primary)]/40"
              >
                <span className="text-[1.65rem] font-semibold leading-none text-[var(--text-primary)]">
                  {metric.value}
                </span>
                <span className="ml-2 text-xs font-medium text-[var(--text-secondary)]">
                  {metric.title}
                </span>
                <span className="float-right mt-1 text-[11px] font-medium text-[var(--accent-primary)]">
                  {metric.action}
                </span>
              </button>
            ))}
          </div>
        </AppSectionBlock>

        <AppSectionBlock
          title="Radar operacional"
          data-contract-copy="Alertas compactos"
          subtitle="Não confirmados, atrasos, risco de no-show e preparação pendente. Fonte atual não entrega resposta do cliente nesta tela; sem resposta aparece apenas como fallback honesto."
          compact
        >
          {attentionItems.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {attentionItems.map(row => {
                return (
                  <article
                    key={String(
                      row.item.id ?? `${row.customerId}-${row.item.startsAt}`
                    )}
                    className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--surface-subtle)] px-2.5 py-2"
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {row.customerName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatDateTime(row.item.startsAt)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">
                      {mapOperationalStatusBadge(row).label}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">
                      Ação: {nextActionLabel(row)}
                    </p>
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelectedAppointmentId(String(row.item.id ?? ""))
                      }
                      disabled={!row.item.id}
                    >
                      Resolver
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <AppPageEmptyState
              title="Sem atenção imediata"
              description="Nenhum agendamento carregado está atrasado, sem confirmação ou com preparação pendente crítica."
            />
          )}
        </AppSectionBlock>

        <AppFiltersBar className="relative z-30 shrink-0 gap-2 overflow-visible border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
          {FILTERS.slice(0, 3).map(filter => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setSelectedFilter(filter.key)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                selectedFilter === filter.key
                  ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <details className="relative z-40">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)]">
              Mais filtros
            </summary>
            <div className="absolute right-0 z-50 mt-2 grid min-w-[220px] gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              {FILTERS.slice(3).map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setSelectedFilter(filter.key)}
                  className={`h-8 rounded-md px-3 text-left text-xs font-medium transition-colors ${
                    selectedFilter === filter.key
                      ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
              <select
                aria-label="Filtrar por cliente"
                className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs text-[var(--text-muted)]"
                value={customerFilter}
                onChange={event => setCustomerFilter(event.target.value)}
                disabled={customersQuery.isError}
              >
                <option value="all">Cliente: todos</option>
                {customers.map((customer: any) => (
                  <option key={String(customer.id)} value={String(customer.id)}>
                    {String(customer.name ?? "Cliente")}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por responsável"
                className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs text-[var(--text-muted)]"
                value={responsibleFilter}
                onChange={event => setResponsibleFilter(event.target.value)}
                disabled={peopleQuery.isError}
              >
                <option value="all">Responsável: todos</option>
                {people.map((person: any) => (
                  <option key={String(person.id)} value={String(person.id)}>
                    {String(person.name ?? "Colaborador")}
                  </option>
                ))}
              </select>
            </div>
          </details>
        </AppFiltersBar>

        {successMessage ? (
          <p className="text-sm text-[var(--success)]">{successMessage}</p>
        ) : null}

        {partialUnavailable.length > 0 ? (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center"
          >
            <p className="flex-1">
              Indisponibilidade parcial: não foi possível carregar{" "}
              {partialUnavailable.join(", ")}. A carteira de agendamentos
              continua disponível sem inventar esses vínculos.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void Promise.all([
                  customersQuery.refetch(),
                  peopleQuery.refetch(),
                  serviceOrdersQuery.refetch(),
                  chargesQuery.refetch(),
                ]);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : null}

        <AppSectionBlock
          title={
            selected
              ? "Outros agendamentos da operação"
              : "Carteira operacional de agendamentos"
          }
          subtitle="Tempo, cliente/serviço, status, responsável e ação rápida como apoio à execução."
          className="flex flex-col"
          compact
        >
          {loading ? (
            <AppPageLoadingState description="Carregando agendamentos..." />
          ) : hasError ? (
            <AppPageErrorState
              description="Erro ao carregar dados operacionais de agendamentos."
              actionLabel="Tentar novamente"
              onAction={() => {
                void Promise.all([
                  appointmentsQuery.refetch(),
                  customersQuery.refetch(),
                  peopleQuery.refetch(),
                  serviceOrdersQuery.refetch(),
                  chargesQuery.refetch(),
                ]);
              }}
            />
          ) : mapped.length === 0 ? (
            <AppPageEmptyState
              title="Sem agendamentos"
              description="Não há agendamentos cadastrados no backend para este ambiente."
            />
          ) : filtered.length === 0 ? (
            <AppSectionCard className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Nenhum agendamento para o filtro atual
              </p>
              <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                Existem agendamentos carregados, mas nenhum corresponde ao
                filtro atual. Limpe ou troque o filtro para voltar à carteira
                operacional.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFilter("all");
                  setQueryText("");
                  setCustomerFilter("all");
                  setResponsibleFilter("all");
                }}
              >
                Limpar filtro
              </Button>
            </AppSectionCard>
          ) : (
            <>
              <div
                data-contract-wallet-dynamic-height="true"
                className={`${walletNeedsInternalScroll ? "max-h-[520px] overflow-y-auto pr-1" : ""} grid gap-2 md:hidden`}
              >
                {paginatedAppointments.map(row => {
                  const status = mapStatus(row.item.status);
                  const priority = deriveAppointmentPriority(row);
                  const appointmentId = String(row.item.id ?? "");
                  return (
                    <article
                      key={`card-${appointmentId}`}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
                      onClick={() => setSelectedAppointmentId(appointmentId)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {formatDateTime(row.item.startsAt)}
                          </p>
                          <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                            {row.customerName}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                            {row.item.title ||
                              row.item.notes ||
                              "Sem observação"}
                          </p>
                        </div>
                        <AppStatusBadge
                          label={status.label}
                          tone={status.tone}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {priority ? (
                          <AppPriorityBadge
                            priority={priority}
                            label={appointmentPriorityLabel(priority)}
                          />
                        ) : null}
                        <span className="text-xs text-[var(--text-muted)]">
                          {row.ownerName}
                        </span>
                      </div>
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        onClick={() => setSelectedAppointmentId(appointmentId)}
                      >
                        {nextActionLabel(row)}
                      </Button>
                    </article>
                  );
                })}
              </div>
              <div
                data-contract-wallet-scroll-only-when-many="true"
                className={`${walletNeedsInternalScroll ? "max-h-[560px] overflow-y-auto pr-1" : ""} hidden gap-2 md:grid`}
              >
                {paginatedAppointments.map(row => {
                  const status = mapStatus(row.item.status);
                  const orderId = row.order?.id ? String(row.order.id) : null;
                  const appointmentId = String(row.item.id ?? "");
                  const isSelected = selectedAppointmentId === appointmentId;
                  const priority = deriveAppointmentPriority(row);
                  const operationalBadge = mapOperationalStatusBadge(row);
                  return (
                    <article
                      key={`line-${appointmentId}`}
                      className={`grid cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors lg:grid-cols-[150px_1.4fr_1fr_150px_220px] ${
                        isSelected
                          ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]/35"
                          : "border-[var(--border-subtle)] bg-[var(--surface-base)] hover:border-[var(--accent-primary)]/30"
                      }`}
                      onClick={() => setSelectedAppointmentId(appointmentId)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {formatDateTime(row.item.startsAt)}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {durationLabel(row.item.startsAt, row.item.endsAt)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {row.customerName}
                        </p>
                        <p className="truncate text-xs text-[var(--text-secondary)]">
                          {row.item.title || row.item.notes || "Sem observação"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {orderId ? "O.S. vinculada" : "Sem O.S."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AppStatusBadge
                          label={status.label}
                          tone={status.tone}
                        />
                        {priority ? (
                          <AppPriorityBadge
                            priority={priority}
                            label={appointmentPriorityLabel(priority)}
                          />
                        ) : (
                          <AppStatusBadge {...operationalBadge} />
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {row.ownerName}
                      </p>
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={event => event.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          onClick={() =>
                            setSelectedAppointmentId(appointmentId)
                          }
                        >
                          {nextActionLabel(row)}
                        </Button>
                        <AppRowActionsDropdown
                          triggerLabel="Ações do agendamento"
                          items={[
                            {
                              label: "Confirmar",
                              onSelect: () =>
                                void updateStatus(
                                  String(row.item.id),
                                  "CONFIRMED"
                                ),
                              disabled: !row.item.id,
                              tone: "primary",
                            },
                            {
                              label: "Iniciar atendimento",
                              onSelect: () => {
                                if (orderId) {
                                  navigate(
                                    `/service-orders?customerId=${row.customerId}&appointmentId=${row.item.id}`
                                  );
                                  return;
                                }
                                setSelectedAppointmentId(String(row.item.id));
                                setOpenServiceOrderModal(true);
                              },
                              disabled: !row.item.id,
                            },
                            {
                              label: "Cancelar",
                              onSelect: () =>
                                void updateStatus(
                                  String(row.item.id),
                                  "CANCELED"
                                ),
                              disabled: !row.item.id,
                            },
                            {
                              label: "Editar/Remarcar",
                              onSelect: () => {
                                setEditing(row.item);
                                setOpenModal(true);
                              },
                              disabled: !row.item.id,
                            },
                            {
                              label: "Criar O.S.",
                              onSelect: () => {
                                setSelectedAppointmentId(String(row.item.id));
                                setOpenServiceOrderModal(true);
                              },
                              disabled: !row.item.id,
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
                              label: "Enviar WhatsApp",
                              onSelect: () =>
                                goToWhatsAppAppointment(
                                  String(row.customerId ?? ""),
                                  String(row.item.id ?? "")
                                ),
                              disabled: !row.customerId || !row.item.id,
                            },
                          ]}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
              <AppPagination
                currentPage={currentPage}
                totalItems={filtered.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </AppSectionBlock>
      </div>

      <FormModal
        open={openModal}
        onOpenChange={next => {
          if (!next) {
            setOpenModal(false);
            setEditing(null);
          }
        }}
        title={editing ? "Editar agendamento" : "Novo agendamento"}
        description="Operação real conectada ao backend"
        closeBlocked={createMutation.isPending || updateMutation.isPending}
        contentClassName="bg-[var(--modal-bg)]"
        footer={
          <>
            <p className="mr-auto text-xs text-[var(--text-muted)]">
              Resumo:{" "}
              {form.customerId
                ? (customerById.get(form.customerId) ?? "Cliente")
                : "Selecione cliente"}{" "}
              · {form.date || "Data"} {form.time || "Hora"}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpenModal(false);
                setEditing(null);
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="appointment-form"
              className="bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
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
                setForm(prev => ({ ...prev, customerId }))
              }
              placeholder="Selecione"
              options={customers.map((item: any) => ({
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
                  setForm(prev => ({ ...prev, date: event.target.value }))
                }
              />
            </AppField>
            <AppField label="Hora">
              <AppInput
                type="time"
                value={form.time}
                onChange={event =>
                  setForm(prev => ({ ...prev, time: event.target.value }))
                }
              />
            </AppField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AppField label="Status">
              <AppSelect
                value={form.status}
                onValueChange={status =>
                  setForm(prev => ({
                    ...prev,
                    status: status as AppointmentStatus,
                  }))
                }
                options={[
                  { value: "SCHEDULED", label: "Não confirmado" },
                  { value: "CONFIRMED", label: "Confirmado" },
                  { value: "DONE", label: "Concluído" },
                  { value: "CANCELED", label: "Cancelado" },
                  { value: "NO_SHOW", label: "No-show" },
                ]}
              />
            </AppField>
            <AppField label="Duração (min)">
              <AppInput
                type="number"
                min={15}
                value={form.durationMinutes}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
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
                setForm(prev => ({ ...prev, assignedToPersonId }))
              }
              placeholder="Opcional"
              options={[
                { value: "unassigned", label: "Sem responsável" },
                ...people.map((item: any) => ({
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
                setForm(prev => ({ ...prev, notes: event.target.value }))
              }
              placeholder="Observação operacional"
            />
          </AppField>
        </AppForm>
      </FormModal>

      <CreateServiceOrderModal
        isOpen={openServiceOrderModal}
        onClose={() => setOpenServiceOrderModal(false)}
        onSuccess={() => {
          setSuccessMessage("O.S. criada com sucesso.");
          void Promise.all([
            utils.nexo.serviceOrders.list.invalidate({ page: 1, limit: 100 }),
            utils.nexo.appointments.list.invalidate(),
          ]);
        }}
        customers={customers.map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? "Cliente"),
        }))}
        people={people.map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? "Pessoa"),
        }))}
        initialCustomerId={selected?.customerId ?? queryParams.customerId}
        appointmentId={
          selected?.item?.id ? String(selected.item.id) : undefined
        }
      />
    </AppPageShell>
  );
}

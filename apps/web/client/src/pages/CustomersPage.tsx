import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import CreateCustomerModal from "@/components/CreateCustomerModal";
import EditCustomerModal from "@/components/EditCustomerModal";
import { CreateAppointmentModal } from "@/components/CreateAppointmentModal";
import CreateServiceOrderModal from "@/components/CreateServiceOrderModal";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { usePageDiagnostics } from "@/hooks/usePageDiagnostics";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";
import { presentationStatusLabel } from "@/lib/presentation-status";
import { Button } from "@/components/ui/button";
import { NexoEvidenceTimeline, NexoExecutiveMetric } from "@/components/app";
import {
  AppDataTable,
  AppAlert,
  AppAlertDescription,
  AppAlertTitle,
  AppOperationalStatusBadge,
  AppPageShell,
  AppPriorityBadge,
  AppRowActionsDropdown,
  AppSectionCard,
  AppStatusBadge,
} from "@/components/app-system";
import {
  AppFiltersBar,
  AppContextWorkspace,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPagination,
  AppSectionBlock,
} from "@/components/internal-page-system";
import { cn } from "@/lib/utils";

function sanitizeCustomerTimelineText(
  value: unknown,
  fallback = "Evento operacional registrado"
) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text
    .replace(/\b[A-Z]+(?:_[A-Z0-9]+){1,}\b/g, fallback)
    .replace(/\b(?:payload|eventType|entityId|slug|uuid)\b:?/gi, "")
    .replace(/#[a-z0-9-]{8,}/gi, "referência operacional")
    .replace(/\b[a-f0-9]{12,}\b/gi, "referência operacional")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function humanizeCustomerTimelineEvent(event: Record<string, any>) {
  const normalizedType = String(
    event.eventType ?? event.type ?? event.action ?? ""
  ).toUpperCase();
  const known: Record<string, { type: string; summary: string }> = {
    CUSTOMER_APPOINTMENT_CREATED: {
      type: "Agendamento criado",
      summary: "Novo compromisso registrado para o cliente.",
    },
    APPOINTMENT_CREATED: {
      type: "Agendamento criado",
      summary: "Novo compromisso registrado para o cliente.",
    },
    APPOINTMENT_CONFIRMED: {
      type: "Agendamento confirmado",
      summary: "Cliente confirmado na agenda.",
    },
    CUSTOMER_SERVICE_ORDER_CREATED: {
      type: "O.S. criada",
      summary: "Ordem de serviço aberta para o cliente.",
    },
    SERVICE_ORDER_CREATED: {
      type: "O.S. criada",
      summary: "Ordem de serviço aberta para o cliente.",
    },
    SERVICE_ORDER_COMPLETED: {
      type: "O.S. concluída",
      summary: "Serviço finalizado para o cliente.",
    },
    CUSTOMER_WHATSAPP_MESSAGE_SENT: {
      type: "Mensagem enviada",
      summary: "Contato operacional registrado com o cliente.",
    },
    WHATSAPP_MESSAGE_SENT: {
      type: "Mensagem enviada",
      summary: "Contato operacional registrado com o cliente.",
    },
    MESSAGE_SENT: {
      type: "Mensagem enviada",
      summary: "Contato operacional registrado com o cliente.",
    },
    CUSTOMER_CHARGE_CONTEXT_UPDATED: {
      type: "Cobrança revisada",
      summary: "Contexto financeiro do cliente foi atualizado.",
    },
    PAYMENT_RECEIVED: {
      type: "Pagamento recebido",
      summary: "Pagamento registrado no histórico do cliente.",
    },
    CHARGE_CREATED: {
      type: "Cobrança criada",
      summary: "Cobrança registrada para o cliente.",
    },
  };
  const explicit = sanitizeCustomerTimelineText(
    event.summary ?? event.description ?? event.title,
    known[normalizedType]?.summary ?? "Evento operacional registrado"
  );
  return {
    type: known[normalizedType]?.type ?? "Evento operacional registrado",
    summary: explicit,
  };
}

type Customer = Record<string, any>;
type Appointment = Record<string, any>;
type ServiceOrder = Record<string, any>;
type Charge = Record<string, any>;

type Workspace = {
  customer?: Record<string, any>;
  appointments?: Appointment[];
  serviceOrders?: ServiceOrder[];
  charges?: Charge[];
  timeline?: Record<string, any>[];
  totalSpentCents?: number;
};

type CustomerFilter = "all" | "active" | "inactive";
type OfficialPriorityFilter = "all" | "P0" | "P1" | "P2" | "P3";
type OfficialRiskFilter =
  | "all"
  | "NORMAL"
  | "WARNING"
  | "RESTRICTED"
  | "SUSPENDED";

type CustomerProfile = {
  customer: Customer;
  customerId: string;
  appointments: Appointment[];
  serviceOrders: ServiceOrder[];
  charges: Charge[];
  overdue: number;
  pending: number;
  pendingCents: number;
  lastInteractionAt: Date | null;
  hasOpenServiceOrder: boolean;
  lastService?: ServiceOrder;
  activeServiceOrder?: ServiceOrder;
  nextAppointment?: Appointment;
  contact: string;
  pendingChargeId: string | null;
};

type CustomerOperationalEventType =
  | "CUSTOMER_APPOINTMENT_CREATED"
  | "CUSTOMER_SERVICE_ORDER_CREATED"
  | "CUSTOMER_WHATSAPP_MESSAGE_SENT"
  | "CUSTOMER_CHARGE_CONTEXT_UPDATED";

const pageSize = 8;
const openServiceOrderStatuses = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
const pendingChargeStatuses = ["OVERDUE", "PENDING"];

function formatCurrency(cents?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents ?? 0) / 100);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: unknown, fallback = "Não informado") {
  const date = toDate(value);
  return date ? date.toLocaleString("pt-BR") : fallback;
}

function normalizeWorkspace(input: unknown): Workspace {
  const raw = normalizeObjectPayload<any>(input) ?? {};
  return {
    customer: normalizeObjectPayload(raw.customer) ?? {},
    appointments: normalizeArrayPayload(
      raw.appointments ?? raw.customerAppointments
    ),
    serviceOrders: normalizeArrayPayload(raw.serviceOrders ?? raw.orders),
    charges: normalizeArrayPayload(raw.charges ?? raw.finance),
    timeline: normalizeArrayPayload(raw.timeline ?? raw.events),
    totalSpentCents:
      raw.totalSpentCents !== null &&
      raw.totalSpentCents !== undefined &&
      Number.isFinite(Number(raw.totalSpentCents))
        ? Math.max(0, Number(raw.totalSpentCents))
        : undefined,
  };
}

function getCustomerContact(customer: Customer) {
  const phone = String(customer.phone ?? "").trim();
  const email = String(customer.email ?? "").trim();
  if (phone && email) return `${phone} · ${email}`;
  return phone || email || "Sem contato cadastrado";
}

function getCustomerActiveStatus(active: unknown) {
  if (active === true) {
    return { label: "Ativo", tone: "success" as const };
  }

  if (active === false) {
    return { label: "Inativo", tone: "neutral" as const };
  }

  return { label: "Status não informado", tone: "neutral" as const };
}

function isChargePending(charge: Charge) {
  return pendingChargeStatuses.includes(
    String(charge.status ?? "").toUpperCase()
  );
}

function isServiceOrderOpen(order: ServiceOrder) {
  return openServiceOrderStatuses.includes(
    String(order.status ?? "").toUpperCase()
  );
}

function isServiceOrderOverdue(order: ServiceOrder) {
  return order.operationalDecision?.isOverdue === true;
}

function getServiceOrderResponsibleName(
  order: ServiceOrder | undefined,
  people: Array<{ id: string; name: string }>
) {
  if (!order) return "Sem O.S. aberta";

  const embeddedName = String(order.assignedTo?.name ?? "").trim();
  if (embeddedName) return embeddedName;

  const assignedToPersonId = String(order.assignedToPersonId ?? "").trim();
  if (!assignedToPersonId) return "Sem responsável";

  return (
    people.find(person => person.id === assignedToPersonId)?.name ??
    "Responsável não identificado"
  );
}

function formatServiceOrderDelay(order: ServiceOrder | undefined) {
  if (!order) return "Sem O.S. aberta";

  const decision = order.operationalDecision;

  if (!decision) return "Prazo operacional indisponível";
  if (!decision.isOverdue) return "No prazo";

  const days = Number(decision.overdueDays ?? 0);

  if (!Number.isFinite(days) || days <= 0) {
    return "Em atraso";
  }

  return `${days} dia${days === 1 ? "" : "s"} de atraso`;
}

function buildCustomerProfiles(input: {
  customers: Customer[];
  appointments: Appointment[];
  serviceOrders: ServiceOrder[];
  charges: Charge[];
}) {
  const map = new Map<
    string,
    Omit<
      CustomerProfile,
      | "lastService"
      | "activeServiceOrder"
      | "nextAppointment"
      | "contact"
      | "pendingChargeId"
      | "hasOpenServiceOrder"
    >
  >();

  for (const customer of input.customers) {
    const customerId = String(customer.id ?? "");
    if (!customerId) continue;
    map.set(customerId, {
      customer,
      customerId,
      appointments: [],
      serviceOrders: [],
      charges: [],
      overdue: 0,
      pending: 0,
      pendingCents: 0,
      lastInteractionAt: toDate(customer.updatedAt ?? customer.createdAt),
    });
  }

  const updateInteraction = (
    current: { lastInteractionAt: Date | null },
    value: unknown
  ) => {
    const touchDate = toDate(value);
    if (
      touchDate &&
      (!current.lastInteractionAt || touchDate > current.lastInteractionAt)
    ) {
      current.lastInteractionAt = touchDate;
    }
  };

  for (const item of input.appointments) {
    const current = map.get(String(item.customerId ?? ""));
    if (!current) continue;
    current.appointments.push(item);
    updateInteraction(
      current,
      item.updatedAt ?? item.startsAt ?? item.createdAt
    );
  }

  for (const item of input.serviceOrders) {
    const current = map.get(String(item.customerId ?? ""));
    if (!current) continue;
    current.serviceOrders.push(item);
    updateInteraction(
      current,
      item.updatedAt ?? item.createdAt ?? item.scheduledFor
    );
  }

  for (const item of input.charges) {
    const current = map.get(String(item.customerId ?? ""));
    if (!current) continue;
    current.charges.push(item);
    const status = String(item.status ?? "").toUpperCase();
    const cents = Number(item.amountCents ?? item.amount ?? 0);
    if (status === "OVERDUE") {
      current.overdue += 1;
      current.pendingCents += cents;
    }
    if (status === "PENDING") {
      current.pending += 1;
      current.pendingCents += cents;
    }
    updateInteraction(
      current,
      item.updatedAt ?? item.createdAt ?? item.dueDate
    );
  }

  return Array.from(map.values()).map(profile => {
    const appointments = [...profile.appointments].sort(
      (a, b) =>
        new Date(String(a.startsAt ?? a.createdAt ?? 0)).getTime() -
        new Date(String(b.startsAt ?? b.createdAt ?? 0)).getTime()
    );
    const serviceOrders = [...profile.serviceOrders].sort(
      (a, b) =>
        new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime() -
        new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime()
    );
    const charges = [...profile.charges].sort(
      (a, b) =>
        new Date(String(a.dueDate ?? a.createdAt ?? 0)).getTime() -
        new Date(String(b.dueDate ?? b.createdAt ?? 0)).getTime()
    );
    const activeServiceOrder =
      serviceOrders.find(isServiceOrderOverdue) ??
      serviceOrders.find(isServiceOrderOpen);
    const lastService = serviceOrders.find(
      order => String(order.status ?? "").toUpperCase() === "COMPLETED"
    );
    const hasOpenServiceOrder = Boolean(activeServiceOrder);
    // Keep the API order: this is a factual related appointment, not a
    // browser-inferred "next appointment" or operational recommendation.
    const nextAppointment = appointments.find(item => Boolean(item.startsAt));
    const pendingChargeId =
      String(charges.find(isChargePending)?.id ?? "").trim() || null;

    return {
      ...profile,
      appointments,
      serviceOrders,
      charges,
      hasOpenServiceOrder,
      lastService,
      activeServiceOrder,
      nextAppointment,
      contact: getCustomerContact(profile.customer),
      pendingChargeId,
    } satisfies CustomerProfile;
  });
}

export default function CustomersPage() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useOperationalMemoryState(
    "nexo.customers.search.v2",
    ""
  );
  const [activeFilter, setActiveFilter] =
    useOperationalMemoryState<CustomerFilter>(
      "nexo.customers.filter.v2",
      "all"
    );
  const [priorityFilter, setPriorityFilter] =
    useOperationalMemoryState<OfficialPriorityFilter>(
      "nexo.customers.priority.v1",
      "all"
    );
  const [riskFilter, setRiskFilter] =
    useOperationalMemoryState<OfficialRiskFilter>(
      "nexo.customers.risk.v1",
      "all"
    );
  const [activeCustomerId, setActiveCustomerId] = useOperationalMemoryState<
    string | null
  >("nexo.customers.active-id.v2", null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(
    null
  );
  const [pendingEditCustomerId, setPendingEditCustomerId] = useState<
    string | null
  >(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [createAppointmentOpen, setCreateAppointmentOpen] = useState(false);
  const [createServiceOrderOpen, setCreateServiceOrderOpen] = useState(false);
  const [showInlineCharges, setShowInlineCharges] = useState(false);
  const timelineAnchorRef = useRef<HTMLDivElement | null>(null);

  const customersQuery = trpc.customers.list.useQuery(
    { page: 1, limit: 300 },
    { enabled: isAuthenticated, retry: false }
  );
  const customersOperationalSummaryQuery =
    trpc.customers.operationalSummary.useQuery(undefined, {
      enabled: isAuthenticated,
      retry: false,
    });
  const appointmentsQuery = trpc.appointments.list.useQuery(
    { page: 1, limit: 500 },
    { enabled: isAuthenticated, retry: false }
  );
  const serviceOrdersQuery = trpc.serviceOrders.list.useQuery(
    { page: 1, limit: 500 },
    { enabled: isAuthenticated, retry: false }
  );
  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 500 },
    { enabled: isAuthenticated, retry: false }
  );
  const peopleQuery = trpc.people.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const trpcUtils = trpc.useUtils();
  const [isRefreshingWorkspace, setIsRefreshingWorkspace] = useState(false);

  const customers = useMemo(
    () => normalizeArrayPayload<Customer>(customersQuery.data),
    [customersQuery.data]
  );
  const appointments = useMemo(
    () => normalizeArrayPayload<Appointment>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const serviceOrders = useMemo(
    () => normalizeArrayPayload<ServiceOrder>(serviceOrdersQuery.data),
    [serviceOrdersQuery.data]
  );
  const charges = useMemo(
    () => normalizeArrayPayload<Charge>(chargesQuery.data),
    [chargesQuery.data]
  );

  const profiles = useMemo(
    () =>
      buildCustomerProfiles({
        customers,
        appointments,
        serviceOrders,
        charges,
      }),
    [appointments, charges, customers, serviceOrders]
  );

  const customersOperationalSummary =
    customersOperationalSummaryQuery.data ?? null;

  const operationalSummaryByCustomerId = useMemo(
    () =>
      new Map(
        (customersOperationalSummary?.customers ?? []).map(summary => [
          summary.customerId,
          summary,
        ])
      ),
    [customersOperationalSummary]
  );

  const operationalProfiles = useMemo(
    () =>
      profiles.map(profile => ({
        ...profile,
        operationalSummary:
          operationalSummaryByCustomerId.get(profile.customerId) ?? null,
      })),
    [operationalSummaryByCustomerId, profiles]
  );

  const profileById = useMemo(
    () =>
      new Map(
        operationalProfiles.map(profile => [profile.customerId, profile])
      ),
    [operationalProfiles]
  );

  const workspaceQuery = trpc.customers.workspace.useQuery(
    { id: activeCustomerId ?? "" },
    { enabled: isAuthenticated && Boolean(activeCustomerId), retry: false }
  );
  const timelineQuery = trpc.timeline.listByCustomer.useQuery(
    { customerId: activeCustomerId ?? "", limit: 5 },
    { enabled: isAuthenticated && Boolean(activeCustomerId), retry: false }
  );

  const workspace = useMemo(
    () => normalizeWorkspace(workspaceQuery.data),
    [workspaceQuery.data]
  );

  // Presentation-only transformation: the official decision attached to each
  // profile is never recalculated, ranked or changed by these controls.
  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return operationalProfiles.filter(profile => {
      if (activeFilter === "active" && profile.customer.active !== true)
        return false;
      if (activeFilter === "inactive" && profile.customer.active !== false)
        return false;
      if (
        priorityFilter !== "all" &&
        profile.operationalSummary?.priority !== priorityFilter
      )
        return false;
      if (
        riskFilter !== "all" &&
        profile.operationalSummary?.riskState !== riskFilter
      )
        return false;
      if (!query) return true;

      return [
        profile.customer.name,
        profile.customer.phone,
        profile.customer.email,
      ]
        .map(value => String(value ?? "").toLowerCase())
        .join(" ")
        .includes(query);
    });
  }, [
    activeFilter,
    operationalProfiles,
    priorityFilter,
    riskFilter,
    searchTerm,
  ]);

  const isLoading = customersQuery.isLoading && customers.length === 0;
  const hasBlockingError =
    Boolean(customersQuery.error) && customers.length === 0;
  const auxiliaryDataSources = [
    { label: "cobranças", query: chargesQuery },
    { label: "ordens de serviço", query: serviceOrdersQuery },
    { label: "agendamentos", query: appointmentsQuery },
  ] as const;
  const unavailableAuxiliaryData = auxiliaryDataSources.filter(source =>
    Boolean(source.query.error)
  );
  const pendingAuxiliaryData = auxiliaryDataSources.filter(
    source => source.query.isLoading && !source.query.data
  );
  const hasIncompleteOperationalData =
    customers.length > 0 &&
    (unavailableAuxiliaryData.length > 0 || pendingAuxiliaryData.length > 0);
  const isChargesUnavailable = Boolean(chargesQuery.error);
  const isServiceOrdersUnavailable = Boolean(serviceOrdersQuery.error);
  const isAppointmentsUnavailable = Boolean(appointmentsQuery.error);
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProfiles.slice(start, start + pageSize);
  }, [currentPage, filteredProfiles]);

  const selectedProfile = activeCustomerId
    ? (profileById.get(String(activeCustomerId)) ?? null)
    : null;

  const selectedCustomer = selectedProfile?.customer ?? null;

  const runAuthoritativeCustomerAction = (
    profile: (typeof operationalProfiles)[number]
  ) => {
    const summary = profile.operationalSummary;
    const target = summary?.recommendedActionTarget;

    switch (target) {
      case "FINANCES":
        navigate(`/finances?customerId=${profile.customerId}`);
        return;
      case "SERVICE_ORDERS":
        navigate(`/service-orders?customerId=${profile.customerId}`);
        return;
      case "APPOINTMENTS":
        navigate(`/appointments?customerId=${profile.customerId}`);
        return;
      case "WHATSAPP":
        openCustomerWhatsApp(profile.customer, profile.pendingChargeId);
        return;
      default:
        setActiveCustomerId(profile.customerId);
    }
  };

  const getAuthoritativeCustomerActionLabel = (
    profile: (typeof operationalProfiles)[number]
  ) => profile.operationalSummary?.recommendedActionLabel ?? "Abrir cliente";
  const people = useMemo(
    () =>
      normalizeArrayPayload<any>(peopleQuery.data).map(person => ({
        id: String(person.id ?? ""),
        name: String(person.name ?? "Colaborador"),
      })),
    [peopleQuery.data]
  );

  const workspaceCharges = (workspace.charges ?? selectedProfile?.charges ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(String(a.dueDate ?? a.createdAt ?? 0)).getTime() -
        new Date(String(b.dueDate ?? b.createdAt ?? 0)).getTime()
    );
  const workspaceServiceOrders =
    workspace.serviceOrders ?? selectedProfile?.serviceOrders ?? [];
  const workspaceAppointments =
    workspace.appointments ?? selectedProfile?.appointments ?? [];
  const workspacePendingCents = workspaceCharges.reduce((total, charge) => {
    if (!isChargePending(charge)) return total;
    return total + Number(charge.amountCents ?? charge.amount ?? 0);
  }, 0);
  const workspaceTotalSpentCents = workspace.totalSpentCents;
  const workspaceOverdueCharges = workspaceCharges.filter(
    charge => String(charge.status ?? "").toUpperCase() === "OVERDUE"
  );
  const workspaceLastPayment = workspaceCharges
    .filter(charge =>
      ["PAID", "SETTLED"].includes(String(charge.status ?? "").toUpperCase())
    )
    .sort(
      (a, b) =>
        new Date(
          String(b.paidAt ?? b.updatedAt ?? b.createdAt ?? 0)
        ).getTime() -
        new Date(String(a.paidAt ?? a.updatedAt ?? a.createdAt ?? 0)).getTime()
    )[0];
  // Preserve the order returned by the workspace contract. The UI does not
  // infer recency, frequency or the next operational action from dates.
  const workspaceNextAppointment = workspaceAppointments.find(item =>
    Boolean(item.startsAt ?? item.scheduledAt)
  );
  const workspaceOpenServiceOrder = workspaceServiceOrders
    .filter(isServiceOrderOpen)
    .sort(
      (a, b) =>
        new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime() -
        new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime()
    )[0];
  const workspaceLastCompletedServiceOrder = workspaceServiceOrders
    .filter(order => String(order.status ?? "").toUpperCase() === "COMPLETED")
    .sort(
      (a, b) =>
        new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime() -
        new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime()
    )[0];

  const workspacePendingCharges = workspaceCharges.filter(isChargePending);
  const workspaceOpenServiceOrders =
    workspaceServiceOrders.filter(isServiceOrderOpen);
  const selectedCustomerName = String(selectedCustomer?.name ?? "Cliente");
  const customerOfficialTimelineEvents = normalizeArrayPayload<
    Record<string, any>
  >(timelineQuery.data)
    .slice(0, 5)
    .map((event, index) => ({
      id: String(event.id ?? `event-${index}`),
      type: humanizeCustomerTimelineEvent(event).type,
      occurredAt: formatDateTime(event.occurredAt ?? event.createdAt),
      entity: String(
        event.entity ?? event.entityType ?? event.target ?? selectedCustomerName
      ),
      actor: String(
        event.actor ?? event.author ?? event.createdBy ?? "Sistema"
      ),
      summary: humanizeCustomerTimelineEvent(event).summary,
    }));

  const selectedOperationalSummary =
    selectedProfile?.operationalSummary ?? null;

  const selectedRecommendedActionLabel =
    selectedOperationalSummary?.recommendedActionLabel ??
    "Ação recomendada indisponível";

  const selectedInterventionReason =
    selectedOperationalSummary?.interventionReason ??
    selectedOperationalSummary?.riskSignal ??
    "Justificativa operacional indisponível";

  const runSelectedRecommendedAction = () => {
    if (!selectedProfile || !selectedOperationalSummary) return;
    runAuthoritativeCustomerAction(selectedProfile);
  };

  async function refreshCustomerWorkspace(
    customerId: string,
    options?: { includeTimeline?: boolean }
  ) {
    if (!customerId) return;
    setIsRefreshingWorkspace(true);
    try {
      const includeTimeline = options?.includeTimeline ?? false;
      const operations: Promise<unknown>[] = [
        trpcUtils.customers.list.invalidate(),
        trpcUtils.customers.operationalSummary.invalidate(),
        trpcUtils.customers.workspace.invalidate({ id: customerId }),
        trpcUtils.appointments.list.invalidate(),
        trpcUtils.serviceOrders.list.invalidate(),
        trpcUtils.finance.charges.list.invalidate(),
      ];
      if (includeTimeline) {
        operations.push(
          trpcUtils.customers.workspace.refetch({ id: customerId })
        );
      }
      await Promise.all(operations);
    } finally {
      setIsRefreshingWorkspace(false);
    }
  }

  async function propagateCustomerOperationalChange(
    customerId: string,
    eventType: CustomerOperationalEventType,
    options?: { includeTimeline?: boolean }
  ) {
    if (!customerId) return;
    setIsRefreshingWorkspace(true);
    try {
      const includeTimeline = options?.includeTimeline ?? false;
      const dashboardUtils = (trpcUtils as any).dashboard;
      const whatsappUtils = (trpcUtils as any).whatsapp;
      const peopleUtils = (trpcUtils as any).people;
      const timelineUtils = (trpcUtils as any).timeline;
      const operations: Promise<unknown>[] = [];
      const safePush = (candidate: unknown) => {
        if (
          candidate &&
          typeof (candidate as Promise<unknown>).then === "function"
        ) {
          operations.push(candidate as Promise<unknown>);
        }
      };

      safePush(trpcUtils.customers.list.invalidate());
      safePush(trpcUtils.customers.operationalSummary.invalidate());
      safePush(trpcUtils.customers.workspace.invalidate({ id: customerId }));

      switch (eventType) {
        case "CUSTOMER_APPOINTMENT_CREATED":
          safePush(trpcUtils.appointments.list.invalidate());
          safePush(dashboardUtils?.kpis?.invalidate?.());
          safePush(dashboardUtils?.alerts?.invalidate?.());
          safePush(timelineUtils?.listByCustomer?.invalidate?.({ customerId }));
          safePush(timelineUtils?.listByOrg?.invalidate?.());
          break;
        case "CUSTOMER_SERVICE_ORDER_CREATED":
          safePush(trpcUtils.serviceOrders.list.invalidate());
          safePush(trpcUtils.appointments.list.invalidate());
          safePush(dashboardUtils?.kpis?.invalidate?.());
          safePush(dashboardUtils?.alerts?.invalidate?.());
          safePush(timelineUtils?.listByCustomer?.invalidate?.({ customerId }));
          safePush(timelineUtils?.listByOrg?.invalidate?.());
          safePush(peopleUtils?.stats?.invalidate?.());
          safePush(peopleUtils?.workload?.invalidate?.());
          break;
        case "CUSTOMER_WHATSAPP_MESSAGE_SENT":
          safePush(whatsappUtils?.conversations?.invalidate?.());
          safePush(whatsappUtils?.messages?.invalidate?.());
          safePush(whatsappUtils?.context?.invalidate?.({ customerId }));
          safePush(timelineUtils?.listByCustomer?.invalidate?.({ customerId }));
          safePush(timelineUtils?.listByOrg?.invalidate?.());
          safePush(dashboardUtils?.alerts?.invalidate?.());
          break;
        case "CUSTOMER_CHARGE_CONTEXT_UPDATED":
          safePush(trpcUtils.finance.charges.list.invalidate());
          break;
      }

      if (includeTimeline) {
        safePush(trpcUtils.customers.workspace.refetch({ id: customerId }));
      }
      await Promise.all(operations);
    } finally {
      setIsRefreshingWorkspace(false);
    }
  }

  function openCustomerWhatsApp(customer: Customer, chargeId?: string | null) {
    const customerId = String(customer?.id ?? "");
    if (!customerId) {
      return toast.error("Cliente sem identificador para abrir WhatsApp.");
    }
    if (!String(customer?.phone ?? "").trim()) {
      return toast.error("Cliente sem telefone/WhatsApp cadastrado.");
    }
    navigate(
      `/whatsapp?customerId=${customerId}${chargeId ? `&chargeId=${chargeId}` : ""}`
    );
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredProfiles.length / pageSize)
    );
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, filteredProfiles.length]);

  usePageDiagnostics({
    page: "customers",
    isLoading,
    hasError: hasBlockingError,
    isEmpty: !isLoading && !hasBlockingError && customers.length === 0,
    dataCount: customers.length,
  });

  useEffect(() => {
    const queryCustomerId = new URLSearchParams(
      location.split("?")[1] ?? ""
    ).get("customerId");
    if (queryCustomerId) {
      setActiveCustomerId(queryCustomerId);
      return;
    }
    if (!activeCustomerId && filteredProfiles.length > 0) {
      setActiveCustomerId(filteredProfiles[0].customerId);
    }
  }, [activeCustomerId, filteredProfiles, location, setActiveCustomerId]);

  const customersOperationalStatus =
    customersOperationalSummary?.portfolio.operationalStatus ?? null;

  const portfolioOperationalStatusBadge = customersOperationalStatus ? (
    <AppOperationalStatusBadge status={customersOperationalStatus} />
  ) : (
    <AppStatusBadge
      label={
        customersOperationalSummaryQuery.isLoading
          ? "Estado operacional carregando"
          : "Estado operacional indisponível"
      }
      tone="warning"
    />
  );

  const renderAuthoritativeCustomerStatus = (
    profile: (typeof operationalProfiles)[number]
  ) => {
    const summary = profile.operationalSummary;

    if (!summary) {
      return (
        <AppStatusBadge
          label={
            customersOperationalSummaryQuery.isLoading
              ? "Estado carregando"
              : "Estado indisponível"
          }
          tone="warning"
        />
      );
    }

    return (
      <AppOperationalStatusBadge
        status={summary.operationalStatus}
        label={summary.riskSignal}
      />
    );
  };

  const renderAuthoritativeCustomerPriority = (
    profile: (typeof operationalProfiles)[number]
  ) => {
    const priority = profile.operationalSummary?.priority;
    return priority ? <AppPriorityBadge priority={priority} /> : null;
  };

  return (
    <AppPageShell className="gap-3">
      <AppOperationalHeader
        title="Centro Operacional do Cliente"
        description="Memória viva do relacionamento: decisão, fluxo, execução e auditoria em uma leitura compacta."
        density="compact"
        primaryAction={
          <Button onClick={() => setCreateOpen(true)}>Novo cliente</Button>
        }
        contextChips={
          <>
            {portfolioOperationalStatusBadge}
            <AppStatusBadge
              label={`${customers.length} clientes na carteira`}
              tone="neutral"
            />
            <AppStatusBadge
              label={
                customersOperationalSummary
                  ? `${
                      customersOperationalSummary.portfolio.riskCustomers +
                      customersOperationalSummary.portfolio.criticalCustomers
                    } em risco`
                  : "Risco operacional indisponível"
              }
              tone="warning"
            />
            <AppStatusBadge
              label={
                isServiceOrdersUnavailable
                  ? "O.S. indisponíveis"
                  : `${profiles.filter(profile => profile.hasOpenServiceOrder).length} com O.S. aberta`
              }
              tone="info"
            />
          </>
        }
      >
        <div className="grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--dashboard-success)]" />
            Cada cliente mostra contexto e próxima ação.
          </span>
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--dashboard-warning)]" />
            Prioridade e risco vêm do resumo operacional oficial.
          </span>
          <span className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-[var(--dashboard-info)]" />
            Ações reais vêm antes da navegação.
          </span>
        </div>
      </AppOperationalHeader>

      {unavailableAuxiliaryData.length > 0 ? (
        <AppAlert
          className="border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface-elevated))]"
          aria-live="polite"
        >
          <ShieldAlert className="h-4 w-4 text-[var(--warning)]" />
          <AppAlertTitle>Leitura operacional parcial</AppAlertTitle>
          <AppAlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Clientes carregados, mas{" "}
              {unavailableAuxiliaryData.map(source => source.label).join(", ")}{" "}
              não puderam ser consultados. Estado operacional e risco continuam
              sendo apresentados pelo resumo oficial; apenas detalhes auxiliares
              desta página podem ficar incompletos.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                void Promise.all(
                  unavailableAuxiliaryData.map(source => source.query.refetch())
                )
              }
            >
              Tentar novamente
            </Button>
          </AppAlertDescription>
        </AppAlert>
      ) : pendingAuxiliaryData.length > 0 && customers.length > 0 ? (
        <AppAlert aria-live="polite">
          <AppAlertTitle>Complementando sinais operacionais</AppAlertTitle>
          <AppAlertDescription>
            Clientes carregados. Aguardando{" "}
            {pendingAuxiliaryData.map(source => source.label).join(", ")} antes
            de completar os detalhes auxiliares da carteira.
          </AppAlertDescription>
        </AppAlert>
      ) : null}

      <AppFiltersBar
        aria-label="Filtros de apresentação"
        className={cn(
          "min-w-0 shrink-0 flex-col items-stretch gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 md:flex-row md:items-center",
          selectedProfile ? "order-2" : undefined
        )}
      >
        <div className="min-w-[220px] flex-1">
          <label className="sr-only" htmlFor="customer-search">
            Buscar clientes
          </label>
          <input
            id="customer-search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
          />
        </div>
        <label className="sr-only" htmlFor="customer-priority-filter">
          Filtrar pela prioridade oficial
        </label>
        <select
          id="customer-priority-filter"
          value={priorityFilter}
          onChange={event =>
            setPriorityFilter(event.target.value as OfficialPriorityFilter)
          }
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todas as prioridades</option>
          {(["P0", "P1", "P2", "P3"] as const).map(priority => (
            <option key={priority} value={priority}>
              Prioridade oficial {priority}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="customer-risk-filter">
          Filtrar pelo risco oficial
        </label>
        <select
          id="customer-risk-filter"
          value={riskFilter}
          onChange={event =>
            setRiskFilter(event.target.value as OfficialRiskFilter)
          }
          className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todos os riscos oficiais</option>
          <option value="NORMAL">Normal</option>
          <option value="WARNING">Atenção</option>
          <option value="RESTRICTED">Restrito</option>
          <option value="SUSPENDED">Suspenso</option>
        </select>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Filtros de situação cadastral"
        >
          {[
            { key: "all", label: "Todos" },
            { key: "active", label: "Ativos" },
            { key: "inactive", label: "Inativos" },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                activeFilter === item.key
                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
              onClick={() => setActiveFilter(item.key as CustomerFilter)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">
          {filteredProfiles.length} resultado(s)
        </span>
      </AppFiltersBar>

      <div
        className={cn(
          "grid grid-cols-1 gap-4 2xl:grid-cols-12",
          selectedProfile ? "order-1" : undefined
        )}
      >
        <AppSectionBlock
          title="Carteira operacional"
          subtitle={
            selectedProfile
              ? "Outros clientes da carteira: apoio para trocar contexto sem perder filtros e paginação."
              : "Lista priorizada por contexto, pendência e próxima ação possível."
          }
          className={cn(
            selectedProfile
              ? "order-2 2xl:col-span-12"
              : "order-1 2xl:col-span-8"
          )}
          compact
        >
          {isLoading ? (
            <AppPageLoadingState description="Carregando clientes..." />
          ) : hasBlockingError ? (
            <AppPageErrorState
              description={
                customersQuery.error?.message ?? "Falha ao carregar clientes."
              }
              actionLabel="Tentar novamente"
              onAction={() => void customersQuery.refetch()}
            />
          ) : customers.length === 0 ? (
            <div className="space-y-3">
              <AppPageEmptyState
                title="Nenhum cliente cadastrado"
                description="Cadastre o primeiro cliente para iniciar a memória operacional de relacionamento."
              />
              <div className="flex justify-center">
                <Button onClick={() => setCreateOpen(true)}>
                  Criar primeiro cliente
                </Button>
              </div>
            </div>
          ) : filteredProfiles.length === 0 ? (
            <AppPageEmptyState
              title="Busca sem resultado"
              description="Nenhum cliente corresponde aos filtros ativos e termo pesquisado."
            />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 md:hidden">
                {paginatedProfiles.map(profile => (
                  <article
                    key={`card-${profile.customerId}`}
                    className={cn(
                      "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3",
                      profile.customerId === activeCustomerId
                        ? "bg-[var(--accent-soft)]/35"
                        : undefined
                    )}
                    onClick={() => setActiveCustomerId(profile.customerId)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {String(profile.customer.name ?? "Sem nome")}
                        </p>
                        <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                          {profile.contact}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {renderAuthoritativeCustomerStatus(profile)}
                        <AppStatusBadge
                          {...getCustomerActiveStatus(profile.customer.active)}
                        />
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-[var(--text-muted)]">
                      {profile.operationalSummary?.riskSignal ??
                        "Sinal operacional indisponível"}
                    </p>
                    {profile.activeServiceOrder ? (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Responsável:{" "}
                        {getServiceOrderResponsibleName(
                          profile.activeServiceOrder,
                          people
                        )}{" "}
                        · Atraso:{" "}
                        {formatServiceOrderDelay(profile.activeServiceOrder)}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {isServiceOrdersUnavailable
                          ? "O.S. indisponíveis"
                          : "Sem O.S. aberta"}
                      </p>
                    )}
                    <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                      <p>
                        Último serviço:{" "}
                        {profile.lastService
                          ? formatDateTime(
                              profile.lastService.updatedAt ??
                                profile.lastService.createdAt
                            )
                          : isServiceOrdersUnavailable
                            ? "O.S. indisponíveis"
                            : "Sem serviço concluído"}
                      </p>
                      <p>
                        Próximo agendamento:{" "}
                        {profile.nextAppointment
                          ? formatDateTime(profile.nextAppointment.startsAt)
                          : isAppointmentsUnavailable
                            ? "Agenda indisponível"
                            : "Sem agenda futura"}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {formatCurrency(profile.pendingCents)}
                      </span>
                      <Button
                        size="sm"
                        onClick={event => {
                          event.stopPropagation();
                          runAuthoritativeCustomerAction(profile);
                        }}
                      >
                        {getAuthoritativeCustomerActionLabel(profile)}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden max-h-[560px] overflow-y-auto md:block">
                <AppDataTable className="min-w-[940px]">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contexto / status</th>
                      <th>Responsável / atraso</th>
                      <th>Próxima ação</th>
                      <th>Financeiro</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProfiles.map(profile => (
                      <tr
                        key={profile.customerId}
                        className={cn(
                          "cursor-pointer align-top transition-colors hover:bg-[var(--surface-subtle)]/60",
                          profile.customerId === activeCustomerId
                            ? "bg-[var(--accent-soft)]/35"
                            : undefined
                        )}
                        onClick={() => setActiveCustomerId(profile.customerId)}
                      >
                        <td>
                          <div className="min-w-[220px] space-y-1">
                            <p className="font-semibold text-[var(--text-primary)]">
                              {String(profile.customer.name ?? "Sem nome")}
                            </p>
                            <p className="max-w-[280px] truncate text-xs text-[var(--text-secondary)]">
                              {profile.contact}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Última interação:{" "}
                              {formatDateTime(profile.lastInteractionAt)}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div className="min-w-[170px] space-y-2 text-xs text-[var(--text-secondary)]">
                            <div className="flex flex-wrap gap-2">
                              {renderAuthoritativeCustomerStatus(profile)}
                              <AppStatusBadge
                                {...getCustomerActiveStatus(
                                  profile.customer.active
                                )}
                              />
                              {renderAuthoritativeCustomerPriority(profile)}
                            </div>
                            <p className="line-clamp-2">
                              {profile.operationalSummary?.riskSignal ??
                                "Sinal operacional indisponível"}
                            </p>
                          </div>
                        </td>
                        <td>
                          {profile.activeServiceOrder ? (
                            <div className="min-w-[170px] space-y-1 text-xs text-[var(--text-secondary)]">
                              <p className="font-medium text-[var(--text-primary)]">
                                {getServiceOrderResponsibleName(
                                  profile.activeServiceOrder,
                                  people
                                )}
                              </p>
                              <p>
                                Atraso:{" "}
                                {formatServiceOrderDelay(
                                  profile.activeServiceOrder
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              {isServiceOrdersUnavailable
                                ? "O.S. indisponíveis"
                                : "Sem O.S. aberta"}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="min-w-[180px] space-y-1 text-xs text-[var(--text-secondary)]">
                            <p className="font-medium text-[var(--text-primary)]">
                              {getAuthoritativeCustomerActionLabel(profile)}
                            </p>
                            <p>
                              Último serviço:{" "}
                              {profile.lastService
                                ? formatDateTime(
                                    profile.lastService.updatedAt ??
                                      profile.lastService.createdAt
                                  )
                                : isServiceOrdersUnavailable
                                  ? "O.S. indisponíveis"
                                  : "Sem serviço concluído"}
                            </p>
                            <p>
                              Próximo agendamento:{" "}
                              {profile.nextAppointment
                                ? formatDateTime(
                                    profile.nextAppointment.startsAt
                                  )
                                : isAppointmentsUnavailable
                                  ? "Agenda indisponível"
                                  : "Sem agenda futura"}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div className="min-w-[150px] space-y-2">
                            <p className="font-medium text-[var(--text-primary)]">
                              {formatCurrency(profile.pendingCents)}
                            </p>
                            {isChargesUnavailable ? (
                              <AppStatusBadge
                                label="Financeiro indisponível"
                                tone="warning"
                              />
                            ) : profile.pendingCents === 0 ? (
                              <AppStatusBadge
                                label="Sem pendência retornada"
                                tone="neutral"
                              />
                            ) : (
                              <AppStatusBadge
                                label="Saldo em atenção"
                                tone="warning"
                              />
                            )}
                          </div>
                        </td>
                        <td onClick={event => event.stopPropagation()}>
                          <div className="flex min-w-[150px] items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                runAuthoritativeCustomerAction(profile)
                              }
                            >
                              {getAuthoritativeCustomerActionLabel(profile)}
                            </Button>
                            <AppRowActionsDropdown
                              triggerLabel="Mais ações"
                              contentClassName="min-w-[220px]"
                              items={[
                                {
                                  label: "Abrir cliente",
                                  tone: "primary",
                                  onSelect: () =>
                                    setActiveCustomerId(profile.customerId),
                                },
                                {
                                  label: "Agendar",
                                  onSelect: () =>
                                    navigate(
                                      `/appointments?customerId=${profile.customerId}`
                                    ),
                                },
                                {
                                  label: "Nova O.S.",
                                  onSelect: () =>
                                    navigate(
                                      `/service-orders?customerId=${profile.customerId}`
                                    ),
                                },
                                {
                                  label: "Cobrar",
                                  onSelect: () =>
                                    navigate(
                                      `/finances?customerId=${profile.customerId}`
                                    ),
                                },
                                {
                                  label: "WhatsApp",
                                  onSelect: () =>
                                    openCustomerWhatsApp(
                                      profile.customer,
                                      profile.pendingChargeId
                                    ),
                                },
                                {
                                  type: "separator",
                                  label: "Cadastro",
                                },
                                {
                                  label:
                                    pendingEditCustomerId === profile.customerId
                                      ? "Editando..."
                                      : "Editar dados",
                                  onSelect: () => {
                                    setPendingEditCustomerId(
                                      profile.customerId
                                    );
                                    setEditingCustomerId(profile.customerId);
                                    toast.success("Editor de cliente aberto.");
                                  },
                                  disabled:
                                    pendingEditCustomerId ===
                                    profile.customerId,
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </AppDataTable>
              </div>
              <AppPagination
                currentPage={currentPage}
                totalItems={filteredProfiles.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </AppSectionBlock>

        <AppContextWorkspace
          title="Centro Operacional do Cliente"
          subtitle="Decisão, fluxo, execução e auditoria do cliente selecionado."
          className={cn(
            selectedProfile
              ? "order-1 2xl:col-span-12"
              : "order-2 2xl:col-span-4"
          )}
        >
          {!activeCustomerId || !selectedCustomer || !selectedProfile ? (
            <AppPageEmptyState
              title="Selecione um cliente"
              description="Escolha um cliente na carteira para abrir o centro contextual."
            />
          ) : workspaceQuery.isLoading && !workspaceQuery.data ? (
            <AppPageLoadingState description="Carregando detalhe do cliente..." />
          ) : workspaceQuery.error ? (
            <AppPageErrorState
              description={workspaceQuery.error.message}
              actionLabel="Tentar novamente"
              onAction={() => void workspaceQuery.refetch()}
            />
          ) : (
            <div className="space-y-3">
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="nexo-overline">Hero Executivo do Cliente</p>
                    <h2 className="mt-0.5 text-2xl font-black uppercase leading-none tracking-tight text-[var(--text-primary)]">
                      {String(selectedCustomer.name ?? "Cliente")}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <AppStatusBadge
                        label={`${
                          selectedProfile.operationalSummary
                            ?.operationalStatus ?? "Estado indisponível"
                        } · ${
                          selectedProfile.operationalSummary?.riskSignal ??
                          "Sinal operacional indisponível"
                        }`}
                        tone={
                          selectedProfile.operationalSummary &&
                          ["RISCO", "CRÍTICO"].includes(
                            selectedProfile.operationalSummary.operationalStatus
                          )
                            ? "warning"
                            : "neutral"
                        }
                      />
                      <span className="truncate text-[var(--text-muted)]">
                        {selectedProfile.contact}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Sinal principal:{" "}
                      <span className="text-[var(--text-primary)]">
                        {selectedProfile.operationalSummary?.riskSignal ??
                          "Sinal operacional indisponível"}
                      </span>
                    </p>
                  </div>
                  <div className="min-w-[190px] rounded-lg border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-3 py-2 text-xs">
                    <p className="nexo-overline">Próxima ação</p>
                    <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                      {selectedRecommendedActionLabel}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">
                      Última interação:{" "}
                      {formatDateTime(
                        selectedProfile.lastInteractionAt,
                        "sem registro"
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <NexoExecutiveMetric
                    title="Último serviço"
                    value={
                      workspaceLastCompletedServiceOrder
                        ? formatDateTime(
                            workspaceLastCompletedServiceOrder.updatedAt ??
                              workspaceLastCompletedServiceOrder.createdAt
                          )
                        : "Sem serviço concluído"
                    }
                    context={
                      workspaceLastCompletedServiceOrder
                        ? String(
                            workspaceLastCompletedServiceOrder.title ??
                              "O.S. concluída"
                          )
                        : "Nenhuma O.S. concluída retornada"
                    }
                    ctaLabel="Ver O.S."
                    onClick={() =>
                      navigate(`/service-orders?customerId=${activeCustomerId}`)
                    }
                  />
                  <NexoExecutiveMetric
                    title="Total gasto"
                    value={
                      isChargesUnavailable ||
                      workspaceTotalSpentCents === undefined
                        ? "Financeiro indisponível"
                        : formatCurrency(workspaceTotalSpentCents)
                    }
                    context={
                      isChargesUnavailable
                        ? "Não foi possível confirmar pagamentos"
                        : "Pagamentos registrados"
                    }
                    ctaLabel="Ver financeiro"
                    onClick={() =>
                      navigate(`/finances?customerId=${activeCustomerId}`)
                    }
                  />
                  <NexoExecutiveMetric
                    title="Saldo"
                    value={formatCurrency(
                      workspacePendingCents ?? selectedProfile.pendingCents
                    )}
                    context={`Vencidas: ${workspaceOverdueCharges.length}`}
                    ctaLabel="Cobrar"
                    onClick={() =>
                      navigate(`/finances?customerId=${activeCustomerId}`)
                    }
                  />
                  <NexoExecutiveMetric
                    title="O.S."
                    value={String(workspaceOpenServiceOrders.length)}
                    context={`Total: ${workspaceServiceOrders.length}`}
                    ctaLabel="Abrir O.S."
                    onClick={() =>
                      navigate(`/service-orders?customerId=${activeCustomerId}`)
                    }
                  />
                  <NexoExecutiveMetric
                    title="Agenda"
                    value={
                      workspaceNextAppointment
                        ? formatDateTime(
                            workspaceNextAppointment.startsAt ??
                              workspaceNextAppointment.scheduledAt
                          )
                        : "Sem agenda futura"
                    }
                    context={`Agendamentos: ${workspaceAppointments.length}`}
                    ctaLabel="Agendar"
                    onClick={() => setCreateAppointmentOpen(true)}
                  />
                  <NexoExecutiveMetric
                    title="Comunicação"
                    value={formatDateTime(
                      selectedProfile.lastInteractionAt,
                      "Sem registro"
                    )}
                    context="Canal: WhatsApp"
                    ctaLabel="Abrir WhatsApp"
                    onClick={() =>
                      openCustomerWhatsApp(
                        selectedCustomer,
                        String(
                          workspaceCharges.find(isChargePending)?.id ?? ""
                        ) || null
                      )
                    }
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      openCustomerWhatsApp(
                        selectedCustomer,
                        String(
                          workspaceCharges.find(isChargePending)?.id ?? ""
                        ) || null
                      )
                    }
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                    Abrir WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreateAppointmentOpen(true)}
                  >
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    Agendar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreateServiceOrderOpen(true)}
                  >
                    <Wrench className="mr-1.5 h-3.5 w-3.5" />
                    Nova O.S.
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(`/finances?customerId=${activeCustomerId}`)
                    }
                  >
                    <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                    Cobrar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      timelineAnchorRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    Ver timeline
                  </Button>
                </div>
              </article>

              <AppSectionCard className="space-y-3 border-[var(--warning)]/25 bg-[var(--surface-base)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="nexo-overline">Decisão e próxima ação</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedOperationalSummary ? (
                        <>
                          <AppOperationalStatusBadge
                            status={
                              selectedOperationalSummary.operationalStatus
                            }
                          />
                          <AppPriorityBadge
                            priority={selectedOperationalSummary.priority}
                          />
                          <AppStatusBadge
                            label={selectedRecommendedActionLabel}
                            tone="info"
                          />
                        </>
                      ) : (
                        <AppStatusBadge
                          label="Decisão operacional indisponível"
                          tone="warning"
                        />
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          Motivo oficial
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                          {selectedInterventionReason}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                          Sinal:{" "}
                          {selectedOperationalSummary?.riskSignal ??
                            "Sinal operacional indisponível"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/45 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          Decisão oficial
                        </p>
                        <p className="mt-1 text-lg font-black text-[var(--text-primary)]">
                          {selectedRecommendedActionLabel}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                          Risco:{" "}
                          {selectedOperationalSummary
                            ? `${selectedOperationalSummary.riskState} · score ${selectedOperationalSummary.riskScore}`
                            : "indisponível"}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {selectedOperationalSummary
                        ? `Avaliação oficial em ${formatDateTime(
                            selectedOperationalSummary.evaluatedAt
                          )}.`
                        : "O resumo operacional oficial não está disponível para este cliente."}
                    </p>
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !selectedOperationalSummary ||
                        !selectedOperationalSummary.recommendedActionLabel
                      }
                      onClick={runSelectedRecommendedAction}
                    >
                      {selectedRecommendedActionLabel}
                    </Button>
                  </div>
                </div>
              </AppSectionCard>

              {isRefreshingWorkspace ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Atualizando dados do cliente...
                </p>
              ) : null}

              {showInlineCharges ? (
                <article className="rounded-xl border border-[var(--border-subtle)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Cobranças pendentes/vencidas
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {workspaceCharges
                      .filter(isChargePending)
                      .slice(0, 5)
                      .map((charge, index) => (
                        <div
                          key={`${String(charge.id ?? "charge")}-${index}`}
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/30 p-2"
                        >
                          <p className="text-xs font-medium text-[var(--text-primary)]">
                            {formatCurrency(
                              Number(charge.amountCents ?? charge.amount ?? 0)
                            )}{" "}
                            ·{" "}
                            {presentationStatusLabel(
                              charge.status,
                              "Aguardando ação"
                            )}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Vencimento:{" "}
                            {formatDateTime(charge.dueDate, "Não informado")}
                          </p>
                        </div>
                      ))}
                    {workspaceCharges.filter(isChargePending).length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        Nenhuma cobrança pendente/vencida retornada para este
                        cliente.
                      </p>
                    ) : null}
                  </div>
                </article>
              ) : null}

              <div ref={timelineAnchorRef}>
                <p className="nexo-overline mb-2">
                  Evidências e navegação contextual
                </p>
                {timelineQuery.isLoading ? (
                  <AppPageLoadingState description="Carregando Timeline do cliente..." />
                ) : timelineQuery.error ? (
                  <AppPageErrorState
                    description="A Timeline está indisponível. Os dados e as ações do cliente permanecem acessíveis."
                    actionLabel="Tentar Timeline novamente"
                    onAction={() => void timelineQuery.refetch()}
                  />
                ) : customerOfficialTimelineEvents.length === 0 ? (
                  <AppPageEmptyState
                    title="Timeline sem eventos"
                    description="Nenhuma evidência histórica foi retornada para este cliente."
                  />
                ) : (
                  <NexoEvidenceTimeline
                    title="Últimos eventos oficiais"
                    subtitle="Prova operacional do cliente e histórico oficial ligado ao cliente."
                    events={customerOfficialTimelineEvents}
                    fullTimelineLabel="Abrir Timeline completa"
                    onFullTimeline={() =>
                      navigate(`/timeline?customerId=${activeCustomerId}`)
                    }
                  />
                )}
              </div>
            </div>
          )}
        </AppContextWorkspace>
      </div>

      <CreateCustomerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async created => {
          setCreateOpen(false);
          await customersQuery.refetch();
          await appointmentsQuery.refetch();
          await serviceOrdersQuery.refetch();
          await chargesQuery.refetch();
          if (created?.id) {
            setActiveCustomerId(created.id);
            await refreshCustomerWorkspace(String(created.id));
          }
        }}
      />

      <EditCustomerModal
        open={Boolean(editingCustomerId)}
        customerId={editingCustomerId}
        onClose={() => {
          setEditingCustomerId(null);
          setPendingEditCustomerId(null);
        }}
        onSaved={async saved => {
          setEditingCustomerId(null);
          setPendingEditCustomerId(null);
          await customersQuery.refetch();
          if (saved?.id) setActiveCustomerId(String(saved.id));
          toast.success("Cliente atualizado com sucesso.");
        }}
      />
      <CreateAppointmentModal
        isOpen={createAppointmentOpen}
        onClose={() => setCreateAppointmentOpen(false)}
        onSuccess={async () => {
          setCreateAppointmentOpen(false);
          if (!activeCustomerId) return;
          await propagateCustomerOperationalChange(
            activeCustomerId,
            "CUSTOMER_APPOINTMENT_CREATED",
            {
              includeTimeline: true,
            }
          );
          toast.success("Agendamento criado.");
        }}
        customers={customers.map(customer => ({
          id: String(customer.id ?? ""),
          name: String(customer.name ?? "Cliente"),
        }))}
        initialCustomerId={activeCustomerId}
      />
      <CreateServiceOrderModal
        isOpen={createServiceOrderOpen}
        onClose={() => setCreateServiceOrderOpen(false)}
        onSuccess={async () => {
          setCreateServiceOrderOpen(false);
          if (!activeCustomerId) return;
          await propagateCustomerOperationalChange(
            activeCustomerId,
            "CUSTOMER_SERVICE_ORDER_CREATED",
            {
              includeTimeline: true,
            }
          );
          toast.success("O.S. criada.");
        }}
        customers={customers.map(customer => ({
          id: String(customer.id ?? ""),
          name: String(customer.name ?? "Cliente"),
        }))}
        people={people}
        initialCustomerId={activeCustomerId}
      />
    </AppPageShell>
  );
}

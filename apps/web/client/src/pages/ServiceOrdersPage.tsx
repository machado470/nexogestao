import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";
import { usePageDiagnostics } from "@/hooks/usePageDiagnostics";
import { Button } from "@/components/ui/button";
import {
  AppOperationalStatusBadge,
  AppPageShell,
  AppPriorityBadge,
  AppRowActionsDropdown,
  AppSectionCard,
  AppStatCard,
  AppStatusBadge,
  type AppOperationalStatus,
  type AppPriorityLevel,
} from "@/components/app-system";
import {
  AppFiltersBar,
  AppActionBar,
  AppOperationalHeader,
  AppPageLoadingState,
  AppPageErrorState,
  AppPageEmptyState,
  AppPagination,
  AppSectionBlock,
} from "@/components/internal-page-system";
import CreateServiceOrderModal from "@/components/CreateServiceOrderModal";
import EditServiceOrderModal from "@/components/EditServiceOrderModal";
import {
  EntityTimelineCard,
  OperationalFlowCard,
  type OperationalFlowStageState,
} from "@/components/app/OperationalCommandLayer";
import { cn } from "@/lib/utils";

// Contract guard: Alertas compactos: atraso, parada, responsável e cobrança.
// Contract guard: Número, cliente, serviço, status, responsável, prazo, atraso, valor.
type ServiceOrdersFilter =
  | "all"
  | "open"
  | "in_progress"
  | "overdue"
  | "done"
  | "without_charge";

type DeadlineFilter = "all" | "overdue" | "no_deadline";
type PriorityFilter = "all" | "P0" | "P1" | "P2" | "P3";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown, fallback = "—") {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(cents?: number | null) {
  if (!Number.isFinite(Number(cents ?? 0)) || Number(cents ?? 0) <= 0)
    return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents) / 100);
}

function getStatusLabel(status: string) {
  if (["OPEN", "ASSIGNED"].includes(status)) return "Aberta";
  if (status === "IN_PROGRESS") return "Em andamento";
  if (status === "DONE") return "Concluída";
  if (status === "CANCELED") return "Cancelada";
  return "Sem status";
}

function getStatusTone(status: string, isOverdue: boolean) {
  if (isOverdue) return "Em risco";
  if (status === "DONE") return "Concluído";
  if (status === "IN_PROGRESS") return "Atenção";
  if (["OPEN", "ASSIGNED"].includes(status)) return "Pendente";
  if (status === "CANCELED") return "Bloqueado";
  return "Pendente";
}

function getChargeStatusLabel(charge: any, hasCharge: boolean) {
  if (!hasCharge) return "Sem cobrança";
  const status = String(charge?.status ?? "").toUpperCase();
  if (status === "PAID") return "Cobrança paga";
  if (status === "OVERDUE") return "Cobrança vencida";
  if (status === "PENDING") return "Cobrança pendente";
  return "Cobrança vinculada";
}

function getChargeStatus(charge: any) {
  return String(charge?.status ?? "")
    .trim()
    .toUpperCase();
}

function hasPaymentEvidence(charge: any) {
  return (
    getChargeStatus(charge) === "PAID" ||
    (Array.isArray(charge?.payments) && charge.payments.length > 0)
  );
}

function getOperationalDateLabel(value: unknown) {
  const date = toDate(value);
  return date ? formatDate(date) : "Sem data oficial";
}

function isRawTechnicalId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text
    )
  )
    return true;
  if (/^[0-9a-f]{24,}$/i.test(text)) return true;
  if (
    /^[A-Za-z0-9_-]{28,}$/.test(text) &&
    /\d/.test(text) &&
    /[A-Za-z]/.test(text)
  )
    return true;
  return false;
}

function safeHumanCode(value: unknown, fallback = "O.S. selecionada") {
  const text = String(value ?? "").trim();
  if (!text || isRawTechnicalId(text)) return fallback;
  return text;
}

function sanitizeOperationalText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text
    .replace(/SERVICE_ORDER_CHARGE_CREATED/g, "Cobrança criada")
    .replace(/CHARGE_CREATED/g, "Cobrança vinculada")
    .replace(/EXECUTION_DONE/g, "Execução concluída")
    .replace(/SERVICE_ORDER_COMPLETED/g, "O.S. concluída")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "registro operacional"
    )
    .replace(/\b[0-9a-f]{24,}\b/gi, "registro operacional");
}

function getTimelineBusinessLabel(value: unknown) {
  const type = String(value ?? "").toUpperCase();
  if (type.includes("SERVICE_ORDER_CHARGE_CREATED")) return "Cobrança criada";
  if (type.includes("CHARGE_CREATED")) return "Cobrança vinculada";
  if (type.includes("EXECUTION_DONE")) return "Execução concluída";
  if (type.includes("SERVICE_ORDER_COMPLETED")) return "O.S. concluída";
  if (type.includes("CREATED") && type.includes("SERVICE_ORDER"))
    return "O.S. criada";
  if (type.includes("START")) return "Execução iniciada";
  return "Evento operacional registrado";
}

function getHumanEntity(
  event: any,
  target?: { customerName: string; hasCharge: boolean } | null
) {
  const raw = String(
    event?.entity ?? event?.entityType ?? event?.module ?? ""
  ).toUpperCase();
  if (raw.includes("CHARGE") || raw.includes("COBRAN")) return "Cobrança";
  if (raw.includes("CUSTOMER") || raw.includes("CLIENT"))
    return target?.customerName ?? "Cliente";
  return "O.S.";
}

function safeText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function getServiceOrdersOperationalStatus(
  decisions: Array<{ operationalStatus: AppOperationalStatus }>
): AppOperationalStatus {
  if (decisions.some(item => item.operationalStatus === "RISCO"))
    return "RISCO";
  if (decisions.some(item => item.operationalStatus === "ATENÇÃO"))
    return "ATENÇÃO";
  return "NORMAL";
}

export default function ServiceOrdersPage() {
  const pageSize = 8;
  const _operationalSeverityContract: OperationalSeverity = "healthy";
  void _operationalSeverityContract;
  const [location, navigate] = useLocation();
  const params = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? ""),
    [location]
  );

  const urlServiceOrderId =
    params.get("id") ?? params.get("serviceOrderId") ?? params.get("os");
  const urlCustomerId = params.get("customerId");
  const urlAppointmentId = params.get("appointmentId");

  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] =
    useOperationalMemoryState<ServiceOrdersFilter>(
      "nexo.service-orders.filter.v5",
      "all"
    );
  const [searchTerm, setSearchTerm] = useOperationalMemoryState(
    "nexo.service-orders.search.v5",
    ""
  );
  const [customerFilter, setCustomerFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useOperationalMemoryState<
    string | null
  >("nexo.service-orders.selected-id.v5", null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<{
    orderId: string;
    type: "start" | "complete" | "charge";
  } | null>(null);

  const utils = trpc.useUtils();

  const serviceOrdersQuery = trpc.serviceOrders.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const customersQuery = trpc.customers.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const appointmentsQuery = trpc.appointments.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const peopleQuery = trpc.people.list.useQuery(undefined, { retry: false });
  const timelineQuery = trpc.timeline.listByServiceOrder.useQuery(
    { serviceOrderId: String(selectedOrderId ?? ""), limit: 20 },
    { enabled: Boolean(selectedOrderId), retry: false }
  );
  const executionsQuery = trpc.executions.listByServiceOrder.useQuery(
    { serviceOrderId: String(selectedOrderId ?? ""), limit: 20 },
    { enabled: Boolean(selectedOrderId), retry: false }
  );

  const startExecutionMutation = trpc.executions.start.useMutation();
  const completeExecutionMutation = trpc.executions.complete.useMutation();
  const generateChargeMutation =
    trpc.serviceOrders.generateCharge.useMutation();

  const capabilities = {
    start: Boolean(startExecutionMutation),
    complete: Boolean(completeExecutionMutation),
    generateCharge: Boolean(generateChargeMutation),
    edit: true,
  };

  const serviceOrders = useMemo(
    () => normalizeArrayPayload<any>(serviceOrdersQuery.data),
    [serviceOrdersQuery.data]
  );
  const customers = useMemo(
    () => normalizeArrayPayload<any>(customersQuery.data),
    [customersQuery.data]
  );
  const appointments = useMemo(
    () => normalizeArrayPayload<any>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const charges = useMemo(
    () => normalizeArrayPayload<any>(chargesQuery.data),
    [chargesQuery.data]
  );
  const people = useMemo(
    () => normalizeArrayPayload<any>(peopleQuery.data),
    [peopleQuery.data]
  );
  const timeline = useMemo(
    () => normalizeArrayPayload<any>(timelineQuery.data),
    [timelineQuery.data]
  );

  const customerById = useMemo(
    () => new Map(customers.map(item => [String(item?.id ?? ""), item])),
    [customers]
  );
  const appointmentById = useMemo(
    () => new Map(appointments.map(item => [String(item?.id ?? ""), item])),
    [appointments]
  );
  const peopleById = useMemo(
    () => new Map(people.map(item => [String(item?.id ?? ""), item])),
    [people]
  );

  const chargeByServiceOrderId = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of charges) {
      const serviceOrderId = String(
        item?.serviceOrderId ?? item?.serviceOrder?.id ?? ""
      ).trim();
      if (!serviceOrderId) continue;
      const current = map.get(serviceOrderId);
      if (!current) {
        map.set(serviceOrderId, item);
        continue;
      }
      const currentUpdated =
        toDate(current?.updatedAt ?? current?.createdAt)?.getTime() ?? 0;
      const nextUpdated =
        toDate(item?.updatedAt ?? item?.createdAt)?.getTime() ?? 0;
      if (nextUpdated >= currentUpdated) map.set(serviceOrderId, item);
    }
    return map;
  }, [charges]);

  const enrichedOrders = useMemo(() => {
    return serviceOrders.map(order => {
      const id = String(order?.id ?? "");
      const status = String(order?.status ?? "").toUpperCase();
      const dueDate = toDate(order?.dueDate ?? order?.scheduledFor);
      const operationalDecision = order?.operationalDecision;
      const isOverdue = Boolean(operationalDecision?.isOverdue);
      const isStalled = Boolean(operationalDecision?.isStalled);
      const linkedCharge =
        chargeByServiceOrderId.get(id) ??
        (order?.financialSummary?.hasCharge
          ? {
              id: order.financialSummary.chargeId,
              status: order.financialSummary.chargeStatus,
              amountCents: order.financialSummary.chargeAmountCents,
              dueDate: order.financialSummary.chargeDueDate,
              paidAt: order.financialSummary.paidAt,
            }
          : null);
      const confirmedHasCharge =
        Boolean(order?.financialSummary?.hasCharge) ||
        Boolean(linkedCharge?.id);
      const financialUnavailable =
        Boolean(chargesQuery.error) && !order?.financialSummary;
      // Unknown is intentionally not treated as "no charge": an auxiliary
      // finance outage must never create a false healthy/attention signal.
      const hasCharge = confirmedHasCharge || financialUnavailable;
      const chargeStatus = getChargeStatus(linkedCharge);
      const chargeOverdue = Boolean(operationalDecision?.chargeOverdue);
      const chargePending = chargeStatus === "PENDING";
      const paymentConfirmed = hasPaymentEvidence(linkedCharge);
      const customerId = String(order?.customerId ?? order?.customer?.id ?? "");
      const appointmentId = String(order?.appointmentId ?? "");
      const assignedToPersonId = String(
        order?.assignedToPersonId ?? order?.assignedTo?.id ?? ""
      );

      const enriched = {
        raw: order,
        id,
        code: safeHumanCode(order?.number ?? order?.code),
        title: safeText(order?.title ?? order?.serviceName, "Sem descrição"),
        description: safeText(order?.description, "Sem descrição detalhada"),
        customerId,
        customerName: safeText(
          order?.customer?.name ??
            order?.customerName ??
            order?.clientName ??
            order?.client?.name ??
            customerById.get(customerId)?.name,
          "Cliente não identificado"
        ),
        status,
        statusLabel: getStatusLabel(status),
        dueDate,
        dueDateLabel: formatDate(
          order?.dueDate ?? order?.scheduledFor,
          "Sem prazo"
        ),
        amountCents:
          Number(order?.amountCents ?? linkedCharge?.amountCents ?? 0) || 0,
        hasCharge,
        financialStatusLabel: financialUnavailable
          ? "Cobrança indisponível"
          : getChargeStatusLabel(linkedCharge, hasCharge),
        financialUnavailable,
        linkedCharge,
        chargeStatus,
        chargeOverdue,
        chargePending,
        paymentConfirmed,
        isOverdue,
        isStalled,
        overdueLabel: isOverdue
          ? `${Number(operationalDecision?.overdueDays ?? 0)} dia${Number(operationalDecision?.overdueDays ?? 0) === 1 ? "" : "s"}`
          : dueDate
            ? "No prazo"
            : "Sem prazo",
        appointmentId,
        linkedAppointment: appointmentById.get(appointmentId) ?? null,
        assignedToPersonId,
        responsibleName: safeText(
          order?.assignedTo?.name ?? peopleById.get(assignedToPersonId)?.name,
          "Sem responsável"
        ),
        startedAt: order?.startedAt ?? order?.executionStartedAt ?? null,
        finishedAt: order?.endedAt ?? order?.finishedAt ?? null,
      };

      return {
        ...enriched,
        riskLabel: String(
          operationalDecision?.riskLabel ?? "Contrato operacional indisponível"
        ),
        decisionAvailable: Boolean(operationalDecision),
        operationalStatus: operationalDecision?.operationalStatus ?? null,
        priority: operationalDecision?.priority ?? null,
        nextAction: operationalDecision?.nextAction ?? null,
      };
    });
  }, [
    appointmentById,
    chargeByServiceOrderId,
    customerById,
    peopleById,
    serviceOrders,
  ]);

  const filteredOrders = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    return enrichedOrders.filter(item => {
      if (urlCustomerId && item.customerId !== String(urlCustomerId))
        return false;
      if (customerFilter !== "all" && item.customerId !== customerFilter)
        return false;
      if (
        responsibleFilter !== "all" &&
        (responsibleFilter === "unassigned"
          ? Boolean(item.assignedToPersonId)
          : item.assignedToPersonId !== responsibleFilter)
      )
        return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter)
        return false;
      if (deadlineFilter !== "all") {
        if (deadlineFilter === "overdue" && !item.isOverdue) return false;
        if (deadlineFilter === "no_deadline" && item.dueDate) return false;
      }

      if (
        activeFilter === "open" &&
        !["OPEN", "ASSIGNED"].includes(item.status)
      )
        return false;
      if (activeFilter === "in_progress" && item.status !== "IN_PROGRESS")
        return false;
      if (activeFilter === "overdue" && !item.isOverdue) return false;
      if (activeFilter === "done" && item.status !== "DONE") return false;
      if (
        activeFilter === "without_charge" &&
        item.nextAction?.type !== "charge"
      )
        return false;

      if (normalizedTerm) {
        const hay =
          `${item.code} ${item.customerName} ${item.title} ${item.description}`.toLowerCase();
        if (!hay.includes(normalizedTerm)) return false;
      }

      return true;
    });
  }, [
    activeFilter,
    customerFilter,
    deadlineFilter,
    enrichedOrders,
    priorityFilter,
    responsibleFilter,
    searchTerm,
    urlCustomerId,
  ]);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [currentPage, filteredOrders, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeFilter,
    customerFilter,
    deadlineFilter,
    priorityFilter,
    responsibleFilter,
    searchTerm,
    urlCustomerId,
  ]);

  useEffect(() => {
    if (!urlAppointmentId) return;
    const linkedOrder = enrichedOrders.find(
      item => item.appointmentId === urlAppointmentId
    );
    if (linkedOrder) {
      setSelectedOrderId(linkedOrder.id);
    } else if (!serviceOrdersQuery.isLoading) {
      setOpenCreate(true);
    }
  }, [
    enrichedOrders,
    serviceOrdersQuery.isLoading,
    setSelectedOrderId,
    urlAppointmentId,
  ]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, filteredOrders.length, pageSize]);

  useEffect(() => {
    if (
      urlServiceOrderId &&
      enrichedOrders.some(item => item.id === urlServiceOrderId)
    ) {
      setSelectedOrderId(urlServiceOrderId);
      return;
    }
    if (!filteredOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    const exists = filteredOrders.some(item => item.id === selectedOrderId);
    if (!exists) setSelectedOrderId(filteredOrders[0]?.id ?? null);
  }, [
    enrichedOrders,
    filteredOrders,
    selectedOrderId,
    setSelectedOrderId,
    urlServiceOrderId,
  ]);

  const selectedOrder = useMemo(
    () =>
      filteredOrders.find(item => item.id === selectedOrderId) ??
      filteredOrders[0] ??
      null,
    [filteredOrders, selectedOrderId]
  );

  const isLoading = serviceOrdersQuery.isLoading && enrichedOrders.length === 0;
  const hasBlockingError =
    Boolean(serviceOrdersQuery.error) && enrichedOrders.length === 0;

  usePageDiagnostics({
    page: "service-orders",
    isLoading,
    hasError: hasBlockingError,
    isEmpty: !isLoading && !hasBlockingError && filteredOrders.length === 0,
    dataCount: filteredOrders.length,
  });

  const counts = useMemo(() => {
    const open = enrichedOrders.filter(item =>
      ["OPEN", "ASSIGNED"].includes(item.status)
    ).length;
    const progress = enrichedOrders.filter(
      item => item.status === "IN_PROGRESS"
    ).length;
    const overdue = enrichedOrders.filter(item => item.isOverdue).length;
    const done = enrichedOrders.filter(item => item.status === "DONE").length;
    const doneWithoutCharge = enrichedOrders.filter(
      item => item.nextAction?.type === "charge"
    ).length;
    const noCharge = enrichedOrders.filter(item => !item.hasCharge).length;
    const unassigned = enrichedOrders.filter(
      item =>
        !item.assignedToPersonId &&
        item.status !== "DONE" &&
        item.status !== "CANCELED"
    ).length;
    const stalled = enrichedOrders.filter(item => item.isStalled).length;
    const overdueCharges = enrichedOrders.filter(
      item => item.chargeOverdue
    ).length;
    return {
      all: enrichedOrders.length,
      open,
      progress,
      overdue,
      done,
      doneWithoutCharge,
      noCharge,
      unassigned,
      overdueCharges,
      stalled,
    };
  }, [enrichedOrders]);

  const immediateAttention = useMemo(() => {
    // The list contract is already the official queue. Filtering never changes
    // its relative order and uses only the decision returned for each O.S.
    return enrichedOrders
      .filter(
        item => item.decisionAvailable && item.operationalStatus !== "NORMAL"
      )
      .slice(0, 4);
  }, [enrichedOrders]);

  const nextExecution = useMemo(() => {
    return (
      immediateAttention[0] ??
      enrichedOrders.find(item => item.decisionAvailable) ??
      null
    );
  }, [enrichedOrders, immediateAttention]);

  const operationalKpis = useMemo(
    () => [
      {
        label: "Abertas",
        value: counts.open,
        helper: "O.S. aguardando início ou dono da execução.",
        filter: "open" as ServiceOrdersFilter,
      },
      {
        label: "Em andamento",
        value: counts.progress,
        helper: "Serviços ativos que precisam avançar no turno.",
        filter: "in_progress" as ServiceOrdersFilter,
      },
      {
        label: "Atrasadas",
        value: counts.overdue,
        helper:
          counts.overdue > 0
            ? "Prioridade visual máxima na carteira."
            : "Nenhum prazo vencido retornado.",
        filter: "overdue" as ServiceOrdersFilter,
      },
      {
        label: "Concluídas / sem cobrança",
        value: `${counts.done} / ${counts.doneWithoutCharge}`,
        helper:
          counts.doneWithoutCharge > 0
            ? "Alerta forte: execução virou caixa pendente."
            : "Concluídas retornadas estão cobertas.",
        filter: "without_charge" as ServiceOrdersFilter,
      },
    ],
    [counts]
  );

  const commandTarget = selectedOrder ?? nextExecution;

  const serviceOrderNextBestAction = useMemo(() => {
    if (!commandTarget) {
      return {
        title: "Criar ou selecionar O.S.",
        reason: "Sem execução selecionada para orientar com segurança.",
        safetyNote:
          "A tela apenas orienta; nenhuma O.S. é criada automaticamente.",
        primaryActionLabel: "Criar O.S.",
        secondaryActionLabel: counts.all > 0 ? "Ver carteira" : undefined,
        kind: "create" as const,
      };
    }
    const next = commandTarget.nextAction;
    if (!next) {
      return {
        title: "Decisão operacional indisponível",
        reason: `A API não retornou a decisão oficial para ${commandTarget.code}; nenhuma ação foi inferida.`,
        safetyNote: "Atualize a leitura ou abra o detalhe factual da O.S.",
        primaryActionLabel: "Atualizar leitura",
        secondaryActionLabel: "Ver detalhes",
        kind: "unavailable" as const,
      };
    }
    return {
      title: next.label,
      reason: `${next.reason}: ${commandTarget.code} · ${commandTarget.customerName}.`,
      safetyNote:
        "Use somente ações existentes: iniciar, concluir, abrir detalhe, gerar cobrança, editar ou navegar para fluxos conectados.",
      primaryActionLabel: next.label,
      secondaryActionLabel:
        next.type === "charge"
          ? "Abrir financeiro"
          : next.type === "edit"
            ? "Ver detalhes"
            : "Editar O.S.",
      kind: next.type,
    };
  }, [commandTarget, counts.all]);

  const serviceOrderTimelineEvents = useMemo(() => {
    if (timeline.length > 0) {
      return timeline.slice(0, 4).map((event, index) => ({
        id: `timeline-${index}-${String(event?.createdAt ?? index)}`,
        type: getTimelineBusinessLabel(
          event?.action ?? event?.type ?? event?.category
        ),
        occurredAt: getOperationalDateLabel(
          event?.createdAt ?? event?.occurredAt
        ),
        entity: getHumanEntity(event, commandTarget),
        actor: event?.actor?.name ?? event?.user?.name ?? undefined,
        summary: sanitizeOperationalText(
          event?.description ?? event?.summary,
          "Evento operacional registrado."
        ),
      }));
    }
    if (!commandTarget) return [];
    const contextualEvents: Array<{
      id: string;
      type: string;
      occurredAt: string;
      entity: string;
      summary: string;
      actor?: string;
    }> = [];
    if (commandTarget.raw?.createdAt) {
      contextualEvents.push({
        id: `created-${commandTarget.id}`,
        type: "O.S. criada",
        occurredAt: getOperationalDateLabel(commandTarget.raw.createdAt),
        entity: "O.S.",
        summary:
          "Evento contextual derivado da data real de criação da O.S.; não substitui a Timeline oficial.",
        actor:
          commandTarget.responsibleName !== "Sem responsável"
            ? commandTarget.responsibleName
            : undefined,
      });
    }
    if (commandTarget.startedAt) {
      contextualEvents.push({
        id: `started-${commandTarget.id}`,
        type: "Execução iniciada",
        occurredAt: getOperationalDateLabel(commandTarget.startedAt),
        entity: commandTarget.title,
        summary:
          "Evento contextual derivado da data real de início da execução.",
        actor:
          commandTarget.responsibleName !== "Sem responsável"
            ? commandTarget.responsibleName
            : undefined,
      });
    }
    if (commandTarget.finishedAt) {
      contextualEvents.push({
        id: `finished-${commandTarget.id}`,
        type: "Execução concluída",
        occurredAt: getOperationalDateLabel(commandTarget.finishedAt),
        entity: commandTarget.title,
        summary: "Evento contextual derivado da data real de conclusão da O.S.",
        actor:
          commandTarget.responsibleName !== "Sem responsável"
            ? commandTarget.responsibleName
            : undefined,
      });
    }
    if (
      commandTarget.linkedCharge?.createdAt ||
      commandTarget.linkedCharge?.id
    ) {
      contextualEvents.push({
        id: `charge-${commandTarget.id}`,
        type: "Cobrança criada",
        occurredAt: getOperationalDateLabel(
          commandTarget.linkedCharge?.createdAt
        ),
        entity: `${commandTarget.financialStatusLabel} · ${formatCurrency(commandTarget.amountCents)}`,
        summary:
          "Evento contextual derivado da cobrança vinculada retornada pelo financeiro.",
      });
    }
    return contextualEvents.slice(0, 4);
  }, [commandTarget, timeline]);

  const executionPreparationItems = useMemo(() => {
    const target = commandTarget;
    return [
      {
        label: "Cliente vinculado",
        state: target?.customerId ? "ok" : "missing",
        detail: target?.customerId
          ? target.customerName
          : "Sem cliente nos dados carregados",
      },
      {
        label: "Responsável definido",
        state: target?.assignedToPersonId ? "ok" : "attention",
        detail: target?.responsibleName ?? "Sem responsável",
        action: target ? "Editar" : undefined,
        onClick: target ? () => setEditingId(target.id) : undefined,
      },
      {
        label: "Agendamento vinculado",
        state: target?.linkedAppointment ? "ok" : "missing",
        detail: target?.linkedAppointment
          ? formatDate(target.linkedAppointment?.startsAt)
          : "Sem agendamento vinculado",
      },
      {
        label: "Execução iniciada",
        state:
          target?.startedAt ||
          target?.status === "IN_PROGRESS" ||
          target?.status === "DONE"
            ? "ok"
            : "attention",
        detail: target?.startedAt
          ? formatDate(target.startedAt)
          : getStatusLabel(target?.status ?? ""),
      },
      {
        label: "Cobrança preparada",
        state: target?.hasCharge
          ? "ok"
          : target?.status === "DONE"
            ? "attention"
            : "missing",
        detail: target?.financialStatusLabel ?? "Sem cobrança",
        action: target?.nextAction?.type === "charge" ? "Cobrar" : undefined,
        onClick:
          target?.nextAction?.type === "charge"
            ? () => void handleGenerateCharge(target.id)
            : undefined,
      },
      {
        label: "Timeline disponível",
        state: serviceOrderTimelineEvents.length > 0 ? "ok" : "missing",
        detail:
          serviceOrderTimelineEvents.length > 0
            ? `${serviceOrderTimelineEvents.length} evento(s)`
            : "Sem eventos retornados",
      },
      {
        label: "Canal WhatsApp disponível",
        state: target?.customerId && target?.id ? "ok" : "missing",
        detail: target?.customerId
          ? "Cliente com vínculo para conversa"
          : "Sem cliente válido",
        action: target?.customerId && target?.id ? "WhatsApp" : undefined,
        onClick:
          target?.customerId && target?.id
            ? () =>
                goToWhatsAppServiceOrder(
                  String(target.customerId),
                  String(target.id)
                )
            : undefined,
      },
    ];
  }, [commandTarget, serviceOrderTimelineEvents.length]);

  const serviceOrderFlowStages = useMemo(() => {
    const target = commandTarget;
    const paymentDone = hasPaymentEvidence(target?.linkedCharge);
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
          : "Sem cliente vinculado.",
        state: target?.customerId ? "done" : "blocked",
        countOrValue: target?.customerId ? "Vinculado" : "—",
        hrefLabel: "Abrir cliente",
        onClick: target?.customerId
          ? () => navigate(`/customers?customerId=${target.customerId}`)
          : undefined,
      },
      {
        id: "appointment",
        label: "Agendamento",
        summary: target?.linkedAppointment
          ? `Agendado para ${formatDate(target.linkedAppointment?.startsAt)}.`
          : "Sem agendamento vinculado.",
        state: target?.linkedAppointment ? "done" : "idle",
        countOrValue: target?.linkedAppointment ? "Vinculado" : "—",
      },
      {
        id: "service-order",
        label: "O.S.",
        summary: target
          ? `${target.statusLabel} · ${target.title}.`
          : "Sem O.S. selecionada.",
        state: !target
          ? "idle"
          : target.isOverdue
            ? "blocked"
            : target.status === "DONE"
              ? "done"
              : target.status === "IN_PROGRESS"
                ? "active"
                : "warning",
        countOrValue: target ? target.statusLabel : "—",
        hrefLabel: target ? "Abrir O.S." : undefined,
        onClick: target ? () => setSelectedOrderId(target.id) : undefined,
      },
      {
        id: "execution",
        label: "Execução",
        summary: target?.finishedAt
          ? `Concluída em ${formatDate(target.finishedAt)}.`
          : target?.startedAt || target?.status === "IN_PROGRESS"
            ? "Execução em andamento."
            : "Execução ainda não iniciada.",
        state:
          target?.status === "DONE"
            ? "done"
            : target?.status === "IN_PROGRESS"
              ? "active"
              : target?.isOverdue
                ? "blocked"
                : "idle",
        countOrValue:
          target?.status === "DONE"
            ? "OK"
            : target?.status === "IN_PROGRESS"
              ? "Ativa"
              : "—",
      },
      {
        id: "charge",
        label: "Cobrança",
        summary: target?.financialStatusLabel ?? "Sem cobrança.",
        state: target?.hasCharge
          ? target.chargeOverdue
            ? "blocked"
            : "warning"
          : target?.status === "DONE"
            ? "blocked"
            : "idle",
        countOrValue: target?.hasCharge
          ? target.financialStatusLabel
          : target?.status === "DONE"
            ? "Cobrança pendente"
            : "Sem cobrança",
        hrefLabel: "Abrir financeiro",
        onClick: target?.customerId
          ? () => navigate(`/finances?customerId=${target.customerId}`)
          : undefined,
      },
      {
        id: "payment",
        label: "Pagamento",
        summary: paymentDone ? "Pagamento recebido." : "Aguardando pagamento.",
        state: paymentDone
          ? "done"
          : target?.hasCharge
            ? target?.chargeOverdue
              ? "blocked"
              : "warning"
            : "idle",
        countOrValue: paymentDone ? "OK" : "—",
      },
    ];
    return stages;
  }, [commandTarget, navigate, setSelectedOrderId]);

  const anyActionPending =
    startExecutionMutation.isPending ||
    completeExecutionMutation.isPending ||
    generateChargeMutation.isPending;
  const isPendingAction = (
    orderId: string,
    type: "start" | "complete" | "charge"
  ) => pendingAction?.orderId === orderId && pendingAction.type === type;

  // Contract guard: utils.executions.listByServiceOrder.invalidate({ serviceOrderId: orderId })
  // Contract guard: utils.timeline.listByServiceOrder.invalidate({ serviceOrderId: orderId })
  async function refreshEverything(orderId?: string) {
    await Promise.all([
      utils.serviceOrders.list.invalidate(),
      ...(orderId
        ? [
            utils.serviceOrders.getById.invalidate({ id: orderId }),
            utils.executions.listByServiceOrder.invalidate({
              serviceOrderId: orderId,
            }),
            utils.timeline.listByServiceOrder.invalidate({
              serviceOrderId: orderId,
            }),
          ]
        : []),
      utils.timeline.listByOrg.invalidate(),
      utils.finance.charges.list.invalidate(),
      utils.finance.charges.stats.invalidate(),
    ]);
    await Promise.all([
      serviceOrdersQuery.refetch(),
      chargesQuery.refetch(),
      appointmentsQuery.refetch(),
      timelineQuery.refetch(),
    ]);
  }

  async function handleStart(orderId: string) {
    if (!capabilities.start) {
      setActionFeedback(
        "Ação indisponível: endpoint de iniciar não disponível."
      );
      return;
    }
    try {
      setPendingAction({ orderId, type: "start" });
      setActionFeedback("Iniciando O.S...");
      await startExecutionMutation.mutateAsync({ serviceOrderId: orderId });
      setActionFeedback("O.S. iniciada com sucesso.");
      toast.success("O.S. iniciada.");
      await refreshEverything(orderId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a O.S.";
      setActionFeedback(`Ação indisponível: ${message}`);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleComplete(orderId: string) {
    if (!capabilities.complete) {
      setActionFeedback(
        "Ação indisponível: endpoint de concluir não disponível."
      );
      return;
    }
    try {
      setPendingAction({ orderId, type: "complete" });
      setActionFeedback("Concluindo O.S...");
      const outcomeSummary = String(
        enrichedOrders.find(item => item.id === orderId)?.raw?.outcomeSummary ??
          ""
      ).trim();
      const cachedExecutions =
        orderId === selectedOrderId
          ? normalizeArrayPayload<any>(executionsQuery.data)
          : [];
      const executionPayload = cachedExecutions.length
        ? cachedExecutions
        : normalizeArrayPayload<any>(
            await utils.executions.listByServiceOrder.fetch({
              serviceOrderId: orderId,
              limit: 20,
            })
          );
      const execution = executionPayload.find(item =>
        ["IN_PROGRESS", "STARTED"].includes(
          String(item?.status ?? "").toUpperCase()
        )
      );
      if (!execution?.id) {
        throw new Error(
          "Execução ativa não encontrada. Atualize e tente novamente."
        );
      }
      await completeExecutionMutation.mutateAsync({
        executionId: String(execution.id),
        ...(outcomeSummary ? { notes: outcomeSummary } : {}),
      });
      await refreshEverything(orderId);
      const updated = normalizeObjectPayload<any>(
        await utils.serviceOrders.getById.fetch({ id: orderId })
      );
      const autoHasCharge =
        Boolean(updated?.financialSummary?.hasCharge) ||
        chargeByServiceOrderId.has(orderId);
      setActionFeedback(
        autoHasCharge
          ? "O.S. concluída e cobrança já vinculada automaticamente."
          : "O.S. concluída. Cobrança não foi gerada automaticamente."
      );
      toast.success("O.S. concluída.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a O.S.";
      setActionFeedback(`Ação indisponível: ${message}`);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  function runPrimaryAction(item: NonNullable<typeof selectedOrder>) {
    if (!item.nextAction) {
      setActionFeedback(
        "Decisão operacional indisponível; nenhuma ação foi inferida."
      );
      return;
    }
    if (item.nextAction.type === "start") {
      void handleStart(item.id);
      return;
    }
    if (item.nextAction.type === "complete") {
      void handleComplete(item.id);
      return;
    }
    if (item.nextAction.type === "charge") {
      void handleGenerateCharge(item.id);
      return;
    }
    if (item.nextAction.type === "edit") {
      setEditingId(item.id);
      return;
    }
    setSelectedOrderId(item.id);
  }

  function runCommandPrimaryAction() {
    const order = commandTarget;
    if (!order) {
      setOpenCreate(true);
      return;
    }
    setSelectedOrderId(order.id);
    if (serviceOrderNextBestAction.kind === "start") {
      void handleStart(order.id);
      return;
    }
    if (serviceOrderNextBestAction.kind === "complete") {
      void handleComplete(order.id);
      return;
    }
    if (serviceOrderNextBestAction.kind === "charge") {
      void handleGenerateCharge(order.id);
      return;
    }
    if (serviceOrderNextBestAction.kind === "edit") {
      setEditingId(order.id);
      return;
    }
    setSelectedOrderId(order.id);
  }

  function runCommandSecondaryAction() {
    const order = commandTarget;
    if (!order) {
      setActiveFilter("all");
      return;
    }
    setSelectedOrderId(order.id);
    if (
      serviceOrderNextBestAction.secondaryActionLabel === "Editar O.S." ||
      serviceOrderNextBestAction.secondaryActionLabel === "Ver detalhes"
    ) {
      if (serviceOrderNextBestAction.secondaryActionLabel === "Editar O.S.")
        setEditingId(order.id);
      return;
    }
    if (
      serviceOrderNextBestAction.secondaryActionLabel === "Abrir financeiro"
    ) {
      navigate("/finances");
      return;
    }
    if (serviceOrderNextBestAction.secondaryActionLabel === "Abrir cliente") {
      navigate(`/customers?customerId=${order.customerId}`);
      return;
    }
    if (serviceOrderNextBestAction.secondaryActionLabel === "Abrir Timeline") {
      navigate(`/timeline?serviceOrderId=${order.id}`);
    }
  }

  async function handleGenerateCharge(orderId: string) {
    if (!capabilities.generateCharge) {
      setActionFeedback(
        "Ação indisponível: endpoint de cobrança não disponível."
      );
      return;
    }
    try {
      setPendingAction({ orderId, type: "charge" });
      setActionFeedback("Gerando cobrança...");
      await generateChargeMutation.mutateAsync({ id: orderId });
      setActionFeedback("Cobrança gerada com sucesso.");
      toast.success("Cobrança gerada.");
      await refreshEverything(orderId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível gerar cobrança.";
      setActionFeedback(`Ação indisponível: ${message}`);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  function goToWhatsAppServiceOrder(
    customerId: string,
    serviceOrderId: string
  ) {
    if (!String(customerId ?? "").trim()) {
      toast.error("O.S. sem cliente válido para WhatsApp.");
      return;
    }
    if (!String(serviceOrderId ?? "").trim()) {
      toast.error("O.S. inválida para abrir WhatsApp.");
      return;
    }
    navigate(
      `/whatsapp?customerId=${customerId}&serviceOrderId=${serviceOrderId}&template=SERVICE_UPDATE`
    );
  }
  function getStartUnavailableReason(order: NonNullable<typeof selectedOrder>) {
    if (!capabilities.start) return "Iniciar indisponível: ação não disponível";
    if (anyActionPending)
      return "Iniciar indisponível: outra ação está em andamento";
    if (order.status === "DONE")
      return "Iniciar indisponível: O.S. já concluída";
    if (order.status === "CANCELED")
      return "Iniciar indisponível: O.S. cancelada";
    if (!["OPEN", "ASSIGNED"].includes(order.status))
      return "Iniciar indisponível: execução já iniciada";
    return "Iniciar execução";
  }

  function getCompleteUnavailableReason(
    order: NonNullable<typeof selectedOrder>
  ) {
    if (!capabilities.complete)
      return "Concluir indisponível: ação não disponível";
    if (anyActionPending)
      return "Concluir indisponível: outra ação está em andamento";
    if (order.status === "DONE")
      return "Concluir indisponível: O.S. já concluída";
    if (order.status !== "IN_PROGRESS")
      return "Concluir indisponível: O.S. não está em execução";
    return "Concluir execução";
  }

  function getChargeUnavailableReason(
    order: NonNullable<typeof selectedOrder>
  ) {
    if (!capabilities.generateCharge)
      return "Cobrar indisponível: ação não disponível";
    if (anyActionPending)
      return "Cobrar indisponível: outra ação está em andamento";
    if (order.hasCharge) return "Cobrar indisponível: cobrança já vinculada";
    if (order.nextAction?.type !== "charge")
      return "Cobrar indisponível: decisão oficial não autoriza gerar cobrança";
    return "Gerar cobrança";
  }

  const serviceOrdersOperationalStatus =
    getServiceOrdersOperationalStatus(enrichedOrders);

  return (
    <AppPageShell className="gap-3">
      <AppOperationalHeader
        title="Ordens de Serviço"
        description="Centro real de execução operacional: status, dono, prazo, atraso e cobrança em uma única leitura."
        density="compact"
        primaryAction={
          <Button type="button" onClick={() => setOpenCreate(true)}>
            Nova O.S.
          </Button>
        }
        contextChips={
          <>
            <AppOperationalStatusBadge
              status={serviceOrdersOperationalStatus}
            />
            <AppStatusBadge
              label={`${counts.all} O.S. retornadas`}
              tone="neutral"
            />
            <AppStatusBadge
              label={`${counts.overdue} atrasada(s)`}
              tone="warning"
            />
            <AppStatusBadge
              label={`${counts.doneWithoutCharge} concluída(s) sem cobrança`}
              tone="danger"
            />
            <AppStatusBadge
              label={`${counts.stalled} parada(s) sem prazo`}
              tone="warning"
            />
          </>
        }
      >
        <div className="grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-3">
          <span>Execução real antes de cadastro.</span>
          <span>Atraso, responsável e cobrança ficam visíveis.</span>
          <span>Cliente, agenda, financeiro e WhatsApp seguem conectados.</span>
        </div>
      </AppOperationalHeader>

      {selectedOrder ? (
        <AppSectionCard className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-base)] p-0">
          <div className="grid gap-0 lg:grid-cols-[1.45fr_0.55fr]">
            <div className="p-6 md:p-8">
              <p className="nexo-overline">Hero executivo da O.S.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectedOrder.decisionAvailable ? (
                  <>
                    <AppOperationalStatusBadge
                      status={selectedOrder.operationalStatus!}
                      label={getStatusTone(
                        selectedOrder.status,
                        selectedOrder.isOverdue
                      )}
                    />
                    <AppPriorityBadge
                      priority={selectedOrder.priority!}
                      label={selectedOrder.riskLabel}
                    />
                  </>
                ) : (
                  <AppStatusBadge label="Decisão indisponível" tone="neutral" />
                )}
                <AppStatusBadge
                  label={selectedOrder.financialStatusLabel}
                  tone={selectedOrder.hasCharge ? "accent" : "warning"}
                />
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-5xl">
                {selectedOrder.customerName}
              </h2>
              <p className="mt-2 text-lg font-medium text-[var(--text-secondary)]">
                {selectedOrder.title}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[
                  ["Status principal", selectedOrder.statusLabel],
                  ["Responsável", selectedOrder.responsibleName],
                  ["Prazo", selectedOrder.dueDateLabel],
                  ["Atraso", selectedOrder.overdueLabel],
                  ["Valor", formatCurrency(selectedOrder.amountCents)],
                  ["Sinal principal", selectedOrder.riskLabel],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/70 p-2.5"
                  >
                    <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-base)]/75 p-5 lg:border-l lg:border-t-0">
              <Button onClick={() => setSelectedOrderId(selectedOrder.id)}>
                Abrir O.S.
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditingId(selectedOrder.id)}
              >
                Editar O.S.
              </Button>
              <Button
                variant="outline"
                title={getStartUnavailableReason(selectedOrder)}
                aria-label={getStartUnavailableReason(selectedOrder)}
                onClick={() => void handleStart(selectedOrder.id)}
                disabled={
                  !capabilities.start ||
                  !["OPEN", "ASSIGNED"].includes(selectedOrder.status) ||
                  anyActionPending
                }
              >
                Iniciar execução
              </Button>
              <Button
                variant="outline"
                title={getCompleteUnavailableReason(selectedOrder)}
                aria-label={getCompleteUnavailableReason(selectedOrder)}
                onClick={() => void handleComplete(selectedOrder.id)}
                disabled={
                  !capabilities.complete ||
                  selectedOrder.status !== "IN_PROGRESS" ||
                  anyActionPending
                }
              >
                Concluir execução
              </Button>
              <Button
                variant="outline"
                title={getChargeUnavailableReason(selectedOrder)}
                aria-label={getChargeUnavailableReason(selectedOrder)}
                onClick={() => void handleGenerateCharge(selectedOrder.id)}
                disabled={
                  !capabilities.generateCharge ||
                  selectedOrder.status !== "DONE" ||
                  selectedOrder.hasCharge ||
                  anyActionPending
                }
              >
                Cobrar cliente
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/customers?customerId=${selectedOrder.customerId}`)
                }
                disabled={!selectedOrder.customerId}
              >
                Abrir cliente
              </Button>
            </div>
          </div>
        </AppSectionCard>
      ) : null}

      <AppSectionCard className="space-y-4 border-2 border-[var(--accent-primary)]/45 bg-[var(--surface-base)] p-0">
        <div className="border-b border-[var(--accent-primary)]/20 px-5 py-4 md:px-6">
          <p className="nexo-overline">
            Decisão e próxima ação · Próxima melhor ação
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] md:text-3xl">
            FAÇA AGORA: {serviceOrderNextBestAction.title}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {serviceOrderNextBestAction.reason}
          </p>
        </div>
        <div className="grid gap-3 px-5 md:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[var(--accent-primary)]/25 bg-[var(--surface-base)]/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Estado operacional
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {commandTarget
                ? `${commandTarget.statusLabel} · ${commandTarget.responsibleName} · ${commandTarget.dueDateLabel}.`
                : "Sem O.S. selecionada."}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Maior risco
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {commandTarget?.riskLabel ?? "Carteira sem foco operacional."}
            </p>
            <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
              Impacto:{" "}
              {commandTarget?.nextAction?.reason ??
                "Selecione ou crie uma O.S. para destravar a execução."}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              Nota: {serviceOrderNextBestAction.safetyNote}
            </p>
          </div>
        </div>
        <AppActionBar className="gap-2 border-t border-[var(--accent-primary)]/20 px-5 pb-5 pt-1 md:px-6">
          <div className="mr-auto max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Próxima ação
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Use apenas ações existentes da O.S., cliente, cobrança, timeline e
              WhatsApp.
            </p>
          </div>
          <Button
            size="lg"
            className="min-w-[220px] bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
            onClick={runCommandPrimaryAction}
          >
            {serviceOrderNextBestAction.primaryActionLabel}
          </Button>
          {serviceOrderNextBestAction.secondaryActionLabel ? (
            <Button variant="outline" onClick={runCommandSecondaryAction}>
              {serviceOrderNextBestAction.secondaryActionLabel}
            </Button>
          ) : null}
        </AppActionBar>
      </AppSectionCard>

      <AppSectionBlock
        title="Preparação da execução"
        subtitle="Checklist somente com dados carregados: cliente, responsável, agenda, execução, cobrança, timeline e WhatsApp."
        compact
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {executionPreparationItems.map(item => (
            <div
              key={item.label}
              className="flex min-h-[76px] items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2"
            >
              <div className="min-w-0">
                <span
                  className={cn(
                    "inline-flex h-2.5 w-2.5 rounded-full",
                    item.state === "ok"
                      ? "bg-[var(--success)]"
                      : item.state === "attention"
                        ? "bg-[var(--warning)]"
                        : "bg-[var(--text-muted)]"
                  )}
                  aria-hidden="true"
                />
                <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
                  {item.label}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {item.detail}
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

      {commandTarget ? (
        <EntityTimelineCard
          title="Timeline humanizada da O.S."
          subtitle={
            timeline.length > 0
              ? "Últimos eventos oficiais retornados pela Timeline."
              : "Sem Timeline oficial carregada; eventos contextuais usam apenas datas reais da O.S. e cobrança."
          }
          events={serviceOrderTimelineEvents}
          fullTimelineLabel="Abrir Timeline completa"
          onFullTimeline={() =>
            navigate(`/timeline?serviceOrderId=${commandTarget.id}`)
          }
        />
      ) : null}

      <OperationalFlowCard
        title="Pipeline operacional da O.S."
        subtitle="Cliente → Agendamento → O.S. → Execução → Cobrança → Pagamento"
        stages={serviceOrderFlowStages}
      />

      <AppSectionBlock
        title="Saúde operacional"
        subtitle="Resumo compacto; não compete com o hero nem com o bloco de decisão."
        compact
      >
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {operationalKpis.map(kpi => (
            <AppStatCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              helper={kpi.helper}
              delta={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveFilter(kpi.filter)}
                >
                  Ver carteira
                </Button>
              }
            />
          ))}
        </div>
      </AppSectionBlock>

      {[customersQuery, appointmentsQuery, chargesQuery, peopleQuery].some(
        query => Boolean(query.error)
      ) ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface-base))] p-4 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold text-[var(--text-primary)]">
              Dados auxiliares parcialmente indisponíveis
            </p>
            <p>
              A lista principal continua disponível. Cliente, responsável,
              agenda ou cobrança podem aparecer sem confirmação; isso não
              significa ausência saudável de pendências.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              void Promise.all([
                customersQuery.refetch(),
                appointmentsQuery.refetch(),
                chargesQuery.refetch(),
                peopleQuery.refetch(),
              ])
            }
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <AppFiltersBar className="shrink-0 gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
        <div className="min-w-[220px] flex-1">
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Buscar por código, cliente ou descrição"
            className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
          />
        </div>
        <label className="sr-only" htmlFor="service-order-customer-filter">
          Filtrar por cliente
        </label>
        <select
          id="service-order-customer-filter"
          value={customerFilter}
          onChange={event => setCustomerFilter(event.target.value)}
          className="h-9 max-w-[190px] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todos os clientes</option>
          {customers.map(customer => (
            <option key={customer.id} value={String(customer.id)}>
              {safeText(customer.name, "Cliente")}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="service-order-responsible-filter">
          Filtrar por responsável
        </label>
        <select
          id="service-order-responsible-filter"
          value={responsibleFilter}
          onChange={event => setResponsibleFilter(event.target.value)}
          className="h-9 max-w-[190px] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todos os responsáveis</option>
          <option value="unassigned">Sem responsável</option>
          {people.map(person => (
            <option key={person.id} value={String(person.id)}>
              {safeText(person.name, "Pessoa")}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="service-order-deadline-filter">
          Filtrar por prazo
        </label>
        <select
          id="service-order-deadline-filter"
          value={deadlineFilter}
          onChange={event =>
            setDeadlineFilter(event.target.value as DeadlineFilter)
          }
          className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todos os prazos</option>
          <option value="overdue">Atrasadas</option>
          <option value="no_deadline">Sem prazo</option>
        </select>
        <label className="sr-only" htmlFor="service-order-priority-filter">
          Filtrar por prioridade
        </label>
        <select
          id="service-order-priority-filter"
          value={priorityFilter}
          onChange={event =>
            setPriorityFilter(event.target.value as PriorityFilter)
          }
          className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm text-[var(--text-primary)]"
        >
          <option value="all">Todas as prioridades</option>
          <option value="P0">Prioridade P0</option>
          <option value="P1">Prioridade P1</option>
          <option value="P2">Prioridade P2</option>
          <option value="P3">Prioridade P3</option>
        </select>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "all", label: `Todas (${counts.all})` },
            { key: "open", label: `Abertas (${counts.open})` },
            { key: "in_progress", label: `Em andamento (${counts.progress})` },
            { key: "overdue", label: `Atrasadas (${counts.overdue})` },
            { key: "done", label: `Concluídas (${counts.done})` },
          ].map(filter => (
            <button
              key={filter.key}
              type="button"
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                activeFilter === filter.key
                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
              onClick={() => setActiveFilter(filter.key as ServiceOrdersFilter)}
            >
              {filter.label}
            </button>
          ))}
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Mais filtros
            </summary>
            <div className="absolute right-0 z-20 mt-2 grid min-w-[240px] gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <button
                type="button"
                className={cn(
                  "h-8 rounded-md border px-3 text-left text-xs font-medium transition-colors",
                  activeFilter === "without_charge"
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
                onClick={() => setActiveFilter("without_charge")}
              >
                Concluídas sem cobrança ({counts.doneWithoutCharge})
              </button>
            </div>
          </details>
        </div>
        <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">
          {filteredOrders.length} / {counts.all} O.S.
        </span>
      </AppFiltersBar>

      <div className="space-y-3">
        <AppSectionBlock
          title="Radar operacional"
          subtitle="Cliente, problema, próxima ação e CTA resolver."
          compact
        >
          {isLoading ? (
            <AppPageLoadingState description="Carregando alertas de O.S..." />
          ) : immediateAttention.length === 0 ? (
            <AppPageEmptyState
              title="Sem alerta imediato"
              description="Os dados retornados não indicam O.S. atrasada, sem responsável, concluída sem cobrança ou parada sem prazo."
            />
          ) : (
            <div className="grid max-h-[220px] gap-2 overflow-auto md:grid-cols-2 2xl:grid-cols-4">
              {immediateAttention.slice(0, 4).map(item => (
                <article
                  key={`attention-${item.id}`}
                  className={cn(
                    "rounded-lg border p-3",
                    item.nextAction?.type === "charge"
                      ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-subtle))]"
                      : item.isOverdue
                        ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-subtle))]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-subtle)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {item.customerName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {item.riskLabel}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {item.title} · {item.responsibleName} ·{" "}
                        {item.dueDateLabel}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => runPrimaryAction(item)}>
                      Resolver
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AppSectionBlock>

        <div className="flex flex-col gap-3">
          <AppSectionBlock
            title="Carteira operacional de O.S."
            subtitle="Cliente, serviço, status, responsável, prazo e ação principal em linhas operacionais selecionáveis."
            className="flex flex-col"
            compact
          >
            {isLoading ? (
              <AppPageLoadingState description="Carregando ordens de serviço..." />
            ) : hasBlockingError ? (
              <AppPageErrorState
                description={
                  serviceOrdersQuery.error?.message ??
                  "Falha ao carregar ordens de serviço."
                }
                actionLabel="Tentar novamente"
                onAction={() => void refreshEverything()}
              />
            ) : filteredOrders.length === 0 ? (
              <AppPageEmptyState
                title={
                  searchTerm.trim()
                    ? "Busca sem resultado"
                    : "Nenhuma ordem encontrada"
                }
                description={
                  searchTerm.trim()
                    ? "Ajuste o termo de busca ou os filtros para continuar."
                    : "Crie uma nova O.S. para iniciar o fluxo operacional."
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
                  {paginatedOrders.map(item => {
                    const isSelected = selectedOrder?.id === item.id;
                    return (
                      <article
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "rounded-xl border p-3 transition-colors hover:border-[var(--accent-primary)]/45",
                          isSelected
                            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]/35"
                            : "border-[var(--border-subtle)] bg-[var(--surface-subtle)]"
                        )}
                        onClick={() => setSelectedOrderId(item.id)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedOrderId(item.id);
                          }
                        }}
                      >
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.1fr_0.75fr_0.9fr_0.8fr_auto] lg:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {item.customerName}
                            </p>
                            <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                              Serviço: {item.title}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {item.decisionAvailable ? (
                              <>
                                <AppOperationalStatusBadge
                                  status={item.operationalStatus!}
                                  label={getStatusTone(
                                    item.status,
                                    item.isOverdue
                                  )}
                                />
                                <AppPriorityBadge
                                  priority={item.priority!}
                                  label={item.riskLabel}
                                />
                              </>
                            ) : (
                              <AppStatusBadge
                                label="Decisão indisponível"
                                tone="neutral"
                              />
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            <p className="font-medium text-[var(--text-primary)]">
                              {item.responsibleName}
                            </p>
                            <p>Prazo: {item.dueDateLabel}</p>
                            <p
                              className={cn(
                                item.isOverdue &&
                                  "font-semibold text-[var(--danger)]"
                              )}
                            >
                              Atraso: {item.overdueLabel}
                            </p>
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            <p className="font-medium text-[var(--text-primary)]">
                              {formatCurrency(item.amountCents)}
                            </p>
                            <p>{item.financialStatusLabel}</p>
                          </div>
                          <div
                            className="flex items-center justify-end gap-2"
                            onClick={event => event.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              onClick={() => runPrimaryAction(item)}
                            >
                              {item.nextAction?.label ?? "Decisão indisponível"}
                            </Button>
                            <AppRowActionsDropdown
                              triggerLabel="Ações da O.S."
                              items={[
                                {
                                  label: capabilities.start
                                    ? "Iniciar execução"
                                    : "Iniciar (indisponível)",
                                  tone: "primary",
                                  onSelect: () => void handleStart(item.id),
                                  disabled:
                                    !capabilities.start ||
                                    !["OPEN", "ASSIGNED"].includes(
                                      item.status
                                    ) ||
                                    anyActionPending,
                                },
                                {
                                  label: capabilities.complete
                                    ? "Concluir execução"
                                    : "Concluir (indisponível)",
                                  tone: "primary",
                                  onSelect: () => void handleComplete(item.id),
                                  disabled:
                                    !capabilities.complete ||
                                    item.status !== "IN_PROGRESS" ||
                                    anyActionPending,
                                },
                                {
                                  label: capabilities.generateCharge
                                    ? "Cobrar cliente"
                                    : "Cobrança (indisponível)",
                                  tone: "primary",
                                  onSelect: () =>
                                    void handleGenerateCharge(item.id),
                                  disabled:
                                    !capabilities.generateCharge ||
                                    item.nextAction?.type !== "charge" ||
                                    anyActionPending,
                                },
                                {
                                  label: "Editar O.S.",
                                  tone: "primary",
                                  onSelect: () => setEditingId(item.id),
                                  disabled: !capabilities.edit,
                                },
                                { type: "separator", label: "Navegação" },
                                {
                                  label: "Abrir O.S.",
                                  onSelect: () => setSelectedOrderId(item.id),
                                },
                                {
                                  label: "Enviar WhatsApp",
                                  onSelect: () =>
                                    goToWhatsAppServiceOrder(
                                      String(item.customerId ?? ""),
                                      String(item.id ?? "")
                                    ),
                                },
                                {
                                  label: "Abrir cliente",
                                  onSelect: () =>
                                    navigate(
                                      `/customers?customerId=${item.customerId}`
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
                <AppPagination
                  currentPage={currentPage}
                  totalItems={filteredOrders.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </AppSectionBlock>

          <AppSectionBlock
            title="Detalhe da O.S."
            subtitle="Status, cliente, serviço, responsável, prazo, ações, financeiro e timeline curta."
            className="flex flex-col"
            compact
          >
            {!selectedOrder ? (
              <AppPageEmptyState
                title="Selecione uma O.S."
                description="Ao selecionar, o painel mostra execução, cliente, agenda, cobrança e histórico."
              />
            ) : (
              <div className="space-y-3">
                <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]/35 p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Resumo
                  </p>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {selectedOrder.code} · {selectedOrder.title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {selectedOrder.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    {selectedOrder.decisionAvailable ? (
                      <AppOperationalStatusBadge
                        status={selectedOrder.operationalStatus!}
                        label={getStatusTone(
                          selectedOrder.status,
                          selectedOrder.isOverdue
                        )}
                      />
                    ) : (
                      <AppStatusBadge
                        label="Decisão indisponível"
                        tone="neutral"
                      />
                    )}
                    <span>Responsável: {selectedOrder.responsibleName}</span>
                    <span>Prazo: {selectedOrder.dueDateLabel}</span>
                  </div>
                </article>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    {
                      label: "Cliente",
                      value: selectedOrder.customerName,
                      detail: selectedOrder.customerId
                        ? "Cliente vinculado"
                        : "Sem cliente nos dados",
                    },
                    {
                      label: "Execução",
                      value: selectedOrder.statusLabel,
                      detail: selectedOrder.finishedAt
                        ? `Concluída em ${formatDate(selectedOrder.finishedAt)}`
                        : selectedOrder.startedAt
                          ? `Iniciada em ${formatDate(selectedOrder.startedAt)}`
                          : "Não iniciada",
                    },
                    {
                      label: "Financeiro",
                      value: selectedOrder.hasCharge
                        ? selectedOrder.financialStatusLabel
                        : "Sem cobrança",
                      detail: `Valor: ${formatCurrency(selectedOrder.amountCents)}`,
                    },
                    {
                      label: "Agendamento",
                      value: selectedOrder.linkedAppointment
                        ? "Agendamento vinculado"
                        : "Sem agendamento vinculado",
                      detail: selectedOrder.linkedAppointment
                        ? formatDate(selectedOrder.linkedAppointment?.startsAt)
                        : "Sem data de agenda",
                    },
                    {
                      label: "Governança/Timeline",
                      value:
                        serviceOrderTimelineEvents.length > 0
                          ? `${serviceOrderTimelineEvents.length} evento(s)`
                          : "Sem prova carregada",
                      detail: selectedOrder.riskLabel,
                    },
                  ].map(card => (
                    <article
                      key={card.label}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/70 p-3 text-sm"
                    >
                      <p className="text-xs uppercase text-[var(--text-muted)]">
                        {card.label}
                      </p>
                      <p className="mt-1 font-semibold text-[var(--text-primary)]">
                        {card.value}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {card.detail}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
                    <p className="text-xs uppercase text-[var(--text-muted)]">
                      Registros de execução
                    </p>
                    {executionsQuery.isLoading ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Carregando registros...
                      </p>
                    ) : executionsQuery.error ? (
                      <div className="mt-2 text-sm text-[var(--text-secondary)]">
                        <p>Registros temporariamente indisponíveis.</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void executionsQuery.refetch()}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    ) : normalizeArrayPayload<any>(executionsQuery.data)
                        .length ? (
                      <ul className="mt-2 space-y-2">
                        {normalizeArrayPayload<any>(executionsQuery.data)
                          .slice(0, 3)
                          .map((execution, index) => (
                            <li
                              key={`${String(execution?.id ?? "execution")}-${index}`}
                              className="rounded-md bg-[var(--surface-subtle)] p-2 text-xs text-[var(--text-secondary)]"
                            >
                              <span className="font-medium text-[var(--text-primary)]">
                                {getStatusLabel(
                                  String(execution?.status ?? "").toUpperCase()
                                )}
                              </span>{" "}
                              · início {formatDate(execution?.startedAt)} · fim{" "}
                              {formatDate(execution?.endedAt)}
                              {execution?.notes ? (
                                <p className="mt-1">
                                  {sanitizeOperationalText(execution.notes)}
                                </p>
                              ) : null}
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Nenhum registro de execução retornado.
                      </p>
                    )}
                  </article>
                  <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
                    <p className="text-xs uppercase text-[var(--text-muted)]">
                      Comunicação
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Abra a conversa contextual da O.S. para enviar a
                      atualização pelo fluxo canônico de WhatsApp.
                    </p>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      disabled={!selectedOrder.customerId}
                      onClick={() =>
                        goToWhatsAppServiceOrder(
                          selectedOrder.customerId,
                          selectedOrder.id
                        )
                      }
                    >
                      Abrir WhatsApp
                    </Button>
                  </article>
                </div>

                <EntityTimelineCard
                  title="Prova operacional da execução"
                  subtitle={
                    timelineQuery.isLoading
                      ? "Carregando últimos eventos oficiais da O.S."
                      : timeline.length > 0
                        ? "Últimos eventos oficiais da O.S. retornados pela Timeline."
                        : serviceOrderTimelineEvents.length > 0
                          ? "Fallback contextual com datas reais da O.S.; não substitui a Timeline oficial."
                          : "Sem Timeline oficial retornada e sem datas suficientes para fallback contextual."
                  }
                  events={serviceOrderTimelineEvents}
                  fullTimelineLabel="Abrir Timeline completa"
                  onFullTimeline={() =>
                    navigate(`/timeline?serviceOrderId=${selectedOrder.id}`)
                  }
                />

                <AppActionBar className="gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-2">
                  <Button
                    type="button"
                    title={getStartUnavailableReason(selectedOrder)}
                    aria-label={getStartUnavailableReason(selectedOrder)}
                    onClick={() => void handleStart(selectedOrder.id)}
                    isLoading={isPendingAction(selectedOrder.id, "start")}
                    loadingLabel="Iniciando..."
                    disabled={
                      !capabilities.start ||
                      !["OPEN", "ASSIGNED"].includes(selectedOrder.status) ||
                      anyActionPending
                    }
                  >
                    {capabilities.start ? "Iniciar" : "Iniciar (indisponível)"}
                  </Button>
                  <Button
                    type="button"
                    title={getCompleteUnavailableReason(selectedOrder)}
                    aria-label={getCompleteUnavailableReason(selectedOrder)}
                    onClick={() => void handleComplete(selectedOrder.id)}
                    isLoading={isPendingAction(selectedOrder.id, "complete")}
                    loadingLabel="Concluindo..."
                    disabled={
                      !capabilities.complete ||
                      selectedOrder.status !== "IN_PROGRESS" ||
                      anyActionPending
                    }
                  >
                    {capabilities.complete
                      ? "Concluir"
                      : "Concluir (indisponível)"}
                  </Button>
                  <Button
                    type="button"
                    title={getChargeUnavailableReason(selectedOrder)}
                    aria-label={getChargeUnavailableReason(selectedOrder)}
                    onClick={() => void handleGenerateCharge(selectedOrder.id)}
                    isLoading={isPendingAction(selectedOrder.id, "charge")}
                    loadingLabel="Gerando..."
                    disabled={
                      !capabilities.generateCharge ||
                      selectedOrder.nextAction?.type !== "charge" ||
                      anyActionPending
                    }
                  >
                    {capabilities.generateCharge
                      ? "Cobrar / Gerar cobrança"
                      : "Cobrança (indisponível)"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      goToWhatsAppServiceOrder(
                        String(selectedOrder.customerId ?? ""),
                        String(selectedOrder.id ?? "")
                      )
                    }
                  >
                    Enviar WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/customers?customerId=${selectedOrder.customerId}`
                      )
                    }
                  >
                    Abrir cliente
                  </Button>
                </AppActionBar>

                {actionFeedback ? (
                  <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    {actionFeedback}
                  </p>
                ) : null}
              </div>
            )}
          </AppSectionBlock>
        </div>
      </div>

      <CreateServiceOrderModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSuccess={() => void refreshEverything()}
        customers={customers.map(item => ({
          id: String(item?.id ?? ""),
          name: safeText(item?.name, "Cliente"),
        }))}
        people={people.map(item => ({
          id: String(item?.id ?? ""),
          name: safeText(item?.name, "Pessoa"),
        }))}
        appointmentId={urlAppointmentId || undefined}
        initialCustomerId={
          urlCustomerId || selectedOrder?.customerId || undefined
        }
      />

      <EditServiceOrderModal
        isOpen={Boolean(editingId)}
        onClose={() => setEditingId(null)}
        onSuccess={() => {
          setEditingId(null);
          void refreshEverything();
        }}
        serviceOrderId={editingId}
        people={people.map(item => ({
          id: String(item?.id ?? ""),
          name: safeText(item?.name, "Pessoa"),
        }))}
      />
    </AppPageShell>
  );
}

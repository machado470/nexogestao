import { useEffect, useMemo, useState } from "react";
import { compareOperationalPriority } from "@/lib/operational-prioritization";
import { aggregateOperationalHealth } from "@/lib/operational-health";
import {
  getAttentionSummary,
  getVisibleAttentionItems,
  type OperationalAttentionItem,
} from "@/lib/operational-attention";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreateChargeModal } from "@/components/CreateChargeModal";
import { FormModal } from "@/components/app-modal-system";
import {
  AppActionBar,
  AppFiltersBar,
  AppPageEmptyState,
  AppPageErrorState,
  AppOperationalHeader,
  AppPageLoadingState,
  AppPagination,
  AppSectionBlock,
} from "@/components/internal-page-system";
import {
  AppField,
  AppFieldGroup,
  AppFormSection,
  AppInfoCard,
  AppInput,
  AppOperationalStatusBadge,
  AppPageShell,
  AppRowActionsDropdown,
  AppSectionCard,
  AppSelect,
  AppStatusBadge,
  AppTextarea,
  type AppOperationalStatus,
  type AppPriorityLevel,
} from "@/components/app-system";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { cn } from "@/lib/utils";
import { safeDate } from "@/lib/operational/kpi";
import { trpc } from "@/lib/trpc";
import {
  EntityTimelineCard,
  NextBestActionCard,
  OperationalRiskCard,
  OperationalStateCard,
  type OperationalStateLevel,
} from "@/components/app/OperationalCommandLayer";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";

type ChargeRecord = Record<string, any>;
type StatusFilter = "all" | "pending" | "overdue" | "paid" | "canceled";

type PaymentMethod = "PIX" | "CASH" | "CARD" | "TRANSFER" | "OTHER";

const PAYMENT_METHOD_OPTIONS: Array<{ label: string; value: PaymentMethod }> = [
  { label: "PIX", value: "PIX" },
  { label: "Cartão", value: "CARD" },
  { label: "Transferência", value: "TRANSFER" },
  { label: "Dinheiro", value: "CASH" },
  { label: "Outro", value: "OTHER" },
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(value: unknown) {
  const date = safeDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "Sem data";
}

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function computeDaysOverdue(value: unknown) {
  const dueDate = safeDate(value);
  if (!dueDate) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor(
    (start.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(diff, 0);
}

function computeDaysUntilDue(value: unknown) {
  const dueDate = safeDate(value);
  if (!dueDate) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function latestPaymentMethod(charge: ChargeRecord): string {
  const payments = Array.isArray(charge?.payments) ? charge.payments : [];
  if (payments.length === 0) return "—";
  const sorted = [...payments].sort((a, b) => {
    const aTime = safeDate(a?.paidAt ?? a?.createdAt)?.getTime() ?? 0;
    const bTime = safeDate(b?.paidAt ?? b?.createdAt)?.getTime() ?? 0;
    return bTime - aTime;
  });
  return String(sorted[0]?.method ?? "—");
}

function getChargeStatusTone(
  status: string
): "warning" | "success" | "danger" | "neutral" {
  if (status === "PAID") return "success";
  if (status === "OVERDUE") return "danger";
  if (status === "CANCELED") return "neutral";
  return "warning";
}

function getFinanceOperationalStatus(
  overdueCount: number,
  pendingCount: number
): AppOperationalStatus {
  if (overdueCount >= 5) return "CRÍTICO";
  if (overdueCount > 0) return "RISCO";
  if (pendingCount > 0) return "ATENÇÃO";
  return "NORMAL";
}

function getChargePriority(charge: ChargeRecord): AppPriorityLevel {
  const status = normalizeStatus(charge?.status);
  const amountCents = Number(charge?.amountCents ?? 0);
  const overdueDays = Number(
    charge?.overdueDays ?? computeDaysOverdue(charge?.dueDate)
  );
  if (status === "OVERDUE" && (overdueDays >= 15 || amountCents >= 500000))
    return "P0";
  if (status === "OVERDUE") return "P1";
  if (status === "PENDING") {
    const dueDate = safeDate(charge?.dueDate);
    if (!dueDate) return "P2";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDue <= 3 ? "P2" : "P3";
  }
  return "P3";
}

function getHumanPriorityLabel(priority: AppPriorityLevel) {
  if (priority === "P0") return "Crítico";
  if (priority === "P1") return "Atenção";
  if (priority === "P2") return "Acompanhar";
  return "Informativo";
}

function chargeStatusLabel(status: string) {
  if (status === "OVERDUE") return "Vencida";
  if (status === "PAID") return "Paga";
  if (status === "CANCELED") return "Cancelada";
  return "Pendente";
}

function statusMatchesFilter(status: string, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return status === "PENDING";
  if (filter === "overdue") return status === "OVERDUE";
  if (filter === "paid") return status === "PAID";
  if (filter === "canceled") return status === "CANCELED";
  return true;
}

function safeText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

const RAW_TECHNICAL_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b[0-9a-f]{24,}\b|EXECUTION_STARTED|EXECUTION_EXECUTED|action-send-overdue-charge-reminder|action-create-charge-followup|eventType|endpoint|BFF|backend|payload|metadata|pending|executed|started/gi;

function sanitizeFinancialText(
  value: unknown,
  fallback = "Informação financeira registrada"
) {
  const text = safeText(value, fallback)
    .replace(RAW_TECHNICAL_PATTERN, "")
    .replace(/\|/g, " ")
    .replace(/=>/g, " ")
    .trim();
  return text.length > 0 ? text : fallback;
}

function humanizeFinancialTimelineEvent(item: Record<string, any>) {
  const source =
    `${item?.type ?? ""} ${item?.category ?? ""} ${item?.title ?? ""} ${item?.description ?? ""}`.toLowerCase();
  if (source.includes("paid") || source.includes("pagamento"))
    return "Pagamento registrado";
  if (source.includes("cancel")) return "Cobrança atualizada";
  if (source.includes("reminder") || source.includes("lembrete")) {
    return source.includes("sent") || source.includes("enviad")
      ? "Lembrete enviado"
      : "Lembrete preparado";
  }
  if (source.includes("action") || source.includes("ação"))
    return "Ação financeira registrada";
  if (source.includes("sent") || source.includes("enviad"))
    return "Lembrete enviado";
  if (source.includes("created") || source.includes("criad"))
    return "Cobrança criada";
  if (source.includes("prepared") || source.includes("prepar"))
    return "Lembrete preparado";
  if (source.includes("updated") || source.includes("atualiz"))
    return "Cobrança atualizada";
  if (source.includes("followup") || source.includes("acompanh"))
    return "Cobrança acompanhada";
  if (source.includes("charge") || source.includes("cobran"))
    return "Cobrança acompanhada";
  return "Evento financeiro registrado";
}

function getFinancialBusinessLabel(
  value: unknown,
  fallback = "Origem não informada pela fonte atual"
) {
  const text = sanitizeFinancialText(value, "");
  if (!text) return fallback;
  return text;
}

function safeFinancialEntityName(
  value: unknown,
  fallback = "Cliente não identificado"
) {
  return sanitizeFinancialText(value, fallback);
}

function getServiceOrderBusinessLabel(charge: ChargeRecord) {
  if (charge?.serviceOrderId || charge?.serviceOrder) return "O.S. vinculada";
  if ("serviceOrderId" in charge || "serviceOrder" in charge)
    return "Sem O.S. vinculada";
  return "Origem não informada pela fonte atual";
}

function getChargePrimaryAction(charge: ChargeRecord) {
  const status = normalizeStatus(charge?.status);
  if (status === "OVERDUE") {
    return {
      label: "Cobrar agora",
      reason: "Cobrança vencida precisa de ação",
      kind: "collect" as const,
    };
  }
  if (status === "PENDING") {
    return {
      label: "Enviar link",
      reason: "Pendência ativa antes de virar atraso",
      kind: "collect" as const,
    };
  }
  if (status === "PAID") {
    return {
      label: "Ver recebimento",
      reason: "Pagamento já confirmado",
      kind: "detail" as const,
    };
  }
  return {
    label: "Revisar",
    reason: "Status exige conferência",
    kind: "detail" as const,
  };
}

function getChargeRisk(charge: ChargeRecord) {
  const status = normalizeStatus(charge?.status);
  if (status === "OVERDUE")
    return `Risco alto · ${Number(charge?.overdueDays ?? 0)} dia(s) em atraso`;
  if (status === "PENDING" && !safeDate(charge?.dueDate))
    return "Pendência: sem vencimento confiável";
  if (status === "PENDING")
    return "Risco monitorado · cobrar antes do vencimento";
  if (status === "PAID") return "Sem risco financeiro imediato";
  if (status === "CANCELED") return "Cancelada · sem ação de cobrança";
  return "Revisar dados da cobrança";
}

function hasRegisteredPayment(charge: ChargeRecord) {
  if (normalizeStatus(charge?.status) !== "PAID") return true;
  return Array.isArray(charge?.payments) && charge.payments.length > 0;
}

function getContactAvailability(charge: ChargeRecord) {
  const customer = charge?.customer ?? {};
  const hasAnyContact = Boolean(
    customer?.phone ||
    customer?.whatsapp ||
    customer?.whatsappPhone ||
    charge?.customerPhone ||
    charge?.phone
  );
  const hasWhatsApp = Boolean(
    customer?.whatsapp ||
    customer?.whatsappPhone ||
    charge?.whatsapp ||
    charge?.whatsappPhone ||
    customer?.phone ||
    charge?.customerPhone
  );
  if (hasWhatsApp) return "WhatsApp disponível";
  if (hasAnyContact) return "Contato cadastrado";
  return "Sem contato retornado";
}

function getPipelineStages(charges: ChargeRecord[]) {
  const actionable = charges.filter(item =>
    ["PENDING", "OVERDUE"].includes(item.status)
  );
  const sent = actionable.filter(
    item => getCommunicationState(item) === "sent"
  ).length;
  const unknownCommunication = actionable.filter(
    item => getCommunicationState(item) === "unknown"
  ).length;
  const contactable = actionable.filter(
    item => getContactAvailability(item) !== "Sem contato retornado"
  ).length;
  const paid = charges.filter(item => item.status === "PAID").length;
  const overdue = charges.filter(item => item.status === "OVERDUE").length;
  const pending = charges.filter(item => item.status === "PENDING").length;

  return [
    {
      stage: "Cliente",
      represents: "Origem da cobrança",
      state:
        charges.length > 0
          ? `${charges.length} cliente(s) com cobrança`
          : "Sem carteira carregada",
      consequence:
        charges.length > 0
          ? "Carteira pronta para priorização."
          : "Carregue a carteira para decidir.",
      bottleneck: charges.length === 0,
    },
    {
      stage: "Cobrança",
      represents: "Valor a converter",
      state:
        actionable.length > 0
          ? `${actionable.length} cobrança(s) ativa(s)`
          : "Sem cobrança ativa",
      consequence:
        overdue > 0
          ? "Atraso exige ação imediata."
          : "Pendências seguem monitoradas.",
      bottleneck: overdue > 0,
    },
    {
      stage: "Envio",
      represents: "Comunicação registrada",
      state:
        sent > 0
          ? `${sent} envio(s) identificado(s)`
          : unknownCommunication > 0
            ? "Histórico não retornado"
            : "Sem envio registrado",
      consequence:
        sent > 0
          ? "Continue pelo contexto existente."
          : "Use WhatsApp contextual, sem automação falsa.",
      bottleneck: actionable.length > 0 && sent === 0,
    },
    {
      stage: "Contato",
      represents: "Canal acionável",
      state:
        contactable > 0
          ? `${contactable} contato(s) acionável(is)`
          : "Contato não retornado",
      consequence:
        contactable > 0
          ? "Cobrança pode seguir pelo CTA real."
          : "Conferir cadastro antes de cobrar.",
      bottleneck: actionable.length > 0 && contactable === 0,
    },
    {
      stage: "Pagamento",
      represents: "Confirmação financeira",
      state:
        paid > 0
          ? `${paid} pagamento(s) registrado(s)`
          : "Aguardando pagamento",
      consequence:
        pending > 0 || overdue > 0
          ? "Recebimento ainda precisa acontecer."
          : "Sem bloqueio de pagamento ativo.",
      bottleneck: actionable.length > 0 && paid === 0,
    },
    {
      stage: "Recebimento",
      represents: "Entrada no caixa",
      state: paid > 0 ? "Receita reconhecida" : "Recebimento pendente",
      consequence:
        paid > 0
          ? "Execução já virou receita."
          : "Caixa depende das etapas anteriores.",
      bottleneck: actionable.length > 0 && paid === 0,
    },
  ];
}

function getCommunicationState(charge: ChargeRecord) {
  const communicationFields = [
    charge?.whatsappSentAt,
    charge?.lastWhatsappSentAt,
    charge?.reminderSentAt,
    charge?.lastReminderAt,
    charge?.paymentLinkSentAt,
    charge?.messageSentAt,
  ];

  if (communicationFields.some(Boolean)) return "sent" as const;
  if (
    "whatsappSentAt" in charge ||
    "lastWhatsappSentAt" in charge ||
    "reminderSentAt" in charge ||
    "lastReminderAt" in charge
  ) {
    return "not_sent" as const;
  }
  return "unknown" as const;
}

export default function FinancesPage() {
  const [location, navigate] = useLocation();
  const [openCreate, setOpenCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const _operationalSeverityContract: OperationalSeverity = "healthy";
  void _operationalSeverityContract;
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [openPayModalFor, setOpenPayModalFor] = useState<ChargeRecord | null>(
    null
  );
  const [openEditModalFor, setOpenEditModalFor] = useState<ChargeRecord | null>(
    null
  );
  const [payMethod, setPayMethod] = useState<PaymentMethod>("PIX");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const queryParams = useMemo(() => {
    const url = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(url);
    return {
      customerId: params.get("customerId") ?? "",
      serviceOrderId: params.get("serviceOrderId") ?? "",
      chargeId: params.get("chargeId") ?? "",
    };
  }, [location]);

  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const operationalQueueQuery = trpc.finance.operationalQueue.useQuery(
    { limit: 50 },
    { retry: false }
  );
  const customersQuery = trpc.nexo.customers.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const serviceOrdersQuery = trpc.nexo.serviceOrders.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );

  const markPaidMutation = trpc.finance.charges.pay.useMutation();
  const cancelMutation = trpc.finance.charges.cancel.useMutation();
  const editMutation = trpc.finance.charges.update.useMutation();

  const charges = useMemo(
    () => normalizeArrayPayload<ChargeRecord>(chargesQuery.data),
    [chargesQuery.data]
  );
  const operationalQueue = useMemo(
    () => normalizeArrayPayload<any>(operationalQueueQuery.data),
    [operationalQueueQuery.data]
  );
  const customers = useMemo(
    () => normalizeArrayPayload<any>(customersQuery.data),
    [customersQuery.data]
  );
  const serviceOrders = useMemo(
    () => normalizeArrayPayload<any>(serviceOrdersQuery.data),
    [serviceOrdersQuery.data]
  );

  const customerById = useMemo(
    () => new Map(customers.map(item => [String(item?.id ?? ""), item])),
    [customers]
  );

  const serviceOrderById = useMemo(
    () => new Map(serviceOrders.map(item => [String(item?.id ?? ""), item])),
    [serviceOrders]
  );

  const allQueriesLoading =
    chargesQuery.isLoading ||
    customersQuery.isLoading ||
    serviceOrdersQuery.isLoading;
  const allQueriesErrored = Boolean(chargesQuery.error && charges.length === 0);

  const enrichedCharges = useMemo<ChargeRecord[]>(() => {
    return charges.map((charge: ChargeRecord) => {
      const customerId = String(
        charge?.customerId ?? charge?.customer?.id ?? ""
      );
      const serviceOrderId = String(
        charge?.serviceOrderId ?? charge?.serviceOrder?.id ?? ""
      );
      const status = normalizeStatus(charge?.status);
      const customer = charge?.customer ?? customerById.get(customerId) ?? null;
      const serviceOrder =
        charge?.serviceOrder ?? serviceOrderById.get(serviceOrderId) ?? null;
      const overdueDays =
        status === "OVERDUE" ? computeDaysOverdue(charge?.dueDate) : 0;

      return {
        ...charge,
        status,
        customerId,
        serviceOrderId,
        customer,
        serviceOrder,
        customerName: String(
          safeFinancialEntityName(customer?.name ?? charge?.customerName)
        ),
        serviceOrderLabel: String(
          serviceOrder?.number
            ? `O.S. ${serviceOrder.number}`
            : getServiceOrderBusinessLabel({
                ...charge,
                serviceOrderId,
                serviceOrder,
              })
        ),
        overdueDays,
      } as ChargeRecord;
    });
  }, [charges, customerById, serviceOrderById]);

  const scopedCharges = useMemo(() => {
    return enrichedCharges.filter(charge => {
      if (
        queryParams.customerId &&
        charge.customerId !== queryParams.customerId
      )
        return false;
      if (
        queryParams.serviceOrderId &&
        charge.serviceOrderId !== queryParams.serviceOrderId
      )
        return false;
      return true;
    });
  }, [enrichedCharges, queryParams.customerId, queryParams.serviceOrderId]);

  const filteredCharges = useMemo(() => {
    const filtered = scopedCharges.filter(charge => {
      if (!statusMatchesFilter(charge.status, statusFilter)) return false;
      const source =
        `${charge.customerName} ${charge.serviceOrderLabel} ${charge.status} ${charge.id ?? ""}`.toLowerCase();
      if (
        searchTerm.trim() &&
        !source.includes(searchTerm.toLowerCase().trim())
      )
        return false;
      return true;
    });

    return [...filtered].sort((a, b) =>
      compareOperationalPriority(
        {
          severity:
            a.status === "OVERDUE"
              ? "WARNING"
              : a.status === "PENDING"
                ? "ATTENTION"
                : "NORMAL",
          dueDate: a.dueDate,
          amountCents: Number(a.amountCents ?? 0),
        },
        {
          severity:
            b.status === "OVERDUE"
              ? "WARNING"
              : b.status === "PENDING"
                ? "ATTENTION"
                : "NORMAL",
          dueDate: b.dueDate,
          amountCents: Number(b.amountCents ?? 0),
        }
      )
    );
  }, [scopedCharges, searchTerm, statusFilter]);
  const paginatedCharges = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCharges.slice(start, start + pageSize);
  }, [currentPage, filteredCharges, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    statusFilter,
    queryParams.customerId,
    queryParams.serviceOrderId,
  ]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredCharges.length / pageSize)
    );
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, filteredCharges.length, pageSize]);

  const hasFiltersContext = Boolean(
    queryParams.customerId || queryParams.serviceOrderId
  );

  const health = useMemo(() => {
    const received = enrichedCharges
      .filter(item => item.status === "PAID")
      .reduce((acc, item) => acc + Number(item?.amountCents ?? 0), 0);
    const receivable = enrichedCharges
      .filter(item => item.status === "PENDING")
      .reduce((acc, item) => acc + Number(item?.amountCents ?? 0), 0);
    const overdue = enrichedCharges
      .filter(item => item.status === "OVERDUE")
      .reduce((acc, item) => acc + Number(item?.amountCents ?? 0), 0);
    const now = Date.now();
    const nextThirtyDays = now + 1000 * 60 * 60 * 24 * 30;
    const projected = enrichedCharges
      .filter(item => {
        if (!["PENDING", "OVERDUE"].includes(item.status)) return false;
        const due = safeDate(item?.dueDate)?.getTime();
        if (!due) return false;
        return due <= nextThirtyDays;
      })
      .reduce((acc, item) => acc + Number(item?.amountCents ?? 0), 0);

    return { received, receivable, overdue, projected };
  }, [enrichedCharges]);

  const operationalHealth = useMemo(
    () =>
      aggregateOperationalHealth({
        charges: enrichedCharges,
        payments: enrichedCharges.flatMap(item =>
          Array.isArray(item.payments) ? item.payments : []
        ),
        serviceOrders,
      }),
    [enrichedCharges, serviceOrders]
  );

  const highlightedFinancialAttention = useMemo(
    () =>
      getVisibleAttentionItems(
        enrichedCharges
          .filter(item => item.status === "OVERDUE")
          .map(
            item =>
              ({
                ...item,
                key: String(item.id ?? ""),
                domain: "finances",
                type: "overdue_charge",
                severity: "WARNING",
                amountCents: Number(item.amountCents ?? 0),
              }) as OperationalAttentionItem
          ),
        2
      ),
    [enrichedCharges]
  );
  const highlightedFinancialSummary = useMemo(
    () => getAttentionSummary(highlightedFinancialAttention),
    [highlightedFinancialAttention]
  );

  useEffect(() => {
    if (queryParams.chargeId) {
      setSelectedChargeId(queryParams.chargeId);
      return;
    }

    if (!selectedChargeId && filteredCharges.length > 0) {
      setSelectedChargeId(String(filteredCharges[0]?.id ?? ""));
    }
  }, [filteredCharges, queryParams.chargeId, selectedChargeId]);

  const selectedCharge = useMemo(() => {
    if (!selectedChargeId) return null;
    return (
      enrichedCharges.find(
        item => String(item?.id ?? "") === selectedChargeId
      ) ?? null
    );
  }, [enrichedCharges, selectedChargeId]);

  const selectedChargeDetailsQuery = trpc.finance.charges.getById.useQuery(
    { id: String(selectedChargeId ?? "") },
    { enabled: Boolean(selectedChargeId), retry: false }
  );

  const selectedFinancialRecord = useMemo(() => {
    const detailed = selectedChargeDetailsQuery.data as
      | ChargeRecord
      | undefined;
    return { ...(selectedCharge ?? {}), ...(detailed ?? {}) } as ChargeRecord;
  }, [selectedCharge, selectedChargeDetailsQuery.data]);

  const timelineByCustomerQuery = trpc.nexo.timeline.listByCustomer.useQuery(
    { customerId: String(selectedCharge?.customerId ?? ""), limit: 20 },
    { enabled: Boolean(selectedCharge?.customerId), retry: false }
  );

  const timelineByServiceOrderQuery =
    trpc.nexo.timeline.listByServiceOrder.useQuery(
      {
        serviceOrderId: String(selectedCharge?.serviceOrderId ?? ""),
        limit: 20,
      },
      { enabled: Boolean(selectedCharge?.serviceOrderId), retry: false }
    );

  const timelineItems = useMemo(() => {
    const customerTimeline = normalizeArrayPayload<any>(
      timelineByCustomerQuery.data
    );
    const serviceOrderTimeline = normalizeArrayPayload<any>(
      timelineByServiceOrderQuery.data
    );
    const combined = [...customerTimeline, ...serviceOrderTimeline];
    const unique = new Map<string, any>();

    for (const item of combined) {
      const key = String(
        item?.id ?? `${item?.createdAt ?? ""}-${item?.title ?? ""}`
      );
      if (!unique.has(key)) unique.set(key, item);
    }

    return Array.from(unique.values())
      .sort((a, b) => {
        const aTime = safeDate(a?.createdAt)?.getTime() ?? 0;
        const bTime = safeDate(b?.createdAt)?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [timelineByCustomerQuery.data, timelineByServiceOrderQuery.data]);

  const hasSearchNoResults =
    Boolean(searchTerm.trim()) && filteredCharges.length === 0;
  const paymentsListAvailable = false;

  const pipelineStages = useMemo(
    () => getPipelineStages(enrichedCharges),
    [enrichedCharges]
  );
  const pipelineBottleneck =
    pipelineStages.find(stage => stage.bottleneck) ??
    pipelineStages[pipelineStages.length - 1];

  const completedOrdersWithoutCharge = useMemo(() => {
    const chargedOrderIds = new Set(
      enrichedCharges
        .map(charge => String(charge?.serviceOrderId ?? ""))
        .filter(Boolean)
    );

    return serviceOrders.filter(order => {
      const status = normalizeStatus(order?.status);
      const orderId = String(order?.id ?? "");
      return status === "DONE" && orderId && !chargedOrderIds.has(orderId);
    });
  }, [enrichedCharges, serviceOrders]);

  const cashHealth = useMemo(() => {
    const paidCount = enrichedCharges.filter(
      item => item.status === "PAID"
    ).length;
    const pendingCount = enrichedCharges.filter(
      item => item.status === "PENDING"
    ).length;
    const overdueCount = enrichedCharges.filter(
      item => item.status === "OVERDUE"
    ).length;
    const pendingAmount = health.receivable;
    const riskAmount = health.overdue;
    const collectionBottleneck = (() => {
      if (overdueCount > 0)
        return `${overdueCount} cobrança(s) vencida(s) travando recebimento`;
      if (completedOrdersWithoutCharge.length > 0)
        return `${completedOrdersWithoutCharge.length} O.S. concluída(s) sem cobrança`;
      if (pendingCount > paidCount)
        return "Mais pendências abertas do que recebimentos confirmados";
      return "Fluxo cobrança → pagamento sem gargalo crítico";
    })();

    return {
      paidCount,
      pendingCount,
      overdueCount,
      pendingAmount,
      riskAmount,
      collectionBottleneck,
    };
  }, [
    completedOrdersWithoutCharge.length,
    enrichedCharges,
    health.overdue,
    health.receivable,
  ]);

  const financeOperationalStatus = getFinanceOperationalStatus(
    cashHealth.overdueCount,
    cashHealth.pendingCount
  );

  const paidWithoutRegisteredPayment = useMemo(
    () => enrichedCharges.filter(item => !hasRegisteredPayment(item)),
    [enrichedCharges]
  );

  const mostCriticalCharge = useMemo(() => {
    const candidates = enrichedCharges.filter(item =>
      ["PENDING", "OVERDUE"].includes(item.status)
    );
    if (candidates.length === 0) return null;

    return [...candidates].sort((a, b) => {
      if (a.status !== b.status) return a.status === "OVERDUE" ? -1 : 1;
      const overdueDiff =
        Number(b.overdueDays ?? 0) - Number(a.overdueDays ?? 0);
      if (overdueDiff !== 0) return overdueDiff;
      return Number(b.amountCents ?? 0) - Number(a.amountCents ?? 0);
    })[0];
  }, [enrichedCharges]);

  const financeCommandState = useMemo(() => {
    const overdueCharges = enrichedCharges.filter(
      item => item.status === "OVERDUE"
    );
    const pendingCharges = enrichedCharges.filter(
      item => item.status === "PENDING"
    );
    const dueSoonCount = pendingCharges.filter(item => {
      const daysUntilDue = computeDaysUntilDue(item.dueDate);
      return daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
    }).length;
    const largestOverdueDays = overdueCharges.reduce(
      (max, item) => Math.max(max, Number(item.overdueDays ?? 0)),
      0
    );
    const averageOverdueDays = overdueCharges.length
      ? Math.round(
          overdueCharges.reduce(
            (sum, item) => sum + Number(item.overdueDays ?? 0),
            0
          ) / overdueCharges.length
        )
      : 0;
    const hasMaterialOverdue =
      health.overdue >= 100000 || overdueCharges.length >= 2;
    const level: OperationalStateLevel =
      overdueCharges.length > 0 &&
      (hasMaterialOverdue || pendingCharges.length > 1)
        ? "RESTRICTED"
        : overdueCharges.length > 0 ||
            dueSoonCount > 0 ||
            pendingCharges.length > 0
          ? "WARNING"
          : "NORMAL";
    const reason = (() => {
      if (overdueCharges.length > 0) {
        return `${overdueCharges.length} cobrança(s) vencida(s) somando ${formatCurrency(health.overdue)}; maior atraso de ${largestOverdueDays} dia(s).`;
      }
      if (dueSoonCount > 0)
        return `${dueSoonCount} cobrança(s) pendente(s) vencem em até 3 dias.`;
      if (pendingCharges.length > 0)
        return `${pendingCharges.length} cobrança(s) pendente(s) ainda precisam virar pagamento.`;
      if (paidWithoutRegisteredPayment.length > 0)
        return `${paidWithoutRegisteredPayment.length} cobrança(s) paga(s) sem pagamento vinculado na lista carregada.`;
      return "Sem vencidas ou pendências relevantes nos dados financeiros carregados.";
    })();
    const impact = (() => {
      if (overdueCharges.length > 0)
        return "Dinheiro travado impacta caixa, priorização da Timeline e leitura de Risco/Governança.";
      if (pendingCharges.length > 0)
        return "A cobrança preventiva evita atraso e mantém o fluxo Cobrança → Pagamento com prova operacional.";
      return "Operação pode manter rotina preventiva e revisar carteira sem bloqueio financeiro imediato.";
    })();

    return {
      level,
      reason,
      impact,
      overdueCharges,
      pendingCharges,
      dueSoonCount,
      largestOverdueDays,
      averageOverdueDays,
    };
  }, [enrichedCharges, health.overdue, paidWithoutRegisteredPayment.length]);

  const financeRisk = useMemo(() => {
    const critical = mostCriticalCharge;
    if (!critical) {
      return {
        title: "Sem risco financeiro dominante",
        reason:
          "Não há cobrança vencida ou pendente crítica nos dados carregados.",
        impact:
          "Caixa sem bloqueio imediato; mantenha revisão preventiva da carteira e da Timeline.",
      };
    }

    if (critical.status === "OVERDUE") {
      return {
        title: `${formatCurrency(Number(critical.amountCents ?? 0))} travados em ${critical.customerName}`,
        reason: `${financeCommandState.overdueCharges.length} cobrança(s) vencida(s), ${formatCurrency(health.overdue)} em atraso, média de ${financeCommandState.averageOverdueDays} dia(s) e maior atraso de ${financeCommandState.largestOverdueDays} dia(s).`,
        impact: `Priorizar ${critical.customerName} reduz risco de caixa e alimenta Timeline/Risco/Governança com ação comprovável.`,
      };
    }

    return {
      title: `Pendência próxima: ${critical.customerName}`,
      reason: `${formatCurrency(Number(critical.amountCents ?? 0))} ainda pendente para ${formatDate(critical.dueDate)}; ${financeCommandState.dueSoonCount} vencimento(s) próximo(s).`,
      impact:
        "Enviar link/lembrar antes do vencimento reduz chance de dinheiro ficar travado.",
    };
  }, [financeCommandState, health.overdue, mostCriticalCharge]);

  const financeNextBestAction = useMemo(() => {
    const overdue = enrichedCharges.filter(item => item.status === "OVERDUE");
    const pendingDueSoon = enrichedCharges.filter(item => {
      if (item.status !== "PENDING") return false;
      const daysUntilDue = computeDaysUntilDue(item.dueDate);
      return daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
    });

    const target =
      [...overdue].sort((a, b) => {
        const amountDiff =
          Number(b.amountCents ?? 0) - Number(a.amountCents ?? 0);
        if (amountDiff !== 0) return amountDiff;
        return Number(b.overdueDays ?? 0) - Number(a.overdueDays ?? 0);
      })[0] ??
      [...pendingDueSoon].sort((a, b) => {
        const aDue = safeDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = safeDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      })[0] ??
      paidWithoutRegisteredPayment[0] ??
      null;

    if (target?.status === "OVERDUE") {
      return {
        target,
        title: "Cobrar cliente",
        entity: `${target.customerName} · ${formatCurrency(Number(target.amountCents ?? 0))}`,
        reason: `Cobrança vencida há ${target.overdueDays} dia(s), com origem operacional: ${getServiceOrderBusinessLabel(target)}.`,
        impact:
          "Destravar recebimento e registrar ação que sustenta caixa, Timeline e Governança.",
        safetyNote:
          "Orientação apenas: não envia mensagem nem registra pagamento automaticamente.",
        primaryActionLabel: "Cobrar no WhatsApp contextual",
        secondaryActionLabel: "Filtrar vencidas",
      };
    }

    if (target?.status === "PENDING") {
      return {
        target,
        title: "Enviar link de pagamento",
        entity: `${target.customerName} · vence ${formatDate(target.dueDate)}`,
        reason: `${formatCurrency(Number(target.amountCents ?? 0))} pendente antes de virar atraso.`,
        impact:
          "Aumenta previsibilidade de caixa e evita entrada no fluxo restrito.",
        safetyNote:
          "Use apenas os CTAs existentes; nenhum fluxo novo de WhatsApp foi criado.",
        primaryActionLabel: "Abrir WhatsApp contextual",
        secondaryActionLabel: "Filtrar pendentes",
      };
    }

    if (target) {
      return {
        target,
        title: "Revisar recebimento",
        entity: `${target.customerName} · cobrança paga`,
        reason: "Status pago sem pagamento vinculado na lista carregada.",
        impact:
          "Evita divergência entre cobrança, pagamento e prova operacional.",
        safetyNote:
          "Fallback seguro: confirmar detalhe antes de qualquer ajuste.",
        primaryActionLabel: "Conferir cobrança",
        secondaryActionLabel: "Ver pagas",
      };
    }

    if (completedOrdersWithoutCharge.length > 0) {
      const order = completedOrdersWithoutCharge[0];
      return {
        target: null,
        title: "Gerar cobrança",
        entity: `O.S. ${safeText(order?.number ?? order?.id, "concluída")}`,
        reason: `${completedOrdersWithoutCharge.length} O.S. concluída(s) ainda não viraram cobrança nos dados carregados.`,
        impact: "Transforma operação concluída em receita rastreável.",
        safetyNote: "Ação orientativa; use o fluxo existente de nova cobrança.",
        primaryActionLabel: "Criar cobrança",
        secondaryActionLabel: "Abrir O.S.",
      };
    }

    return {
      target: null,
      title: "Revisar carteira financeira",
      entity: `${enrichedCharges.length} cobrança(s) monitorada(s)`,
      reason: "Sem pendência crítica nos dados financeiros carregados.",
      impact:
        "Mantém governança preventiva sobre cobrança, pagamento e Timeline.",
      safetyNote:
        "Nenhuma execução automática; apenas direcionamento para revisão.",
      primaryActionLabel: "Ver carteira",
      secondaryActionLabel: undefined,
    };
  }, [
    completedOrdersWithoutCharge,
    enrichedCharges,
    paidWithoutRegisteredPayment,
  ]);

  const financeTimelineEvents = useMemo(() => {
    if (timelineItems.length > 0) {
      return timelineItems.slice(0, 4).map((item, index) => ({
        id: `timeline-${index}`,
        type: humanizeFinancialTimelineEvent(item),
        occurredAt: formatDate(item?.createdAt),
        entity: sanitizeFinancialText(
          item?.title ?? item?.description,
          "Evento financeiro registrado"
        ),
        actor: item?.actor?.name ?? item?.user?.name ?? undefined,
        summary: sanitizeFinancialText(
          item?.description ?? item?.summary,
          "Evento financeiro registrado na Timeline."
        ),
      }));
    }

    const contextualEvents: Array<{
      id: string;
      type: string;
      occurredAt: string;
      entity: string;
      summary: string;
    }> = [];
    if (selectedFinancialRecord?.id) {
      contextualEvents.push({
        id: "charge-contextual",
        type: "Cobrança acompanhada",
        occurredAt: formatDate(
          selectedFinancialRecord.createdAt ?? selectedFinancialRecord.dueDate
        ),
        entity: `${safeText(selectedFinancialRecord.customerName, "Cliente")} · ${formatCurrency(Number(selectedFinancialRecord.amountCents ?? 0))}`,
        summary: `Cobrança ${chargeStatusLabel(selectedFinancialRecord.status)} derivada dos dados financeiros carregados; não substitui a Timeline oficial.`,
      });
    }
    const payments = Array.isArray(selectedFinancialRecord?.payments)
      ? selectedFinancialRecord.payments
      : [];
    for (const payment of payments.slice(0, 3)) {
      contextualEvents.push({
        id: `payment-contextual-${contextualEvents.length}`,
        type: "Pagamento registrado",
        occurredAt: formatDate(payment?.paidAt ?? payment?.createdAt),
        entity: `${safeText(selectedFinancialRecord.customerName, "Cliente")} · ${formatCurrency(Number(payment?.amountCents ?? 0))}`,
        summary: `Pagamento retornado no detalhe da cobrança com método ${safeText(payment?.method)}.`,
      });
    }
    return contextualEvents.slice(0, 4);
  }, [selectedFinancialRecord, timelineItems]);

  const filterTabs = useMemo(
    () => [
      {
        key: "all" as const,
        label: `Todas (${scopedCharges.length})`,
      },
      {
        key: "pending" as const,
        label: `Pendentes (${
          scopedCharges.filter(item => item.status === "PENDING").length
        })`,
      },
      {
        key: "overdue" as const,
        label: `Vencidas (${
          scopedCharges.filter(item => item.status === "OVERDUE").length
        })`,
      },
      {
        key: "paid" as const,
        label: `Pagas (${
          scopedCharges.filter(item => item.status === "PAID").length
        })`,
      },
      {
        key: "canceled" as const,
        label: `Canceladas (${
          scopedCharges.filter(item => item.status === "CANCELED").length
        })`,
      },
    ],
    [scopedCharges]
  );

  const immediateAttentionItems = useMemo(() => {
    const overdueCharges = enrichedCharges.filter(
      item => item.status === "OVERDUE"
    );
    const pendingWithoutWhatsApp = enrichedCharges.filter(item => {
      if (!["PENDING", "OVERDUE"].includes(item.status)) return false;
      return getCommunicationState(item) === "not_sent";
    });
    const communicationUnknownCount = enrichedCharges.filter(item => {
      if (!["PENDING", "OVERDUE"].includes(item.status)) return false;
      return getCommunicationState(item) === "unknown";
    }).length;

    return [
      {
        key: "overdue",
        title: "Cobrança vencida",
        value: String(highlightedFinancialAttention.length),
        consequence:
          overdueCharges.length > 0
            ? "Priorize cobrança por WhatsApp ou registre pagamento."
            : "Sem atraso financeiro no momento.",
        actionLabel: overdueCharges.length > 0 ? "Priorizar" : "Resolver",
        onAction: () =>
          setStatusFilter(overdueCharges.length > 0 ? "overdue" : "all"),
      },
      {
        key: "whatsapp",
        title: "Cobrança sem WhatsApp enviado",
        value:
          pendingWithoutWhatsApp.length > 0
            ? String(pendingWithoutWhatsApp.length)
            : "Sem histórico",
        consequence:
          pendingWithoutWhatsApp.length > 0
            ? "Há pendência sem comunicação registrada nos campos retornados."
            : communicationUnknownCount > 0
              ? "Nenhum histórico de envio disponível nesta leitura. Use o WhatsApp contextual para continuar a cobrança."
              : "Nenhuma pendência sem envio registrada.",
        actionLabel: "Usar WhatsApp",
        onAction: () => setStatusFilter("pending"),
      },
      {
        key: "os-without-charge",
        title: "O.S. concluída sem cobrança",
        value: String(completedOrdersWithoutCharge.length),
        consequence:
          completedOrdersWithoutCharge.length > 0
            ? "Receita operacional ainda não virou cobrança."
            : "Nenhuma O.S. concluída sem cobrança encontrada nos dados carregados.",
        actionLabel:
          completedOrdersWithoutCharge.length > 0 ? "Resolver" : "Conferir",
        onAction: () => {
          if (completedOrdersWithoutCharge.length > 0)
            navigate("/service-orders");
          else setStatusFilter("all");
        },
      },
      {
        key: "payment-register",
        title: "Pagamento não registrado",
        value:
          paidWithoutRegisteredPayment.length > 0
            ? String(paidWithoutRegisteredPayment.length)
            : "Conferir",
        consequence:
          paidWithoutRegisteredPayment.length > 0
            ? "Cobrança paga sem lista de pagamentos vinculada no detalhe."
            : "Nenhum histórico consolidado de pagamentos disponível nesta leitura. Confira a cobrança selecionada.",
        actionLabel: "Conferir",
        onAction: () =>
          selectedChargeId
            ? undefined
            : setSelectedChargeId(String(enrichedCharges[0]?.id ?? "")),
      },
      {
        key: "communication-failure",
        title: "Falha de cobrança/comunicação",
        value: "Acompanhar",
        consequence:
          "Sem falha de comunicação comprovada nesta leitura; continue a cobrança pelo WhatsApp contextual.",
        actionLabel: "Usar WhatsApp",
        onAction: () =>
          selectedCharge
            ? goToWhatsApp(selectedCharge)
            : setStatusFilter("overdue"),
      },
    ];
  }, [
    completedOrdersWithoutCharge,
    enrichedCharges,
    navigate,
    selectedCharge,
    selectedChargeId,
  ]);

  async function refreshAll() {
    await Promise.all([
      chargesQuery.refetch(),
      customersQuery.refetch(),
      serviceOrdersQuery.refetch(),
      selectedChargeDetailsQuery.refetch(),
      timelineByCustomerQuery.refetch(),
      timelineByServiceOrderQuery.refetch(),
    ]);
  }

  async function openMarkAsPaid(charge: ChargeRecord) {
    setPayMethod("PIX");
    setPayAmount(
      String((Number(charge?.amountCents ?? 0) / 100).toFixed(2)).replace(
        ".",
        ","
      )
    );
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes("");
    setOpenPayModalFor(charge);
  }

  async function submitMarkAsPaid() {
    if (!openPayModalFor?.id) return;
    const normalized = payAmount.replace(/\./g, "").replace(",", ".");
    const amountNumber = Number(normalized);
    const amountCents = Number.isFinite(amountNumber)
      ? Math.round(amountNumber * 100)
      : 0;
    if (amountCents <= 0) {
      toast.error("Valor inválido para registrar pagamento.");
      return;
    }

    try {
      await markPaidMutation.mutateAsync({
        chargeId: String(openPayModalFor.id),
        amountCents,
        method: payMethod,
        paidAt: payDate
          ? new Date(`${payDate}T12:00:00`).toISOString()
          : new Date().toISOString(),
        notes: payNotes.trim() || undefined,
      });
      toast.success("Pagamento registrado com sucesso.");
      setOpenPayModalFor(null);
      await refreshAll();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao registrar pagamento.");
    }
  }

  function openEditCharge(charge: ChargeRecord) {
    setEditAmount(
      String((Number(charge?.amountCents ?? 0) / 100).toFixed(2)).replace(
        ".",
        ","
      )
    );
    const due = safeDate(charge?.dueDate);
    setEditDueDate(due ? due.toISOString().slice(0, 10) : "");
    setEditNotes(String(charge?.notes ?? ""));
    setOpenEditModalFor(charge);
  }

  async function submitEditCharge() {
    if (!openEditModalFor?.id) return;
    const normalized = editAmount.replace(/\./g, "").replace(",", ".");
    const amountNumber = Number(normalized);
    const amountCents = Number.isFinite(amountNumber)
      ? Math.round(amountNumber * 100)
      : 0;

    if (amountCents <= 0 || !editDueDate) {
      toast.error("Preencha valor e vencimento para editar a cobrança.");
      return;
    }

    try {
      await editMutation.mutateAsync({
        id: String(openEditModalFor.id),
        amountCents,
        dueDate: new Date(`${editDueDate}T12:00:00`),
        notes: editNotes.trim() || undefined,
      });
      toast.success("Cobrança atualizada com sucesso.");
      setOpenEditModalFor(null);
      await refreshAll();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao editar cobrança.");
    }
  }

  async function handleCancelCharge(charge: ChargeRecord) {
    if (!charge?.id) return;
    if (charge.status === "PAID") {
      toast.error("Cobrança paga não pode ser cancelada.");
      return;
    }
    const cancellationReason = window.prompt(
      "Cancelar cobrança\n\nEsta cobrança será mantida no histórico como cancelada. Ela não será apagada.\n\nMotivo do cancelamento"
    )?.trim();
    if (!cancellationReason) {
      toast.error("Motivo do cancelamento é obrigatório.");
      return;
    }
    try {
      await cancelMutation.mutateAsync({
        chargeId: String(charge.id),
        cancellationReason,
        expectedUpdatedAt: charge.updatedAt ? String(charge.updatedAt) : undefined,
      });
      toast.success("Cobrança cancelada com sucesso.");
      await refreshAll();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao cancelar cobrança.");
    }
  }

  function goToCustomer(charge: ChargeRecord) {
    if (!charge?.customerId) {
      toast.error("Cliente inválido para abrir WhatsApp.");
      return;
    }
    navigate(`/customers?customerId=${charge.customerId}`);
  }

  function goToServiceOrder(charge: ChargeRecord) {
    if (!charge?.serviceOrderId) {
      toast.error("Cliente inválido para abrir WhatsApp.");
      return;
    }
    navigate(
      `/service-orders?customerId=${charge.customerId ?? ""}&serviceOrderId=${charge.serviceOrderId}`
    );
  }

  function goToWhatsApp(charge: ChargeRecord) {
    if (!charge?.customerId) {
      toast.error("Cliente inválido para abrir WhatsApp.");
      return;
    }
    if (String(charge.status ?? "").toUpperCase() === "PAID") {
      toast.info(
        "Cobrança já paga. Use WhatsApp apenas para comunicação pós-pagamento."
      );
      navigate(`/whatsapp?customerId=${charge.customerId}`);
      return;
    }
    navigate(
      `/whatsapp?customerId=${charge.customerId}&chargeId=${charge.id ?? ""}`
    );
  }

  return (
    <AppPageShell className="gap-3">
      <AppOperationalHeader
        title="Financeiro operacional"
        description={`Centro de conversão da execução em receita · ${enrichedCharges.length} cobrança(s), ${cashHealth.overdueCount} vencida(s), ${cashHealth.pendingCount} pendente(s) e ${completedOrdersWithoutCharge.length} O.S. concluída(s) sem cobrança.`}
        secondaryActions={
          <Button variant="ghost" size="sm" onClick={() => void refreshAll()}>
            Atualizar
          </Button>
        }
        primaryAction={
          <Button onClick={() => setOpenCreate(true)}>Novo recebimento</Button>
        }
        contextChips={
          <>
            <AppOperationalStatusBadge
              status={financeOperationalStatus}
              label={`Saúde ${financeOperationalStatus.toLowerCase()}`}
            />
            <AppStatusBadge
              label={`Carteira: ${enrichedCharges.length}`}
              tone="info"
            />
            <AppStatusBadge
              label={`Atrasos: ${cashHealth.overdueCount}`}
              tone={cashHealth.overdueCount > 0 ? "danger" : "success"}
            />
            <AppStatusBadge
              label={`Pendências: ${cashHealth.pendingCount}`}
              tone={cashHealth.pendingCount > 0 ? "warning" : "neutral"}
            />
            {hasFiltersContext ? (
              <AppStatusBadge label="Contexto via operação" tone="accent" />
            ) : null}
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Financeiro mostra cobrança, pagamento, atraso e risco com os dados já
          carregados — sem ERP contábil pesado e sem automação inventada.
        </p>
      </AppOperationalHeader>

      <AppSectionBlock
        title="Hero Executivo Financeiro"
        subtitle="Cockpit compacto: recebido, pendente e em risco sem competir com FAÇA AGORA."
        compact
      >
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ["Dinheiro recebido", health.received, "Já virou caixa"],
            ["Dinheiro pendente", health.receivable, "Ainda precisa cobrança"],
            ["Dinheiro em risco", health.overdue, "Atraso trava receita"],
          ].map(([label, value, hint]) => (
            <AppInfoCard key={String(label)} className="px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                {label}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {formatCurrency(Number(value))}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{hint}</p>
              </div>
            </AppInfoCard>
          ))}
        </div>
      </AppSectionBlock>

      <AppSectionCard className="space-y-0 border-0 bg-transparent p-0">
        <span className="sr-only">
          Próxima melhor ação financeira · FAÇA AGORA: comando financeiro
          dominante
        </span>
        <div className="mb-2 rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-soft)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
            FAÇA AGORA
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
            {financeNextBestAction.title}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {financeNextBestAction.reason}
          </p>
        </div>
        <NextBestActionCard
          title={financeNextBestAction.title}
          entity={financeNextBestAction.entity}
          reason={financeNextBestAction.reason}
          impact={financeNextBestAction.impact}
          safetyNote={financeNextBestAction.safetyNote}
          primaryActionLabel={financeNextBestAction.primaryActionLabel}
          onPrimaryAction={() => {
            const target = financeNextBestAction.target;
            if (target) {
              setSelectedChargeId(String(target.id ?? ""));
              if (target.status === "OVERDUE" || target.status === "PENDING") {
                goToWhatsApp(target);
                return;
              }
              setStatusFilter("paid");
              return;
            }
            if (financeNextBestAction.title === "Gerar cobrança") {
              setOpenCreate(true);
              return;
            }
            setStatusFilter("all");
          }}
          secondaryActionLabel={financeNextBestAction.secondaryActionLabel}
          onSecondaryAction={
            financeNextBestAction.secondaryActionLabel
              ? () => {
                  if (financeNextBestAction.title === "Cobrar cliente")
                    setStatusFilter("overdue");
                  else if (
                    financeNextBestAction.title === "Enviar link de pagamento"
                  )
                    setStatusFilter("pending");
                  else if (
                    financeNextBestAction.title === "Revisar recebimento"
                  )
                    setStatusFilter("paid");
                  else if (financeNextBestAction.title === "Gerar cobrança")
                    navigate("/service-orders");
                  else setStatusFilter("all");
                }
              : undefined
          }
        />
      </AppSectionCard>


      <AppSectionBlock
        title="Carteira Prioritária"
        subtitle="Até 50 cobranças ordenadas por atraso, impacto financeiro, risco e ausência de contato recente."
        compact
      >
        {operationalQueueQuery.isLoading ? (
          <AppPageLoadingState description="Carregando fila operacional financeira..." />
        ) : operationalQueue.length === 0 ? (
          <AppPageEmptyState
            title="Sem ação prioritária agora"
            description="Nenhuma cobrança pendente ou vencida entrou na fila operacional."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {operationalQueue.slice(0, 6).map(item => {
              const summary = item?.financialOperationalSummary ?? {};
              const customerName = safeFinancialEntityName(
                item?.customer?.name ?? item?.customerName
              );
              return (
                <button
                  key={String(item?.id ?? customerName)}
                  type="button"
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 text-left transition-colors hover:border-[var(--accent-primary)]"
                  onClick={() => setSelectedChargeId(String(item?.id ?? ""))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {customerName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {summary.priorityReason ?? "Priorização derivada da cobrança."}
                      </p>
                    </div>
                    <AppStatusBadge
                      label={String(summary.riskLevel ?? "NORMAL")}
                      tone={summary.riskLevel === "SUSPENDED" || summary.riskLevel === "RESTRICTED" ? "danger" : summary.riskLevel === "WARNING" ? "warning" : "success"}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
                    <span>
                      Valor: <strong className="text-[var(--text-primary)]">{formatCurrency(Number(item?.amountCents ?? 0))}</strong>
                    </span>
                    <span>
                      Atraso: <strong className="text-[var(--text-primary)]">{Number(summary.daysOverdue ?? 0)} dia(s)</strong>
                    </span>
                    <span>
                      Ação: <strong className="text-[var(--text-primary)]">{String(summary.recommendedAction ?? item?.nextBestCollectionAction ?? "REVIEW_CHARGE")}</strong>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Pipeline Financeiro"
        subtitle="Cliente → Cobrança → Envio → Contato → Pagamento → Recebimento, usando somente dados já carregados e CTAs existentes."
        compact
      >
        <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Gargalo principal:{" "}
          <strong className="text-[var(--text-primary)]">
            {pipelineBottleneck.stage}
          </strong>{" "}
          — {pipelineBottleneck.consequence}
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
          {pipelineStages.map((item, index) => (
            <div key={item.stage} className="flex flex-1 items-stretch gap-3">
              <AppInfoCard
                className={cn(
                  "min-h-full flex-1 border-l-4 transition-all",
                  item.bottleneck
                    ? "scale-[1.02] border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : "border-l-[var(--border-subtle)]"
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {index + 1}. {item.stage}
                  {item.bottleneck ? " · Gargalo" : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {item.represents}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  {item.state}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {item.consequence}
                </p>
              </AppInfoCard>
              {index < pipelineStages.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="hidden items-center text-xl text-[var(--accent-primary)] xl:flex"
                >
                  →
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </AppSectionBlock>

      <AppSectionBlock
        title="Carteira operacional"
        subtitle="Fila real de trabalho: cliente, valor, vencimento, origem, prioridade, próxima ação e CTA real."
      >
        <AppFiltersBar className="shrink-0 gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
          <div className="min-w-[220px] flex-1">
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Buscar cliente, O.S. ou status"
              className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filterTabs.map(filter => (
              <button
                key={filter.key}
                type="button"
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                  statusFilter === filter.key
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)]">
              Mais filtros
            </summary>
            <div className="absolute right-0 z-20 mt-2 grid min-w-[190px] gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatusFilter("overdue")}
              >
                Priorizar atraso
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatusFilter("pending")}
              >
                Cobrar pendências
              </Button>
            </div>
          </details>
          <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">
            {filteredCharges.length} / {scopedCharges.length} cobrança(s)
          </span>
        </AppFiltersBar>

        {hasFiltersContext ? (
          <p className="text-xs text-[var(--text-muted)]">
            Contexto ativo por seleção operacional.
          </p>
        ) : null}

        {allQueriesLoading && enrichedCharges.length === 0 ? (
          <AppPageLoadingState description="Carregando cobranças, clientes e O.S...." />
        ) : null}

        {allQueriesErrored ? (
          <AppPageErrorState
            description={
              chargesQuery.error?.message ??
              "Falha ao carregar dados financeiros."
            }
            actionLabel="Tentar novamente"
            onAction={() => void refreshAll()}
          />
        ) : null}

        {!allQueriesLoading &&
        !allQueriesErrored &&
        filteredCharges.length === 0 ? (
          hasSearchNoResults ? (
            <AppPageEmptyState
              title="Busca sem resultado"
              description="Nenhuma cobrança encontrada para os termos pesquisados."
            />
          ) : (
            <AppPageEmptyState
              title="Nenhuma cobrança disponível"
              description="Não há cobranças para o contexto atual."
            />
          )
        ) : null}

        {!allQueriesLoading &&
        !allQueriesErrored &&
        filteredCharges.length > 0 ? (
          <>
            <div className="grid gap-3">
              {paginatedCharges.map(row => {
                const primaryAction = getChargePrimaryAction(row);
                const selected = selectedChargeId === String(row?.id ?? "");
                return (
                  <button
                    key={String(row?.id ?? "")}
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition-colors",
                      selected
                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-base)] hover:bg-[var(--surface-subtle)]/70"
                    )}
                    onClick={() => setSelectedChargeId(String(row?.id ?? ""))}
                  >
                    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] lg:items-center">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {safeFinancialEntityName(row.customerName)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {getContactAvailability(row)}
                        </p>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-[var(--text-primary)]">
                          {formatCurrency(Number(row?.amountCents ?? 0))}
                        </p>
                        <AppStatusBadge
                          label={chargeStatusLabel(row.status)}
                          tone={getChargeStatusTone(row.status)}
                        />
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        <p className="font-medium text-[var(--text-primary)]">
                          {row.status === "OVERDUE"
                            ? `${row.overdueDays} dia(s) em atraso`
                            : `Vence em ${formatDate(row?.dueDate)}`}
                        </p>
                        <p>
                          {getFinancialBusinessLabel(
                            getServiceOrderBusinessLabel(row)
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]">
                          {getHumanPriorityLabel(getChargePriority(row))}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {primaryAction.reason}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={event => event.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant={
                            primaryAction.kind === "collect"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => {
                            setSelectedChargeId(String(row?.id ?? ""));
                            if (primaryAction.kind === "collect")
                              goToWhatsApp(row);
                          }}
                          disabled={row.status === "CANCELED"}
                        >
                          {primaryAction.label}
                        </Button>
                        <AppRowActionsDropdown
                          items={[
                            {
                              label: "Ver detalhe",
                              onSelect: () =>
                                setSelectedChargeId(String(row?.id ?? "")),
                            },
                            {
                              label: "Marcar como pago",
                              onSelect: () => void openMarkAsPaid(row),
                              disabled:
                                row.status === "PAID" ||
                                row.status === "CANCELED",
                              tone: "primary",
                            },
                            {
                              label:
                                normalizeStatus(row?.status) === "PAID"
                                  ? "WhatsApp pós-pagamento"
                                  : "Cobrar via WhatsApp",
                              onSelect: () => goToWhatsApp(row),
                              disabled: !row.customerId,
                              tone: "primary",
                            },
                            {
                              label: "Editar cobrança",
                              onSelect: () => openEditCharge(row),
                              disabled:
                                row.status === "PAID" ||
                                row.status === "CANCELED",
                            },
                            {
                              label: "Cancelar cobrança",
                              onSelect: () => void handleCancelCharge(row),
                              disabled:
                                row.status === "PAID" ||
                                row.status === "CANCELED",
                            },
                            { type: "separator", label: "Navegação" },
                            {
                              label: "Abrir cliente",
                              onSelect: () => goToCustomer(row),
                              disabled: !row.customerId,
                            },
                            {
                              label: "Abrir O.S.",
                              onSelect: () => goToServiceOrder(row),
                              disabled: !row.serviceOrderId,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <AppPagination
              currentPage={currentPage}
              totalItems={filteredCharges.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </>
        ) : null}
      </AppSectionBlock>

      <AppSectionBlock
        title="Conversão de receita"
        subtitle="Faixa compacta: execução → cobrança → pagamento → recebimento."
        compact
      >
        <div className="grid gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-2 md:grid-cols-4">
          {[
            ["Recebido", health.received],
            ["Pendente", health.receivable],
            ["Em risco", health.overdue],
            [
              "Previsto total",
              health.received + health.receivable + health.overdue,
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg bg-[var(--surface-base)] px-3 py-2"
            >
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                {label}
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrency(Number(value))}
              </p>
            </div>
          ))}
        </div>
      </AppSectionBlock>

      <AppSectionBlock
        title="Radar financeiro"
        subtitle={`Alertas densos para proteger caixa, cobrança e conversão da execução em receita. ${highlightedFinancialSummary.hidden > 0 ? highlightedFinancialSummary.hiddenMessage : ""}`}
        compact
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {immediateAttentionItems.slice(0, 5).map(item => (
            <AppInfoCard key={item.key} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {item.title}
                </p>
                <AppStatusBadge label={item.value} tone="neutral" />
              </div>
              <p className="mt-1 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
                {item.consequence}
              </p>
              <Button
                className="mt-2 w-full"
                size="sm"
                variant="outline"
                onClick={item.onAction}
              >
                {item.actionLabel}
              </Button>
            </AppInfoCard>
          ))}
        </div>
      </AppSectionBlock>

      <AppSectionBlock
        title="Detalhe financeiro de cobrança"
        subtitle="Cobrança, pagamento, histórico/timeline e comunicação existente, com fallback honesto quando a fonte não entrega dado."
        compact
      >
        {selectedCharge ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AppInfoCard>
                <p className="text-xs text-[var(--text-muted)]">
                  Cliente vinculado
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedFinancialRecord.customerName}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {getContactAvailability(selectedFinancialRecord)}
                </p>
              </AppInfoCard>
              <AppInfoCard>
                <p className="text-xs text-[var(--text-muted)]">
                  Valor da cobrança
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatCurrency(
                    Number(selectedFinancialRecord?.amountCents ?? 0)
                  )}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Método recebido:{" "}
                  {latestPaymentMethod(selectedFinancialRecord)}
                </p>
              </AppInfoCard>
              <AppInfoCard>
                <p className="text-xs text-[var(--text-muted)]">
                  Status / vencimento
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {chargeStatusLabel(selectedFinancialRecord.status)} ·{" "}
                  {formatDate(selectedFinancialRecord?.dueDate)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {getChargeRisk(selectedFinancialRecord)}
                </p>
                {selectedFinancialRecord.status === "CANCELED" ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Cancelada em {formatDate(selectedFinancialRecord.canceledAt)}
                    {selectedFinancialRecord.cancellationReason
                      ? ` · Motivo: ${selectedFinancialRecord.cancellationReason}`
                      : ""}
                  </p>
                ) : null}
              </AppInfoCard>
              <AppInfoCard>
                <p className="text-xs text-[var(--text-muted)]">
                  Origem operacional
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {safeText(
                    selectedFinancialRecord.serviceOrderLabel,
                    "Sem O.S. vinculada"
                  )}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {getServiceOrderBusinessLabel(selectedFinancialRecord)}
                </p>
              </AppInfoCard>
            </div>
            <AppInfoCard className="border-[var(--accent-primary)] bg-[var(--accent-soft)]">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
                Decisão operacional
              </p>
              <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                {getChargePrimaryAction(selectedFinancialRecord).label}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  <strong>Motivo:</strong>{" "}
                  {getChargePrimaryAction(selectedFinancialRecord).reason}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  <strong>Impacto:</strong>{" "}
                  {getChargeRisk(selectedFinancialRecord)}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  <strong>Segurança:</strong> decisão orientativa; pagamento e
                  mensagem exigem CTA real.
                </p>
              </div>
            </AppInfoCard>
            <AppActionBar className="gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-2">
              <Button
                onClick={() => goToWhatsApp(selectedFinancialRecord)}
                disabled={selectedFinancialRecord.status === "CANCELED"}
              >
                {selectedFinancialRecord.status === "OVERDUE"
                  ? "Cobrar agora"
                  : "Enviar link"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void openMarkAsPaid(selectedFinancialRecord)}
                disabled={
                  selectedFinancialRecord.status === "PAID" ||
                  selectedFinancialRecord.status === "CANCELED" ||
                  markPaidMutation.isPending
                }
              >
                {markPaidMutation.isPending
                  ? "Salvando..."
                  : "Marcar como pago"}
              </Button>
              <Button
                variant="outline"
                onClick={() => openEditCharge(selectedFinancialRecord)}
                disabled={
                  selectedFinancialRecord.status === "PAID" ||
                  selectedFinancialRecord.status === "CANCELED" ||
                  editMutation.isPending
                }
              >
                {editMutation.isPending ? "Salvando..." : "Editar cobrança"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleCancelCharge(selectedFinancialRecord)}
                disabled={
                  selectedFinancialRecord.status === "PAID" ||
                  selectedFinancialRecord.status === "CANCELED" ||
                  cancelMutation.isPending
                }
              >
                {cancelMutation.isPending ? "Salvando..." : "Cancelar"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => goToCustomer(selectedFinancialRecord)}
              >
                Abrir cliente
              </Button>
              <Button
                variant="ghost"
                onClick={() => goToServiceOrder(selectedFinancialRecord)}
              >
                Abrir O.S.
              </Button>
            </AppActionBar>

            <div className="grid gap-3 lg:grid-cols-3">
              <p className="sr-only">Ações reais</p>
              <EntityTimelineCard
                className="lg:col-span-2"
                title="Prova operacional financeira"
                subtitle={
                  timelineByCustomerQuery.isLoading ||
                  timelineByServiceOrderQuery.isLoading
                    ? "Carregando Timeline oficial para cliente/O.S. selecionados."
                    : timelineItems.length > 0
                      ? "Últimos eventos oficiais retornados pela Timeline para sustentar cobrança, pagamento e risco."
                      : "Fallback contextual: eventos abaixo vêm de cobranças/pagamentos carregados e não substituem a Timeline oficial."
                }
                events={financeTimelineEvents}
                fullTimelineLabel="Abrir Timeline completa"
                onFullTimeline={() =>
                  navigate(
                    selectedFinancialRecord?.customerId
                      ? `/timeline?customerId=${selectedFinancialRecord.customerId}`
                      : "/timeline"
                  )
                }
              />
              <AppInfoCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Comunicação / WhatsApp
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {getCommunicationState(selectedFinancialRecord) === "sent"
                    ? "Envio de cobrança identificado nos campos retornados."
                    : getCommunicationState(selectedFinancialRecord) ===
                        "not_sent"
                      ? "Sem envio registrado nos campos retornados."
                      : "Nenhum histórico de envio disponível nesta leitura. Use o WhatsApp contextual para continuar a cobrança."}
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {paymentsListAvailable
                    ? "Listagem de pagamentos/mensagens conectada."
                    : "Use o WhatsApp contextual para continuar a cobrança sem criar automação paralela."}
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={() => goToWhatsApp(selectedFinancialRecord)}
                >
                  Ir para WhatsApp com contexto
                </Button>
              </AppInfoCard>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Selecione uma cobrança para abrir o painel detalhado.
          </p>
        )}
      </AppSectionBlock>

      <CreateChargeModal
        isOpen={openCreate}
        onClose={() => setOpenCreate(false)}
        onSuccess={() => {
          toast.success("Cobrança criada com sucesso.");
          void refreshAll();
        }}
      />

      <FormModal
        open={Boolean(openPayModalFor)}
        onOpenChange={open => {
          if (!open) setOpenPayModalFor(null);
        }}
        title="Marcar como pago"
        description="Registrar recebimento real da cobrança."
        size="md"
        closeBlocked={markPaidMutation.isPending}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">
              Resumo:{" "}
              {openPayModalFor
                ? formatCurrency(Number(openPayModalFor?.amountCents ?? 0))
                : "—"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenPayModalFor(null)}
                disabled={markPaidMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void submitMarkAsPaid()}
                disabled={markPaidMutation.isPending}
              >
                {markPaidMutation.isPending
                  ? "Salvando..."
                  : "Confirmar pagamento"}
              </Button>
            </div>
          </div>
        }
      >
        <AppFormSection
          title="Recebimento"
          subtitle="Campos preservam o registro atual de pagamento."
        >
          <AppFieldGroup>
            <AppField label="Valor">
              <AppInput
                value={payAmount}
                onChange={event => setPayAmount(event.target.value)}
              />
            </AppField>
            <AppField label="Método">
              <AppSelect
                value={payMethod}
                onValueChange={value => setPayMethod(value as PaymentMethod)}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </AppField>
            <AppField
              label="Data de pagamento"
              hint="A data selecionada será registrada no pagamento."
            >
              <AppInput
                value={payDate}
                onChange={event => setPayDate(event.target.value)}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
              />
            </AppField>
            <AppField
              label="Observação"
              hint="A observação será salva no histórico do pagamento."
            >
              <AppTextarea
                className="min-h-[80px]"
                value={payNotes}
                onChange={event => setPayNotes(event.target.value)}
                placeholder="Observação operacional"
              />
            </AppField>
          </AppFieldGroup>
        </AppFormSection>
      </FormModal>

      <FormModal
        open={Boolean(openEditModalFor)}
        onOpenChange={open => {
          if (!open) setOpenEditModalFor(null);
        }}
        title="Editar cobrança"
        description="Atualize valor, vencimento e observações no fluxo existente."
        size="md"
        closeBlocked={editMutation.isPending}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">
              Resumo atualizado pelo fluxo existente.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenEditModalFor(null)}
                disabled={editMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void submitEditCharge()}
                disabled={editMutation.isPending}
              >
                {editMutation.isPending ? "Salvando..." : "Salvar edição"}
              </Button>
            </div>
          </div>
        }
      >
        <AppFormSection
          title="Dados da cobrança"
          subtitle="Edição curta preservando valor, vencimento e observações atuais."
        >
          <AppFieldGroup>
            <AppField label="Valor">
              <AppInput
                value={editAmount}
                onChange={event => setEditAmount(event.target.value)}
              />
            </AppField>
            <AppField label="Vencimento">
              <AppInput
                value={editDueDate}
                onChange={event => setEditDueDate(event.target.value)}
                type="date"
              />
            </AppField>
            <div className="sm:col-span-2">
              <AppField label="Observações">
                <AppTextarea
                  className="min-h-[110px]"
                  value={editNotes}
                  onChange={event => setEditNotes(event.target.value)}
                />
              </AppField>
            </div>
          </AppFieldGroup>
        </AppFormSection>
      </FormModal>
    </AppPageShell>
  );
}

import { useMemo } from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { OperationalInnerCard } from "@/components/operational";
import { trpc } from "@/lib/trpc";
import { useRenderWatchdog } from "@/hooks/useRenderWatchdog";
import { presentationStatusLabel } from "@/lib/presentation-status";
import {
  executiveDashboardStateLabel,
  resolveExecutiveDashboardState,
} from "@/lib/executive-dashboard-state";
import {
  AppContextChip,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPageShell,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";
import {
  NexoEvidenceTimeline,
  NexoPriorityPanel,
  NexoOperationalPipeline,
  NexoGovernanceDecisionCard,
  NexoExecutiveMetric,
  type OperationalFlowStageState,
  type OperationalStateLevel,
} from "@/components/app";
import {
  buildWhatsAppExecutionPath,
  formatWhatsAppExecutionDate,
  whatsappActionLabel,
  type WhatsAppActionExecution,
} from "@/lib/whatsappActionExecution";

type DashboardRecord = Record<string, unknown>;
type Severity = "critical" | "high" | "medium";
type SignalSeverity = "CRITICAL" | "WARNING" | "INFO";
type OperationalSignal = {
  id: string;
  severity: SignalSeverity;
  area: string;
  title: string;
  summary?: string;
  impact?: string;
  suggestedAction?: string;
  serviceOrderId?: string | null;
  chargeId?: string | null;
  messageId?: string | null;
};
type AttentionItem = {
  id: string;
  severity: Severity;
  title: string;
  reason: string;
  impact: string;
  ctaLabel: string;
  path: string;
  primaryValue?: string;
};
type QueueItem = {
  id: string;
  type: string;
  entity: string;
  context: string;
  status: string;
  dueLabel: string;
  responsible: string;
  responsibleMissing: boolean;
  ctaLabel: string;
  path: string;
};
type FlowStage = {
  id: string;
  label: string;
  value: string;
  context: string;
  path: string;
  action: string;
  state: OperationalFlowStageState;
};
type RecommendedAction = {
  title: string;
  entity: string;
  reason: string;
  impact: string;
  path: string;
  ctaLabel: string;
  safetyNote?: string;
  primaryValue?: string;
};
type DashboardTimelineEvent = DashboardRecord & {
  id?: unknown;
  eventType?: unknown;
  type?: unknown;
  action?: unknown;
  createdAt?: unknown;
  occurredAt?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  chargeId?: unknown;
  serviceOrderId?: unknown;
  appointmentId?: unknown;
  messageId?: unknown;
  actorName?: unknown;
  responsibleName?: unknown;
  summary?: unknown;
  description?: unknown;
  title?: unknown;
};
type ComparisonKey =
  | "revenueReceivedPct"
  | "completedServiceOrdersPct"
  | "overdueChargesPct"
  | "failedMessagesPct";
type QueueRecord = DashboardRecord & {
  id?: unknown;
  responsibleName?: unknown;
  assigneeName?: unknown;
  ownerName?: unknown;
  type?: unknown;
  title?: unknown;
  context?: unknown;
  amountCents?: unknown;
  startsAt?: unknown;
  dueAt?: unknown;
  dueDate?: unknown;
  deadlineAt?: unknown;
  lastMessageAt?: unknown;
  serviceOrderId?: unknown;
  chargeId?: unknown;
  appointmentId?: unknown;
  messageId?: unknown;
};

type DashboardAlerts = {
  overdueOrders?: { count?: number; items?: DashboardRecord[] };
  overdueCharges?: {
    count?: number;
    totalAmountCents?: number;
    items?: DashboardRecord[];
  };
  todayServices?: { count?: number; items?: DashboardRecord[] };
  customersWithPending?: { count?: number; items?: DashboardRecord[] };
  doneOrdersWithoutCharge?: {
    count?: number;
    totalAmountCents?: number;
    items?: DashboardRecord[];
  };
  operationalQueue?: QueueRecord[];
};

/**
 * Fonte de dados do cockpit operacional:
 * - dashboard.kpis: volumes, comparação histórica, WhatsApp Signals e governança quando o BFF entregar.
 * - dashboard.alerts: alertas financeiros/O.S. e fila transversal leve.
 * - dashboard.operationalSignals: riscos e próxima ação via BFF autenticado.
 * - nexo.timeline.listByOrg: prova operacional recente; sem eventos, o dashboard declara ausência em vez de inventar tendência.
 * O cliente realiza apenas formatação, tradução visual e navegação contextual.
 * Estado, severidade, ordem dos sinais e próxima ação permanecem autoritativos.
 */
const fullWidthLayoutClass = "w-full min-w-0";
const dashboardSectionClass = fullWidthLayoutClass;

function asRecord(value: unknown): DashboardRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DashboardRecord)
    : {};
}

function asAlerts(value: unknown): DashboardAlerts {
  return asRecord(value) as DashboardAlerts;
}

function readNumber(record: DashboardRecord, key: string) {
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? (record[key] as number)
    : 0;
}

function readNullableNumber(record: DashboardRecord, key: string) {
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? (record[key] as number)
    : null;
}
function readString(record: DashboardRecord, key: string) {
  return typeof record[key] === "string" ? (record[key] as string) : "";
}

function formatShortDateTime(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date))
    return "Prazo não informado";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Prazo não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function describeComparison(
  label: string,
  value: number,
  lowerIsBetter = false
) {
  if (value === 0) return `${label}: estável em relação ao período anterior.`;

  const improved = lowerIsBetter ? value < 0 : value > 0;
  return `${label}: ${improved ? "melhorou" : "piorou"} ${Math.abs(value).toLocaleString("pt-BR")}% em relação ao período anterior.`;
}

function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatCurrencyMentions(value: string) {
  return value.replace(/(\d+)\s+centavos\b/gi, (_, cents: string) =>
    formatCurrencyFromCents(Number(cents))
  );
}

function sanitizeOperationalText(
  value: unknown,
  fallback = "Evento operacional registrado"
) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const cleaned = formatCurrencyMentions(text)
    .replace(/\b(?:EXECUTION|ACTION|AUTH)_[A-Z0-9_]+\b/g, fallback)
    .replace(/\b[A-Z]+(?:_[A-Z0-9]+){1,}\b/g, fallback)
    .replace(/\baction-[a-z0-9-]+\b/gi, "ação operacional")
    .replace(/\b[a-z]+(?:-[a-z0-9]+){2,}\b/g, "referência operacional")
    .replace(/\b(?:payload|eventType|actionId|slug)\b:?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function resolveExecutiveEntity(event: DashboardTimelineEvent) {
  const entityType = String(event.entityType ?? "").toUpperCase();
  if (entityType.includes("CHARGE") || event.chargeId)
    return "Cobrança relacionada";
  if (entityType.includes("SERVICE") || event.serviceOrderId)
    return "Ordem de serviço relacionada";
  if (entityType.includes("APPOINTMENT") || event.appointmentId)
    return "Agendamento relacionado";
  if (entityType.includes("MESSAGE") || event.messageId)
    return "Contato relacionado";
  if (entityType.includes("CUSTOMER") || entityType.includes("PERSON"))
    return "Cliente relacionado";
  return "Operação relacionada";
}

function formatRelativeDelay(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return "Prazo operacional vencido";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Vencida hoje";
  return `Vencida há ${days} ${days === 1 ? "dia" : "dias"}`;
}

function describeMicroTrend(
  value: number | null,
  lowerIsBetter = false,
  unit: "pct" | "count" = "pct"
) {
  if (value === null) return "Sem base histórica suficiente";
  if (value === 0) return "Estável";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  const arrow = value > 0 ? "↑" : "↓";
  const amount = Math.abs(value).toLocaleString("pt-BR");
  if (unit === "pct")
    return `${arrow} ${improved ? "melhorou" : "piorou"} ${amount}%`;
  return `${arrow} ${value > 0 ? "+" : "-"}${amount} desde o período anterior`;
}

function formatPeriod() {
  return `Hoje · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}`;
}

function readResponsible(record: DashboardRecord) {
  const responsible =
    readString(record, "responsibleName") ||
    readString(record, "assigneeName") ||
    readString(record, "ownerName");

  return {
    label: responsible || "—",
    missing: !responsible,
  };
}

function compactIncidentTitle(title: string) {
  return title
    .replace(/ exigem destravamento| pressionam o caixa| ativa$/gi, "")
    .replace(
      /^Serviços concluídos ainda não viraram cobrança$/i,
      "O.S. sem cobrança"
    )
    .replace(/^Clientes com pendência financeira$/i, "Clientes com pendência")
    .replace(
      /^Clientes com pendência financeira ativa$/i,
      "Clientes com pendência"
    )
    .replace(/^Mensagens WhatsApp com falha$/i, "WhatsApp com falha");
}

function extractFirstNumber(value: string) {
  return value.match(/(?:R\$\s*)?[0-9][0-9.]*?(?:,[0-9]{2})?/)?.[0];
}

function formatEventDateTime(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date))
    return "Data não informada";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeTimelineEvents(payload: unknown) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).items)
      ? (asRecord(payload).items as unknown[])
      : Array.isArray(asRecord(payload).events)
        ? (asRecord(payload).events as unknown[])
        : [];

  return source.slice(0, 3).map((raw, index) => {
    const event = asRecord(raw) as DashboardTimelineEvent;
    const humanEvent = humanizeEvent(event);
    return {
      id: String(event.id ?? `${humanEvent.type}-${index}`),
      type: humanEvent.type,
      occurredAt: formatEventDateTime(event.occurredAt ?? event.createdAt),
      entity: humanEvent.entity ?? resolveExecutiveEntity(event),
      actor:
        typeof event.actorName === "string"
          ? event.actorName
          : typeof event.responsibleName === "string"
            ? event.responsibleName
            : undefined,
      summary: humanEvent.summary,
    };
  });
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|\s)\S/g, letter => letter.toUpperCase());
}

function compactActionName(value: unknown) {
  return String(value ?? "")
    .replace(/^action-/i, "")
    .replace(/_/g, "-")
    .toLowerCase();
}

function humanizeEvent(event: DashboardTimelineEvent) {
  const eventType = String(
    event.eventType ?? event.type ?? event.action ?? "Evento oficial"
  );
  const normalizedType = eventType.toUpperCase();
  const actionName = compactActionName(
    event.action ?? readString(asRecord(event), "actionId")
  );
  const rawSummary = String(
    event.summary ?? event.description ?? event.title ?? ""
  );
  const actionSource = `${actionName} ${rawSummary}`.toLowerCase();

  if (
    normalizedType === "EXECUTION_BLOCKED" &&
    actionSource.includes("overdue-charge-reminder")
  ) {
    return {
      type: "Cobrança não enviada",
      summary: "Lembrete de cobrança bloqueado.",
    };
  }
  if (
    normalizedType === "EXECUTION_BLOCKED" &&
    actionSource.includes("create-charge-followup")
  ) {
    return {
      type: "Follow-up não executado",
      summary: "Ação de cobrança não foi concluída.",
    };
  }

  const known: Record<string, { type: string; summary: string }> = {
    PAYMENT_RECEIVED: {
      type: "Pagamento recebido",
      summary: "Pagamento registrado na operação.",
    },
    CHARGE_CREATED: {
      type: "Cobrança criada",
      summary: "Nova cobrança registrada.",
    },
    SERVICE_ORDER_COMPLETED: {
      type: "O.S. concluída",
      summary: "Serviço finalizado.",
    },
    APPOINTMENT_CONFIRMED: {
      type: "Agendamento confirmado",
      summary: "Cliente confirmado na agenda.",
    },
  };

  if (known[normalizedType]) return known[normalizedType];

  return {
    type: "Evento operacional registrado",
    summary: sanitizeOperationalText(
      rawSummary,
      "Evento operacional registrado"
    ),
    entity: resolveExecutiveEntity(event),
  };
}

function buildSignalPath(
  signal: Pick<
    OperationalSignal,
    "area" | "messageId" | "chargeId" | "serviceOrderId"
  >
) {
  if (signal.area === "WHATSAPP" || signal.messageId) return "/whatsapp";
  if (signal.area === "FINANCE" || signal.chargeId)
    return "/finances?view=charges";
  if (signal.serviceOrderId)
    return `/service-orders?id=${signal.serviceOrderId}`;
  if (signal.area === "GOVERNANCE" || signal.area === "RISK")
    return "/governance";
  return "/timeline";
}

function fromSignal(signal: OperationalSignal): AttentionItem {
  return {
    id: signal.id,
    severity:
      signal.severity === "CRITICAL"
        ? "critical"
        : signal.severity === "WARNING"
          ? "high"
          : "medium",
    title: formatCurrencyMentions(signal.title),
    reason: formatCurrencyMentions(
      signal.summary ?? "Sinal operacional retornado pelo backend."
    ),
    impact: formatCurrencyMentions(
      signal.impact ?? "O impacto precisa ser validado no módulo responsável."
    ),
    ctaLabel: signal.suggestedAction ?? "Abrir contexto",
    path: buildSignalPath(signal),
    primaryValue: extractFirstNumber(
      `${signal.title} ${signal.summary ?? ""} ${signal.impact ?? ""}`
    ),
  };
}

function buildAttention(signals: OperationalSignal[]) {
  // A ordem, severidade e conteúdo vêm integralmente do contrato oficial.
  // O cliente limita a quantidade exibida e traduz apenas o tom visual.
  return signals.slice(0, 5).map(fromSignal);
}

function buildQueue(alerts: DashboardAlerts): QueueItem[] {
  return (alerts.operationalQueue ?? []).slice(0, 10).map(item => {
    const type = String(item.type);
    if (type === "OVERDUE_SERVICE_ORDER")
      return {
        id: String(item.id),
        type: "O.S. atrasada",
        entity: String(item.title ?? "Ordem de serviço"),
        context: formatCurrencyMentions(
          String(item.context ?? "Prazo operacional vencido")
        ),
        status: "Prazo vencido",
        dueLabel:
          formatRelativeDelay(
            item.deadlineAt ?? item.dueAt ?? item.dueDate ?? item.startsAt
          ) || "Prazo operacional vencido",
        responsible: readResponsible(asRecord(item)).label,
        responsibleMissing: readResponsible(asRecord(item)).missing,
        ctaLabel: "Destravar",
        path: `/service-orders?id=${String(item.serviceOrderId ?? item.id)}`,
      };
    if (type === "OVERDUE_CHARGE") {
      const amount =
        typeof item.amountCents === "number" ? item.amountCents : 0;
      const amountLabel = formatCurrencyFromCents(amount);
      const context = formatCurrencyMentions(
        String(item.context ?? "Prazo financeiro vencido")
      )
        .replace(
          new RegExp(
            `${amountLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:-|·)?\\s*`,
            "i"
          ),
          ""
        )
        .replace(/^\s*(?:-|·)\s*/, "");
      return {
        id: String(item.id),
        type: "Cobrança vencida",
        entity: String(item.title ?? "Cliente"),
        context: `${amountLabel} pendentes${context ? ` · ${context}` : ""}`,
        status: "Vencida",
        dueLabel:
          formatRelativeDelay(item.dueAt ?? item.dueDate ?? item.startsAt) ||
          "Cliente com cobrança vencida",
        responsible: readResponsible(asRecord(item)).label,
        responsibleMissing: readResponsible(asRecord(item)).missing,
        ctaLabel: "Cobrar",
        path: "/finances?view=charges&status=overdue",
      };
    }
    if (type === "CUSTOMER_AWAITING_RESPONSE")
      return {
        id: String(item.id),
        type: "Cliente aguardando resposta",
        entity: String(item.title ?? "Conversa WhatsApp"),
        context: formatCurrencyMentions(
          String(item.context ?? "Conversa aguardando resposta da operação")
        ),
        status: "Aguardando operador",
        dueLabel: formatShortDateTime(item.lastMessageAt),
        responsible: readResponsible(asRecord(item)).label,
        responsibleMissing: readResponsible(asRecord(item)).missing,
        ctaLabel: "Responder cliente",
        path: "/whatsapp",
      };
    if (type === "UNCONFIRMED_APPOINTMENT")
      return {
        id: String(item.id),
        type: "Agendamento sem confirmação",
        entity: String(item.title ?? "Agendamento futuro"),
        context: formatCurrencyMentions(
          String(item.context ?? "Confirmação pendente")
        ),
        status: "Sem confirmação",
        dueLabel: formatShortDateTime(item.startsAt),
        responsible: readResponsible(asRecord(item)).label,
        responsibleMissing: readResponsible(asRecord(item)).missing,
        ctaLabel: "Confirmar agenda",
        path: "/appointments",
      };
    return {
      id: String(item.id),
      type: "Mensagem com falha",
      entity: String(item.title ?? "Mensagem WhatsApp"),
      context: formatCurrencyMentions(
        String(item.context ?? "Falha retornada pelo backend")
      ),
      status: "Falha de envio",
      dueLabel: "Falha recente",
      responsible: readResponsible(asRecord(item)).label,
      responsibleMissing: readResponsible(asRecord(item)).missing,
      priority: "high",
      ctaLabel: "Resolver mensagem",
      path: "/whatsapp",
    };
  });
}

function AttentionRow({
  item,
  navigate,
}: {
  item: AttentionItem;
  navigate: (path: string) => void;
}) {
  return (
    <OperationalInnerCard className="grid w-full min-w-0 gap-2 border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/35 p-2.5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--danger)]/25 bg-[var(--danger)]/8">
        <ShieldAlert className="h-4 w-4 text-[var(--danger)]" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <AppStatusBadge
            label={
              item.severity === "critical"
                ? "Crítico"
                : item.severity === "high"
                  ? "Ação"
                  : "Monitorar"
            }
          />
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {compactIncidentTitle(item.title)}
          </p>
        </div>
        <p className="mt-1 line-clamp-1 text-xs leading-4 text-[var(--text-secondary)]">
          Impacto: {item.impact}
        </p>
      </div>
      {item.primaryValue ? (
        <strong className="text-2xl font-semibold leading-none text-[var(--text-primary)] md:text-right">
          {item.primaryValue}
        </strong>
      ) : null}
      <Button
        className="h-8 w-full shrink-0 px-3 text-xs md:w-auto"
        size="sm"
        onClick={() => navigate(item.path)}
      >
        {item.ctaLabel}
      </Button>
    </OperationalInnerCard>
  );
}

export default function ExecutiveDashboard() {
  useRenderWatchdog("ExecutiveDashboard");
  const [, navigate] = useLocation();
  const { isAuthenticated, role } = useAuth();
  const kpisQuery = trpc.dashboard.kpis.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const alertsQuery = trpc.dashboard.alerts.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const pendingWhatsAppApprovalsQuery =
    trpc.nexo.whatsapp.listPendingApprovals.useQuery(
      { limit: 10 },
      { enabled: isAuthenticated, retry: false }
    );
  const operationalStateQuery = trpc.dashboard.operationalState.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      retry: false,
    }
  );
  const operationalSignalsQuery = trpc.dashboard.operationalSignals.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated, retry: false }
  );
  const nextBestActionQuery = trpc.dashboard.nextBestAction.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      retry: false,
    }
  );
  const timelineQuery = trpc.nexo.timeline.listByOrg.useQuery(
    { limit: 3 },
    { enabled: isAuthenticated, retry: false }
  );

  const metrics = useMemo(() => asRecord(kpisQuery.data), [kpisQuery.data]);
  const alerts = useMemo(() => asAlerts(alertsQuery.data), [alertsQuery.data]);
  const signals = operationalSignalsQuery.data?.signals ?? [];
  const attention = useMemo(() => buildAttention(signals), [signals]);
  const queue = useMemo(() => buildQueue(alerts), [alerts]);
  const hasMissingResponsible = queue.some(item => item.responsibleMissing);
  const pendingWhatsAppApprovals = Array.isArray(
    pendingWhatsAppApprovalsQuery.data
  )
    ? (pendingWhatsAppApprovalsQuery.data as WhatsAppActionExecution[])
    : [];
  // Métricas e alertas formam a leitura mínima. Sinais auxiliares degradam
  // apenas seus próprios blocos e nunca escondem dados operacionais válidos.
  const pageLoading =
    (kpisQuery.isLoading && !kpisQuery.data) ||
    (alertsQuery.isLoading && !alertsQuery.data);
  const pageError = kpisQuery.isError && alertsQuery.isError;
  const unavailableSources = [
    kpisQuery.isError ? "KPIs" : null,
    alertsQuery.isError ? "alertas e fila" : null,
    operationalStateQuery.isError ? "estado operacional" : null,
    operationalSignalsQuery.isError ? "sinais de risco" : null,
    nextBestActionQuery.isError ? "próxima melhor ação" : null,
    timelineQuery.isError ? "prova da Timeline" : null,
    pendingWhatsAppApprovalsQuery.isError ? "aprovações WhatsApp" : null,
  ].filter((source): source is string => Boolean(source));
  const isPartiallyUnavailable = unavailableSources.length > 0 && !pageError;
  const dashboardState = resolveExecutiveDashboardState({
    isLoading: pageLoading,
    isError: pageError,
    backendState: operationalStateQuery.data?.dashboardState,
  });
  const comparison = asRecord(metrics.comparison);
  const pulseComparisons: Array<[string, ComparisonKey, boolean?]> = [
    ["Receita recebida", "revenueReceivedPct"],
    ["O.S. concluídas", "completedServiceOrdersPct"],
    ["Cobranças vencidas", "overdueChargesPct", true],
    ["Mensagens falhando", "failedMessagesPct", true],
  ];
  const criticalCount = attention.filter(
    item => item.severity === "critical"
  ).length;
  const overdueOrders = alerts.overdueOrders?.count ?? 0;
  const todayServicesCount = alerts.todayServices?.count ?? 0;
  const overdueCharges = alerts.overdueCharges?.count ?? 0;
  const missingCharges = alerts.doneOrdersWithoutCharge?.count ?? 0;
  const timelineEvents = normalizeTimelineEvents(timelineQuery.data);
  const operationLevel: OperationalStateLevel =
    operationalStateQuery.data?.operationalState ?? "UNKNOWN";
  const operationStateReason = operationalStateQuery.isError
    ? "Não foi possível consultar o estado operacional."
    : (operationalStateQuery.data?.reason ??
      "A fonte oficial não forneceu justificativa para este estado.");

  // O contrato atual expõe volumes por etapa, mas não um estado oficial por
  // etapa. Por isso o pipeline declara o estado indisponível em vez de inferir
  // bloqueio, conclusão ou criticidade a partir das contagens.
  const flow: FlowStage[] = [
    {
      id: "customers",
      label: "Cliente",
      value: String(readNumber(metrics, "totalCustomers")),
      context: "clientes ativos",
      path: "/customers",
      action: "Ver clientes",
      state: "unavailable",
    },
    {
      id: "appointments",
      label: "Agendamento",
      value: String(todayServicesCount),
      context: "agendamentos de hoje",
      path: "/appointments",
      action: "Ver agenda",
      state: "unavailable",
    },
    {
      id: "service-orders",
      label: "O.S.",
      value: String(readNumber(metrics, "openServiceOrders")),
      context: "ordens abertas",
      path: "/service-orders",
      action: "Ver execução",
      state: "unavailable",
    },
    {
      id: "charges",
      label: "Cobrança",
      value: String(readNumber(metrics, "chargesGenerated")),
      context: "cobranças geradas",
      path: "/finances?view=charges",
      action: "Ver cobranças",
      state: "unavailable",
    },
    {
      id: "payments",
      label: "Pagamento",
      value:
        readNullableNumber(metrics, "paymentsReceivedCount") === null
          ? "—"
          : String(readNullableNumber(metrics, "paymentsReceivedCount")),
      context:
        readNullableNumber(metrics, "paymentsReceivedCount") === null
          ? "volume não disponível no contrato"
          : "pagamentos recebidos nesta semana",
      path: "/finances?view=paid",
      action: "Ver pagamentos",
      state: "unavailable",
    },
  ];
  const operationStateMetrics = [
    {
      label: "O.S. atrasadas",
      value: alertsQuery.isError ? "—" : String(overdueOrders),
      tone: "neutral",
    },
    {
      label: "Cobranças vencidas",
      value: alertsQuery.isError ? "—" : String(overdueCharges),
      tone: "neutral",
    },
    {
      label: "Sinais exibidos",
      value: operationalSignalsQuery.isError ? "—" : String(attention.length),
      tone: "neutral",
    },
    {
      label: "Fonte do estado",
      value: operationalStateQuery.data?.source ?? "indisponível",
      tone: "neutral",
    },
  ] satisfies Array<{
    label: string;
    value: string;
    tone: "neutral" | "warning" | "danger";
  }>;
  const failedMessages = readNumber(
    asRecord(metrics.whatsappSignals),
    "failedMessages"
  );
  const revenueTrend = describeMicroTrend(
    readNullableNumber(comparison, "revenueReceivedPct")
  );
  const completedOrdersTrend = describeMicroTrend(
    readNullableNumber(comparison, "completedServiceOrdersPct")
  );
  const overdueChargesTrend = describeMicroTrend(
    readNullableNumber(comparison, "overdueChargesPct"),
    true
  );
  const failedMessagesTrend = describeMicroTrend(
    readNullableNumber(comparison, "failedMessagesPct"),
    true
  );
  const nextBestAction = nextBestActionQuery.data;
  const recommendedAction: RecommendedAction | null = nextBestAction
    ? {
        title: formatCurrencyMentions(nextBestAction.title),
        entity: nextBestAction.serviceOrderId
          ? `O.S. #${nextBestAction.serviceOrderId}`
          : nextBestAction.chargeId
            ? `Cobrança #${nextBestAction.chargeId}`
            : nextBestAction.messageId
              ? `Mensagem #${nextBestAction.messageId}`
              : nextBestAction.area || "Operação",
        reason: formatCurrencyMentions(nextBestAction.reason),
        impact: formatCurrencyMentions(nextBestAction.impact),
        path: nextBestAction.routeHint,
        ctaLabel: nextBestAction.suggestedAction,
        safetyNote:
          "Sinal retornado pelo motor operacional; execução permanece no módulo de origem.",
        primaryValue: extractFirstNumber(
          `${nextBestAction.title} ${nextBestAction.impact}`
        ),
      }
    : null;
  const availableComparisons = pulseComparisons.flatMap(
    ([label, key, lowerIsBetter]) => {
      const value = readNullableNumber(comparison, key);
      return value === null
        ? []
        : [describeComparison(label, value, lowerIsBetter)];
    }
  );
  const missingComparisonCount =
    pulseComparisons.length - availableComparisons.length;
  const hasOperationalData = dashboardState !== "EMPTY";
  const weeklyRevenueInCents = readNumber(metrics, "weeklyRevenueInCents");
  const kpiCards = [
    {
      label: "Receita da semana",
      value: formatCurrencyFromCents(weeklyRevenueInCents),
      context:
        weeklyRevenueInCents > 0
          ? `Pagamentos registrados no período atual. ${revenueTrend}.`
          : `Sem pagamentos registrados. Sem pagamentos registrados no período. ${revenueTrend}.`,
      cta: "Ver pagamentos",
      path: "/finances?view=paid",
      Icon: WalletCards,
    },
    {
      label: "Execução em aberto",
      value: String(readNumber(metrics, "openServiceOrders")),
      context:
        overdueOrders > 0
          ? `${overdueOrders} atrasada(s) exigem ação. ${completedOrdersTrend}.`
          : `Sem atraso retornado. ${completedOrdersTrend}.`,
      cta: "Abrir execução",
      path: "/service-orders?status=open",
      Icon: ClipboardList,
    },
    {
      label: "Caixa em risco",
      value: formatCurrencyFromCents(
        alerts.overdueCharges?.totalAmountCents ?? 0
      ),
      context:
        overdueCharges > 0
          ? `${formatCurrencyFromCents(alerts.overdueCharges?.totalAmountCents ?? 0)} vencidos exigem cobrança. ${overdueChargesTrend}.`
          : `Sem carteira vencida retornada. ${overdueChargesTrend}.`,
      cta: "Abrir cobranças",
      path: "/finances?view=charges&status=overdue",
      Icon: CircleDollarSign,
    },
    {
      label: "Falhas de comunicação",
      value: String(failedMessages),
      context:
        failedMessages > 0
          ? `Falhas podem bloquear confirmações. ${failedMessagesTrend}.`
          : `Sem falhas bloqueando operação. ${failedMessagesTrend}.`,
      cta: "Revisar WhatsApp",
      path: "/whatsapp",
      Icon: MessageSquareWarning,
    },
  ];

  const quickAccesses = [
    {
      label: "Ver financeiro",
      path: "/finances?view=charges&status=overdue",
      Icon: CircleDollarSign,
    },
    {
      label: "Ver O.S.",
      path: "/service-orders?status=attention",
      Icon: ClipboardList,
    },
    {
      label: "Ver agendamentos",
      path: "/appointments?status=pending-confirmation",
      Icon: CalendarClock,
    },
    {
      label: "Ver WhatsApp",
      path: "/whatsapp",
      Icon: MessageSquareWarning,
    },
    {
      label: "Ver timeline",
      path: "/timeline",
      Icon: Clock3,
    },
    {
      label: "Ver governança",
      path: "/governance",
      Icon: ShieldCheck,
    },
  ];
  const pulseInsights = [
    {
      label: "Receita",
      keyword: formatCurrencyFromCents(weeklyRevenueInCents),
      Icon: WalletCards,
      iconClass: "text-[var(--text-muted)]",
      text: "Recebimentos registrados na semana.",
      trend: revenueTrend,
    },
    {
      label: "Execução",
      keyword: `${readNumber(metrics, "openServiceOrders")} O.S. abertas`,
      Icon: Clock3,
      iconClass: "text-[var(--text-muted)]",
      text: "Volume oficial de ordens em aberto.",
      trend: completedOrdersTrend,
    },
    {
      label: "Contato",
      keyword: `${failedMessages} falha(s)`,
      Icon: MessageSquareWarning,
      iconClass: "text-[var(--text-muted)]",
      text: "Falhas registradas no canal oficial.",
      trend: failedMessagesTrend,
    },
    {
      label: "Cobranças",
      keyword: formatCurrencyFromCents(
        alerts.overdueCharges?.totalAmountCents ?? 0
      ),
      Icon: WalletCards,
      iconClass: "text-[var(--text-muted)]",
      text: "Valor vencido retornado pelo contrato.",
      trend: overdueChargesTrend,
    },
  ];
  const statusLabel = executiveDashboardStateLabel[dashboardState];
  const roleContext =
    role === "ADMIN"
      ? "Visão administrativa"
      : role === "MANAGER"
        ? "Visão de gestão"
        : role === "STAFF"
          ? "Visão operacional"
          : "Visão de consulta";
  const executiveContactSummary = [
    `${readNumber(asRecord(metrics.whatsappSignals), "customersNoResponse")} aguardando resposta`,
    `${pendingWhatsAppApprovals.length} aprovações pendentes`,
    `${failedMessages} falhas relevantes`,
    `${readNumber(asRecord(metrics.whatsappSignals), "customersNoResponse")} clientes sem retorno`,
  ].join(" · ");
  return (
    <AppPageShell className="gap-3 sm:gap-4">
      <AppOperationalHeader
        density="compact"
        title="Operação hoje"
        description="Decida primeiro o que destrava execução e caixa."
        contextChips={
          <>
            <AppContextChip>{formatPeriod()}</AppContextChip>
            <AppContextChip>Período: Hoje / Semana / 30 dias</AppContextChip>
            <AppContextChip
              tone={operationLevel === "NORMAL" ? "success" : "accent"}
            >
              Estado: {operationLevel}
            </AppContextChip>
            <AppContextChip>{roleContext}</AppContextChip>
            <AppContextChip tone={criticalCount > 0 ? "danger" : "neutral"}>
              {operationalSignalsQuery.isError
                ? "Riscos críticos indisponíveis"
                : `${criticalCount} ${criticalCount === 1 ? "risco crítico" : "riscos críticos"}`}
            </AppContextChip>
            <AppContextChip tone={overdueCharges > 0 ? "warning" : "neutral"}>
              {alertsQuery.isError
                ? "Cobranças vencidas indisponíveis"
                : `${overdueCharges} cobranças vencidas`}
            </AppContextChip>
            <AppContextChip tone={overdueOrders > 0 ? "warning" : "neutral"}>
              {alertsQuery.isError
                ? "O.S. atrasadas indisponíveis"
                : `${overdueOrders} O.S. atrasadas`}
            </AppContextChip>
          </>
        }
      />

      {pageLoading ? (
        <AppPageLoadingState
          title="Carregando mesa de comando"
          description="Buscando riscos, fila e indicadores operacionais reais."
        />
      ) : null}
      {pageError ? (
        <AppPageErrorState
          title="Não foi possível ler a operação"
          description="Não foi possível consultar a próxima ação. Falhou essa ou outra fonte do Dashboard; a operação não assume que está tudo bem quando a leitura está indisponível."
          onAction={() => {
            void kpisQuery.refetch();
            void alertsQuery.refetch();
            void operationalStateQuery.refetch();
            void operationalSignalsQuery.refetch();
            void nextBestActionQuery.refetch();
          }}
        />
      ) : null}
      {isPartiallyUnavailable ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 p-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <strong className="text-[var(--text-primary)]">
              Leitura parcial.
            </strong>{" "}
            Indisponível agora: {unavailableSources.join(", ")}. Os dados
            visíveis permanecem válidos; ausência de sinal não indica operação
            saudável.
          </p>
          <Button
            className="shrink-0"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (kpisQuery.isError) void kpisQuery.refetch();
              if (alertsQuery.isError) void alertsQuery.refetch();
              if (operationalStateQuery.isError)
                void operationalStateQuery.refetch();
              if (operationalSignalsQuery.isError)
                void operationalSignalsQuery.refetch();
              if (nextBestActionQuery.isError)
                void nextBestActionQuery.refetch();
              if (timelineQuery.isError) void timelineQuery.refetch();
              if (pendingWhatsAppApprovalsQuery.isError)
                void pendingWhatsAppApprovalsQuery.refetch();
            }}
          >
            Tentar fontes indisponíveis novamente
          </Button>
        </div>
      ) : null}
      {!pageLoading && !pageError && !hasOperationalData ? (
        <div className="space-y-3">
          <AppPageEmptyState
            title="Ainda não há dados operacionais"
            description="Nenhuma avaliação operacional foi concluída com dados avaliáveis. Cadastre ou importe o primeiro cliente para iniciar. A operação não cria alertas ou recomendações fictícias, nem inventa riscos, valores, cobranças ou ações."
          />
          <div className="flex justify-center">
            <Button onClick={() => navigate("/customers")}>
              Cadastrar ou importar primeiro cliente
            </Button>
          </div>
        </div>
      ) : null}

      {!pageLoading && !pageError && hasOperationalData ? (
        <div className="w-full min-w-0 space-y-3 sm:space-y-4">
          <AppSectionBlock
            title="Atenção imediata"
            compact
            className="border-[var(--danger)]/30 bg-[var(--surface-base)]"
            subtitle="Riscos que interrompem execução, recebimento ou atendimento."
          >
            {attention.length > 0 ? (
              <div className="w-full min-w-0 divide-y divide-[var(--border-subtle)]/70">
                {attention.map(item => (
                  <AttentionRow key={item.id} item={item} navigate={navigate} />
                ))}
              </div>
            ) : (
              <AppPageEmptyState
                title={
                  operationalSignalsQuery.isError
                    ? "Atenção imediata indisponível"
                    : "Nenhum sinal operacional retornado"
                }
                description={
                  operationalSignalsQuery.isError
                    ? "O contrato oficial de sinais não pôde ser consultado. Nenhum risco foi inferido a partir de KPIs ou alertas auxiliares."
                    : "A fonte oficial não retornou sinais para esta leitura; isso não é apresentado como confirmação de operação saudável."
                }
              />
            )}
          </AppSectionBlock>

          <AppSectionBlock
            title="Próxima melhor ação"
            compact
            className={dashboardSectionClass}
            subtitle="Ação contextual mais importante retornada pelos sinais operacionais."
          >
            {recommendedAction ? (
              <NexoPriorityPanel
                title={recommendedAction.title}
                entity={recommendedAction.entity}
                reason={recommendedAction.reason}
                impact={recommendedAction.impact}
                safetyNote={recommendedAction.safetyNote}
                primaryValue={recommendedAction.primaryValue}
                primaryActionLabel={recommendedAction.ctaLabel}
                onPrimaryAction={() => navigate(recommendedAction.path)}
                className="border-[var(--accent-primary)]/55 bg-[var(--accent-soft)]/50"
              />
            ) : (
              <div className="space-y-2">
                <AppPageEmptyState
                  title={
                    nextBestActionQuery.isError
                      ? "Próxima ação indisponível"
                      : "Nenhuma ação prioritária encontrada."
                  }
                  description={
                    nextBestActionQuery.isError
                      ? "A fonte desta recomendação falhou. Use a fila e os alertas disponíveis ou tente novamente; nenhuma recomendação foi inventada."
                      : "Nenhuma ação prioritária retornada para o período."
                  }
                />
                {nextBestActionQuery.isError ? (
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void nextBestActionQuery.refetch()}
                    >
                      Tentar próxima ação novamente
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </AppSectionBlock>

          <AppSectionBlock
            title="KPIs operacionais"
            compact
            className={dashboardSectionClass}
            subtitle="Indicadores de apoio para decidir rápido."
          >
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {kpiCards.map(({ label, value, context, cta, path, Icon }) => (
                <NexoExecutiveMetric
                  key={label}
                  title={label}
                  value={value}
                  context={context}
                  icon={<Icon className="h-4 w-4" />}
                  ctaLabel={cta}
                  onClick={() => navigate(path)}
                />
              ))}
            </div>
          </AppSectionBlock>

          <AppSectionBlock
            title="Fluxo operacional"
            compact
            className={dashboardSectionClass}
            subtitle="Gargalos do fluxo Cliente → Agendamento → O.S. → Cobrança → Pagamento."
          >
            <NexoOperationalPipeline
              title="Etapas operacionais"
              subtitle="Volumes oficiais por etapa; o estado de cada etapa permanece indisponível até existir contrato autoritativo."
              stages={flow.map(stage => ({
                id: stage.id,
                label: stage.label,
                summary: stage.context,
                state: stage.state,
                countOrValue: stage.value,
                hrefLabel: stage.action,
                onClick: () => navigate(stage.path),
              }))}
            />
          </AppSectionBlock>

          <AppSectionBlock
            title="Fila operacional"
            compact
            className={dashboardSectionClass}
            subtitle="Itens que exigem execução, ordenados por urgência."
          >
            {queue.length > 0 ? (
              <div className="w-full min-w-0">
                <div className="max-h-[340px] w-full min-w-0 overflow-auto rounded-xl border border-[var(--border-subtle)]/70 p-2">
                  <div className="grid min-w-0 gap-2 text-xs">
                    {queue.slice(0, 10).map(item => (
                      <OperationalInnerCard
                        key={`${item.type}-${item.id}`}
                        className="grid min-w-0 gap-2 border-[var(--border-subtle)]/60 bg-[var(--surface-primary)]/35 p-2.5 text-[var(--text-secondary)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {item.type}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              · {presentationStatusLabel(item.status)}
                            </span>
                          </div>
                          <strong className="mt-1 block truncate text-sm text-[var(--text-primary)]">
                            {item.entity}
                          </strong>
                          <p className="mt-0.5 line-clamp-1 text-xs">
                            {item.context}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                            <span>{item.dueLabel}</span>
                            <span>
                              Responsável:{" "}
                              <span
                                className={
                                  item.responsibleMissing
                                    ? "text-[var(--text-muted)]"
                                    : "text-[var(--text-secondary)]"
                                }
                                title={
                                  item.responsibleMissing
                                    ? "Responsável não informado"
                                    : item.responsible
                                }
                                aria-label={
                                  item.responsibleMissing
                                    ? "Responsável não informado"
                                    : undefined
                                }
                              >
                                {item.responsible}
                              </span>
                            </span>
                          </div>
                        </div>
                        <Button
                          className="h-8 justify-self-start px-3 text-xs md:justify-self-end"
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(item.path)}
                        >
                          {item.ctaLabel}
                        </Button>
                      </OperationalInnerCard>
                    ))}
                  </div>
                </div>
                {hasMissingResponsible ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Alguns itens não retornaram responsável pela fonte atual.
                  </p>
                ) : null}
                <Button
                  className="mt-2 h-auto px-0 py-0 text-[var(--accent-primary)]"
                  variant="link"
                  size="sm"
                  onClick={() => navigate("/timeline")}
                >
                  Abrir Timeline
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <AppPageEmptyState
                title="Fila operacional sem itens retornados"
                description="Não há itens acionáveis na leitura atual. A operação não preenche a fila com exemplos."
              />
            )}
          </AppSectionBlock>

          <AppSectionBlock
            title="Pulso da operação"
            compact
            className="border-[var(--accent-primary)]/20 bg-[var(--accent-soft)]/20"
            subtitle="Tendências e sinais qualitativos depois da fila operacional."
          >
            <div className="flex w-full min-w-0 flex-col divide-y divide-[var(--border-subtle)]/70 lg:flex-row lg:divide-x lg:divide-y-0">
              {pulseInsights.map(
                ({ label, keyword, Icon, iconClass, text, trend }) => (
                  <article
                    key={label}
                    className="w-full min-w-0 px-3 py-3 text-sm leading-5 text-[var(--text-secondary)] first:pt-0 lg:flex-1 lg:first:pt-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--accent-primary)]/20 bg-[var(--surface-elevated)]/75">
                        <Icon className={`h-4 w-4 ${iconClass}`} />
                      </span>
                      <strong className="text-[var(--text-primary)]">
                        {label}
                      </strong>
                    </div>
                    <p className="text-base font-semibold leading-5 text-[var(--text-primary)]">
                      {keyword}
                    </p>
                    <p className="mt-1 line-clamp-1">{text}</p>
                    <span className="mt-2 inline-flex rounded-full border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/55 px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                      {trend}
                    </span>
                  </article>
                )
              )}
            </div>
            {availableComparisons.length > 0 || missingComparisonCount > 0 ? (
              <div className="mt-3 border-t border-[var(--border-subtle)]/70 pt-2 text-xs leading-5 text-[var(--text-secondary)]">
                {availableComparisons.map(item => (
                  <p key={item}>
                    <TrendingDown className="mr-1.5 inline h-3.5 w-3.5" />
                    {item}
                  </p>
                ))}
                {missingComparisonCount > 0 ? (
                  <p className="mt-1">
                    Histórico em formação: sem base histórica suficiente para{" "}
                    {missingComparisonCount} de {pulseComparisons.length}{" "}
                    indicador(es).
                  </p>
                ) : null}
              </div>
            ) : null}
          </AppSectionBlock>

          <div className="grid w-full min-w-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <NexoGovernanceDecisionCard
              level={operationLevel}
              title="Estado operacional"
              reason={operationStateReason}
              impact={
                operationalStateQuery.data?.evidenceAt
                  ? `Evidência registrada em ${formatEventDateTime(operationalStateQuery.data.evidenceAt)}.`
                  : "Nenhuma evidência operacional confiável disponível."
              }
              detailsLabel="Abrir governança"
              metrics={operationStateMetrics}
              onDetails={() => navigate("/governance")}
            />

            <NexoEvidenceTimeline
              className="h-full"
              events={timelineEvents}
              fullTimelineLabel="Ver Timeline"
              onFullTimeline={() => navigate("/timeline")}
            />
          </div>

          <AppSectionBlock
            title="WhatsApp executivo"
            compact
            className={dashboardSectionClass}
            subtitle="Leitura consolidada de contato, sem inbox e sem tarefas."
          >
            <OperationalInnerCard className="border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/35 text-sm text-[var(--text-secondary)]">
              <strong className="block text-[var(--text-primary)]">
                Contato operacional
              </strong>
              <p className="mt-1">{executiveContactSummary}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Orientação: responder somente o que destrava confirmação,
                aprovação, falha relevante ou cliente sem retorno.
              </p>
            </OperationalInnerCard>
          </AppSectionBlock>

          <AppSectionBlock
            title="Acessos rápidos contextuais"
            compact
            className={fullWidthLayoutClass}
            subtitle="Atalhos secundários da operação."
          >
            <div className="flex w-full min-w-0 flex-wrap gap-2">
              {quickAccesses.map(({ label, path, Icon }) => (
                <button
                  type="button"
                  key={path}
                  className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-primary)]/45 px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                  onClick={() => navigate(path)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                    <span>{label}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                </button>
              ))}
            </div>
            <div className="mt-3 w-full min-w-0 border-t border-[var(--border-subtle)]/70 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Aprovações WhatsApp · {pendingWhatsAppApprovals.length}
                </p>
                {pendingWhatsAppApprovals.length > 0 ? (
                  <Button
                    className="h-auto px-0 py-0 text-[var(--accent-primary)]"
                    variant="link"
                    size="sm"
                    onClick={() => navigate("/whatsapp")}
                  >
                    Abrir aprovações
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              {pendingWhatsAppApprovalsQuery.isError ? (
                <p className="mt-2 text-xs text-[var(--danger)]">
                  Não foi possível carregar aprovações WhatsApp nesta leitura.
                </p>
              ) : pendingWhatsAppApprovals.length > 0 ? (
                <div className="mt-1 divide-y divide-[var(--border-subtle)]/70">
                  {pendingWhatsAppApprovals.slice(0, 2).map(execution => (
                    <button
                      type="button"
                      key={execution.id}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                      onClick={() =>
                        navigate(buildWhatsAppExecutionPath(execution))
                      }
                    >
                      <span>
                        {whatsappActionLabel(execution.suggestedAction)} ·{" "}
                        {formatWhatsAppExecutionDate(execution.createdAt)}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Nenhuma aprovação pendente retornada. Sem prova operacional
                  recente retornada quando a Timeline não trouxer eventos.
                </p>
              )}
            </div>
          </AppSectionBlock>
        </div>
      ) : null}
    </AppPageShell>
  );
}

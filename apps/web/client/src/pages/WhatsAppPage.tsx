import {
  memo,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Bell,
  ArrowLeft,
  Bot,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  EllipsisVertical,
  FileText,
  Info,
  MessageCircleMore,
  Paperclip,
  Search,
  Send,
  Star,
  Volume2,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";
import { cn } from "@/lib/utils";
import { presentationStatusLabel } from "@/lib/presentation-status";
import { Button } from "@/components/ui/button";
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownLabel,
  AppDropdownSeparator,
  AppDropdownTrigger,
  AppPageShell,
  AppSkeleton,
} from "@/components/app-system";
import { OperationalInnerCard } from "@/components/operational";
import { ConfirmModal, FormModal } from "@/components/app-modal-system";
import {
  AppContextChip,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
} from "@/components/internal-page-system";
import {
  WhatsAppActionExecutionPanel,
  type WhatsAppActionExecution,
  type WhatsAppSuggestedAction,
} from "@/lib/whatsappActionExecution";

type ConversationFilter = "all" | "waiting_customer" | "resolved";

type WhatsAppConversationStatus =
  | "OPEN"
  | "WAITING_CUSTOMER"
  | "WAITING_OPERATOR"
  | "PENDING"
  | "RESOLVED"
  | "FAILED";
type WhatsAppPriority = "LOW" | "NORMAL" | "MEDIUM" | "HIGH" | "CRITICAL";
type ContextType =
  | "CUSTOMER"
  | "CHARGE"
  | "APPOINTMENT"
  | "SERVICE_ORDER"
  | "PAYMENT"
  | "GENERAL";
type MessageDirection = "INBOUND" | "OUTBOUND";
type MessageStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "UNCERTAIN"
  | "CANCELED";
export type OperationalMessageType =
  | "APPOINTMENT_CONFIRMATION"
  | "APPOINTMENT_REMINDER"
  | "SERVICE_UPDATE"
  | "PAYMENT_LINK"
  | "PAYMENT_REMINDER"
  | "PAYMENT_CONFIRMATION"
  | "CUSTOMER_NOTIFICATION"
  | "MANUAL"
  | "REMIND_24H"
  | "RECEIPT"
  | "EXECUTION_CONFIRMATION";

const DEFAULT_MANUAL_MESSAGE_TYPE: OperationalMessageType = "MANUAL";

const VALID_OPERATIONAL_MESSAGE_TYPES = new Set<OperationalMessageType>([
  "APPOINTMENT_CONFIRMATION",
  "APPOINTMENT_REMINDER",
  "SERVICE_UPDATE",
  "PAYMENT_LINK",
  "PAYMENT_REMINDER",
  "PAYMENT_CONFIRMATION",
  "CUSTOMER_NOTIFICATION",
  "MANUAL",
  "REMIND_24H",
  "RECEIPT",
  "EXECUTION_CONFIRMATION",
]);

type ComposerActionGroupName =
  | "Comunicação"
  | "Financeiro"
  | "Agenda"
  | "Ordem de serviço"
  | "Execução assistida";

type ComposerActionGroupId =
  | "communication"
  | "finance"
  | "agenda"
  | "serviceOrder"
  | "execution";

type ComposerActionAvailability =
  | "primary"
  | "secondary"
  | "unavailable"
  | "upcoming";

type ComposerActionDescriptor = {
  key: string;
  label: string;
  group: ComposerActionGroupName;
  groupId: ComposerActionGroupId;
  description?: string;
  disabled?: boolean;
  reason?: string;
  availability?: ComposerActionAvailability;
};

type WhatsAppComposerAction = ComposerActionDescriptor & {
  icon: ReactNode;
  onSelect?: () => void;
};

type WhatsAppComposerActionPalette = {
  primaryActions: ComposerActionDescriptor[];
  secondaryActions: ComposerActionDescriptor[];
  unavailableActions: ComposerActionDescriptor[];
  upcomingActions: ComposerActionDescriptor[];
  recommendedActions: ComposerActionDescriptor[];
  groupedActions: Record<ComposerActionGroupName, ComposerActionDescriptor[]>;
};

type OfficialComposerAction = ComposerActionDescriptor & {
  action: WhatsAppSuggestedAction | null;
  target?: { entityType: string; entityId: string | null } | null;
  requiresHumanApproval: boolean;
  logicalKey?: string | null;
};

/** Presentation-only projection of actions evaluated by the API. */
export function presentOfficialWhatsAppActions(
  actions: OfficialComposerAction[] = []
): WhatsAppComposerActionPalette {
  const groupedActions = Object.fromEntries(
    (
      [
        "Comunicação",
        "Financeiro",
        "Agenda",
        "Ordem de serviço",
        "Execução assistida",
      ] as ComposerActionGroupName[]
    ).map(group => [group, actions.filter(action => action.group === group)])
  ) as unknown as Record<ComposerActionGroupName, ComposerActionDescriptor[]>;
  return {
    primaryActions: actions.filter(action => action.availability === "primary"),
    secondaryActions: actions.filter(
      action => action.availability === "secondary"
    ),
    unavailableActions: actions.filter(
      action => action.availability === "unavailable"
    ),
    upcomingActions: actions.filter(
      action => action.availability === "upcoming"
    ),
    recommendedActions: actions.filter(
      action => action.availability === "primary"
    ),
    groupedActions,
  };
}

function resolveComposerErrorMessage(error: unknown) {
  const fallback = "Falha ao enviar mensagem.";
  const rawMessage =
    typeof error === "string"
      ? error
      : ((error as { message?: string })?.message ?? fallback);
  if (rawMessage.includes("Please login (10001)")) {
    return "Sessão expirada. Faça login novamente para enviar mensagens.";
  }
  return rawMessage;
}

type Customer = {
  id?: string | number;
  name?: string;
  phone?: string | null;
  [key: string]: any;
};

type Conversation = {
  id: string;
  conversationId?: string | null;
  customerId?: string | null;
  name: string;
  phone?: string | null;
  title?: string | null;
  lastMessage: string;
  lastMessageAt?: string | null;
  status: WhatsAppConversationStatus | null;
  contextType: ContextType;
  priority: WhatsAppPriority | null;
  priorityReason?: string | null;
  inboxPosition?: number | null;
  governanceSignal?: {
    communicationFailure?: boolean;
    failedMessageCount?: number;
    lastFailedAt?: string | null;
  } | null;
  failedMessageCount?: number;
  lastFailedAt?: string | null;
  hasNoResponse?: boolean;
  unreadCount: number | null;
  contextId?: string | null;
  operationalStatus?: string;
  contextHint?: string | null;
  hasPendingCharge?: boolean;
  hasUpcomingAppointment?: boolean;
  hasActiveServiceOrder?: boolean;
  hasFailedDelivery?: boolean;
  isVirtual?: boolean;
  customer?: { id?: string; name?: string; phone?: string | null } | null;
  responsibleName?: string | null;
};

type ChatMessage = {
  id: string;
  direction: MessageDirection;
  content: string;
  createdAt?: string | null;
  status: MessageStatus;
  messageType?: string | null;
  errorMessage?: string | null;
};

export type WhatsAppContext = {
  customer?: { id?: string; name?: string; phone?: string } | null;
  nextAppointment?: {
    id?: string;
    scheduledAt?: string;
    status?: string;
    serviceName?: string | null;
  } | null;
  activeServiceOrder?: {
    id?: string;
    number?: string | null;
    status?: string;
    technician?: string | null;
  } | null;
  openCharge?: {
    id?: string;
    amount?: number;
    dueDate?: string;
    status?: string;
    daysOverdue?: number | null;
    paymentLink?: string | null;
  } | null;
  lastInteraction?: {
    direction?: string;
    status?: string;
    createdAt?: string;
  } | null;
  suggestedAction?: {
    type?: string;
    label?: string;
    reason?: string;
    entityType?: string;
    entityId?: string | null;
  } | null;
  officialActions?: OfficialComposerAction[];
  intelligence?: {
    intent?: string | null;
    intentReason?: string | null;
    priority?: string | null;
    priorityReason?: string | null;
    slaStatus?: string | null;
    responseDueAt?: string | null;
  } | null;
  governanceSignal?: {
    communicationFailure?: boolean;
    failedMessageCount?: number;
    lastFailedAt?: string | null;
  } | null;
  evaluatedAt?: string | null;
  governanceAlert?: string | null;
};

const FILTERS: Array<{
  value: ConversationFilter;
  label: string;
  count: string;
}> = [
  { value: "all", label: "Geral", count: "" },
  { value: "waiting_customer", label: "Aguardando", count: "" },
  { value: "resolved", label: "Resolvidas", count: "" },
];

const QUICK_COMPOSER_TEMPLATES = [
  "Cobrança pendente",
  "Lembrete de agendamento",
  "Confirmação de agendamento",
  "Atualização de O.S.",
  "Mensagem livre",
] as const;

const statusUi: Record<
  WhatsAppConversationStatus,
  { label: string; dot: string }
> = {
  OPEN: { label: "Aberta", dot: "bg-amber-400" },
  WAITING_CUSTOMER: { label: "Aguardando cliente", dot: "bg-sky-400" },
  WAITING_OPERATOR: { label: "Aguardando operação", dot: "bg-amber-400" },
  PENDING: { label: "Pendente", dot: "bg-[var(--accent-primary)]" },
  RESOLVED: { label: "Resolvida", dot: "bg-emerald-400" },
  FAILED: { label: "Falha", dot: "bg-rose-400" },
};

const ROW_HEIGHT = 116;
const NO_APPOINTMENT_TEXT = "Sem agendamento futuro";
const NO_SERVICE_ORDER_TEXT = "Nenhuma O.S. ativa";
const NO_CHARGE_TEXT = "Nenhuma cobrança pendente";

function normalizeCustomersPayload(payload: unknown): Customer[] {
  const raw = payload as any;
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw?.data?.items)) return raw.data.items;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  if (Array.isArray(raw?.data?.data?.items)) return raw.data.data.items;

  if (Array.isArray(raw?.result?.data)) return raw.result.data;
  if (Array.isArray(raw?.result?.data?.items)) return raw.result.data.items;
  if (Array.isArray(raw?.result?.data?.json)) return raw.result.data.json;
  if (Array.isArray(raw?.result?.data?.json?.data))
    return raw.result.data.json.data;
  if (Array.isArray(raw?.result?.data?.json?.items))
    return raw.result.data.json.items;
  if (Array.isArray(raw?.result?.data?.json?.data?.items))
    return raw.result.data.json.data.items;

  return [];
}

function fmtDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Keep personal and provider identifiers out of the operational surface. */
export function maskPhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "Telefone cadastrado";
  return `•••• ${digits.slice(-4)}`;
}

export function getMessageDeliveryPresentation(message: ChatMessage) {
  const labels: Record<MessageStatus, string> = {
    QUEUED: "Na fila",
    SENDING: "Enviando",
    SENT: "Enviada ao provedor",
    DELIVERED: "Entregue",
    READ: "Lida",
    FAILED: "Falha no envio",
    UNCERTAIN: "Entrega incerta",
    CANCELED: "Cancelada",
  };
  return {
    label: labels[message.status] ?? "Status indisponível",
    uncertain: message.status === "UNCERTAIN",
    failed: message.status === "FAILED",
  };
}

/** Transport mapping only: official ordering and operational semantics are copied. */
export function mapConversation(item: any): Conversation {
  const governanceSignal =
    item?.governanceSignal ?? item?.metadata?.governanceSignal ?? null;
  return {
    id: String(item?.id ?? ""),
    conversationId: String(item?.id ?? ""),
    customerId: item?.customerId ?? item?.customer?.id ?? null,
    name: String(item?.customer?.name ?? item?.title ?? "Sem nome"),
    phone: item?.phone ?? item?.customer?.phone ?? null,
    title: item?.title ?? null,
    lastMessage: String(
      item?.lastMessagePreview ?? item?.title ?? "Sem mensagens"
    ),
    lastMessageAt: item?.lastMessageAt ?? null,
    status: (item?.status ?? null) as WhatsAppConversationStatus | null,
    contextType: (item?.contextType ?? "GENERAL") as ContextType,
    priority: item?.priority ?? null,
    priorityReason: item?.priorityReason ?? null,
    inboxPosition: Number.isInteger(item?.inboxPosition)
      ? item.inboxPosition
      : null,
    unreadCount:
      item?.unreadCount === null || item?.unreadCount === undefined
        ? null
        : Number(item.unreadCount),
    contextId: item?.contextId ?? null,
    operationalStatus: item?.operationalStatus ?? "Não informado",
    contextHint: item?.title ?? item?.lastMessagePreview ?? null,
    hasPendingCharge: item?.flags?.hasPendingCharge === true,
    hasUpcomingAppointment: item?.flags?.hasUpcomingAppointment === true,
    hasActiveServiceOrder: item?.flags?.hasActiveServiceOrder === true,
    hasFailedDelivery: item?.flags?.hasFailure === true,
    governanceSignal,
    failedMessageCount: item?.failedMessageCount,
    lastFailedAt: governanceSignal?.lastFailedAt ?? null,
    hasNoResponse: item?.flags?.hasNoResponse === true,
    isVirtual: false,
    customer: item?.customer ?? null,
    responsibleName: item?.ownership?.name ?? null,
  };
}

function mapMessage(item: any): ChatMessage {
  return {
    id: item.id,
    direction: item.direction,
    content: item.renderedText,
    createdAt: item.createdAt,
    status: item.status,
    messageType: item.messageType,
    errorMessage: item.errorMessage,
  };
}

export function getDefaultMessageType(): OperationalMessageType {
  return DEFAULT_MANUAL_MESSAGE_TYPE;
}

function normalizeMessageType(
  messageType?: string | null
): OperationalMessageType | null {
  if (!messageType || messageType === "GENERAL") return null;
  return VALID_OPERATIONAL_MESSAGE_TYPES.has(
    messageType as OperationalMessageType
  )
    ? (messageType as OperationalMessageType)
    : null;
}

export function resolveMessageType({
  explicitMessageType,
  context,
}: {
  explicitMessageType?: string | null;
  context?: WhatsAppContext | null;
} = {}): OperationalMessageType {
  const normalizedExplicit = normalizeMessageType(explicitMessageType);
  if (normalizedExplicit) return normalizedExplicit;

  return getDefaultMessageType();
}

export function buildWhatsAppSendPayload<
  TPayload extends { messageType?: string | null },
>(
  payload: TPayload,
  options: { context?: WhatsAppContext | null } = {}
): Omit<TPayload, "messageType"> & { messageType: OperationalMessageType } {
  return {
    ...payload,
    messageType: resolveMessageType({
      explicitMessageType: payload.messageType,
      context: options.context,
    }),
  };
}

function resolveEntityFromContext(context?: WhatsAppContext | null): {
  entityType: "CUSTOMER" | "APPOINTMENT" | "SERVICE_ORDER" | "CHARGE" | "PAYMENT" | "GENERAL";
  entityId?: string;
} {
  if (context?.openCharge?.id)
    return { entityType: "CHARGE", entityId: context.openCharge.id };
  if (context?.nextAppointment?.id)
    return { entityType: "APPOINTMENT", entityId: context.nextAppointment.id };
  if (context?.activeServiceOrder?.id) {
    return {
      entityType: "SERVICE_ORDER",
      entityId: context.activeServiceOrder.id,
    };
  }
  if (context?.customer?.id)
    return { entityType: "CUSTOMER", entityId: context.customer.id };
  return { entityType: "GENERAL", entityId: undefined };
}

function getOperationalStatus(conversation: Conversation) {
  if (conversation.conversationId)
    return conversation.operationalStatus ?? "Resolvido";
  return "Sem conversa ativa";
}

function getConversationBadges(conversation: Conversation) {
  const badges: string[] = [];
  if (conversation.hasFailedDelivery) badges.push("Falha");
  if (conversation.priority === "CRITICAL") badges.push("Crítica");
  if (conversation.priority === "HIGH") badges.push("Alta");
  if (conversation.hasNoResponse) badges.push("Sem resposta");
  return badges;
}

function getContextTypeLabel(contextType?: ContextType | null) {
  if (contextType === "CHARGE") return "Cobrança";
  if (contextType === "APPOINTMENT") return "Agendamento";
  if (contextType === "SERVICE_ORDER") return "O.S.";
  if (contextType === "PAYMENT") return "Pagamento";
  if (contextType === "CUSTOMER") return "Cliente";
  return "Geral";
}

function getInboxContextLabel(contextType?: ContextType | null) {
  if (contextType === "CHARGE" || contextType === "PAYMENT") return "Cobrança";
  if (contextType === "APPOINTMENT") return "Agendamento";
  if (contextType === "SERVICE_ORDER") return "O.S.";
  return "Geral";
}

function getPriorityLabel(priority?: WhatsAppPriority | null) {
  if (priority === "CRITICAL") return "Crítica";
  if (priority === "HIGH") return "Alta";
  if (priority === "MEDIUM") return "Média";
  if (priority === "LOW") return "Baixa";
  if (priority === "NORMAL") return "Normal";
  return "Não classificada";
}

function getOfficialSuggestedAction(context?: WhatsAppContext | null) {
  const primary = context?.officialActions?.find(
    action => action.availability === "primary"
  );
  if (!primary?.action) return null;
  return {
    key: primary.key,
    label: primary.label,
    reason: primary.reason,
    executableAction: primary.action,
    target: primary.target ?? null,
    logicalKey: primary.logicalKey ?? null,
  };
}

function buildTemplateText(template: string, context?: WhatsAppContext | null) {
  const customerName = context?.customer?.name ?? "cliente";
  const appointmentDate = context?.nextAppointment?.scheduledAt
    ? fmtDateTime(context.nextAppointment.scheduledAt)
    : "data a confirmar";
  const chargeAmount = context?.openCharge?.amount
    ? `R$ ${(context.openCharge.amount / 100).toFixed(2).replace(".", ",")}`
    : "valor pendente";
  const chargeDueDate = context?.openCharge?.dueDate
    ? fmtDateTime(context.openCharge.dueDate)
    : "sem vencimento";

  if (template === "Confirmação de agendamento") {
    return `Olá ${customerName}, confirmando seu agendamento em ${appointmentDate}.`;
  }
  if (template === "Lembrete" || template === "Lembrete de agendamento") {
    return `Olá ${customerName}, passando para lembrar do seu atendimento/pendência.`;
  }
  if (template === "Cobrança simples") {
    return `Olá ${customerName}, identificamos uma cobrança em aberto (${chargeAmount}, vencimento ${chargeDueDate}).`;
  }
  if (template === "Cobrança pendente") {
    return `Olá ${customerName}, sua cobrança (${chargeAmount}) segue pendente. Vencimento: ${chargeDueDate}.`;
  }
  if (template === "Atualização de O.S.") {
    return `Olá ${customerName}, atualizando sua ordem de serviço: status ${presentationStatusLabel(context?.activeServiceOrder?.status, "em andamento")}.`;
  }
  if (template === "Confirmação de pagamento") {
    return `Olá ${customerName}, pagamento confirmado com sucesso.`;
  }
  if (template === "Mensagem livre") {
    return `Olá ${customerName}, tudo bem?`;
  }
  if (template === "Link de pagamento") {
    return `Olá ${customerName}, segue o link para pagamento: ${context?.openCharge?.paymentLink ?? "(link indisponível)"}`;
  }
  return template;
}

const ConversationRow = memo(function ConversationRow({
  conversation,
  selectedId,
  onSelect,
  style,
}: {
  conversation: Conversation;
  selectedId: string;
  onSelect: (id: string) => void;
  style: CSSProperties;
}) {
  const status = conversation.status
    ? (statusUi[conversation.status] ?? statusUi.OPEN)
    : { label: "Status indisponível", dot: "bg-slate-400" };
  const isSelected = selectedId === conversation.id;
  const primaryBadge = getInboxContextLabel(conversation.contextType);
  const statusBadge = getConversationBadges(conversation)[0];
  const lastMessage =
    conversation.lastMessage?.trim() ||
    conversation.contextHint ||
    "Sem mensagem recente";

  return (
    <div style={style} className="px-0.5 py-0.5">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={isSelected ? "true" : undefined}
        aria-label={`Abrir conversa com ${conversation.name}`}
        className={cn(
          "relative grid h-full w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-3 py-2.5 text-left text-app-primary transition duration-150",
          isSelected
            ? "bg-[var(--accent-soft)]/35 border border-[var(--accent-primary)]/25"
            : conversation.priority === "CRITICAL" ||
                conversation.priority === "HIGH"
              ? "bg-[color-mix(in_srgb,var(--warning)_6%,var(--app-card))] hover:bg-app-card/85"
              : "hover:bg-app-card/70"
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold uppercase",
            isSelected
              ? "bg-[var(--accent-primary)] text-[var(--primary-foreground)]"
              : "bg-app-surface text-app-muted"
          )}
        >
          {conversation.name.slice(0, 1)}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-app-primary">
              {conversation.name}
            </p>
            {conversation.phone ? (
              <span className="hidden max-w-[7rem] shrink truncate text-[10px] text-app-muted sm:inline">
                {maskPhone(conversation.phone)}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs leading-4 text-[var(--text-secondary)]">
            {lastMessage}
          </p>
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] leading-none">
            <span className="shrink-0 rounded-full bg-app-surface px-2 py-1 font-medium text-[var(--text-secondary)]">
              {primaryBadge}
            </span>
            {statusBadge ? (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-app-surface/80 px-2 py-1 text-app-muted">
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", status.dot)}
                />
                <span className="truncate">{statusBadge}</span>
              </span>
            ) : null}
          </div>
          <p className="truncate text-[10px] text-[var(--text-muted)]">
            Prioridade oficial: {getPriorityLabel(conversation.priority)}
            {conversation.responsibleName
              ? ` · ${conversation.responsibleName}`
              : " · Sem responsável"}
          </p>
          {conversation.governanceSignal?.communicationFailure ? (
            <p className="truncate text-[10px] font-medium text-[var(--danger)]">
              Falha de comunicação oficial
              {conversation.priorityReason
                ? ` · ${conversation.priorityReason}`
                : ""}
            </p>
          ) : conversation.priorityReason ? (
            <p className="truncate text-[10px] text-[var(--text-muted)]">
              {conversation.priorityReason}
            </p>
          ) : null}
        </div>

        <div className="flex h-full shrink-0 flex-col items-end justify-between gap-1 text-right">
          <span className="whitespace-nowrap text-[10px] text-app-muted">
            {fmtTime(conversation.lastMessageAt)}
          </span>
          {conversation.unreadCount ? (
            <span className="min-w-5 rounded-full bg-[color-mix(in_srgb,var(--warning)_18%,var(--app-surface))] px-1.5 py-0.5 text-center text-[10px] font-medium leading-none text-[var(--warning)]">
              {conversation.unreadCount}
            </span>
          ) : (
            <span className={cn("size-2 rounded-full", status.dot)} />
          )}
        </div>
      </button>
    </div>
  );
});

function InboxQueueColumn({
  rows,
  selectedId,
  onSelect,
  search,
  isLoading,
  hasError,
  errorMessage,
  emptyStateMessage,
  onRetry,
}: {
  rows: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  emptyStateMessage: string;
  onRetry: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    setViewportHeight(node.clientHeight);
  }, []);

  const totalHeight = rows.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 8;
  const visibleRows = rows.slice(startIndex, startIndex + visibleCount);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent xl:border-r xl:border-[var(--app-border)]/40 p-2.5 text-app-primary">
      <div className="shrink-0 space-y-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              Inbox
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">
              Conversas por prioridade
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-app-surface px-2 py-1 text-[10px] text-app-muted">
            {rows.length} itens
          </span>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="scrollbar-thin-nexo mt-1 min-h-0 flex-1 overflow-y-auto pr-1"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        {isLoading ? (
          <AppPageLoadingState
            title="Carregando inbox"
            description="Buscando a ordem oficial das conversas."
          />
        ) : rows.length === 0 ? (
          hasError ? (
            <AppPageErrorState
              title="Inbox indisponível"
              description={
                errorMessage ?? "Não foi possível carregar conversas"
              }
              actionLabel="Tentar novamente"
              onAction={onRetry}
            />
          ) : (
            <AppPageEmptyState
              title={emptyStateMessage}
              description={
                search.trim()
                  ? "Limpe a busca ou altere os filtros."
                  : "Conversas reais aparecerão aqui quando houver contato pelo canal."
              }
            />
          )
        ) : (
          <div style={{ height: totalHeight, position: "relative" }}>
            <div
              style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
            >
              {visibleRows.map(conversation => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  selectedId={selectedId ?? ""}
                  onSelect={onSelect}
                  style={{ height: ROW_HEIGHT }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ExecutionChatColumn({
  conversation,
  onBack,
  canCompose,
  composePlaceholder,
  messages,
  isLoading,
  messagesError,
  onRetryMessages,
  sendMessage,
  content,
  setContent,
  onToggleFavorite,
  isFavorite,
  onInfo,
  onMoreActions,
  error,
  onOpenServiceOrder,
  onFillTemplate,
  onSendCharge,
  onSendPaymentReminder,
  onRequestSuggestedExecution,
  onResolveConversation,
  onReviewAssistedExecution,
  officialActions,
  suggestedActionLabel,
  governanceAlert,
  onRunSuggestedAction,
}: {
  conversation?: Conversation;
  onBack: () => void;
  canCompose: boolean;
  composePlaceholder: string;
  messages: ChatMessage[];
  isLoading: boolean;
  messagesError?: boolean;
  onRetryMessages: () => void;
  sendMessage: () => void;
  content: string;
  setContent: (value: string) => void;
  onToggleFavorite: () => void;
  isFavorite: boolean;
  onInfo: () => void;
  onMoreActions: () => void;
  error?: string | null;
  onOpenServiceOrder: () => void;
  onFillTemplate: (
    template: string,
    messageType?: OperationalMessageType
  ) => void;
  onSendCharge: () => void;
  onSendPaymentReminder: () => void;
  onRequestSuggestedExecution: () => void;
  onResolveConversation: () => void;
  onReviewAssistedExecution: () => void;
  officialActions: OfficialComposerAction[];
  suggestedActionLabel?: string | null;
  governanceAlert?: string | null;
  onRunSuggestedAction: () => void;
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const hasConversation = Boolean(conversation);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [conversation?.id, messages.length]);

  const composerActionPalette = useMemo(() => {
    const {
      primaryActions,
      secondaryActions,
      unavailableActions,
      upcomingActions,
      recommendedActions,
      groupedActions,
    } = presentOfficialWhatsAppActions(officialActions);
    const iconByKey: Record<string, ReactNode> = {
      "quick-template": <MessageCircleMore className="size-4" />,
      "attach-file": <Paperclip className="size-4" />,
      "audio-message": <Volume2 className="size-4" />,
      "send-charge": <CircleDollarSign className="size-4" />,
      "send-payment-link": <CreditCard className="size-4" />,
      "payment-reminder": <Bell className="size-4" />,
      "confirm-appointment": <CalendarCheck className="size-4" />,
      "appointment-reminder": <Bell className="size-4" />,
      "update-service": <ClipboardList className="size-4" />,
      "link-service-order": <FileText className="size-4" />,
      "create-assisted-execution": <Bot className="size-4" />,
      "mark-resolved": <CheckCircle2 className="size-4" />,
    };
    const handlerByKey: Record<string, () => void> = {
      "send-charge": onSendCharge,
      "send-payment-link": onSendCharge,
      "payment-reminder": onSendPaymentReminder,
      "confirm-appointment": () =>
        onFillTemplate(
          "Confirmação de agendamento",
          "APPOINTMENT_CONFIRMATION"
        ),
      "appointment-reminder": () =>
        onFillTemplate("Lembrete de agendamento", "APPOINTMENT_REMINDER"),
      "update-service": () =>
        onFillTemplate("Atualização de O.S.", "SERVICE_UPDATE"),
      "link-service-order": onOpenServiceOrder,
      "review-assisted-execution": onReviewAssistedExecution,
      "create-assisted-execution": onRequestSuggestedExecution,
      "mark-resolved": onResolveConversation,
    };
    const withRuntime = (
      actions: ComposerActionDescriptor[]
    ): WhatsAppComposerAction[] =>
      actions.map(action => ({
        ...action,
        icon: iconByKey[action.key] ?? <FileText className="size-4" />,
        onSelect: handlerByKey[action.key],
      }));

    return {
      primaryActions: withRuntime(primaryActions),
      secondaryActions: withRuntime(secondaryActions),
      unavailableActions: withRuntime(unavailableActions),
      upcomingActions: withRuntime(upcomingActions),
      recommendedActions: withRuntime(recommendedActions),
      groupedActions: Object.fromEntries(
        Object.entries(groupedActions).map(([group, actions]) => [
          group,
          withRuntime(actions),
        ])
      ) as Record<ComposerActionGroupName, WhatsAppComposerAction[]>,
    };
  }, [
    officialActions,
    onFillTemplate,
    onOpenServiceOrder,
    onRequestSuggestedExecution,
    onResolveConversation,
    onReviewAssistedExecution,
    onSendCharge,
    onSendPaymentReminder,
  ]);

  const renderComposerAction = (
    action: WhatsAppComposerAction,
    key = action.key
  ) => {
    const isDisabled = Boolean(
      action.disabled ||
      action.availability === "unavailable" ||
      action.availability === "upcoming"
    );
    const isPrimary = action.availability === "primary";
    const isUpcoming = action.availability === "upcoming";
    const isUnavailable = action.availability === "unavailable";
    const statusLabel = action.reason ?? (isPrimary ? action.group : undefined);
    const contentNode = (
      <span className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
            isPrimary
              ? "bg-[var(--accent-soft)] text-[var(--wa-menu-icon-active)]"
              : isDisabled
                ? "bg-[var(--wa-action-disabled-icon-bg)] text-[var(--wa-action-disabled-icon)]"
                : "bg-[var(--wa-action-icon-bg)] text-[var(--wa-menu-icon)]"
          )}
        >
          {action.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-[13px] leading-5",
                isDisabled
                  ? "font-medium text-[var(--wa-action-disabled-text)]"
                  : "font-semibold text-[var(--wa-menu-fg-primary)]"
              )}
            >
              {action.label}
            </span>
            {statusLabel ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 tracking-[-0.01em]",
                  isUpcoming
                    ? "border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--app-card))] text-[color-mix(in_srgb,var(--warning)_84%,var(--text-primary))]"
                    : isUnavailable
                      ? "border-[var(--wa-action-badge-border)] bg-[var(--wa-action-badge-bg)] text-[var(--wa-action-badge-muted-text)]"
                      : "border-[var(--wa-action-badge-border)] bg-[var(--wa-action-badge-bg)] text-[var(--wa-action-badge-text)]"
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </span>
          {action.description ? (
            <span
              className={cn(
                "mt-0.5 block line-clamp-2 text-[11px] leading-4",
                isDisabled
                  ? "text-[var(--wa-action-disabled-description)]"
                  : "text-[var(--wa-action-description)]"
              )}
            >
              {action.description}
            </span>
          ) : null}
        </span>
      </span>
    );

    if (action.key === "quick-template") {
      return (
        <div
          key={key}
          role="group"
          aria-label={action.label}
          className="space-y-0.5"
        >
          <div className="px-2.5 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
            {action.label}
          </div>
          {QUICK_COMPOSER_TEMPLATES.map(template => (
            <AppDropdownItem
              key={template}
              onSelect={() => onFillTemplate(template)}
              className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium leading-snug text-app-primary"
            >
              <FileText className="size-4 text-[var(--text-muted)]" />
              <span className="min-w-0 flex-1 whitespace-normal">
                {template}
              </span>
            </AppDropdownItem>
          ))}
        </div>
      );
    }

    return (
      <AppDropdownItem
        key={key}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        onClick={isDisabled ? undefined : action.onSelect}
        className={cn(
          "items-start rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-[var(--wa-menu-item-hover)] focus:bg-[var(--wa-menu-item-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-primary)]",
          isDisabled
            ? "cursor-default data-[disabled]:pointer-events-none data-[disabled]:opacity-100"
            : "cursor-pointer"
        )}
      >
        {contentNode}
      </AppDropdownItem>
    );
  };

  const renderActionSection = ({
    title,
    tone,
    actions,
  }: {
    title: string;
    tone: "primary" | "secondary" | "muted" | "upcoming";
    actions: WhatsAppComposerAction[];
  }) => {
    if (!actions.length) return null;

    return (
      <div
        className={cn(
          "space-y-1.5 py-1.5 first:pt-0 last:pb-0",
          tone === "primary" ? "pt-0" : "mt-1.5"
        )}
      >
        <AppDropdownLabel
          className={cn(
            "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            tone === "primary"
              ? "text-[var(--wa-action-section-primary)]"
              : tone === "secondary"
                ? "text-[var(--wa-action-section-label)]"
                : "text-[var(--wa-action-section-muted)]"
          )}
        >
          {title}
        </AppDropdownLabel>
        <div className="space-y-0.5">
          {actions.map(action =>
            renderComposerAction(action, `${tone}-${action.key}`)
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent xl:border-r xl:border-[var(--app-border)]/40 text-app-primary">
      <header className="flex shrink-0 items-start justify-between border-b border-[var(--app-border)]/55 bg-[color-mix(in_srgb,var(--app-surface)_70%,transparent)] px-5 py-3">
        <div className="flex items-start gap-3.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={onBack}
            aria-label="Voltar para o inbox"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex size-12 items-center justify-center rounded-2xl border border-[var(--accent-primary)]/20 bg-[var(--accent-soft)]/45 text-base font-semibold text-[var(--accent-primary)]">
            {conversation?.name?.slice(0, 1) ?? "-"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              {conversation?.name ?? "Selecione uma conversa"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {conversation?.conversationId
                ? (conversation.title ??
                  conversation.contextHint ??
                  "Conversa operacional")
                : "Nenhuma conversa ativa"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[var(--app-border)]/45 bg-app-card/40 p-1 text-[var(--text-muted)]">
          <button
            type="button"
            className="rounded-lg p-1.5 transition enabled:hover:bg-app-surface disabled:opacity-45"
            onClick={onToggleFavorite}
            disabled={!hasConversation}
            aria-label="Favoritar conversa"
          >
            <Star
              className={cn(
                "size-4.5",
                isFavorite ? "fill-yellow-400 text-yellow-300" : ""
              )}
            />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 transition enabled:hover:bg-app-surface disabled:opacity-45"
            onClick={onInfo}
            disabled={!hasConversation}
            aria-label="Abrir contexto operacional"
          >
            <Info className="size-4.5" />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 transition enabled:hover:bg-app-surface disabled:opacity-45"
            onClick={onMoreActions}
            disabled={!hasConversation}
            aria-label="Repetir última mensagem com falha"
          >
            <EllipsisVertical className="size-4.5" />
          </button>
        </div>
      </header>

      {hasConversation ? (
        <div className="mx-5 mt-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_18%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--app-surface))] px-3 py-2 text-xs">
          {suggestedActionLabel ? (
            <Button
              type="button"
              onClick={onRunSuggestedAction}
              size="sm"
              className="h-8"
            >
              {suggestedActionLabel}
            </Button>
          ) : (
            <span className="font-medium text-app-muted">
              Sem recomendação oficial
            </span>
          )}
          {governanceAlert ? (
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {governanceAlert}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        ref={messagesRef}
        className="scrollbar-thin-nexo min-h-0 flex-1 overflow-y-auto bg-transparent px-6 pb-3 pt-3"
      >
        {!hasConversation ? (
          <div className="flex h-full items-center justify-center px-1 py-4 text-xs text-[var(--text-muted)]">
            Selecione um cliente ou conversa para continuar.
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <AppSkeleton key={idx} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : messagesError ? (
          <AppPageErrorState
            title="Histórico indisponível"
            description="A conversa e o contexto continuam disponíveis. Tente carregar as mensagens novamente."
            actionLabel="Tentar novamente"
            onAction={onRetryMessages}
          />
        ) : messages.length === 0 ? (
          <div className="px-1 py-4 text-xs text-[var(--text-muted)]">
            Sem mensagens nesta conversa.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(message => {
              const outgoing = message.direction === "OUTBOUND";
              const delivery = getMessageDeliveryPresentation(message);
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    outgoing ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      outgoing
                        ? "max-w-[66%] bg-[color-mix(in_srgb,var(--success)_16%,var(--app-card))] text-app-primary"
                        : "max-w-[68%] bg-app-card text-app-primary"
                    )}
                  >
                    <p>{message.content}</p>
                    <p className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[var(--text-muted)]/85">
                      {fmtTime(message.createdAt)} · {delivery.label}
                      {outgoing &&
                      ["DELIVERED", "READ"].includes(message.status) ? (
                        <CheckCheck className="size-3" />
                      ) : null}
                    </p>
                    {delivery.failed || delivery.uncertain ? (
                      <p className="mt-1 text-[10px] text-[var(--danger)]">
                        {delivery.uncertain
                          ? "O provedor não confirmou o resultado. Verifique antes de reenviar para evitar duplicidade."
                          : "Não foi possível enviar. Use a ação de retentativa."}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="mt-0 shrink-0 border-t border-[var(--app-border)]/55 bg-transparent px-4 pb-2.5 pt-2">
        {hasConversation && !canCompose ? (
          <div className="mb-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,var(--app-surface))] px-3 py-2 text-[11px] font-medium text-[var(--danger)]">
            Envio bloqueado: cliente sem telefone cadastrado.
          </div>
        ) : null}
        <div className="rounded-2xl border border-[var(--app-border)]/40 bg-app-surface/75 p-2">
          <div className="flex items-center gap-2">
            <label htmlFor="whatsapp-composer" className="sr-only">
              Mensagem da conversa
            </label>
            <input
              id="whatsapp-composer"
              value={content}
              onChange={event => canCompose && setContent(event.target.value)}
              onKeyDown={event => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                if (hasConversation && canCompose) sendMessage();
              }}
              placeholder={
                hasConversation
                  ? composePlaceholder
                  : "Selecione uma conversa para responder..."
              }
              disabled={!hasConversation || !canCompose}
              className="h-9 min-w-0 flex-1 rounded-xl bg-app-card px-3 text-sm text-app-primary outline-none placeholder:text-app-muted/70"
            />
            <AppDropdown>
              <AppDropdownTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="whatsapp-action-menu h-9 shrink-0 gap-1.5 border-[var(--wa-menu-badge-border)] bg-[var(--wa-menu-badge-bg)] px-3 text-[11px] font-semibold text-[var(--wa-menu-fg-primary)] hover:border-[color-mix(in_srgb,var(--accent-primary)_28%,var(--app-border))] hover:bg-[var(--wa-menu-item-hover)] hover:text-[var(--wa-menu-fg-primary)] disabled:opacity-100 disabled:saturate-100 disabled:text-[var(--wa-menu-fg-disabled)] [&_svg]:text-[var(--wa-menu-icon)]"
                  disabled={!hasConversation}
                  aria-label="Mais ações da conversa"
                >
                  Mais ações
                  <ChevronDown className="size-3.5" />
                </Button>
              </AppDropdownTrigger>
              <AppDropdownContent
                align="end"
                sideOffset={8}
                className="max-h-[min(560px,calc(100vh-12rem),var(--radix-dropdown-menu-content-available-height))] w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0"
              >
                <div className="scrollbar-menu-nexo max-h-[min(560px,calc(100vh-12rem),var(--radix-dropdown-menu-content-available-height))] min-h-0 overflow-y-auto overscroll-contain p-2">
                  {renderActionSection({
                    title: composerActionPalette.recommendedActions.length
                      ? "Recomendadas agora"
                      : "Ações principais",
                    tone: "primary",
                    actions: composerActionPalette.primaryActions,
                  })}
                  {composerActionPalette.secondaryActions.length ? (
                    <AppDropdownSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Outras ações",
                    tone: "secondary",
                    actions: composerActionPalette.secondaryActions,
                  })}
                  {composerActionPalette.unavailableActions.length ? (
                    <AppDropdownSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Indisponíveis neste contexto",
                    tone: "muted",
                    actions: composerActionPalette.unavailableActions,
                  })}
                  {composerActionPalette.upcomingActions.length ? (
                    <AppDropdownSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Em breve",
                    tone: "upcoming",
                    actions: composerActionPalette.upcomingActions,
                  })}
                </div>
              </AppDropdownContent>
            </AppDropdown>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-xl bg-[var(--accent-primary)] px-3 text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={sendMessage}
              disabled={!hasConversation || !canCompose}
              aria-label="Enviar mensagem"
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </footer>
      {error ? (
        <p className="px-3 pb-2 text-[11px] text-[var(--danger)]">{error}</p>
      ) : null}
    </section>
  );
}

function OperationalContextColumn({
  context,
  conversation,
  selectedCustomer,
  isLoading,
  hasError,
  onRetry,
  onNavigate,
  pendingApprovals,
  executionHistory,
  isExecutionLoading,
  onApproveExecution,
  onExecuteExecution,
  onCancelExecution,
  isExecutionMutating,
  isExecutionError,
  onRetryExecution,
}: {
  context?: WhatsAppContext | null;
  conversation?: Conversation;
  selectedCustomer?: any | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onNavigate: (path: string) => void;
  pendingApprovals: WhatsAppActionExecution[];
  executionHistory: WhatsAppActionExecution[];
  isExecutionLoading: boolean;
  onApproveExecution: (execution: WhatsAppActionExecution) => void;
  onExecuteExecution: (execution: WhatsAppActionExecution) => void;
  onCancelExecution: (execution: WhatsAppActionExecution) => void;
  isExecutionMutating: boolean;
  isExecutionError?: boolean;
  onRetryExecution?: () => void;
}) {
  if (!conversation && !selectedCustomer) {
    return (
      <aside
        className="scrollbar-thin-nexo h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-transparent p-3 text-app-primary"
        id="whatsapp-context-panel"
      >
        <section className="border-t border-[var(--app-border)]/40 px-1 py-4">
          <p className="text-xs font-semibold">Sem contexto ativo</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Selecione uma conversa para ver cliente, agendamento, O.S. e
            cobrança vinculados.
          </p>
          <div className="mt-3 space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <p>Cliente — aguardando conversa</p>
            <p>Próximo agendamento — aguardando contexto</p>
            <p>Cobrança aberta — aguardando contexto</p>
            <p>Última interação — aguardando conversa</p>
          </div>
        </section>
      </aside>
    );
  }

  const hasCharge = Boolean(context?.openCharge?.id);
  const hasAppointment = Boolean(context?.nextAppointment?.id);
  const hasServiceOrder = Boolean(context?.activeServiceOrder?.id);

  return (
    <aside
      className="scrollbar-thin-nexo h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-transparent p-3 text-app-primary"
      id="whatsapp-context-panel"
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <AppSkeleton key={idx} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : hasError ? (
        <AppPageErrorState
          title="Contexto indisponível"
          description="O histórico e o composer permanecem disponíveis. Tente carregar apenas o contexto novamente."
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      ) : (
        <div className="space-y-1.5 text-xs">
          <OperationalInnerCard className="border-transparent bg-app-card/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
              Cliente
            </p>
            <p className="mt-1 font-semibold">
              {context?.customer?.name ??
                selectedCustomer?.name ??
                conversation?.name ??
                "Sem nome"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {maskPhone(
                context?.customer?.phone ??
                  selectedCustomer?.phone ??
                  conversation?.phone
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-[11px]"
              onClick={() =>
                onNavigate(
                  context?.customer?.id
                    ? `/customers?customerId=${context.customer.id}`
                    : "/customers"
                )
              }
            >
              Ver cliente
            </Button>
          </OperationalInnerCard>

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
              Inteligência oficial
            </p>
            {context?.intelligence ? (
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Intenção</dt>
                  <dd className="text-right font-medium">
                    {context.intelligence.intent ?? "Indisponível"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Prioridade</dt>
                  <dd className="text-right font-medium">
                    {context.intelligence.priority ?? "Indisponível"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">SLA oficial</dt>
                  <dd className="text-right font-medium">
                    {context.intelligence.slaStatus ?? "Indisponível"}
                  </dd>
                </div>
                {context.intelligence.priorityReason ? (
                  <div className="pt-1 text-[var(--text-secondary)]">
                    {context.intelligence.priorityReason}
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Inteligência indisponível para esta conversa.
              </p>
            )}
          </OperationalInnerCard>

          <WhatsAppActionExecutionPanel
            pendingApprovals={pendingApprovals}
            history={executionHistory}
            isLoading={isExecutionLoading}
            isError={Boolean(isExecutionError)}
            errorMessage={
              isExecutionError
                ? "Não foi possível carregar aprovações ou histórico desta conversa."
                : undefined
            }
            onRetry={onRetryExecution}
            onApprove={onApproveExecution}
            onExecute={onExecuteExecution}
            onCancel={onCancelExecution}
            isMutating={isExecutionMutating}
          />

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Próximo agendamento
            </p>
            <p className="mt-1 font-medium">
              {context?.nextAppointment?.serviceName ?? NO_APPOINTMENT_TEXT}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {context?.nextAppointment?.scheduledAt
                ? fmtDateTime(context?.nextAppointment?.scheduledAt)
                : NO_APPOINTMENT_TEXT}
            </p>
            <span className="mt-2 inline-flex whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--warning)_14%,var(--app-surface))] px-2 py-0.5 text-[10px] text-[var(--warning)]">
              {presentationStatusLabel(context?.nextAppointment?.status)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-[11px]"
              disabled={!hasAppointment}
              onClick={() =>
                context?.nextAppointment?.id &&
                onNavigate(
                  `/appointments?appointmentId=${context.nextAppointment.id}`
                )
              }
            >
              Ver agendamento
            </Button>
          </OperationalInnerCard>

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Ordem de serviço
            </p>
            <p className="mt-1 font-medium">
              {context?.activeServiceOrder?.number
                ? `OS #${context.activeServiceOrder.number}`
                : NO_SERVICE_ORDER_TEXT}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Status:{" "}
              {presentationStatusLabel(context?.activeServiceOrder?.status)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Técnico: {context?.activeServiceOrder?.technician ?? "--"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-[11px]"
              disabled={!hasServiceOrder}
              onClick={() =>
                context?.activeServiceOrder?.id &&
                onNavigate(
                  `/service-orders?serviceOrderId=${context.activeServiceOrder.id}`
                )
              }
            >
              Ver O.S.
            </Button>
          </OperationalInnerCard>

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Financeiro
            </p>
            <p className="mt-1 font-medium">
              {context?.openCharge?.id ? "Cobrança pendente" : NO_CHARGE_TEXT}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Vencimento: {fmtDateTime(context?.openCharge?.dueDate)}
            </p>
            <p className="text-[11px]">
              Valor:{" "}
              {context?.openCharge?.amount
                ? `R$ ${(context.openCharge.amount / 100).toFixed(2).replace(".", ",")}`
                : "--"}
            </p>
            <span className="mt-2 inline-flex whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,var(--app-surface))] px-2 py-0.5 text-[10px] text-[var(--danger)]">
              {presentationStatusLabel(context?.openCharge?.status)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-[11px]"
              disabled={!hasCharge}
              onClick={() =>
                context?.openCharge?.id &&
                onNavigate(`/finances?chargeId=${context.openCharge.id}`)
              }
            >
              Ver cobrança
            </Button>
          </OperationalInnerCard>

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Timeline resumida
            </p>
            {context?.lastInteraction?.createdAt ? (
              <>
                <p className="mt-1">
                  {context?.lastInteraction?.direction ?? "--"} ·{" "}
                  {presentationStatusLabel(context?.lastInteraction?.status)}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {fmtDateTime(context?.lastInteraction?.createdAt)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Sem eventos recentes.
              </p>
            )}
          </OperationalInnerCard>
        </div>
      )}
    </aside>
  );
}

export default function WhatsAppPage() {
  const [location, setLocation] = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? ""),
    [location]
  );
  const queryConversationId = searchParams.get("conversationId");
  const queryCustomerId = searchParams.get("customerId");
  const queryChargeId = searchParams.get("chargeId");
  const queryAppointmentId = searchParams.get("appointmentId");
  const queryServiceOrderId = searchParams.get("serviceOrderId");
  const queryTemplate = searchParams.get("template");

  const [selectedConversationId, setSelectedConversationId] =
    useOperationalMemoryState<string | null>(
      "nexo.whatsapp.selected-conversation.v1",
      queryConversationId ??
        (queryCustomerId ? `customer:${queryCustomerId}` : null)
    );
  const [searchTerm, setSearchTerm] = useOperationalMemoryState(
    "nexo.whatsapp.search.v2",
    ""
  );
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<
    "ALL" | WhatsAppPriority
  >("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState("ALL");
  const [content, setContent] = useOperationalMemoryState(
    "nexo.whatsapp.composer.v2",
    ""
  );
  const [composerMessageTypeOverride, setComposerMessageTypeOverride] =
    useState<OperationalMessageType | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [isContextVisible, setIsContextVisible] = useState(true);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [localFavorites, setLocalFavorites] = useState<Record<string, boolean>>(
    {}
  );
  const [executionToRun, setExecutionToRun] =
    useState<WhatsAppActionExecution | null>(null);
  const [executionToCancel, setExecutionToCancel] =
    useState<WhatsAppActionExecution | null>(null);
  const [cancelReason, setCancelReason] = useState(
    "Cancelado no cockpit WhatsApp"
  );
  const didAutoSelectFromQueryRef = useRef(false);
  const hasManualSelectionRef = useRef(false);
  const shouldPromoteVirtualSelectionRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filtersInput = useMemo<Record<string, unknown>>(() => ({}), []);

  const healthQuery = trpc.whatsapp.health.useQuery(undefined, {
    retry: false,
  });
  const conversationsQuery = trpc.whatsapp.listConversations.useQuery(
    filtersInput,
    {
      retry: false,
    }
  );

  const conversations = useMemo<Conversation[]>(() => {
    return conversationsQuery.data?.items.map(item => mapConversation(item)) ?? [];
  }, [conversationsQuery.data]);
  const customersQuery = trpc.customers.list.useQuery(
    { page: 1, limit: 300 },
    { retry: false, enabled: true }
  );
  const appointmentsQuery = trpc.appointments.list.useQuery(undefined, {
    retry: false,
  });
  const serviceOrdersQuery = trpc.serviceOrders.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const customers = useMemo(
    () => normalizeCustomersPayload(customersQuery.data),
    [customersQuery.data]
  );
  const appointments = useMemo(() => {
    const raw = appointmentsQuery.data as any;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  }, [appointmentsQuery.data]);
  const serviceOrders = useMemo(() => {
    const raw = serviceOrdersQuery.data as any;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  }, [serviceOrdersQuery.data]);
  const charges = useMemo(() => {
    const raw = chargesQuery.data as any;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  }, [chargesQuery.data]);
  const deepLinkCustomerId = useMemo(() => {
    if (queryCustomerId) return queryCustomerId;
    const chargeCustomerId = charges.find(
      (charge: any) => String(charge?.id ?? "") === String(queryChargeId ?? "")
    )?.customerId;
    if (chargeCustomerId) return String(chargeCustomerId);
    const appointmentCustomerId = appointments.find(
      (appointment: any) =>
        String(appointment?.id ?? "") === String(queryAppointmentId ?? "")
    )?.customerId;
    if (appointmentCustomerId) return String(appointmentCustomerId);
    const serviceOrderCustomerId = serviceOrders.find(
      (serviceOrder: any) =>
        String(serviceOrder?.id ?? "") === String(queryServiceOrderId ?? "")
    )?.customerId;
    if (serviceOrderCustomerId) return String(serviceOrderCustomerId);
    return null;
  }, [
    appointments,
    charges,
    queryAppointmentId,
    queryChargeId,
    queryCustomerId,
    queryServiceOrderId,
    serviceOrders,
  ]);

  // Contacts without a server conversation stay outside the operational inbox.
  // A virtual selection exists only as a factual deep-link entry point to start contact.
  const buildVirtualRowFromCustomer = useCallback(
    (customer: any): Conversation => ({
      id: `customer:${String(customer.id)}`,
      conversationId: null,
      customerId: String(customer.id),
      name: String(customer?.name ?? "Sem nome"),
      phone: customer?.phone ? String(customer.phone) : null,
      title: "Novo contato",
      lastMessage: "Conversa ainda não iniciada",
      lastMessageAt: null,
      status: null,
      contextType: "GENERAL",
      priority: null,
      unreadCount: null,
      contextId: String(customer.id),
      operationalStatus: "Conversa ainda não iniciada",
      contextHint: "Atalho para iniciar contato",
      hasFailedDelivery: false,
      isVirtual: true,
      governanceSignal: null,
      responsibleName: null,
      customer: {
        id: String(customer.id),
        name: String(customer?.name ?? "Sem nome"),
        phone: customer?.phone ? String(customer.phone) : null,
      },
    }),
    []
  );
  const allInboxRows = useMemo(() => conversations, [conversations]);
  const responsibles = useMemo(
    () =>
      Array.from(
        new Set(
          allInboxRows
            .map(item => item.responsibleName)
            .filter((name): name is string => Boolean(name))
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [allInboxRows]
  );
  const filteredRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return allInboxRows.filter(item => {
      const searchable = [
        item.customer?.name ?? item.name,
        item.customer?.phone ?? item.phone ?? "",
        item.title ?? "",
        item.phone ?? "",
        item.lastMessage,
        item.contextHint ?? "",
        item.operationalStatus ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      if (!matchesSearch) return false;
      if (priorityFilter !== "ALL" && item.priority !== priorityFilter)
        return false;
      if (responsibleFilter === "UNASSIGNED" && item.responsibleName)
        return false;
      if (
        responsibleFilter !== "ALL" &&
        responsibleFilter !== "UNASSIGNED" &&
        item.responsibleName !== responsibleFilter
      )
        return false;
      if (activeFilter === "all") return true;
      if (activeFilter === "waiting_customer")
        return item.status === "WAITING_CUSTOMER";
      if (activeFilter === "resolved") return item.status === "RESOLVED";
      return true;
    });
  }, [
    activeFilter,
    allInboxRows,
    debouncedSearch,
    priorityFilter,
    responsibleFilter,
  ]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[WhatsAppPage][customers-debug]", {
      queryParams: {
        customerId: queryCustomerId,
        conversationId: queryConversationId,
        chargeId: queryChargeId,
        appointmentId: queryAppointmentId,
        serviceOrderId: queryServiceOrderId,
      },
      rawCustomersQueryData: customersQuery.data,
      normalizedCustomersLength: customers.length,
      firstNormalizedCustomer: customers[0] ?? null,
      conversationsLength: conversations.length,
      allInboxRowsLength: allInboxRows.length,
      filteredRowsLength: filteredRows.length,
    });
  }, [
    allInboxRows.length,
    conversations.length,
    customers,
    customersQuery.data,
    filteredRows.length,
    queryAppointmentId,
    queryChargeId,
    queryConversationId,
    queryCustomerId,
    queryServiceOrderId,
  ]);
  const emptyStateMessage = useMemo(() => {
    if (allInboxRows.length > 0 && filteredRows.length === 0)
      return "Nenhuma conversa corresponde aos filtros";
    if (debouncedSearch.trim()) return "Nenhum resultado para esta busca";
    return "Inbox vazio";
  }, [allInboxRows.length, debouncedSearch, filteredRows.length]);

  const selectedConversation = useMemo(() => {
    const realConversation =
      filteredRows.find(item => item.id === selectedConversationId) ??
      allInboxRows.find(item => item.id === selectedConversationId);
    if (realConversation) return realConversation;
    if (!selectedConversationId?.startsWith("customer:")) return undefined;
    const customerId = selectedConversationId.slice("customer:".length);
    const customer = customers.find(
      item => String(item?.id ?? "") === customerId
    );
    return customer ? buildVirtualRowFromCustomer(customer) : undefined;
  }, [
    allInboxRows,
    buildVirtualRowFromCustomer,
    customers,
    filteredRows,
    selectedConversationId,
  ]);
  const selectedConversationRecordId =
    selectedConversation?.conversationId ?? null;

  useEffect(() => {
    if (hasManualSelectionRef.current) return;
    const conversationsReady =
      !conversationsQuery.isLoading && !conversationsQuery.isFetching;
    const customersReady =
      !customersQuery.isLoading && !customersQuery.isFetching;
    if (
      (deepLinkCustomerId || queryConversationId) &&
      !didAutoSelectFromQueryRef.current &&
      conversationsReady &&
      customersReady
    ) {
      if (queryConversationId) {
        const byConversation = allInboxRows.find(
          item =>
            item.conversationId === queryConversationId ||
            item.id === queryConversationId
        );
        if (byConversation) {
          setSelectedConversationId(byConversation.id);
          didAutoSelectFromQueryRef.current = true;
          return;
        }
      }
      if (deepLinkCustomerId) {
        const existingConversation = allInboxRows.find(
          item =>
            item.customerId === deepLinkCustomerId &&
            Boolean(item.conversationId)
        );
        const virtualCustomer =
          allInboxRows.find(
            item => item.id === `customer:${deepLinkCustomerId}`
          ) ??
          (() => {
            const customer = customers.find(
              (item: any) =>
                String(item?.id ?? "") === String(deepLinkCustomerId)
            );
            return customer ? buildVirtualRowFromCustomer(customer) : null;
          })();
        if (!existingConversation && !virtualCustomer && import.meta.env.DEV) {
          console.debug(
            "[WhatsAppPage] customerId from URL not found in customers dataset",
            {
              queryCustomerId: deepLinkCustomerId,
              normalizedCustomersLength: customers.length,
            }
          );
        }
        const nextSelection = existingConversation ?? virtualCustomer;
        if (nextSelection?.id) {
          setSelectedConversationId(nextSelection.id);
        }
      }
      didAutoSelectFromQueryRef.current = true;
      return;
    }
  }, [
    allInboxRows,
    conversationsQuery.isFetching,
    conversationsQuery.isLoading,
    customersQuery.isFetching,
    customersQuery.isLoading,
    filteredRows,
    queryConversationId,
    deepLinkCustomerId,
    selectedConversationId,
    setSelectedConversationId,
    buildVirtualRowFromCustomer,
    customers,
  ]);

  useEffect(() => {
    if (!selectedConversationId) {
      setContent("");
      setComposerMessageTypeOverride(null);
      setComposerError(null);
    }
  }, [selectedConversationId, setContent]);

  useEffect(() => {
    if (!selectedConversationId?.startsWith("customer:")) return;
    if (!shouldPromoteVirtualSelectionRef.current) return;
    const customerId = selectedConversation?.customerId;
    if (!customerId) return;
    const existingConversation = conversations.find(
      item => item.customerId === customerId && Boolean(item.conversationId)
    );
    if (
      existingConversation?.id &&
      existingConversation.id !== selectedConversationId
    ) {
      shouldPromoteVirtualSelectionRef.current = false;
      setSelectedConversationId(existingConversation.id);
    }
  }, [
    conversations,
    selectedConversation?.customerId,
    selectedConversationId,
    setSelectedConversationId,
  ]);

  const conversationDetailsQuery = trpc.whatsapp.getConversation.useQuery(
    { id: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );

  const messagesQuery = trpc.whatsapp.getMessages.useQuery(
    { conversationId: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );
  const contextQuery = trpc.whatsapp.getContext.useQuery(
    { conversationId: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );
  const pendingApprovalsQuery = trpc.whatsapp.listPendingApprovals.useQuery(
    { limit: 25 },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );
  const executionHistoryQuery = trpc.whatsapp.listExecutionHistory.useQuery(
    { conversationId: selectedConversationRecordId ?? undefined, limit: 25 },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );

  const sendMessageMutation = trpc.whatsapp.sendMessage.useMutation();
  const sendTemplateMutation = trpc.whatsapp.sendTemplate.useMutation();
  const retryMessageMutation = trpc.whatsapp.retryMessage.useMutation();
  const requestExecutionMutation = trpc.whatsapp.requestExecution.useMutation();
  const approveExecutionMutation = trpc.whatsapp.approveExecution.useMutation();
  const executeExecutionMutation = trpc.whatsapp.executeExecution.useMutation();
  const cancelExecutionMutation = trpc.whatsapp.cancelExecution.useMutation();

  const pendingApprovals = useMemo(
    () =>
      (Array.isArray(pendingApprovalsQuery.data)
        ? (pendingApprovalsQuery.data as WhatsAppActionExecution[])
        : []
      ).filter(
        item =>
          !selectedConversationRecordId ||
          item.conversationId === selectedConversationRecordId
      ),
    [pendingApprovalsQuery.data, selectedConversationRecordId]
  );
  const executionHistory = useMemo(
    () =>
      Array.isArray(executionHistoryQuery.data)
        ? (executionHistoryQuery.data as WhatsAppActionExecution[])
        : [],
    [executionHistoryQuery.data]
  );

  const messages = useMemo(
    () =>
      selectedConversationRecordId && messagesQuery.data
        ? messagesQuery.data.map(mapMessage).reverse()
        : [],
    [messagesQuery.data, selectedConversationRecordId]
  );
  const selectedCustomer = useMemo(() => {
    const activeCustomerId =
      selectedConversation?.customerId ?? deepLinkCustomerId ?? "";
    return (
      customers.find(
        (customer: any) =>
          String(customer?.id ?? "") === String(activeCustomerId)
      ) ?? null
    );
  }, [customers, deepLinkCustomerId, selectedConversation?.customerId]);
  const selectedCustomerCharge = useMemo(
    () =>
      charges.find(
        (charge: any) =>
          String(charge?.customerId ?? "") ===
            String(selectedCustomer?.id ?? "") &&
          ["PENDING", "OVERDUE"].includes(
            String(charge?.status ?? "").toUpperCase()
          )
      ) ??
      charges.find(
        (charge: any) =>
          String(charge?.id ?? "") === String(queryChargeId ?? "")
      ) ??
      null,
    [charges, queryChargeId, selectedCustomer?.id]
  );
  const selectedCustomerAppointment = useMemo(
    () =>
      appointments.find(
        (appointment: any) =>
          String(appointment?.id ?? "") === String(queryAppointmentId ?? "")
      ) ??
      appointments.find(
        (appointment: any) =>
          String(appointment?.customerId ?? "") ===
            String(selectedCustomer?.id ?? "") &&
          String(appointment?.status ?? "").toUpperCase() !== "CANCELED"
      ) ??
      null,
    [appointments, queryAppointmentId, selectedCustomer?.id]
  );
  const selectedCustomerServiceOrder = useMemo(
    () =>
      serviceOrders.find(
        (serviceOrder: any) =>
          String(serviceOrder?.id ?? "") === String(queryServiceOrderId ?? "")
      ) ??
      serviceOrders.find(
        (serviceOrder: any) =>
          String(serviceOrder?.customerId ?? "") ===
            String(selectedCustomer?.id ?? "") &&
          !["DONE", "CANCELED"].includes(
            String(serviceOrder?.status ?? "").toUpperCase()
          )
      ) ??
      null,
    [queryServiceOrderId, selectedCustomer?.id, serviceOrders]
  );
  const context = selectedConversationRecordId
    ? ((contextQuery.data ?? null) as WhatsAppContext | null)
    : null;

  const suggestedAction = useMemo(
    () => getOfficialSuggestedAction(context),
    [context]
  );

  const refreshExecutionState = useCallback(async () => {
    await Promise.all([
      pendingApprovalsQuery.refetch(),
      executionHistoryQuery.refetch(),
      messagesQuery.refetch(),
      conversationsQuery.refetch(),
      contextQuery.refetch(),
      conversationDetailsQuery.refetch(),
    ]);
  }, [
    conversationDetailsQuery,
    contextQuery,
    conversationsQuery,
    executionHistoryQuery,
    messagesQuery,
    pendingApprovalsQuery,
  ]);

  const handleApproveExecution = useCallback(
    async (execution: WhatsAppActionExecution) => {
      try {
        await approveExecutionMutation.mutateAsync({
          id: execution.id,
          reason: "Aprovado no cockpit WhatsApp",
        });
        await refreshExecutionState();
        toast.success("Workflow aprovado.");
      } catch (error: any) {
        toast.error(error?.message ?? "Falha ao aprovar workflow.");
      }
    },
    [approveExecutionMutation, refreshExecutionState]
  );

  const handleExecuteExecution = useCallback(
    (execution: WhatsAppActionExecution) => {
      if (
        execution.status === "PENDING_APPROVAL" ||
        execution.approvalRequired
      ) {
        toast.message(
          "Aprove o workflow antes de executar. A execução automática de ações sensíveis está bloqueada."
        );
        return;
      }
      setExecutionToRun(execution);
    },
    []
  );

  const confirmExecuteExecution = useCallback(async () => {
    if (!executionToRun) return;
    try {
      await executeExecutionMutation.mutateAsync({
        id: executionToRun.id,
        reason: "Executado no cockpit WhatsApp",
      });
      await refreshExecutionState();
      setExecutionToRun(null);
      toast.success("Workflow executado.");
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao executar workflow.");
    }
  }, [executeExecutionMutation, executionToRun, refreshExecutionState]);

  const handleCancelExecution = useCallback(
    (execution: WhatsAppActionExecution) => {
      setCancelReason("Cancelado no cockpit WhatsApp");
      setExecutionToCancel(execution);
    },
    []
  );

  const confirmCancelExecution = useCallback(async () => {
    const reason = cancelReason.trim();
    if (!executionToCancel || !reason) {
      toast.message("Informe um motivo para cancelar o workflow.");
      return;
    }
    try {
      await cancelExecutionMutation.mutateAsync({
        id: executionToCancel.id,
        reason,
      });
      await refreshExecutionState();
      setExecutionToCancel(null);
      toast.success("Workflow cancelado.");
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao cancelar workflow.");
    }
  }, [
    cancelExecutionMutation,
    cancelReason,
    executionToCancel,
    refreshExecutionState,
  ]);

  const handleRequestSuggestedExecution = useCallback(async () => {
    if (!selectedConversationRecordId || !suggestedAction?.executableAction) {
      toast.message("A ação sugerida precisa de uma conversa ativa.");
      return;
    }
    try {
      const execution = (await requestExecutionMutation.mutateAsync({
        conversationId: selectedConversationRecordId,
        suggestedAction: suggestedAction.executableAction,
        executionReason: suggestedAction.label,
        actionPayload: suggestedAction.target
          ? {
              entityType: suggestedAction.target.entityType,
              entityId: suggestedAction.target.entityId,
            }
          : undefined,
        idempotencyKey: suggestedAction.logicalKey ?? undefined,
      })) as WhatsAppActionExecution;
      await refreshExecutionState();
      if (execution.status === "PENDING_APPROVAL") {
        toast.success("Workflow criado e aguardando aprovação.");
        return;
      }
      toast.success("Workflow executado com segurança.");
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao criar workflow sugerido.");
    }
  }, [
    context,
    refreshExecutionState,
    requestExecutionMutation,
    selectedConversationRecordId,
    suggestedAction,
  ]);

  const handleResolveConversationExecution = useCallback(async () => {
    const action = context?.officialActions?.find(
      item => item.action === "MARK_RESOLVED" && !item.disabled
    );
    if (!selectedConversationRecordId || !action?.logicalKey) {
      toast.message("A resolução não está disponível no contrato oficial.");
      return;
    }
    try {
      const execution = (await requestExecutionMutation.mutateAsync({
        conversationId: selectedConversationRecordId,
        suggestedAction: "MARK_RESOLVED",
        executionReason: action.reason ?? action.label,
        actionPayload: action.target
          ? {
              entityType: action.target.entityType,
              entityId: action.target.entityId,
            }
          : undefined,
        idempotencyKey: action.logicalKey,
      })) as WhatsAppActionExecution;
      await refreshExecutionState();
      toast.success(
        execution.status === "PENDING_APPROVAL"
          ? "Workflow de resolução aguardando aprovação."
          : "Workflow de resolução atualizado."
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao criar workflow de resolução.");
    }
  }, [
    context,
    refreshExecutionState,
    requestExecutionMutation,
    selectedConversationRecordId,
  ]);

  const handleReviewAssistedExecution = useCallback(() => {
    setIsContextVisible(true);
    document
      .getElementById("whatsapp-context-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const governanceAlert = context?.governanceAlert ?? null;

  const destinationPhone = useMemo(
    () =>
      String(
        context?.customer?.phone ??
          selectedConversation?.phone ??
          selectedCustomer?.phone ??
          ""
      ).trim(),
    [
      context?.customer?.phone,
      selectedConversation?.phone,
      selectedCustomer?.phone,
    ]
  );
  const canComposeForSelected =
    Boolean(selectedConversationId) && Boolean(destinationPhone);
  const composePlaceholder = selectedConversation
    ? selectedConversationRecordId
      ? "Responder conversa..."
      : "Iniciar conversa com este cliente..."
    : "Selecione uma conversa para responder...";

  const handleSelectConversation = (conversationId: string) => {
    hasManualSelectionRef.current = true;
    setSelectedConversationId(conversationId);
    setContent("");
    setComposerMessageTypeOverride(null);
    setComposerError(null);
  };

  const handleManualSend = async () => {
    if (!selectedConversationId) {
      setComposerError("Selecione uma conversa antes de enviar.");
      return;
    }
    const customerId =
      context?.customer?.id ?? selectedConversation?.customerId ?? undefined;
    if (!selectedConversationRecordId && !customerId) {
      setComposerError(
        "Não foi possível identificar o cliente para iniciar a conversa."
      );
      return;
    }
    if (!destinationPhone) {
      setComposerError("Este cliente não possui telefone cadastrado.");
      return;
    }
    const finalContent = content.trim();
    if (!finalContent) {
      setComposerError("Digite uma mensagem antes de enviar.");
      return;
    }
    setComposerError(null);

    try {
      const entity = resolveEntityFromContext(context);
      await sendMessageMutation.mutateAsync(
        buildWhatsAppSendPayload(
          {
            conversationId: selectedConversationRecordId ?? undefined,
            customerId,
            toPhone: destinationPhone,
            content: finalContent,
            entityType: entity.entityType,
            entityId: entity.entityId ?? customerId ?? undefined,
            messageType: composerMessageTypeOverride,
          },
          { context }
        )
      );
      setContent("");
      setComposerMessageTypeOverride(null);
      shouldPromoteVirtualSelectionRef.current = !selectedConversationRecordId;
      const refreshedConversations = await conversationsQuery.refetch();
      const refreshedRows = Array.isArray(refreshedConversations.data)
        ? refreshedConversations.data.map(mapConversation)
        : [];
      const resolvedConversation = refreshedRows.find(
        item => String(item.customerId ?? "") === String(customerId ?? "")
      );
      if (resolvedConversation?.id) {
        setSelectedConversationId(resolvedConversation.id);
      }
      // TODO(timeline): validar evento MESSAGE_SENT/PAYMENT_LINK_SENT quando endpoint de timeline expuser rastreamento dedicado.
      await Promise.all([
        messagesQuery.refetch(),
        contextQuery.refetch(),
        conversationDetailsQuery.refetch(),
      ]);
    } catch (error: any) {
      console.error(error);
      const message = resolveComposerErrorMessage(error);
      setComposerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (!queryTemplate || !selectedConversationId || content.trim()) return;
    const templateMap: Record<string, string> = {
      APPOINTMENT_CONFIRMATION: "Confirmação de agendamento",
      APPOINTMENT_REMINDER: "Lembrete de agendamento",
      SERVICE_UPDATE: "Atualização de O.S.",
      PAYMENT_LINK: "Link de pagamento",
      PAYMENT_REMINDER: "Lembrete de cobrança",
      PAYMENT_CONFIRMATION: "Confirmação de pagamento",
      CUSTOMER_NOTIFICATION: "Mensagem livre",
      MANUAL: "Mensagem livre",
    };
    const resolved = templateMap[String(queryTemplate).toUpperCase()];
    if (resolved) {
      setContent(buildTemplateText(resolved, context));
      setComposerMessageTypeOverride(
        normalizeMessageType(String(queryTemplate)) ?? getDefaultMessageType()
      );
    }
  }, [queryTemplate, selectedConversationId, content, context, setContent]);

  const handleTemplateChip = (
    template: string,
    messageType?: OperationalMessageType
  ) => {
    if (!selectedConversationId) return;
    setContent(buildTemplateText(template, context));
    setComposerMessageTypeOverride(messageType ?? null);
  };

  const handleSendTemplate = async (templateKey: "payment_link" | "payment_reminder") => {
    if (!selectedConversationId) return;
    const customerId =
      context?.customer?.id ?? selectedConversation?.customerId ?? undefined;
    if (!selectedConversationRecordId && !customerId) {
      toast.error(
        "Não foi possível identificar o cliente para iniciar a conversa."
      );
      return;
    }
    if (!destinationPhone) {
      toast.error("Este cliente não possui telefone cadastrado.");
      return;
    }
    try {
      await sendTemplateMutation.mutateAsync({
        templateKey,
        conversationId: selectedConversationRecordId ?? undefined,
        customerId,
        context: {
          customerName: context?.customer?.name,
          appointmentDate: context?.nextAppointment?.scheduledAt,
          appointmentTime: context?.nextAppointment?.scheduledAt,
          chargeAmount: context?.openCharge?.amount == null ? undefined : String(context.openCharge.amount),
          chargeDueDate: context?.openCharge?.dueDate,
          paymentLink: context?.openCharge?.paymentLink ?? undefined,
          serviceOrderNumber: context?.activeServiceOrder?.number == null ? undefined : String(context.activeServiceOrder.number),
        },
      });
      shouldPromoteVirtualSelectionRef.current = !selectedConversationRecordId;
      const refreshedConversations = await conversationsQuery.refetch();
      const refreshedRows = Array.isArray(refreshedConversations.data)
        ? refreshedConversations.data.map(mapConversation)
        : [];
      const resolvedConversation = refreshedRows.find(
        item => String(item.customerId ?? "") === String(customerId ?? "")
      );
      if (resolvedConversation?.id) {
        setSelectedConversationId(resolvedConversation.id);
      }
      await Promise.all([
        messagesQuery.refetch(),
        contextQuery.refetch(),
        conversationDetailsQuery.refetch(),
      ]);
      toast.success("Template enviado.");
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao enviar template.");
    }
  };

  const handleRetryLastFailed = async () => {
    const failed = [...messages]
      .reverse()
      .find(item => item.status === "FAILED");
    if (!failed?.id) {
      toast.message("Nenhuma mensagem com falha para reenviar.");
      return;
    }
    try {
      await retryMessageMutation.mutateAsync({ id: failed.id });
      await Promise.all([
        messagesQuery.refetch(),
        conversationsQuery.refetch(),
        contextQuery.refetch(),
      ]);
      toast.success("Reenvio solicitado com sucesso.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível reenviar a mensagem.");
    }
  };

  const handleMoreActions = async () => {
    await handleRetryLastFailed();
  };

  const handleSendCharge = async () => {
    if (!context?.openCharge?.id) {
      toast.message("Nenhuma cobrança aberta para este cliente.");
      return;
    }
    await handleSendTemplate(context.openCharge.paymentLink ? "payment_link" : "payment_reminder");
  };

  return (
    <>
      <AppPageShell className="min-w-0 gap-3 overflow-x-hidden">
        <AppOperationalHeader
          title="WhatsApp"
          description="Inbox, conversa e contexto oficial em um único workspace operacional."
          density="compact"
          contextChips={
            <>
              <AppContextChip tone="neutral">
                {conversations.length} conversa(s) no inbox
              </AppContextChip>
              <AppContextChip tone={healthQuery.error ? "warning" : "success"}>
                {healthQuery.error
                  ? "Disponibilidade do canal indisponível"
                  : healthQuery.isLoading
                    ? "Verificando disponibilidade do canal"
                    : "Canal verificado oficialmente"}
              </AppContextChip>
            </>
          }
        >
          {healthQuery.error ? (
            <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Não foi possível confirmar a disponibilidade do canal. O
                histórico permanece acessível; novos envios podem falhar.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void healthQuery.refetch()}
              >
                Verificar novamente
              </Button>
            </div>
          ) : null}
        </AppOperationalHeader>

        <AppFiltersBar className="min-w-0 flex-col items-stretch gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="whatsapp-search" className="sr-only">
              Buscar conversas
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              id="whatsapp-search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Buscar por cliente, contato ou mensagem"
              className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] pl-9 pr-3 text-sm"
            />
          </div>
          <label htmlFor="whatsapp-status-filter" className="sr-only">
            Filtrar por status da conversa
          </label>
          <select
            id="whatsapp-status-filter"
            value={activeFilter}
            onChange={event =>
              setActiveFilter(event.target.value as ConversationFilter)
            }
            className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
          >
            {FILTERS.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <label htmlFor="whatsapp-priority-filter" className="sr-only">
            Filtrar por prioridade oficial
          </label>
          <select
            id="whatsapp-priority-filter"
            value={priorityFilter}
            onChange={event =>
              setPriorityFilter(event.target.value as "ALL" | WhatsAppPriority)
            }
            className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
          >
            <option value="ALL">Todas as prioridades</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Baixa</option>
          </select>
          <label htmlFor="whatsapp-responsible-filter" className="sr-only">
            Filtrar por responsável oficial
          </label>
          <select
            id="whatsapp-responsible-filter"
            value={responsibleFilter}
            onChange={event => setResponsibleFilter(event.target.value)}
            className="h-9 min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-sm"
          >
            <option value="ALL">Todos os responsáveis</option>
            <option value="UNASSIGNED">Sem responsável</option>
            {responsibles.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </AppFiltersBar>

        <AppSectionBlock
          title="Workspace de comunicação"
          subtitle="A ordem relativa do inbox é exatamente a ordem recebida da API."
          compact
          className="min-h-0 overflow-hidden"
        >
          <div className="grid min-h-[34rem] min-w-0 grid-cols-1 overflow-hidden md:h-[calc(100dvh-19rem)] md:max-h-[52rem] md:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)_minmax(18rem,20rem)]">
            <div
              className={cn(
                "min-h-0 min-w-0 overflow-hidden md:block",
                selectedConversationId ? "hidden" : "block"
              )}
            >
              <InboxQueueColumn
                rows={filteredRows}
                selectedId={selectedConversationId}
                onSelect={handleSelectConversation}
                search={searchTerm}
                isLoading={
                  (conversationsQuery.isLoading ||
                    conversationsQuery.isFetching) &&
                  filteredRows.length === 0
                }
                hasError={Boolean(conversationsQuery.error)}
                errorMessage="Não foi possível carregar conversas"
                emptyStateMessage={emptyStateMessage}
                onRetry={() => void conversationsQuery.refetch()}
              />
            </div>

            <div
              className={cn(
                "min-h-0 min-w-0 flex-col overflow-hidden md:flex",
                selectedConversationId ? "flex" : "hidden"
              )}
            >
              <ExecutionChatColumn
                conversation={selectedConversation}
                onBack={() => setSelectedConversationId(null)}
                canCompose={canComposeForSelected}
                composePlaceholder={composePlaceholder}
                messages={messages}
                isLoading={messagesQuery.isLoading || messagesQuery.isFetching}
                messagesError={Boolean(messagesQuery.error)}
                onRetryMessages={() => void messagesQuery.refetch()}
                sendMessage={handleManualSend}
                content={content}
                setContent={value => setContent(value)}
                onToggleFavorite={() => {
                  if (!selectedConversationId) return;
                  setLocalFavorites(previous => ({
                    ...previous,
                    [selectedConversationId]: !previous[selectedConversationId],
                  }));
                }}
                isFavorite={Boolean(
                  localFavorites[selectedConversationId ?? ""]
                )}
                onInfo={() => setIsContextVisible(true)}
                onMoreActions={handleMoreActions}
                error={composerError}
                onOpenServiceOrder={() =>
                  setLocation(
                    context?.activeServiceOrder?.id
                      ? `/service-orders?serviceOrderId=${context.activeServiceOrder.id}`
                      : "/service-orders"
                  )
                }
                onFillTemplate={handleTemplateChip}
                onSendCharge={() => void handleSendCharge()}
                onSendPaymentReminder={() =>
                  void handleSendTemplate("payment_reminder")
                }
                onRequestSuggestedExecution={() =>
                  void handleRequestSuggestedExecution()
                }
                onResolveConversation={() =>
                  void handleResolveConversationExecution()
                }
                onReviewAssistedExecution={handleReviewAssistedExecution}
                officialActions={context?.officialActions ?? []}
                suggestedActionLabel={suggestedAction?.label ?? null}
                governanceAlert={governanceAlert}
                onRunSuggestedAction={() => {
                  if (suggestedAction?.key === "retry") {
                    void handleRetryLastFailed();
                    return;
                  }
                  void handleRequestSuggestedExecution();
                }}
              />
            </div>

            <div
              className={cn(
                "min-h-0 min-w-0 overflow-hidden border-l border-[var(--border-subtle)]",
                isContextVisible ? "hidden xl:block" : "hidden"
              )}
            >
              <OperationalContextColumn
                conversation={selectedConversation}
                context={context}
                selectedCustomer={selectedCustomer}
                isLoading={contextQuery.isLoading || contextQuery.isFetching}
                hasError={Boolean(contextQuery.error)}
                onRetry={() => void contextQuery.refetch()}
                onNavigate={setLocation}
                pendingApprovals={pendingApprovals}
                executionHistory={executionHistory}
                isExecutionLoading={
                  pendingApprovalsQuery.isLoading ||
                  pendingApprovalsQuery.isFetching ||
                  executionHistoryQuery.isLoading ||
                  executionHistoryQuery.isFetching
                }
                onApproveExecution={handleApproveExecution}
                onExecuteExecution={handleExecuteExecution}
                onCancelExecution={handleCancelExecution}
                isExecutionMutating={
                  approveExecutionMutation.isPending ||
                  executeExecutionMutation.isPending ||
                  cancelExecutionMutation.isPending ||
                  requestExecutionMutation.isPending
                }
                isExecutionError={Boolean(
                  pendingApprovalsQuery.error || executionHistoryQuery.error
                )}
                onRetryExecution={() =>
                  void Promise.all([
                    pendingApprovalsQuery.refetch(),
                    executionHistoryQuery.refetch(),
                  ])
                }
              />
            </div>
          </div>
        </AppSectionBlock>
        {/* TODO: Conectar registro direto quando finance.markAsPaid estiver exposto no BFF. */}
        {/* TODO: Abrir detalhe de clientes/financeiro pelo query id caso a rota ainda não suporte foco automático. */}
      </AppPageShell>
      <ConfirmModal
        open={Boolean(executionToRun)}
        onOpenChange={open => !open && setExecutionToRun(null)}
        title="Executar workflow WhatsApp"
        description="Confirme a execução oficial deste workflow agora."
        confirmLabel="Executar workflow"
        onConfirm={() => void confirmExecuteExecution()}
        isPending={executeExecutionMutation.isPending}
      />
      <FormModal
        open={Boolean(executionToCancel)}
        onOpenChange={open => !open && setExecutionToCancel(null)}
        title="Cancelar workflow WhatsApp"
        description="Informe o motivo auditável do cancelamento."
        closeBlocked={cancelExecutionMutation.isPending}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExecutionToCancel(null)}
              disabled={cancelExecutionMutation.isPending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmCancelExecution()}
              disabled={
                cancelExecutionMutation.isPending || !cancelReason.trim()
              }
            >
              Confirmar cancelamento
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label
            htmlFor="whatsapp-cancel-reason"
            className="text-sm font-medium text-app-primary"
          >
            Motivo do cancelamento
          </label>
          <textarea
            id="whatsapp-cancel-reason"
            value={cancelReason}
            onChange={event => setCancelReason(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-app-primary"
          />
        </div>
      </FormModal>
    </>
  );
}

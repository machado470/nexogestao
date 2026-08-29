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
import {
  priorityRank,
  resolveInboxPriority,
  type GovernanceSignal,
  type InboxPriority,
} from "@/lib/whatsappInboxPriority";
import { Button } from "@/components/ui/button";
import { AppPageShell, AppSkeleton } from "@/components/app-system";
import { OperationalInnerCard } from "@/components/operational";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppPageLoadingState } from "@/components/internal-page-system";
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
type WhatsAppPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
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

type WhatsAppComposerActionContext = {
  hasSuggestedAction: boolean;
  hasPendingAssistedExecution?: boolean;
  hasOpenCharge?: boolean;
  hasPendingCharge?: boolean;
  canSendPaymentLink?: boolean;
  chargeStatus?: string | null;
  chargeDaysOverdue?: number | null;
  hasUpcomingAppointment?: boolean;
  appointmentStatus?: string | null;
  hasActiveServiceOrder?: boolean;
  serviceOrderStatus?: string | null;
  canResolveConversation?: boolean;
};

function normalizeContextStatus(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
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

function cloneRecommendedAction(
  action: ComposerActionDescriptor,
  description: string,
  label = action.label
): ComposerActionDescriptor {
  return {
    ...action,
    label,
    description,
    availability: "primary",
  };
}

export function getRecommendedWhatsAppComposerActions(
  context: Required<
    Pick<
      WhatsAppComposerActionContext,
      | "hasSuggestedAction"
      | "hasPendingAssistedExecution"
      | "hasOpenCharge"
      | "hasPendingCharge"
      | "canSendPaymentLink"
      | "hasUpcomingAppointment"
      | "hasActiveServiceOrder"
      | "canResolveConversation"
    >
  > &
    Pick<
      WhatsAppComposerActionContext,
      | "chargeStatus"
      | "chargeDaysOverdue"
      | "appointmentStatus"
      | "serviceOrderStatus"
    >,
  groupedActions: Record<ComposerActionGroupName, ComposerActionDescriptor[]>
): ComposerActionDescriptor[] {
  const actionByKey = new Map(
    Object.values(groupedActions)
      .flat()
      .map(action => [action.key, action])
  );
  const chargeStatus = normalizeContextStatus(context.chargeStatus);
  const appointmentStatus = normalizeContextStatus(context.appointmentStatus);
  const serviceOrderStatus = normalizeContextStatus(context.serviceOrderStatus);
  const hasOverdueCharge =
    (context.chargeDaysOverdue ?? 0) > 0 ||
    ["OVERDUE", "VENCIDA", "ATRASADA"].includes(chargeStatus);
  const hasChargeToCollect =
    context.hasOpenCharge &&
    (context.hasPendingCharge ||
      hasOverdueCharge ||
      ["PENDING", "OPEN", "ABERTA", "PENDENTE"].includes(chargeStatus));
  const hasAppointmentToConfirm =
    context.hasUpcomingAppointment &&
    !["CONFIRMED", "CONFIRMADO", "CANCELLED", "CANCELED", "CANCELADO"].includes(
      appointmentStatus
    );
  const hasServiceOrderNeedingUpdate =
    context.hasActiveServiceOrder &&
    ![
      "DONE",
      "COMPLETED",
      "CONCLUIDA",
      "CONCLUÍDA",
      "CANCELLED",
      "CANCELED",
    ].includes(serviceOrderStatus);

  const recommended: ComposerActionDescriptor[] = [];
  const add = (key: string, description: string, label?: string) => {
    const action = actionByKey.get(key);
    if (!action || action.disabled) return;
    recommended.push(cloneRecommendedAction(action, description, label));
  };

  if (context.hasPendingAssistedExecution) {
    add(
      "create-assisted-execution",
      "Há uma execução pendente para revisar antes de continuar.",
      "Revisar execução assistida"
    );
  }

  if (hasOverdueCharge) {
    add("send-charge", "Cobrança vencida neste atendimento.");
    add("send-payment-link", "Link disponível para resolver a cobrança agora.");
  } else if (hasChargeToCollect) {
    add("send-charge", "Cobrança pendente vinculada ao cliente.");
    add("send-payment-link", "Link disponível para resolver a cobrança agora.");
  }

  if (hasAppointmentToConfirm) {
    add(
      "confirm-appointment",
      "Agendamento pendente no contexto desta conversa."
    );
  }

  if (hasServiceOrderNeedingUpdate) {
    add("update-service", "O.S. ativa ou atrasada vinculada ao cliente.");
  }

  return recommended;
}

export function buildWhatsAppComposerActionGroups({
  hasSuggestedAction,
  hasPendingAssistedExecution = false,
  hasOpenCharge = true,
  hasPendingCharge = hasOpenCharge,
  canSendPaymentLink = true,
  chargeStatus = null,
  chargeDaysOverdue = null,
  hasUpcomingAppointment = true,
  appointmentStatus = null,
  hasActiveServiceOrder = true,
  serviceOrderStatus = null,
  canResolveConversation = hasSuggestedAction,
}: WhatsAppComposerActionContext): WhatsAppComposerActionPalette {
  const groupedActions: Record<
    ComposerActionGroupName,
    ComposerActionDescriptor[]
  > = {
    Comunicação: [
      {
        key: "quick-template",
        label: "Template rápido",
        group: "Comunicação",
        groupId: "communication",
        description: "Preencher uma resposta padronizada.",
      },
      {
        key: "attach-file",
        label: "Anexar arquivo",
        group: "Comunicação",
        groupId: "communication",
        description: "Enviar mídia ou documento nesta conversa.",
        disabled: true,
        reason: "Em breve",
        availability: "upcoming",
      },
      {
        key: "audio-message",
        label: "Áudio / mensagem de voz",
        group: "Comunicação",
        groupId: "communication",
        description: "Gravar ou enviar áudio pelo WhatsApp.",
        disabled: true,
        reason: "Em breve",
        availability: "upcoming",
      },
    ],
    Financeiro: [
      {
        key: "send-charge",
        label: "Enviar cobrança",
        group: "Financeiro",
        groupId: "finance",
        description: "Enviar a cobrança aberta do cliente.",
        disabled: !hasOpenCharge,
        reason: hasOpenCharge ? undefined : "Sem cobrança",
      },
      {
        key: "send-payment-link",
        label: "Enviar link de pagamento",
        group: "Financeiro",
        groupId: "finance",
        description: "Compartilhar o checkout já disponível.",
        disabled: !hasOpenCharge || !canSendPaymentLink,
        reason: !hasOpenCharge
          ? "Sem cobrança"
          : canSendPaymentLink
            ? undefined
            : "Sem link",
      },
      {
        key: "payment-reminder",
        label: "Lembrete de pagamento",
        group: "Financeiro",
        groupId: "finance",
        description: "Preparar lembrete com dados da cobrança.",
        disabled: !hasOpenCharge,
        reason: hasOpenCharge ? undefined : "Sem cobrança",
      },
    ],
    Agenda: [
      {
        key: "confirm-appointment",
        label: "Confirmar agendamento",
        group: "Agenda",
        groupId: "agenda",
        description: "Preencher confirmação com data e horário.",
        disabled: !hasUpcomingAppointment,
        reason: hasUpcomingAppointment ? undefined : "Sem agenda",
      },
      {
        key: "appointment-reminder",
        label: "Lembrete de agendamento",
        group: "Agenda",
        groupId: "agenda",
        description: "Preparar lembrete do próximo atendimento.",
        disabled: !hasUpcomingAppointment,
        reason: hasUpcomingAppointment ? undefined : "Sem agenda",
      },
    ],
    "Ordem de serviço": [
      {
        key: "update-service",
        label: "Atualizar serviço",
        group: "Ordem de serviço",
        groupId: "serviceOrder",
        description: "Preencher status da O.S. ativa.",
        disabled: !hasActiveServiceOrder,
        reason: hasActiveServiceOrder ? undefined : "Sem O.S.",
      },
      {
        key: "link-service-order",
        label: "Vincular O.S.",
        group: "Ordem de serviço",
        groupId: "serviceOrder",
        description: "Abrir a O.S. ativa ou localizar cadastro.",
        disabled: !hasActiveServiceOrder,
        reason: hasActiveServiceOrder ? undefined : "Sem O.S.",
      },
    ],
    "Execução assistida": [
      {
        key: "create-assisted-execution",
        label: hasPendingAssistedExecution
          ? "Revisar execução assistida"
          : "Criar execução assistida",
        group: "Execução assistida",
        groupId: "execution",
        description: hasPendingAssistedExecution
          ? "Abrir workflow pendente desta conversa."
          : "Revisar e aprovar a ação sugerida.",
        disabled: !hasSuggestedAction && !hasPendingAssistedExecution,
        reason:
          hasSuggestedAction || hasPendingAssistedExecution
            ? undefined
            : "Sem ação sugerida",
      },
      {
        key: "mark-resolved",
        label: "Marcar conversa como resolvida",
        group: "Execução assistida",
        groupId: "execution",
        description: "Encerrar esta conversa via execução assistida.",
        disabled: !canResolveConversation,
        reason: canResolveConversation ? undefined : "Conversa resolvida",
      },
    ],
  };

  const recommendedActions = getRecommendedWhatsAppComposerActions(
    {
      hasSuggestedAction,
      hasPendingAssistedExecution,
      hasOpenCharge,
      hasPendingCharge,
      canSendPaymentLink,
      chargeStatus,
      chargeDaysOverdue,
      hasUpcomingAppointment,
      appointmentStatus,
      hasActiveServiceOrder,
      serviceOrderStatus,
      canResolveConversation,
    },
    groupedActions
  );
  const recommendedKeys = new Set(recommendedActions.map(action => action.key));
  const allActions = Object.values(groupedActions).flat();
  const fallbackPrimaryAction = allActions.find(
    action =>
      action.key === "quick-template" && !recommendedKeys.has(action.key)
  );
  const primaryActions = recommendedActions.length
    ? recommendedActions
    : fallbackPrimaryAction
      ? [
          {
            ...fallbackPrimaryAction,
            availability: "primary" as const,
            description:
              "Começar com uma resposta padronizada ou mensagem livre.",
          },
        ]
      : [];
  const primaryKeys = new Set(primaryActions.map(action => action.key));
  const contextualActions = allActions.filter(
    action => !primaryKeys.has(action.key)
  );

  return {
    primaryActions,
    secondaryActions: contextualActions
      .filter(action => !action.disabled)
      .map(action => ({ ...action, availability: "secondary" as const })),
    unavailableActions: contextualActions
      .filter(action => action.disabled && action.availability !== "upcoming")
      .map(action => ({ ...action, availability: "unavailable" as const })),
    upcomingActions: contextualActions
      .filter(action => action.availability === "upcoming")
      .map(action => ({ ...action, availability: "upcoming" as const })),
    recommendedActions,
    groupedActions,
  };
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
  status: WhatsAppConversationStatus;
  contextType: ContextType;
  priority: WhatsAppPriority;
  governanceSignal?: GovernanceSignal | null;
  failedMessageCount?: number;
  lastFailedAt?: string | null;
  hasNoResponse?: boolean;
  unreadCount: number;
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
    entityType?: string;
    entityId?: string | null;
  } | null;
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

const ROW_HEIGHT = 92;
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

function mapConversation(item: any): Conversation {
  const customerName = item?.customer?.name ?? item?.title ?? "Sem nome";
  const hasPendingCharge = Boolean(item?.flags?.hasPendingCharge);
  const hasUpcomingAppointment = Boolean(
    item?.flags?.hasUpcomingAppointment ?? item?.contextType === "APPOINTMENT"
  );
  const hasActiveServiceOrder = Boolean(
    item?.flags?.hasActiveServiceOrder ?? item?.contextType === "SERVICE_ORDER"
  );
  const governanceSignal = (item?.metadata?.governanceSignal ??
    null) as GovernanceSignal | null;
  const hasFailedDelivery =
    item?.status === "FAILED" ||
    Boolean(governanceSignal?.communicationFailure);
  const hasNoResponse = Boolean(
    item?.flags?.hasNoResponse ?? item?.status === "WAITING_CUSTOMER"
  );
  const operationalStatus = hasFailedDelivery
    ? "Falha"
    : hasNoResponse
      ? "Aguardando resposta"
      : hasPendingCharge || hasUpcomingAppointment || hasActiveServiceOrder
        ? "Com pendência"
        : "Resolvido";
  const backendPriority =
    item?.priority === "NORMAL" ? "MEDIUM" : item?.priority;
  const priority =
    backendPriority ??
    resolveInboxPriority({
      hasFailedDelivery,
      hasPendingCharge,
      isAwaitingReply: hasNoResponse,
      isResolved: String(item?.status ?? "") === "RESOLVED",
      governanceSignal,
    });
  return {
    id: String(item?.id ?? ""),
    conversationId: String(item?.id ?? ""),
    customerId: item?.customerId ?? item?.customer?.id ?? null,
    name: String(customerName),
    phone: item?.phone ?? item?.customer?.phone ?? null,
    title: item?.title ?? null,
    lastMessage: String(
      item?.lastMessagePreview ?? item?.title ?? "Sem mensagens"
    ),
    lastMessageAt: item?.lastMessageAt ?? null,
    status: (item?.status ?? "OPEN") as WhatsAppConversationStatus,
    contextType: (item?.contextType ?? "GENERAL") as ContextType,
    priority,
    unreadCount: Number(item?.unreadCount ?? 0),
    contextId: item?.contextId ?? null,
    operationalStatus,
    contextHint: item?.title ?? item?.lastMessagePreview ?? null,
    hasPendingCharge,
    hasUpcomingAppointment,
    hasActiveServiceOrder,
    hasFailedDelivery,
    governanceSignal,
    failedMessageCount: governanceSignal?.failedMessageCount ?? undefined,
    lastFailedAt: governanceSignal?.lastFailedAt ?? null,
    hasNoResponse,
    isVirtual: false,
    customer: item?.customer
      ? {
          id: item?.customer?.id ? String(item.customer.id) : undefined,
          name: item?.customer?.name ? String(item.customer.name) : undefined,
          phone: item?.customer?.phone
            ? String(item.customer.phone)
            : undefined,
        }
      : null,
    responsibleName:
      item?.assignedTo?.name ??
      item?.responsible?.name ??
      item?.responsibleName ??
      null,
  };
}

function mapMessage(item: any): ChatMessage {
  return {
    id: String(item?.id ?? ""),
    direction: (item?.direction ?? "OUTBOUND") as MessageDirection,
    content: String(item?.renderedText ?? item?.content ?? ""),
    createdAt: item?.createdAt ?? null,
    status: (item?.status ?? "QUEUED") as MessageStatus,
    messageType: item?.messageType ?? null,
    errorMessage: item?.errorMessage ?? item?.lastError ?? null,
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

function resolveMessageTypeFromTemplate(
  templateKey: string,
  context?: WhatsAppContext | null
): OperationalMessageType {
  const normalizedTemplateKey = templateKey.toLowerCase();
  if (normalizedTemplateKey.includes("payment_link")) return "PAYMENT_LINK";
  if (normalizedTemplateKey.includes("payment_reminder"))
    return "PAYMENT_REMINDER";
  if (normalizedTemplateKey.includes("appointment_confirmation"))
    return "APPOINTMENT_CONFIRMATION";
  if (normalizedTemplateKey.includes("appointment_reminder"))
    return "APPOINTMENT_REMINDER";
  if (normalizedTemplateKey.includes("service_update")) return "SERVICE_UPDATE";
  return resolveMessageType({ context });
}

function resolveEntityFromContext(context?: WhatsAppContext | null) {
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

function priorityScore(conversation: Conversation) {
  if (!conversation.conversationId) return 900;
  const rank = priorityRank(conversation.priority as InboxPriority);
  return rank * 100;
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
  return "Baixa";
}

function getPrimaryCommunicationAction(conversation?: Conversation | null) {
  if (!conversation) return "Selecionar conversa";
  if (!conversation.phone) return "Bloqueado: sem telefone";
  if (conversation.hasFailedDelivery) return "Reenviar falha";
  if (conversation.hasPendingCharge) return "Enviar cobrança";
  if (conversation.hasUpcomingAppointment) return "Confirmar agenda";
  if (conversation.hasActiveServiceOrder) return "Atualizar O.S.";
  if (conversation.status !== "RESOLVED") return "Resolver conversa";
  return "Acompanhar histórico";
}

function buildSuggestedAction(
  conversation?: Conversation,
  context?: WhatsAppContext | null
) {
  if (!conversation) return null;
  if (conversation.hasFailedDelivery)
    return { key: "retry", label: "Reenviar mensagem" };
  if (conversation.hasPendingCharge && conversation.hasNoResponse) {
    return {
      key: "charge",
      label: context?.openCharge?.paymentLink
        ? "Enviar link de pagamento"
        : "Enviar lembrete de cobrança",
      executableAction: (context?.openCharge?.paymentLink
        ? "SEND_PAYMENT_LINK"
        : "REPLY_WITH_TEMPLATE") as WhatsAppSuggestedAction,
    };
  }
  if (
    context?.nextAppointment?.id &&
    String(context?.nextAppointment?.status ?? "").toUpperCase() !== "CONFIRMED"
  ) {
    return {
      key: "appointment",
      label: "Confirmar agendamento",
      executableAction: "CONFIRM_APPOINTMENT" as WhatsAppSuggestedAction,
    };
  }
  if (context?.activeServiceOrder?.id) {
    return {
      key: "service",
      label: "Enviar atualização da O.S.",
      executableAction: "SEND_SERVICE_UPDATE" as WhatsAppSuggestedAction,
    };
  }
  return {
    key: "resolve",
    label: "Marcar conversa como resolvida",
    executableAction: "MARK_RESOLVED" as WhatsAppSuggestedAction,
  };
}

function buildActionPayload(
  action: WhatsAppSuggestedAction,
  context?: WhatsAppContext | null
) {
  const entity = resolveEntityFromContext(context);
  return {
    entityType: entity.entityType,
    entityId: entity.entityId,
    customerName: context?.customer?.name,
    paymentLink: context?.openCharge?.paymentLink,
    chargeAmount: context?.openCharge?.amount,
    chargeDueDate: context?.openCharge?.dueDate,
    appointmentDate: context?.nextAppointment?.scheduledAt,
    appointmentTime: context?.nextAppointment?.scheduledAt,
    serviceOrderNumber: context?.activeServiceOrder?.number,
    templateKey:
      action === "REPLY_WITH_TEMPLATE"
        ? context?.openCharge?.id
          ? "payment_reminder"
          : "manual_followup"
        : undefined,
  };
}

function timeAgoLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - date.getTime()) / 60000)
  );
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
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
  const status = statusUi[conversation.status] ?? statusUi.OPEN;
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
  filter,
  onFilter,
  search,
  onSearch,
  isLoading,
  hasError,
  errorMessage,
  emptyStateMessage,
  priorityFilter,
  onPriorityFilter,
  responsibleFilter,
  onResponsibleFilter,
  responsibles,
  onRetry,
}: {
  rows: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: ConversationFilter;
  onFilter: (next: ConversationFilter) => void;
  search: string;
  onSearch: (next: string) => void;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  emptyStateMessage: string;
  priorityFilter: "ALL" | WhatsAppPriority;
  onPriorityFilter: (value: "ALL" | WhatsAppPriority) => void;
  responsibleFilter: string;
  onResponsibleFilter: (value: string) => void;
  responsibles: string[];
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
        <div className="flex h-9 items-center gap-2 border-b border-[var(--app-border)]/45 bg-transparent px-1 focus-within:border-[var(--app-border)]/80">
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="h-full min-w-0 flex-1 !border-transparent !bg-transparent text-xs text-app-primary !outline-none placeholder:text-app-muted/75 focus-visible:!border-transparent focus-visible:!outline-none"
          />
        </div>
        <div className="scrollbar-thin-nexo flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
          {FILTERS.map(item => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "relative h-7 shrink-0 rounded-lg px-2.5 text-[11px] font-medium text-app-muted transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-px after:rounded-full after:bg-transparent after:content-[''] hover:bg-app-card/70 hover:text-app-primary focus-visible:outline-none",
                filter === item.value &&
                  "bg-app-card/60 text-[var(--accent-primary)] after:bg-[var(--accent-primary)]/70"
              )}
              onClick={() => onFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="grid grid-cols-2 gap-2"
          aria-label="Filtros operacionais"
        >
          <label className="sr-only" htmlFor="whatsapp-priority-filter">
            Prioridade
          </label>
          <select
            id="whatsapp-priority-filter"
            value={priorityFilter}
            onChange={event =>
              onPriorityFilter(event.target.value as "ALL" | WhatsAppPriority)
            }
            className="h-8 rounded-lg border border-[var(--app-border)]/50 bg-app-surface px-2 text-[11px] text-app-primary"
          >
            <option value="ALL">Todas as prioridades</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>
          <label className="sr-only" htmlFor="whatsapp-responsible-filter">
            Responsável
          </label>
          <select
            id="whatsapp-responsible-filter"
            value={responsibleFilter}
            onChange={event => onResponsibleFilter(event.target.value)}
            className="h-8 rounded-lg border border-[var(--app-border)]/50 bg-app-surface px-2 text-[11px] text-app-primary"
          >
            <option value="ALL">Todos responsáveis</option>
            <option value="UNASSIGNED">Sem responsável</option>
            {responsibles.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="scrollbar-thin-nexo mt-1 min-h-0 flex-1 overflow-y-auto pr-1"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <AppSkeleton key={idx} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="border-t border-[var(--app-border)]/40 px-1 py-4">
            <p className="text-xs text-[var(--text-secondary)]">
              {hasError
                ? (errorMessage ?? "Não foi possível carregar conversas")
                : emptyStateMessage}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {hasError
                ? "Tente novamente em instantes."
                : search.trim()
                  ? "Limpe a busca ou altere os filtros."
                  : "As conversas reais aparecerão aqui quando clientes responderem ou mensagens forem enviadas."}
            </p>
            {hasError ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                Tentar novamente
              </Button>
            ) : null}
          </div>
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
  canCompose,
  composePlaceholder,
  messages,
  isLoading,
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
  hasOpenCharge,
  hasPendingCharge,
  canSendPaymentLink,
  chargeStatus,
  chargeDaysOverdue,
  hasUpcomingAppointment,
  appointmentStatus,
  hasActiveServiceOrder,
  serviceOrderStatus,
  canResolveConversation,
  hasPendingAssistedExecution,
  suggestedActionLabel,
  governanceAlert,
  onRunSuggestedAction,
}: {
  conversation?: Conversation;
  canCompose: boolean;
  composePlaceholder: string;
  messages: ChatMessage[];
  isLoading: boolean;
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
  hasOpenCharge: boolean;
  hasPendingCharge: boolean;
  canSendPaymentLink: boolean;
  chargeStatus?: string | null;
  chargeDaysOverdue?: number | null;
  hasUpcomingAppointment: boolean;
  appointmentStatus?: string | null;
  hasActiveServiceOrder: boolean;
  serviceOrderStatus?: string | null;
  canResolveConversation: boolean;
  hasPendingAssistedExecution: boolean;
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
    } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: Boolean(suggestedActionLabel),
      hasPendingAssistedExecution,
      hasOpenCharge,
      hasPendingCharge,
      canSendPaymentLink,
      chargeStatus,
      chargeDaysOverdue,
      hasUpcomingAppointment,
      appointmentStatus,
      hasActiveServiceOrder,
      serviceOrderStatus,
      canResolveConversation,
    });
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
      "create-assisted-execution": hasPendingAssistedExecution
        ? onReviewAssistedExecution
        : onRequestSuggestedExecution,
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
    appointmentStatus,
    canResolveConversation,
    canSendPaymentLink,
    chargeDaysOverdue,
    chargeStatus,
    hasActiveServiceOrder,
    hasOpenCharge,
    hasPendingAssistedExecution,
    hasPendingCharge,
    hasUpcomingAppointment,
    onFillTemplate,
    onOpenServiceOrder,
    onRequestSuggestedExecution,
    onResolveConversation,
    onReviewAssistedExecution,
    onSendCharge,
    onSendPaymentReminder,
    serviceOrderStatus,
    suggestedActionLabel,
  ]);

  const renderComposerAction = (
    action: WhatsAppComposerAction,
    key = action.key
  ) => {
    const isDisabled = Boolean(action.disabled);
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
        <DropdownMenuSub key={key}>
          <DropdownMenuSubTrigger className="cursor-pointer items-start gap-0 rounded-lg px-2.5 py-2 outline-none data-[state=open]:bg-[var(--wa-menu-item-active)] focus:bg-[var(--wa-menu-item-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-primary)] hover:bg-[var(--wa-menu-item-hover)] [&>svg]:mt-1 [&>svg]:text-[var(--wa-menu-icon)]">
            {contentNode}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={2}
            alignOffset={-6}
            className="nexo-cascade-surface nexo-cascade-submenu whatsapp-action-menu scrollbar-menu-nexo z-[70] max-h-[min(70vh,24rem)] w-72 overflow-y-auto p-2 text-app-primary [direction:ltr]"
          >
            {QUICK_COMPOSER_TEMPLATES.map(template => (
              <DropdownMenuItem
                key={template}
                onClick={() => onFillTemplate(template)}
                className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium leading-snug text-[var(--wa-menu-fg-primary)] outline-none data-[highlighted]:bg-[var(--wa-menu-item-hover)] data-[highlighted]:text-[var(--wa-menu-fg-primary)] focus:bg-[var(--wa-menu-item-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-primary)]"
              >
                <FileText className="size-4 text-[var(--wa-menu-icon)]" />
                <span className="min-w-0 flex-1 whitespace-normal">
                  {template}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    return (
      <DropdownMenuItem
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
      </DropdownMenuItem>
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
        <DropdownMenuLabel
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
        </DropdownMenuLabel>
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
          >
            <Info className="size-4.5" />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 transition enabled:hover:bg-app-surface disabled:opacity-45"
            onClick={onMoreActions}
            disabled={!hasConversation}
          >
            <EllipsisVertical className="size-4.5" />
          </button>
        </div>
      </header>

      {suggestedActionLabel || governanceAlert ? (
        <div className="mx-5 mt-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_18%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--app-surface))] px-3 py-2 text-xs">
          {suggestedActionLabel ? (
            <button
              type="button"
              onClick={onRunSuggestedAction}
              className="font-medium text-[var(--warning)] underline-offset-2 hover:underline"
            >
              {suggestedActionLabel}
            </button>
          ) : null}
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
            <input
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
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
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
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="nexo-cascade-surface whatsapp-action-menu z-[60] max-h-[min(560px,calc(100vh-12rem),var(--radix-dropdown-menu-content-available-height))] w-[min(22rem,calc(100vw-2rem))] overflow-visible p-0 [direction:ltr]"
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
                    <DropdownMenuSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Outras ações",
                    tone: "secondary",
                    actions: composerActionPalette.secondaryActions,
                  })}
                  {composerActionPalette.unavailableActions.length ? (
                    <DropdownMenuSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Indisponíveis neste contexto",
                    tone: "muted",
                    actions: composerActionPalette.unavailableActions,
                  })}
                  {composerActionPalette.upcomingActions.length ? (
                    <DropdownMenuSeparator className="mx-2 my-1.5 bg-[var(--wa-action-separator)] opacity-100" />
                  ) : null}
                  {renderActionSection({
                    title: "Em breve",
                    tone: "upcoming",
                    actions: composerActionPalette.upcomingActions,
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
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
  onNavigate,
  onSendCharge,
  onSendReminder,
  onResolveConversation,
  canResolveConversation,
  onMoreActions,
  pendingApprovals,
  executionHistory,
  isExecutionLoading,
  onApproveExecution,
  onExecuteExecution,
  onCancelExecution,
  isExecutionMutating,
  isExecutionError,
  onRetryExecution,
  highlightedChargeId,
  highlightedAppointmentId,
  highlightedServiceOrderId,
}: {
  context?: WhatsAppContext | null;
  conversation?: Conversation;
  selectedCustomer?: any | null;
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onSendCharge: () => void;
  onSendReminder: () => void;
  onResolveConversation: () => void;
  canResolveConversation: boolean;
  onMoreActions: () => void;
  pendingApprovals: WhatsAppActionExecution[];
  executionHistory: WhatsAppActionExecution[];
  isExecutionLoading: boolean;
  onApproveExecution: (execution: WhatsAppActionExecution) => void;
  onExecuteExecution: (execution: WhatsAppActionExecution) => void;
  onCancelExecution: (execution: WhatsAppActionExecution) => void;
  isExecutionMutating: boolean;
  isExecutionError?: boolean;
  onRetryExecution?: () => void;
  highlightedChargeId?: string | null;
  highlightedAppointmentId?: string | null;
  highlightedServiceOrderId?: string | null;
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
              {context?.customer?.phone ??
                selectedCustomer?.phone ??
                conversation?.phone ??
                "--"}
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
            {highlightedAppointmentId &&
            context?.nextAppointment?.id === highlightedAppointmentId ? (
              <p className="mt-1 text-[10px] text-[var(--accent-primary)]">
                Sugestão: Confirmar agendamento.
              </p>
            ) : null}
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
            {highlightedServiceOrderId &&
            context?.activeServiceOrder?.id === highlightedServiceOrderId ? (
              <p className="mt-1 text-[10px] text-[var(--accent-primary)]">
                Sugestão: Atualizar cliente sobre serviço.
              </p>
            ) : null}
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
            {highlightedChargeId &&
            context?.openCharge?.id === highlightedChargeId ? (
              <p className="mt-1 text-[10px] text-[var(--accent-primary)]">
                Sugestão: Enviar cobrança.
              </p>
            ) : null}
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

          <OperationalInnerCard className="border-[var(--app-border)]/30 bg-app-card/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Próxima melhor ação
            </p>
            <div className="mt-2.5 rounded-lg border border-[var(--app-border)]/35 bg-app-surface/55 p-2.5">
              <p className="text-[11px] font-semibold">Enviar cobrança</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Cliente possui cobrança pendente ou conversa sem resolução.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2 h-8 w-full min-w-0 justify-start truncate bg-[var(--accent-primary)] px-2.5 text-[11px] font-semibold text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
                onClick={onSendCharge}
              >
                Enviar cobrança
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 justify-start truncate border-[color-mix(in_srgb,var(--app-border)_78%,transparent)] bg-[color-mix(in_srgb,var(--app-card)_86%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                onClick={() =>
                  onNavigate(
                    context?.openCharge?.id
                      ? `/finances?chargeId=${context.openCharge.id}&action=register-payment`
                      : "/finances"
                  )
                }
              >
                Registrar pagamento
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 justify-start truncate border-[color-mix(in_srgb,var(--app-border)_78%,transparent)] bg-[color-mix(in_srgb,var(--app-card)_86%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                onClick={onSendReminder}
              >
                Confirmar agenda / enviar lembrete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 justify-start truncate border-[color-mix(in_srgb,var(--app-border)_78%,transparent)] bg-[color-mix(in_srgb,var(--app-card)_86%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                onClick={onSendReminder}
              >
                Atualizar O.S.
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 justify-start truncate border-[color-mix(in_srgb,var(--app-border)_78%,transparent)] bg-[color-mix(in_srgb,var(--app-card)_86%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:opacity-45"
                disabled={!canResolveConversation}
                onClick={onResolveConversation}
              >
                Resolver conversa
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 justify-start truncate border-[color-mix(in_srgb,var(--app-border)_78%,transparent)] bg-[color-mix(in_srgb,var(--app-card)_86%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                onClick={onMoreActions}
              >
                Mais ações
              </Button>
            </div>
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
  const didAutoSelectFromQueryRef = useRef(false);
  const hasManualSelectionRef = useRef(false);
  const shouldPromoteVirtualSelectionRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filtersInput = useMemo<Record<string, unknown>>(() => ({}), []);

  const healthQuery = trpc.nexo.whatsapp.health.useQuery(undefined, {
    retry: false,
  });
  const conversationsQuery = trpc.nexo.whatsapp.listConversations.useQuery(
    filtersInput,
    {
      retry: false,
    }
  );

  const conversations = useMemo<Conversation[]>(() => {
    const payload = conversationsQuery.data as any;
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    return items.map((item: unknown) => mapConversation(item));
  }, [conversationsQuery.data]);
  const customersQuery = trpc.nexo.customers.list.useQuery(
    { page: 1, limit: 300 },
    { retry: false, enabled: true }
  );
  const appointmentsQuery = trpc.nexo.appointments.list.useQuery(undefined, {
    retry: false,
  });
  const serviceOrdersQuery = trpc.nexo.serviceOrders.list.useQuery(
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

  const conversationCustomerIds = useMemo(
    () =>
      new Set(
        conversations
          .map(item => item.customerId ?? item.customer?.id ?? null)
          .filter((id): id is string => Boolean(id))
      ),
    [conversations]
  );
  const customersWithoutConversation = useMemo(
    () =>
      customers
        .filter(
          (customer: any) =>
            customer?.id && !conversationCustomerIds.has(String(customer.id))
        )
        .map(
          (customer: any): Conversation => ({
            id: `customer:${String(customer.id)}`,
            conversationId: null,
            customerId: String(customer.id),
            name: String(customer?.name ?? "Sem nome"),
            phone: customer?.phone ? String(customer.phone) : null,
            title: "Sem conversa ativa",
            lastMessage: "Sem conversa ativa",
            lastMessageAt: null,
            status: "OPEN",
            contextType: "GENERAL",
            priority: "LOW",
            unreadCount: 0,
            contextId: String(customer.id),
            operationalStatus: "Sem conversa ativa",
            contextHint: "Sem conversa ativa",
            hasPendingCharge: charges.some(
              (charge: any) =>
                String(charge?.customerId ?? "") === String(customer.id) &&
                ["PENDING", "OVERDUE"].includes(String(charge?.status ?? ""))
            ),
            hasUpcomingAppointment: appointments.some(
              (appointment: any) =>
                String(appointment?.customerId ?? "") === String(customer.id) &&
                String(appointment?.status ?? "").toUpperCase() !== "CANCELED"
            ),
            hasActiveServiceOrder: serviceOrders.some(
              (serviceOrder: any) =>
                String(serviceOrder?.customerId ?? "") ===
                  String(customer.id) &&
                !["DONE", "CANCELED"].includes(
                  String(serviceOrder?.status ?? "").toUpperCase()
                )
            ),
            hasFailedDelivery: false,
            isVirtual: true,
            customer: {
              id: String(customer.id),
              name: String(customer?.name ?? "Sem nome"),
              phone: customer?.phone ? String(customer.phone) : null,
            },
          })
        ),
    [appointments, charges, conversationCustomerIds, customers, serviceOrders]
  );
  const buildVirtualRowFromCustomer = useCallback(
    (customer: any): Conversation => ({
      id: `customer:${String(customer.id)}`,
      conversationId: null,
      customerId: String(customer.id),
      name: String(customer?.name ?? "Sem nome"),
      phone: customer?.phone ? String(customer.phone) : null,
      title: "Sem conversa ativa",
      lastMessage: "Sem conversa ativa",
      lastMessageAt: null,
      status: "OPEN",
      contextType: "GENERAL",
      priority: "LOW",
      unreadCount: 0,
      contextId: String(customer.id),
      operationalStatus: "Sem conversa ativa",
      contextHint: "Sem conversa ativa",
      hasPendingCharge: charges.some(
        (charge: any) =>
          String(charge?.customerId ?? "") === String(customer.id) &&
          ["PENDING", "OVERDUE"].includes(String(charge?.status ?? ""))
      ),
      hasUpcomingAppointment: appointments.some(
        (appointment: any) =>
          String(appointment?.customerId ?? "") === String(customer.id) &&
          String(appointment?.status ?? "").toUpperCase() !== "CANCELED"
      ),
      hasActiveServiceOrder: serviceOrders.some(
        (serviceOrder: any) =>
          String(serviceOrder?.customerId ?? "") === String(customer.id) &&
          !["DONE", "CANCELED"].includes(
            String(serviceOrder?.status ?? "").toUpperCase()
          )
      ),
      hasFailedDelivery: false,
      isVirtual: true,
      customer: {
        id: String(customer.id),
        name: String(customer?.name ?? "Sem nome"),
        phone: customer?.phone ? String(customer.phone) : null,
      },
    }),
    [appointments, charges, serviceOrders]
  );
  const allInboxRows = useMemo(
    () => [...conversations, ...customersWithoutConversation],
    [conversations, customersWithoutConversation]
  );
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
    return allInboxRows
      .filter(item => {
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
      })
      .sort((a, b) => {
        const scoreDiff = priorityScore(a) - priorityScore(b);
        if (scoreDiff !== 0) return scoreDiff;
        const aDate = new Date(a.lastMessageAt ?? 0).getTime();
        const bDate = new Date(b.lastMessageAt ?? 0).getTime();
        return bDate - aDate;
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
      customersWithoutConversationLength: customersWithoutConversation.length,
      allInboxRowsLength: allInboxRows.length,
      filteredRowsLength: filteredRows.length,
    });
  }, [
    allInboxRows.length,
    conversations.length,
    customers,
    customersQuery.data,
    customersWithoutConversation.length,
    filteredRows.length,
    queryAppointmentId,
    queryChargeId,
    queryConversationId,
    queryCustomerId,
    queryServiceOrderId,
  ]);
  const emptyStateMessage = useMemo(() => {
    if (customersQuery.error) return "Erro ao carregar clientes";
    if (
      !customersQuery.isLoading &&
      !customersQuery.isFetching &&
      customers.length === 0
    ) {
      return "Nenhum cliente carregado";
    }
    if (allInboxRows.length > 0 && filteredRows.length === 0)
      return "Nenhum resultado para esta busca";
    if (debouncedSearch.trim()) return "Nenhum resultado para esta busca";
    return "Nenhum cliente encontrado.";
  }, [
    activeFilter,
    allInboxRows.length,
    customers.length,
    customersQuery.error,
    customersQuery.isFetching,
    customersQuery.isLoading,
    debouncedSearch,
    filteredRows.length,
  ]);

  const selectedConversation = useMemo(
    () =>
      filteredRows.find(item => item.id === selectedConversationId) ??
      allInboxRows.find(item => item.id === selectedConversationId),
    [allInboxRows, filteredRows, selectedConversationId]
  );
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

    if (!selectedConversationId && filteredRows.length > 0) {
      setSelectedConversationId(filteredRows[0]?.id ?? null);
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

  const conversationDetailsQuery = trpc.nexo.whatsapp.getConversation.useQuery(
    { id: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );

  const messagesQuery = trpc.nexo.whatsapp.getMessages.useQuery(
    { conversationId: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );
  const contextQuery = trpc.nexo.whatsapp.getContext.useQuery(
    { conversationId: selectedConversationRecordId ?? "" },
    { enabled: Boolean(selectedConversationRecordId), retry: false }
  );
  const pendingApprovalsQuery =
    trpc.nexo.whatsapp.listPendingApprovals.useQuery(
      { limit: 25 },
      { enabled: Boolean(selectedConversationRecordId), retry: false }
    );
  const executionHistoryQuery =
    trpc.nexo.whatsapp.listExecutionHistory.useQuery(
      { conversationId: selectedConversationRecordId ?? undefined, limit: 25 },
      { enabled: Boolean(selectedConversationRecordId), retry: false }
    );

  const sendMessageMutation = trpc.nexo.whatsapp.sendMessage.useMutation();
  const sendTemplateMutation = trpc.nexo.whatsapp.sendTemplate.useMutation();
  const retryMessageMutation = trpc.nexo.whatsapp.retryMessage.useMutation();
  const requestExecutionMutation =
    trpc.nexo.whatsapp.requestExecution.useMutation();
  const approveExecutionMutation =
    trpc.nexo.whatsapp.approveExecution.useMutation();
  const executeExecutionMutation =
    trpc.nexo.whatsapp.executeExecution.useMutation();
  const cancelExecutionMutation =
    trpc.nexo.whatsapp.cancelExecution.useMutation();

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
      selectedConversationRecordId && Array.isArray(messagesQuery.data)
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
  const context = useMemo(() => {
    if (selectedConversationRecordId)
      return (contextQuery.data ?? null) as WhatsAppContext | null;
    if (selectedCustomer) {
      return {
        customer: {
          id: String(selectedCustomer.id),
          name: String(
            selectedCustomer.name ?? selectedConversation?.name ?? "Sem nome"
          ),
          phone: selectedCustomer.phone
            ? String(selectedCustomer.phone)
            : undefined,
        },
        nextAppointment: selectedCustomerAppointment
          ? {
              id: String(selectedCustomerAppointment.id),
              scheduledAt:
                selectedCustomerAppointment.startsAt ??
                selectedCustomerAppointment.scheduledAt,
              status: selectedCustomerAppointment.status,
              serviceName: selectedCustomerAppointment.serviceName ?? null,
            }
          : null,
        activeServiceOrder: selectedCustomerServiceOrder
          ? {
              id: String(selectedCustomerServiceOrder.id),
              number: selectedCustomerServiceOrder.number
                ? String(selectedCustomerServiceOrder.number)
                : null,
              status: selectedCustomerServiceOrder.status,
              technician: selectedCustomerServiceOrder.technicianName ?? null,
            }
          : null,
        openCharge: selectedCustomerCharge
          ? {
              id: String(selectedCustomerCharge.id),
              amount: Number(
                selectedCustomerCharge.amountCents ??
                  selectedCustomerCharge.amount ??
                  0
              ),
              dueDate: selectedCustomerCharge.dueDate,
              status: selectedCustomerCharge.status,
              paymentLink: selectedCustomerCharge.paymentLink ?? null,
            }
          : null,
      } as WhatsAppContext;
    }
    return null;
  }, [
    contextQuery.data,
    selectedConversation?.name,
    selectedConversationRecordId,
    selectedCustomer,
    selectedCustomerAppointment,
    selectedCustomerCharge,
    selectedCustomerServiceOrder,
  ]);

  const suggestedAction = useMemo(
    () => buildSuggestedAction(selectedConversation, context),
    [context, selectedConversation]
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
    async (execution: WhatsAppActionExecution) => {
      if (
        execution.status === "PENDING_APPROVAL" ||
        execution.approvalRequired
      ) {
        toast.message(
          "Aprove o workflow antes de executar. A execução automática de ações sensíveis está bloqueada."
        );
        return;
      }
      const confirmed = window.confirm(
        "Confirmar execução deste workflow WhatsApp agora?"
      );
      if (!confirmed) return;
      try {
        await executeExecutionMutation.mutateAsync({
          id: execution.id,
          reason: "Executado no cockpit WhatsApp",
        });
        await refreshExecutionState();
        toast.success("Workflow executado.");
      } catch (error: any) {
        toast.error(error?.message ?? "Falha ao executar workflow.");
      }
    },
    [executeExecutionMutation, refreshExecutionState]
  );

  const handleCancelExecution = useCallback(
    async (execution: WhatsAppActionExecution) => {
      const reason = window.prompt(
        "Informe o motivo do cancelamento do workflow WhatsApp:",
        "Cancelado no cockpit WhatsApp"
      );
      const normalizedReason = reason?.trim();
      if (!normalizedReason) {
        toast.message("Informe um motivo para cancelar o workflow.");
        return;
      }
      const confirmed = window.confirm(
        "Confirmar cancelamento deste workflow WhatsApp?"
      );
      if (!confirmed) return;
      try {
        await cancelExecutionMutation.mutateAsync({
          id: execution.id,
          reason: normalizedReason,
        });
        await refreshExecutionState();
        toast.success("Workflow cancelado.");
      } catch (error: any) {
        toast.error(error?.message ?? "Falha ao cancelar workflow.");
      }
    },
    [cancelExecutionMutation, refreshExecutionState]
  );

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
        actionPayload: buildActionPayload(
          suggestedAction.executableAction,
          context
        ),
        idempotencyKey: `whatsapp-ui:${selectedConversationRecordId}:${suggestedAction.executableAction}:${context?.openCharge?.id ?? context?.nextAppointment?.id ?? context?.activeServiceOrder?.id ?? context?.customer?.id ?? "general"}`,
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
    if (!selectedConversationRecordId) {
      toast.message("Selecione uma conversa ativa para resolver.");
      return;
    }
    try {
      const execution = (await requestExecutionMutation.mutateAsync({
        conversationId: selectedConversationRecordId,
        suggestedAction: "MARK_RESOLVED",
        executionReason: "Marcar conversa como resolvida",
        actionPayload: buildActionPayload("MARK_RESOLVED", context),
        idempotencyKey: `whatsapp-ui:${selectedConversationRecordId}:MARK_RESOLVED:${context?.customer?.id ?? "conversation"}`,
      })) as WhatsAppActionExecution;
      await refreshExecutionState();
      if (execution.status === "PENDING_APPROVAL") {
        toast.success("Workflow de resolução criado e aguardando aprovação.");
        return;
      }
      toast.success("Conversa marcada para resolução com segurança.");
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

  const governanceAlert = useMemo(() => {
    if (!selectedConversation) return null;
    if (
      !selectedConversation.governanceSignal?.communicationFailure &&
      !selectedConversation.hasFailedDelivery
    )
      return null;
    const parts = ["Sinal de governança: falha de comunicação"];
    if ((selectedConversation.failedMessageCount ?? 0) > 1)
      parts.push(
        `${selectedConversation.failedMessageCount} falhas acumuladas`
      );
    const failedAgo = timeAgoLabel(selectedConversation.lastFailedAt);
    if (failedAgo) parts.push(`última falha ${failedAgo}`);
    return parts.join(" • ");
  }, [selectedConversation]);

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
        resolveMessageTypeFromTemplate(String(queryTemplate), context)
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

  const handleSendTemplate = async (
    templateKey: string,
    messageType = resolveMessageTypeFromTemplate(templateKey, context)
  ) => {
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
      const entity = resolveEntityFromContext(context);
      await sendTemplateMutation.mutateAsync({
        templateKey,
        conversationId: selectedConversationRecordId ?? undefined,
        customerId,
        toPhone: destinationPhone,
        entityType: entity.entityType,
        entityId: entity.entityId ?? customerId ?? undefined,
        messageType,
        context: {
          customerName: context?.customer?.name,
          appointmentDate: context?.nextAppointment?.scheduledAt,
          appointmentTime: context?.nextAppointment?.scheduledAt,
          chargeAmount: context?.openCharge?.amount,
          chargeDueDate: context?.openCharge?.dueDate,
          paymentLink: context?.openCharge?.paymentLink,
          serviceOrderNumber: context?.activeServiceOrder?.number,
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
    await handleSendTemplate(
      context.openCharge.paymentLink ? "payment_link" : "payment_reminder",
      context.openCharge.paymentLink ? "PAYMENT_LINK" : "PAYMENT_REMINDER"
    );
  };

  const handleSendReminder = async () => {
    if (
      context?.openCharge?.id &&
      (context?.openCharge?.daysOverdue ?? 0) > 0
    ) {
      await handleSendTemplate("payment_reminder", "PAYMENT_REMINDER");
      return;
    }
    if (context?.nextAppointment?.id) {
      await handleSendTemplate("appointment_reminder", "APPOINTMENT_REMINDER");
      return;
    }
    if (context?.activeServiceOrder?.id) {
      await handleSendTemplate("service_update", "SERVICE_UPDATE");
      return;
    }
    await handleSendTemplate("manual_followup", getDefaultMessageType());
  };

  if (
    conversationsQuery.isLoading &&
    customersQuery.isLoading &&
    allInboxRows.length === 0
  ) {
    return (
      <AppPageShell>
        <AppPageLoadingState
          title="Carregando inbox operacional"
          description="Preparando prioridades, contexto e fila de execução."
        />
      </AppPageShell>
    );
  }

  return (
    <AppPageShell className="h-[calc(100vh-4.25rem)] min-h-0 bg-transparent px-4 pb-2 pt-2 text-app-primary xl:pb-3 xl:pt-2 2xl:pb-4 2xl:pt-2">
      {healthQuery.error ? (
        <div
          role="status"
          className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--app-surface))] px-3 py-2 text-xs text-app-primary"
        >
          <span>
            Canal parcialmente indisponível. O histórico pode ser consultado,
            mas novos envios podem falhar.
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
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 rounded-none border-0 bg-transparent xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_minmax(300px,340px)]">
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          <InboxQueueColumn
            rows={filteredRows}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            filter={activeFilter}
            onFilter={setActiveFilter}
            search={searchTerm}
            onSearch={setSearchTerm}
            isLoading={
              (conversationsQuery.isLoading ||
                conversationsQuery.isFetching ||
                customersQuery.isLoading ||
                customersQuery.isFetching) &&
              filteredRows.length === 0
            }
            hasError={
              Boolean(conversationsQuery.error) || Boolean(customersQuery.error)
            }
            errorMessage={
              customersQuery.error
                ? "Erro ao carregar clientes"
                : "Não foi possível carregar conversas"
            }
            emptyStateMessage={emptyStateMessage}
            priorityFilter={priorityFilter}
            onPriorityFilter={setPriorityFilter}
            responsibleFilter={responsibleFilter}
            onResponsibleFilter={setResponsibleFilter}
            responsibles={responsibles}
            onRetry={() =>
              void Promise.all([
                conversationsQuery.refetch(),
                customersQuery.refetch(),
              ])
            }
          />
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <ExecutionChatColumn
            conversation={selectedConversation}
            canCompose={canComposeForSelected}
            composePlaceholder={composePlaceholder}
            messages={messages}
            isLoading={messagesQuery.isLoading || messagesQuery.isFetching}
            sendMessage={handleManualSend}
            content={content}
            setContent={value => setContent(value)}
            onToggleFavorite={() => {
              if (!selectedConversationId) return;
              setLocalFavorites(prev => ({
                ...prev,
                [selectedConversationId]: !prev[selectedConversationId],
              }));
              // TODO: conectar favorite quando Conversation tiver campo isFavorite
            }}
            isFavorite={Boolean(localFavorites[selectedConversationId ?? ""])}
            onInfo={() => {
              setIsContextVisible(true);
              document
                .getElementById("whatsapp-context-panel")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
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
              void handleSendTemplate("payment_reminder", "PAYMENT_REMINDER")
            }
            onRequestSuggestedExecution={() =>
              void handleRequestSuggestedExecution()
            }
            onResolveConversation={() =>
              void handleResolveConversationExecution()
            }
            onReviewAssistedExecution={handleReviewAssistedExecution}
            hasOpenCharge={Boolean(context?.openCharge?.id)}
            hasPendingCharge={Boolean(
              context?.openCharge?.id || selectedConversation?.hasPendingCharge
            )}
            canSendPaymentLink={Boolean(context?.openCharge?.paymentLink)}
            chargeStatus={context?.openCharge?.status ?? null}
            chargeDaysOverdue={context?.openCharge?.daysOverdue ?? null}
            hasUpcomingAppointment={Boolean(context?.nextAppointment?.id)}
            appointmentStatus={context?.nextAppointment?.status ?? null}
            hasActiveServiceOrder={Boolean(context?.activeServiceOrder?.id)}
            serviceOrderStatus={context?.activeServiceOrder?.status ?? null}
            canResolveConversation={
              Boolean(selectedConversationRecordId) &&
              selectedConversation?.status !== "RESOLVED"
            }
            hasPendingAssistedExecution={pendingApprovals.length > 0}
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
            "h-full min-h-0 min-w-0 overflow-hidden",
            isContextVisible ? "xl:block" : "hidden"
          )}
        >
          <OperationalContextColumn
            conversation={selectedConversation}
            context={context}
            selectedCustomer={selectedCustomer}
            isLoading={contextQuery.isLoading || contextQuery.isFetching}
            onNavigate={setLocation}
            onSendCharge={handleSendCharge}
            onSendReminder={handleSendReminder}
            onResolveConversation={() =>
              void handleResolveConversationExecution()
            }
            canResolveConversation={
              Boolean(selectedConversationRecordId) &&
              selectedConversation?.status !== "RESOLVED"
            }
            onMoreActions={handleMoreActions}
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
            highlightedChargeId={queryChargeId}
            highlightedAppointmentId={queryAppointmentId}
            highlightedServiceOrderId={queryServiceOrderId}
          />
        </div>
      </div>
      {/* TODO: Conectar registro direto quando finance.markAsPaid estiver exposto no BFF. */}
      {/* TODO: Abrir detalhe de clientes/financeiro pelo query id caso a rota ainda não suporte foco automático. */}
    </AppPageShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  Download,
  FileClock,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import {
  AppFiltersBar,
  AppOperationalHeader,
  AppPagination,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPriorityBadge,
  AppSectionBlock,
  AppStatusBadge,
  AppSkeleton,
} from "@/components/internal-page-system";
import {
  AppDataTable,
  AppPageShell,
  AppSectionCard,
  AppSelect,
  AppStatCard,
  AppTimeline,
  AppTimelineItem,
} from "@/components/app-system";
import { OperationalKpiCard, OperationalPanel } from "@/components/operational";
import { Button } from "@/components/ui/button";
import {
  EntityTimelineCard,
  NextBestActionCard,
  OperationalFlowCard,
  OperationalRiskCard,
  OperationalStateCard,
  type OperationalFlowStageState,
  type OperationalStateLevel,
} from "@/components/app/OperationalCommandLayer";
import { usePageDiagnostics } from "@/hooks/usePageDiagnostics";
import { useRenderWatchdog } from "@/hooks/useRenderWatchdog";
import { setBootPhase } from "@/lib/bootPhase";

export type TimelineEvent = Record<string, unknown>;
type ModuleFilter =
  | "all"
  | "finance"
  | "service_order"
  | "appointment"
  | "whatsapp"
  | "governance"
  | "customer";
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

const PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 8;

const LEGACY_TIMELINE_EVENT_ALIASES: Record<string, string> = {
  APPOINTMENT_CANCELED: "APPOINTMENT_CANCELLED",
  EXECUTION_STARTED: "SERVICE_ORDER_STARTED",
  EXECUTION_DONE: "SERVICE_ORDER_COMPLETED",
  EXECUTION_COMPLETED: "SERVICE_ORDER_COMPLETED",
  SERVICE_ORDER_DONE: "SERVICE_ORDER_COMPLETED",
  SERVICE_ORDER_CHARGE_CREATED: "CHARGE_CREATED",
  WHATSAPP_MESSAGE_SENT: "MESSAGE_SENT",
  WHATSAPP_MESSAGE_FAILED: "MESSAGE_FAILED",
  CUSTOMER_OPERATIONAL_RISK_UPDATED: "RISK_UPDATED",
  RISK_SNAPSHOT_CREATED: "RISK_UPDATED",
  OPERATIONAL_STATE_ENFORCED: "OPERATIONAL_STATE_CHANGED",
  OPERATIONAL_WARNING_RAISED: "OPERATIONAL_STATE_CHANGED",
};

function normalizeTimelineEventType(eventType: string) {
  const normalized = String(eventType ?? "")
    .trim()
    .toUpperCase();
  return LEGACY_TIMELINE_EVENT_ALIASES[normalized] ?? normalized;
}

const MODULE_OPTIONS: Array<{ value: ModuleFilter; label: string }> = [
  { value: "all", label: "Todos os módulos" },
  { value: "finance", label: "Financeiro" },
  { value: "service_order", label: "O.S." },
  { value: "appointment", label: "Agendamentos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "governance", label: "Governança" },
  { value: "customer", label: "Clientes" },
];

export function text(value: unknown, fallback = "—") {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function metadataRecord(event: TimelineEvent): Record<string, unknown> {
  const metadata = event?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return {};
  return metadata as Record<string, unknown>;
}

function normalizedMetadataValue(event: TimelineEvent, keys: string[]) {
  const metadata = metadataRecord(event);
  return (
    keys
      .map(key => text(metadata[key], ""))
      .find(value => value.length > 0)
      ?.toUpperCase() ?? ""
  );
}

function hasCriticalOperationalMetadata(event: TimelineEvent) {
  const value = normalizedMetadataValue(event, [
    "operationalState",
    "nextState",
    "result",
    "severity",
    "riskLevel",
  ]);
  return value.includes("SUSPENDED") || value.includes("RESTRICTED");
}

function hasWarningOperationalMetadata(event: TimelineEvent) {
  const value = normalizedMetadataValue(event, [
    "operationalState",
    "previousState",
    "nextState",
    "result",
    "severity",
    "riskLevel",
  ]);
  return value.includes("WARNING");
}

function metadataSearchBucket(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return [
    metadata.module,
    metadata.entityType,
    metadata.operationalState,
    metadata.previousState,
    metadata.nextState,
    metadata.riskLevel,
    metadata.result,
    metadata.severity,
    metadata.reason,
    metadata.messageStatus,
  ]
    .map(value => text(value, "").toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function eventAction(event: TimelineEvent) {
  return normalizeTimelineEventType(
    text(event?.action ?? event?.type, "EVENTO")
  );
}

function whatsappExecutionEventLabel(action: string) {
  const labels: Record<string, string> = {
    WHATSAPP_ACTION_APPROVED: "WhatsApp: ação aprovada",
    WHATSAPP_ACTION_EXECUTED: "WhatsApp: ação executada",
    WHATSAPP_ACTION_FAILED: "WhatsApp: ação falhou",
    WHATSAPP_ACTION_CANCELLED: "WhatsApp: ação cancelada",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}

export function humanizeTimelineAction(action: string) {
  const normalized = normalizeTimelineEventType(action);
  const labels: Record<string, string> = {
    PAYMENT_RECEIVED: "Pagamento recebido",
    CHARGE_CREATED: "Cobrança criada",
    EXECUTION_BLOCKED: "Bloqueio operacional registrado",
    SERVICE_ORDER_COMPLETED: "Ordem de serviço concluída",
    APPOINTMENT_CONFIRMED: "Agendamento confirmado",
    MESSAGE_SENT: "Mensagem enviada",
    GOVERNANCE_RUN_COMPLETED: "Verificação de governança concluída",
    RISK_UPDATED: "Sinal de risco atualizado",
    MESSAGE_FAILED: "Mensagem com falha",
  };
  const slugLabels: Record<string, string> = {
    "action-send-overdue-charge-reminder": "Lembrete de cobrança bloqueado",
    "action-create-charge-followup": "Acompanhamento de cobrança bloqueado",
  };
  const raw = String(action ?? "").trim();
  if (slugLabels[raw]) return slugLabels[raw];
  if (labels[normalized]) return labels[normalized];
  if (/^[A-Z0-9_]+$/.test(raw) || raw.startsWith("action-")) {
    return "Evento operacional registrado";
  }
  return raw || "Evento operacional registrado";
}

function eventAutomationSlug(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return [
    event?.automationSlug,
    event?.workflowSlug,
    event?.executionSlug,
    event?.actionSlug,
    event?.actionKey,
    event?.automationAction,
    metadata.automationSlug,
    metadata.workflowSlug,
    metadata.executionSlug,
    metadata.actionSlug,
    metadata.actionKey,
    metadata.automationAction,
    metadata.action,
    metadata.reason,
    metadata.command,
  ]
    .map(value => text(value, ""))
    .find(value => value.startsWith("action-"));
}

function eventHumanTitle(event: TimelineEvent) {
  const action = eventAction(event);
  const slug = eventAutomationSlug(event);
  if (action === "EXECUTION_BLOCKED" && slug) {
    return humanizeTimelineAction(slug);
  }
  return humanizeTimelineAction(text(event?.action ?? event?.type, action));
}

function isTechnicalEventText(value: string) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    ) ||
    /^[A-Z0-9_]+$/.test(value) ||
    value.startsWith("action-")
  );
}

function eventHumanFallback(event: TimelineEvent) {
  const entity = eventPrimarySubject(event);
  const when = formatDateTime(event?.createdAt);

  return `${eventHumanTitle(event)} registrado para ${entity} em ${when}`;
}

export function isSafeHumanText(value: unknown) {
  const candidate = text(value, "");
  if (!candidate || candidate.length > 240) return false;
  if (/[{}\[\]]/.test(candidate)) return false;
  if (
    /\b(?:payload|requestId|entityId|customerId|serviceOrderId|appointmentId|chargeId|actorUserId|orgId)\b\s*[:=]/i.test(
      candidate
    )
  )
    return false;
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
      candidate
    )
  )
    return false;
  return (
    /^-?\d+(?:[.,]\d+)?$/.test(candidate) || !isTechnicalEventText(candidate)
  );
}

function eventDisplayTitle(event: TimelineEvent) {
  const actionLabel = eventHumanTitle(event);
  if (actionLabel !== "Evento operacional registrado") return actionLabel;
  const explicit = text(
    event?.summary ?? event?.title ?? event?.description,
    ""
  );
  if (isSafeHumanText(explicit)) return explicit;
  const whatsappLabel = whatsappExecutionEventLabel(eventAction(event));
  return whatsappLabel === eventAction(event).replace(/_/g, " ")
    ? eventHumanFallback(event)
    : whatsappLabel;
}

function isWhatsAppExecutionEvent(action: string) {
  return [
    "WHATSAPP_ACTION_APPROVED",
    "WHATSAPP_ACTION_EXECUTED",
    "WHATSAPP_ACTION_FAILED",
    "WHATSAPP_ACTION_CANCELLED",
  ].includes(action);
}

export function eventEntityLabel(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  const explicitType = text(event?.entityType ?? metadata.entityType, "");
  if (explicitType) {
    const normalized = explicitType.toLowerCase().replace(/[\s-]/g, "_");
    if (["customer", "client", "cliente"].includes(normalized))
      return "Cliente";
    if (
      ["service_order", "serviceorder", "ordem_de_serviço"].includes(normalized)
    )
      return "Ordem de serviço";
    if (["appointment", "agendamento"].includes(normalized))
      return "Agendamento";
    if (["charge", "payment", "cobrança", "pagamento"].includes(normalized))
      return "Cobrança";
    return "Entidade vinculada";
  }
  if (event?.customerId) return "Cliente";
  if (event?.serviceOrderId) return "Ordem de serviço";
  if (event?.appointmentId) return "Agendamento";
  if (event?.chargeId) return "Cobrança";
  return "Entidade não informada";
}

export function eventEntityId(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return (
    text(event?.entityId, "") ||
    text(metadata.entityId, "") ||
    text(event?.customerId, "") ||
    text(event?.serviceOrderId, "") ||
    text(event?.appointmentId, "") ||
    text(event?.chargeId, "") ||
    "—"
  );
}

export function eventCustomerId(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return text(event?.customerId ?? metadata.customerId, "");
}

function eventCustomerName(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return text(
    event?.customerName ??
      event?.personName ??
      metadata.customerName ??
      metadata.clientName ??
      metadata.personName,
    ""
  );
}

function eventPrimarySubject(event: TimelineEvent) {
  const customerName = eventCustomerName(event);
  if (customerName) return customerName;

  const metadata = metadataRecord(event);
  const chargeReference = text(
    event?.chargeNumber ?? event?.chargeCode ?? metadata.chargeNumber,
    ""
  );
  if (event?.chargeId || chargeReference) {
    return chargeReference ? `Cobrança ${chargeReference}` : "Cobrança";
  }

  const serviceOrderReference = text(
    event?.serviceOrderNumber ??
      event?.serviceOrderCode ??
      metadata.serviceOrderNumber,
    ""
  );
  if (event?.serviceOrderId || serviceOrderReference) {
    return serviceOrderReference
      ? `O.S. ${serviceOrderReference}`
      : "Ordem de serviço";
  }

  const appointmentReference = text(
    event?.appointmentNumber ??
      event?.appointmentCode ??
      metadata.appointmentNumber,
    ""
  );
  if (event?.appointmentId || appointmentReference) {
    return appointmentReference
      ? `Agendamento ${appointmentReference}`
      : "Agendamento";
  }

  const entityType = eventEntityLabel(event);
  return entityType === "Entidade não informada"
    ? entityType
    : `${entityType} vinculada`;
}

export function eventModule(event: TimelineEvent): ModuleFilter {
  const action = eventAction(event);
  const bucket = [
    action.toLowerCase(),
    text(event?.description, "").toLowerCase(),
    text(event?.serviceOrderId, "").toLowerCase(),
    text(event?.appointmentId, "").toLowerCase(),
    text(event?.chargeId, "").toLowerCase(),
    metadataSearchBucket(event),
  ].join(" ");

  if (
    action === "RISK_UPDATED" ||
    action === "GOVERNANCE_RUN_STARTED" ||
    action === "GOVERNANCE_RUN_COMPLETED" ||
    action === "OPERATIONAL_STATE_CHANGED" ||
    bucket.includes("govern") ||
    bucket.includes("operational_state") ||
    bucket.includes("operationalstate") ||
    bucket.includes("risklevel")
  )
    return "governance";

  if (
    event?.chargeId ||
    bucket.includes("payment") ||
    bucket.includes("charge") ||
    bucket.includes("finance")
  )
    return "finance";
  if (
    event?.serviceOrderId ||
    bucket.includes("service_order") ||
    bucket.includes("service order") ||
    bucket.includes("o.s")
  )
    return "service_order";
  if (
    event?.appointmentId ||
    bucket.includes("appointment") ||
    bucket.includes("agenda")
  )
    return "appointment";
  if (
    bucket.includes("whatsapp") ||
    bucket.includes("message") ||
    bucket.includes("comunica")
  )
    return "whatsapp";
  if (
    event?.customerId ||
    bucket.includes("customer") ||
    bucket.includes("cliente")
  )
    return "customer";
  return "all";
}

export function eventSeverity(
  event: TimelineEvent
): Exclude<SeverityFilter, "all"> {
  const action = eventAction(event);
  const bucket = [
    action.toLowerCase(),
    text(event?.description, "").toLowerCase(),
    text(event?.status, "").toLowerCase(),
    metadataSearchBucket(event),
  ].join(" ");

  if (hasCriticalOperationalMetadata(event)) return "critical";
  if (action === "RISK_UPDATED" || action === "OPERATIONAL_STATE_CHANGED")
    return "high";
  if (action === "GOVERNANCE_RUN_COMPLETED") {
    if (
      bucket.includes("critical") ||
      bucket.includes("crítico") ||
      bucket.includes("restricted") ||
      bucket.includes("suspended") ||
      bucket.includes("failed") ||
      bucket.includes("error")
    )
      return "critical";
    if (bucket.includes("warning") || bucket.includes("risk")) return "high";
    return "medium";
  }
  if (action === "GOVERNANCE_RUN_STARTED") {
    if (hasWarningOperationalMetadata(event)) return "high";
    return "medium";
  }
  if (isWhatsAppExecutionEvent(action) && action.includes("EXECUTED"))
    return "medium";
  if (
    bucket.includes("failed") ||
    bucket.includes("error") ||
    bucket.includes("cancel") ||
    bucket.includes("atras")
  )
    return "critical";
  if (
    bucket.includes("risk") ||
    bucket.includes("overdue") ||
    bucket.includes("warning") ||
    bucket.includes("block")
  )
    return "high";
  if (
    bucket.includes("confirm") ||
    bucket.includes("updated") ||
    bucket.includes("state")
  )
    return "medium";
  return "low";
}

function eventReason(event: TimelineEvent) {
  const description = text(event?.description, "");
  if (isSafeHumanText(description)) return description;
  const action = eventAction(event);
  if (action === "EXECUTION_BLOCKED")
    return "Ação operacional bloqueada por segurança; revise o módulo de origem antes de qualquer nova tentativa.";
  if (action === "WHATSAPP_ACTION_APPROVED")
    return "Ação WhatsApp sensível aprovada por humano e liberada para execução segura.";
  if (action === "WHATSAPP_ACTION_EXECUTED")
    return "Ação WhatsApp executada pelo workflow com rastreabilidade operacional.";
  if (action === "WHATSAPP_ACTION_FAILED")
    return "Falha na execução do workflow WhatsApp; exige diagnóstico antes de nova tentativa.";
  if (action === "WHATSAPP_ACTION_CANCELLED")
    return "Workflow WhatsApp cancelado com decisão operacional registrada.";
  if (action.includes("CREATED"))
    return "Registro criado para iniciar fluxo operacional auditável.";
  if (action.includes("COMPLETED") || action.includes("DONE"))
    return "Execução concluída com rastreabilidade preservada.";
  if (action.includes("CANCELED") || action.includes("NO_SHOW"))
    return "Ruptura operacional registrada para análise imediata de risco.";
  if (action.includes("OPERATIONAL_STATE_CHANGED"))
    return "Mudança de estado operacional registrada em governança.";
  return eventHumanFallback(event);
}

function eventOperationalConsequence(event: TimelineEvent) {
  const title = eventDisplayTitle(event).toLowerCase();
  const module = eventModule(event);
  if (title.includes("lembrete de cobrança bloqueado"))
    return "Receita permanece sem contato enquanto o bloqueio não for revisado.";
  if (title.includes("acompanhamento de cobrança bloqueado"))
    return "Cobrança vencida fica sem acompanhamento operacional seguro.";
  if (module === "finance" && eventSeverity(event) !== "low")
    return "Pode afetar caixa, cobrança e governança de receita.";
  if (module === "service_order" && eventSeverity(event) !== "low")
    return "Pode gerar atraso de execução, retrabalho ou ruptura de SLA.";
  if (module === "appointment" && eventSeverity(event) !== "low")
    return "Pode comprometer agenda, capacidade operacional e continuidade.";
  if (module === "whatsapp" && eventSeverity(event) !== "low")
    return "Comunicação pode ficar sem resposta ou exigir diagnóstico.";
  if (module === "governance")
    return "Evidência orienta decisão, auditoria ou restrição operacional.";
  return "Histórico operacional preservado para auditoria e consulta.";
}

function eventRecommendedAction(event: TimelineEvent) {
  return eventRealCtas(event)[0]?.label ?? "Ver no feed";
}

function eventRoute(event: TimelineEvent) {
  const deepLink = eventDeepLinks(event)[0]?.route;
  if (deepLink) return deepLink;
  if (event?.customerId) return "/customers";
  if (event?.appointmentId) return "/appointments";
  if (event?.serviceOrderId) return "/service-orders";
  if (event?.chargeId) return "/finances";
  const module = eventModule(event);
  if (module === "whatsapp") return "/whatsapp";
  if (module === "governance") return "/governance";
  if (module === "finance") return "/finances";
  if (module === "service_order") return "/service-orders";
  if (module === "appointment") return "/appointments";
  if (module === "customer") return "/customers";
  return "/dashboard";
}

function eventActorLabel(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  return text(
    event?.personName ?? event?.actorName ?? metadata.actorName,
    "Ator não informado pela fonte"
  );
}

function normalizedEntityType(event: TimelineEvent) {
  const raw = eventEntityLabel(event).toLowerCase();
  if (raw.includes("cliente") || raw.includes("customer")) return "customer";
  if (
    raw.includes("ordem") ||
    raw.includes("serviceorder") ||
    raw.includes("service_order")
  )
    return "service_order";
  if (raw.includes("agendamento") || raw.includes("appointment"))
    return "appointment";
  if (
    raw.includes("cobrança") ||
    raw.includes("cobranca") ||
    raw.includes("charge") ||
    raw.includes("payment") ||
    raw.includes("pagamento")
  )
    return "finance";
  if (raw.includes("whatsapp") || raw.includes("message")) return "whatsapp";
  return null;
}

function eventAuditFallbacks(event: TimelineEvent) {
  const pairs = usefulMetadataPairs(event);
  return [
    eventActorLabel(event).startsWith("Ator não informado")
      ? "Ator não veio na fonte oficial"
      : null,
    eventEntityId(event) === "—" ? "Entidade sem ID rastreável" : null,
    eventEntityLabel(event) === "Entidade não informada"
      ? "Tipo de entidade não veio na fonte"
      : null,
    eventModule(event) === "all" ? "Módulo não identificável pela fonte" : null,
    pairs.length === 0 ? "Sem metadados operacionais resumíveis" : null,
  ].filter(Boolean) as string[];
}

export function eventDeepLinks(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  const customerId = text(event?.customerId ?? metadata.customerId, "");
  const serviceOrderId = text(
    event?.serviceOrderId ?? metadata.serviceOrderId,
    ""
  );
  const appointmentId = text(
    event?.appointmentId ?? metadata.appointmentId,
    ""
  );
  const chargeId = text(event?.chargeId ?? metadata.chargeId, "");
  const genericId = eventEntityId(event);
  const type = normalizedEntityType(event);
  const module = eventModule(event);
  const ctas: Array<{ label: string; route: string; reason: string }> = [];
  const customerTarget = customerId || (type === "customer" ? genericId : "");
  const serviceOrderTarget =
    serviceOrderId || (type === "service_order" ? genericId : "");
  const appointmentTarget =
    appointmentId || (type === "appointment" ? genericId : "");
  const chargeTarget = chargeId || (type === "finance" ? genericId : "");

  if (customerTarget && customerTarget !== "—") {
    ctas.push({
      label: "Abrir cliente",
      route: `/customers?customerId=${encodeURIComponent(customerTarget)}`,
      reason: "entityType/entityId ou customerId utilizável",
    });
  }
  if (serviceOrderTarget && serviceOrderTarget !== "—") {
    ctas.push({
      label: "Abrir O.S.",
      route: `/service-orders?serviceOrderId=${encodeURIComponent(serviceOrderTarget)}`,
      reason: "entityType/entityId ou serviceOrderId utilizável",
    });
  }
  if (appointmentTarget && appointmentTarget !== "—") {
    ctas.push({
      label: "Abrir agendamento",
      route: `/appointments?appointmentId=${encodeURIComponent(appointmentTarget)}`,
      reason: "entityType/entityId ou appointmentId utilizável",
    });
  }
  if (chargeTarget && chargeTarget !== "—") {
    ctas.push({
      label: "Abrir financeiro",
      route: `/finances?chargeId=${encodeURIComponent(chargeTarget)}`,
      reason: "entityType/entityId ou chargeId utilizável",
    });
  }
  if (genericId !== "—" && (type === "whatsapp" || module === "whatsapp")) {
    ctas.push({
      label: "Abrir WhatsApp",
      route: "/whatsapp",
      reason: "evento WhatsApp com entidade utilizável",
    });
  }

  return ctas;
}

const eventRealCtas = eventDeepLinks;

function eventTone(event: TimelineEvent) {
  const action = eventAction(event);
  const title = eventDisplayTitle(event).toLowerCase();
  if (
    action === "EXECUTION_BLOCKED" ||
    title.includes("falha") ||
    title.includes("bloque") ||
    title.includes("restri")
  )
    return "critical";
  if (
    action === "PAYMENT_RECEIVED" ||
    action === "SERVICE_ORDER_COMPLETED" ||
    action === "APPOINTMENT_CONFIRMED"
  )
    return "success";
  if (
    action === "CHARGE_CREATED" ||
    action === "MESSAGE_SENT" ||
    action === "RISK_UPDATED"
  )
    return "attention";
  if (eventModule(event) === "governance") return "info";
  return eventSeverity(event) === "critical" ? "critical" : "info";
}

function severityColorClass(severity: Exclude<SeverityFilter, "all">) {
  if (severity === "critical") return "text-[var(--danger)]";
  if (severity === "high") return "text-[var(--warning)]";
  if (severity === "medium") return "text-[var(--accent-primary)]";
  return "text-[var(--text-muted)]";
}

function toneColorClass(tone: ReturnType<typeof eventTone>) {
  if (tone === "critical") return "text-[var(--danger)]";
  if (tone === "success") return "text-[var(--success)]";
  if (tone === "attention") return "text-[var(--warning)]";
  return "text-[var(--accent-primary)]";
}

function timelineItemClass({
  isSelected,
  severity,
  module,
}: {
  isSelected: boolean;
  severity: Exclude<SeverityFilter, "all">;
  module: ModuleFilter;
}) {
  if (isSelected)
    return "cursor-pointer border border-l-4 border-[var(--accent-primary)] bg-[var(--accent-soft)]";

  const governanceEmphasis = module === "governance" ? " border-dashed" : "";
  if (severity === "critical")
    return `cursor-pointer border border-l-4 border-[var(--danger)] bg-[var(--surface-base)]${governanceEmphasis}`;
  if (severity === "high")
    return `cursor-pointer border border-l-4 border-[var(--warning)] bg-[var(--surface-base)]${governanceEmphasis}`;
  if (severity === "medium")
    return `cursor-pointer border border-l-4 border-[var(--accent-primary)] bg-[var(--surface-base)]/80${governanceEmphasis}`;
  return "cursor-pointer border border-l-4 border-[var(--border-subtle)] bg-[var(--surface-base)]/70";
}

function EventIcon({ event }: { event: TimelineEvent }) {
  const module = eventModule(event);
  const severity = eventSeverity(event);
  const tone = eventTone(event);
  const colorClass = toneColorClass(tone);
  if (tone === "critical") return <Siren className={`h-4 w-4 ${colorClass}`} />;
  if (module === "governance") {
    const Icon = severity === "high" ? ShieldAlert : ShieldCheck;
    return <Icon className={`h-4 w-4 ${colorClass}`} />;
  }
  if (module === "finance")
    return <BadgeDollarSign className={`h-4 w-4 ${colorClass}`} />;
  if (module === "appointment")
    return <CalendarClock className={`h-4 w-4 ${colorClass}`} />;
  if (module === "whatsapp")
    return <MessageSquare className={`h-4 w-4 ${colorClass}`} />;
  if (module === "service_order")
    return <FileClock className={`h-4 w-4 ${colorClass}`} />;
  return <CheckCircle2 className={`h-4 w-4 ${colorClass}`} />;
}

function eventModuleLabel(module: ModuleFilter) {
  return (
    MODULE_OPTIONS.find(option => option.value === module)?.label ?? "Operação"
  );
}

function eventSeverityLabel(severity: Exclude<SeverityFilter, "all">) {
  if (severity === "critical") return "Crítico";
  if (severity === "high") return "Alta";
  if (severity === "medium") return "Média";
  return "Baixa";
}

function eventEvidenceBucket(event: TimelineEvent) {
  return [
    eventAction(event),
    text(event?.description, ""),
    text(event?.summary, ""),
    text(event?.status, ""),
    metadataSearchBucket(event),
  ]
    .join(" ")
    .toLowerCase();
}

function eventGroupKey(event: TimelineEvent) {
  return `${eventModule(event)}:${eventDisplayTitle(event)}`;
}

function summarizeEvidenceGroups(events: TimelineEvent[]) {
  const groups = new Map<string, TimelineEvent[]>();
  events.forEach(event => {
    const key = eventGroupKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(event);
  });
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    module: eventModule(items[0]),
    title: eventDisplayTitle(items[0]),
    items,
  }));
}

function isFinancialRiskEvent(event: TimelineEvent) {
  const bucket = eventEvidenceBucket(event);
  return (
    eventModule(event) === "finance" &&
    (bucket.includes("overdue") ||
      bucket.includes("vencid") ||
      bucket.includes("atras") ||
      bucket.includes("pendente") ||
      bucket.includes("pending") ||
      bucket.includes("failed") ||
      bucket.includes("falh"))
  );
}

function isServiceOrderRiskEvent(event: TimelineEvent) {
  const bucket = eventEvidenceBucket(event);
  return (
    eventModule(event) === "service_order" &&
    (bucket.includes("atras") ||
      bucket.includes("overdue") ||
      bucket.includes("trav") ||
      bucket.includes("blocked") ||
      bucket.includes("sem cobrança") ||
      bucket.includes("without charge") ||
      bucket.includes("failed") ||
      bucket.includes("falh"))
  );
}

function isAppointmentRiskEvent(event: TimelineEvent) {
  const action = eventAction(event);
  const bucket = eventEvidenceBucket(event);
  return (
    eventModule(event) === "appointment" &&
    (action.includes("CANCEL") ||
      action.includes("NO_SHOW") ||
      bucket.includes("cancel") ||
      bucket.includes("no-show") ||
      bucket.includes("no show") ||
      bucket.includes("falt") ||
      bucket.includes("atras") ||
      bucket.includes("failed") ||
      bucket.includes("falh"))
  );
}

function isGovernanceRiskEvent(event: TimelineEvent) {
  const action = eventAction(event);
  return (
    eventModule(event) === "governance" ||
    action === "RISK_UPDATED" ||
    action === "OPERATIONAL_STATE_CHANGED" ||
    hasCriticalOperationalMetadata(event) ||
    hasWarningOperationalMetadata(event)
  );
}

function isCommunicationFailureEvent(event: TimelineEvent) {
  const bucket = eventEvidenceBucket(event);
  return (
    eventModule(event) === "whatsapp" &&
    (bucket.includes("failed") ||
      bucket.includes("error") ||
      bucket.includes("erro") ||
      bucket.includes("falh"))
  );
}

function isRiskEvidenceEvent(event: TimelineEvent) {
  return (
    eventSeverity(event) === "critical" ||
    eventSeverity(event) === "high" ||
    isFinancialRiskEvent(event) ||
    isServiceOrderRiskEvent(event) ||
    isAppointmentRiskEvent(event) ||
    isGovernanceRiskEvent(event) ||
    isCommunicationFailureEvent(event)
  );
}

const METADATA_PRIORITY_FIELDS = [
  "amount",
  "previousState",
  "nextState",
  "riskLevel",
  "operationalState",
  "result",
  "messageStatus",
];

const METADATA_LABELS: Record<string, string> = {
  amount: "Valor",
  previousState: "Estado anterior",
  nextState: "Novo estado",
  riskLevel: "Nível de risco",
  operationalState: "Estado operacional",
  result: "Resultado",
  messageStatus: "Status da mensagem",
};

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
  if (value instanceof Date) return formatDateTime(value);
  return "";
}

export function usefulMetadataPairs(event: TimelineEvent) {
  const metadata = metadataRecord(event);
  const pairs = METADATA_PRIORITY_FIELDS.map(key => ({
    key: METADATA_LABELS[key] ?? key,
    value: formatMetadataValue(metadata[key]),
  })).filter(pair => isSafeHumanText(pair.value));

  return pairs.slice(0, 6);
}

function formatEventTime(input: unknown) {
  if (!input) return "--:--";
  const parsed = new Date(String(input));
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(input: unknown) {
  if (!input) return "Sem data";
  const parsed = new Date(String(input));
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleString("pt-BR");
}

export default function TimelinePage() {
  setBootPhase("PAGE:Timeline");
  useRenderWatchdog("TimelinePage");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const urlParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const initialModule = (urlParams.get("module") ?? "all") as ModuleFilter;
  const initialCustomer = urlParams.get("customerId") ?? "all";

  const [searchValue, setSearchValue] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("7d");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>(
    MODULE_OPTIONS.some(option => option.value === initialModule)
      ? initialModule
      : "all"
  );
  const [entityFilter, setEntityFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState(initialCustomer);
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [expandedEvidenceGroups, setExpandedEvidenceGroups] = useState<
    Record<string, boolean>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const timelineQuery = trpc.nexo.timeline.listByOrg.useQuery(
    { limit: PAGE_SIZE, cursor },
    { enabled: isAuthenticated, retry: false }
  );

  useEffect(() => {
    if (!timelineQuery.data) return;
    const incoming = normalizeArrayPayload<TimelineEvent>(timelineQuery.data);
    setHasMore(incoming.length === PAGE_SIZE);
    setEvents(prev => {
      if (!cursor) return incoming;
      const seen = new Set(prev.map(item => String(item?.id ?? "")));
      const merged = [...prev];
      incoming.forEach(item => {
        const key = String(item?.id ?? "");
        if (key && !seen.has(key)) merged.push(item);
      });
      return merged;
    });
  }, [cursor, timelineQuery.data]);

  const isInitialLoading = timelineQuery.isLoading && events.length === 0;
  const hasInitialError = Boolean(timelineQuery.error) && events.length === 0;

  usePageDiagnostics({
    page: "timeline",
    isLoading: isInitialLoading,
    hasError: hasInitialError,
    isEmpty: !isInitialLoading && !hasInitialError && events.length === 0,
    dataCount: events.length,
  });

  const eventTypeOptions = useMemo(() => {
    const values = Array.from(new Set(events.map(event => eventAction(event))));
    return values
      .slice(0, 30)
      .map(value => ({ value, label: whatsappExecutionEventLabel(value) }));
  }, [events]);

  const entityOptions = useMemo(() => {
    const values = Array.from(
      new Set(events.map(event => eventEntityLabel(event)))
    );
    return values
      .slice(0, 20)
      .map(value => ({ value: value.toLowerCase(), label: value }));
  }, [events]);

  const clientOptions = useMemo(() => {
    const values = new Map<string, string>();
    events.forEach(event => {
      const id = eventCustomerId(event);
      const name = eventCustomerName(event);
      if (id && name) values.set(id, name);
    });
    return Array.from(values, ([value, label]) => ({ value, label })).slice(
      0,
      30
    );
  }, [events]);

  const responsibleOptions = useMemo(() => {
    const values = Array.from(
      new Set(events.map(event => eventActorLabel(event)))
    );
    return values
      .slice(0, 20)
      .map(value => ({ value: value.toLowerCase(), label: value }));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = searchValue.trim().toLowerCase();

    return events.filter(event => {
      const createdAt = new Date(String(event?.createdAt ?? ""));
      const hasDate = !Number.isNaN(createdAt.getTime());
      const action = eventAction(event);
      const entity = eventEntityLabel(event);
      const module = eventModule(event);
      const customerId = eventCustomerId(event);
      const responsible = eventActorLabel(event);
      const severity = eventSeverity(event);

      if (eventTypeFilter !== "all" && action !== eventTypeFilter) return false;
      if (moduleFilter !== "all" && module !== moduleFilter) return false;
      if (entityFilter !== "all" && entity.toLowerCase() !== entityFilter)
        return false;
      if (clientFilter !== "all" && customerId !== clientFilter) return false;
      if (
        responsibleFilter !== "all" &&
        responsible.toLowerCase() !== responsibleFilter
      )
        return false;
      if (severityFilter !== "all" && severity !== severityFilter) return false;

      if (
        periodFilter === "24h" &&
        (!hasDate || Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000)
      )
        return false;
      if (
        periodFilter === "7d" &&
        (!hasDate || Date.now() - createdAt.getTime() > 7 * 24 * 60 * 60 * 1000)
      )
        return false;
      if (
        periodFilter === "30d" &&
        (!hasDate ||
          Date.now() - createdAt.getTime() > 30 * 24 * 60 * 60 * 1000)
      )
        return false;

      if (!q) return true;
      const haystack = [
        action,
        text(event?.description, ""),
        entity,
        eventEntityId(event),
        customerId,
        responsible,
        module,
        metadataSearchBucket(event),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [
    clientFilter,
    entityFilter,
    eventTypeFilter,
    events,
    moduleFilter,
    periodFilter,
    responsibleFilter,
    searchValue,
    severityFilter,
  ]);
  const paginatedFilteredEvents = useMemo(() => {
    const start = (currentPage - 1) * LIST_PAGE_SIZE;
    return filteredEvents.slice(start, start + LIST_PAGE_SIZE);
  }, [currentPage, filteredEvents]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    clientFilter,
    entityFilter,
    eventTypeFilter,
    moduleFilter,
    periodFilter,
    responsibleFilter,
    searchValue,
    severityFilter,
  ]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredEvents.length / LIST_PAGE_SIZE)
    );
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, filteredEvents.length]);

  const selectedEvent = useMemo(
    () =>
      filteredEvents.find(event => String(event?.id) === selectedEventId) ??
      filteredEvents[0] ??
      null,
    [filteredEvents, selectedEventId]
  );

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    paginatedFilteredEvents.forEach(event => {
      const date = new Date(String(event?.createdAt ?? ""));
      let key = "Sem data";
      if (!Number.isNaN(date.getTime())) {
        const day = date.toDateString();
        key =
          day === today.toDateString()
            ? "Hoje"
            : day === yesterday.toDateString()
              ? "Ontem"
              : date.toLocaleDateString("pt-BR");
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(event);
    });

    return Array.from(groups.entries());
  }, [paginatedFilteredEvents]);

  const operationalEvidence = useMemo(() => {
    const criticalEvents = filteredEvents.filter(
      item => eventSeverity(item) === "critical"
    );
    const highEvents = filteredEvents.filter(
      item => eventSeverity(item) === "high"
    );
    const financeRiskEvents = filteredEvents.filter(isFinancialRiskEvent);
    const serviceOrderRiskEvents = filteredEvents.filter(
      isServiceOrderRiskEvent
    );
    const appointmentRiskEvents = filteredEvents.filter(isAppointmentRiskEvent);
    const governanceEvents = filteredEvents.filter(isGovernanceRiskEvent);
    const communicationFailures = filteredEvents.filter(
      isCommunicationFailureEvent
    );
    const riskEvents = filteredEvents.filter(isRiskEvidenceEvent);
    const suspendedEvents = filteredEvents.filter(item =>
      normalizedMetadataValue(item, [
        "operationalState",
        "previousState",
        "nextState",
        "result",
        "severity",
        "riskLevel",
      ]).includes("SUSPENDED")
    );
    const restrictedEvents = filteredEvents.filter(
      hasCriticalOperationalMetadata
    );
    const latestEvent = filteredEvents[0] ?? null;
    const latestTimestamp = latestEvent
      ? new Date(String(latestEvent?.createdAt ?? "")).getTime()
      : Number.NaN;
    const hasRecentEvent =
      Number.isFinite(latestTimestamp) &&
      Date.now() - latestTimestamp <= 7 * 24 * 60 * 60 * 1000;

    return {
      criticalEvents,
      highEvents,
      financeRiskEvents,
      serviceOrderRiskEvents,
      appointmentRiskEvents,
      governanceEvents,
      communicationFailures,
      riskEvents,
      suspendedEvents,
      restrictedEvents,
      latestEvent,
      hasRecentEvent,
    };
  }, [filteredEvents]);

  const operationalState = useMemo((): {
    level: OperationalStateLevel;
    reason: string;
    impact: string;
    detailsLabel: string;
    onDetails: () => void;
  } => {
    const evidence = operationalEvidence;

    if (evidence.suspendedEvents.length > 0) {
      return {
        level: "SUSPENDED",
        reason: `${evidence.suspendedEvents.length} evento(s) retornaram estado SUSPENDED em metadados reais da Timeline.`,
        impact:
          "A prova oficial indica suspensão operacional; a próxima leitura deve preservar trilha e abrir governança antes de qualquer execução.",
        detailsLabel: "Filtrar eventos suspensos",
        onDetails: () => {
          setSeverityFilter("critical");
          setModuleFilter("governance");
        },
      };
    }

    if (
      evidence.restrictedEvents.length >= 2 ||
      evidence.criticalEvents.length >= 3 ||
      evidence.governanceEvents.some(hasCriticalOperationalMetadata)
    ) {
      return {
        level: "RESTRICTED",
        reason: `${evidence.criticalEvents.length} crítico(s), ${evidence.restrictedEvents.length} restritivo(s) e ${evidence.governanceEvents.length} evidência(s) de governança no recorte.`,
        impact:
          "A Timeline deixou de ser apenas histórico e passa a apontar bloqueio ou investigação formal antes da continuidade operacional.",
        detailsLabel: "Ver eventos críticos",
        onDetails: () => setSeverityFilter("critical"),
      };
    }

    if (
      evidence.criticalEvents.length > 0 ||
      evidence.highEvents.length > 0 ||
      evidence.financeRiskEvents.length > 0 ||
      evidence.serviceOrderRiskEvents.length > 0 ||
      evidence.appointmentRiskEvents.length > 0 ||
      evidence.communicationFailures.length > 0 ||
      !evidence.hasRecentEvent
    ) {
      const reason = !evidence.hasRecentEvent
        ? "Nenhum evento recente foi encontrado no recorte carregado; a prova operacional pode estar silenciosa."
        : `${evidence.highEvents.length + evidence.criticalEvents.length} evento(s) de atenção, incluindo ${evidence.financeRiskEvents.length} financeiro(s), ${evidence.serviceOrderRiskEvents.length} O.S. e ${evidence.appointmentRiskEvents.length} agendamento(s).`;
      return {
        level: "WARNING",
        reason,
        impact:
          "A evidência exige revisão dirigida para evitar perda de receita, atraso de execução ou lacuna de governança.",
        detailsLabel:
          evidence.criticalEvents.length > 0
            ? "Investigar críticos"
            : "Revisar recorte",
        onDetails: () => {
          if (evidence.criticalEvents.length > 0) setSeverityFilter("critical");
          else setSeverityFilter("high");
        },
      };
    }

    return {
      level: "NORMAL",
      reason: `${filteredEvents.length} evento(s) normais no recorte, sem sinais críticos ou restritivos detectados pelos dados carregados.`,
      impact:
        "A Timeline sustenta monitoramento regular: o histórico responde o que aconteceu, quando, quem fez e qual entidade foi afetada.",
      detailsLabel: "Ver feed oficial",
      onDetails: () => setSeverityFilter("all"),
    };
  }, [filteredEvents.length, operationalEvidence]);

  const operationalRisk = useMemo(() => {
    const evidence = operationalEvidence;
    const pick = (items: TimelineEvent[]) => items[0] ?? null;
    const selected =
      pick(evidence.criticalEvents) ??
      pick(evidence.financeRiskEvents) ??
      pick(evidence.serviceOrderRiskEvents) ??
      pick(evidence.appointmentRiskEvents) ??
      pick(evidence.governanceEvents) ??
      pick(evidence.communicationFailures) ??
      null;

    if (!selected) {
      return {
        title: "Sem risco dominante no recorte",
        reason:
          filteredEvents.length > 0
            ? `${filteredEvents.length} evento(s) carregados sem cobrança vencida, O.S. travada, agendamento problemático ou governança restritiva identificável.`
            : "Nenhum evento oficial foi retornado para calcular risco sem inventar evidência.",
        impact:
          "A leitura permanece auditável e deve ser usada para revisão de histórico recente, não para acionar bloqueios automáticos.",
        ctaLabel: "Revisar histórico",
        route: "/timeline",
      };
    }

    const module = eventModule(selected);
    const entity = eventPrimarySubject(selected);
    const when = formatDateTime(selected?.createdAt);

    if (isFinancialRiskEvent(selected)) {
      return {
        title: "Risco financeiro evidenciado",
        reason: `${entity} registrou evento financeiro de atenção em ${when}: ${eventReason(selected)}`,
        impact:
          "Pode afetar caixa, cobrança e governança de receita se não for tratado no módulo financeiro.",
        ctaLabel: "Abrir financeiro",
        route: "/finances",
      };
    }
    if (isServiceOrderRiskEvent(selected)) {
      return {
        title: "Risco de execução em O.S.",
        reason: `${entity} aparece com atraso, trava ou falha em ${when}: ${eventReason(selected)}`,
        impact:
          "Pode gerar retrabalho, SLA rompido e perda de rastreabilidade entre execução e cobrança.",
        ctaLabel: "Abrir O.S.",
        route: "/service-orders",
      };
    }
    if (isAppointmentRiskEvent(selected)) {
      return {
        title: "Risco de entrada operacional",
        reason: `${entity} teve cancelamento, no-show ou atraso registrado em ${when}: ${eventReason(selected)}`,
        impact:
          "Pode comprometer agenda, capacidade operacional e continuidade até O.S. ou cobrança.",
        ctaLabel: "Abrir agendamentos",
        route: "/appointments",
      };
    }
    if (isGovernanceRiskEvent(selected)) {
      return {
        title: "Risco de governança operacional",
        reason: `${entity} registrou evidência de estado/risco em ${when}: ${eventReason(selected)}`,
        impact:
          "Pode exigir decisão formal, auditoria ou restrição antes da próxima ação operacional.",
        ctaLabel: "Abrir governança",
        route: "/governance",
      };
    }
    if (isCommunicationFailureEvent(selected)) {
      return {
        title: "Falha de comunicação registrada",
        reason: `${entity} registrou falha de comunicação em ${when}: ${eventReason(selected)}`,
        impact:
          "Pode reduzir resposta operacional; a Timeline apenas evidencia a falha, sem criar novo fluxo de WhatsApp.",
        ctaLabel: "Abrir contexto",
        route: eventRoute(selected),
      };
    }

    return {
      title:
        module === "all"
          ? "Evento crítico operacional"
          : `Evento crítico em ${eventModuleLabel(module)}`,
      reason: `${entity} registrou criticidade em ${when}: ${eventReason(selected)}`,
      impact:
        "A evidência deve ser investigada no módulo de origem e, se necessário, elevada para governança.",
      ctaLabel: "Abrir contexto",
      route: eventRoute(selected),
    };
  }, [filteredEvents.length, operationalEvidence]);

  const nextBestAction = useMemo(() => {
    const evidence = operationalEvidence;
    const selected =
      evidence.criticalEvents[0] ??
      evidence.financeRiskEvents[0] ??
      evidence.serviceOrderRiskEvents[0] ??
      evidence.appointmentRiskEvents[0] ??
      evidence.governanceEvents[0] ??
      filteredEvents[0] ??
      null;

    if (!selected) {
      return {
        title: "Revisar histórico recente",
        entity: "Timeline sem eventos oficiais no recorte",
        reason:
          "Não há evento real carregado para orientar investigação específica sem criar dados fictícios.",
        impact:
          "Mantém segurança da prova oficial e direciona o operador para gerar operação real ou abrir módulos principais.",
        safetyNote:
          "Nenhuma ação é executada automaticamente; ajuste filtros ou abra módulos operacionais para produzir evidência real.",
        primaryActionLabel: "Limpar filtros",
        primaryRoute: null as string | null,
        secondaryActionLabel: "Abrir dashboard",
        secondaryRoute: "/dashboard" as string | null,
        applyPrimary: () => clearFilters(),
      };
    }

    const entity = eventPrimarySubject(selected);
    const reason = `${eventReason(selected)} Evidência registrada em ${formatDateTime(selected?.createdAt)} por ${eventActorLabel(selected)}.`;
    const base = {
      entity,
      reason,
      safetyNote:
        "Orientação baseada somente na Timeline carregada. O Nexo não executa ação automática; apenas navega para investigação.",
      secondaryActionLabel: "Ver no feed",
      secondaryRoute: "/timeline" as string | null,
      applyPrimary: null as (() => void) | null,
    };

    if (evidence.criticalEvents[0] === selected) {
      return {
        ...base,
        title: "Investigar evento crítico",
        impact:
          "Reduz risco de escalada operacional e preserva trilha para governança.",
        primaryActionLabel: "Abrir contexto crítico",
        primaryRoute: eventRoute(selected),
      };
    }
    if (evidence.financeRiskEvents[0] === selected) {
      return {
        ...base,
        title: "Abrir cobrança",
        impact:
          "Prioriza recuperação de receita ou validação de pendência financeira.",
        primaryActionLabel: "Abrir financeiro",
        primaryRoute: "/finances",
      };
    }
    if (evidence.serviceOrderRiskEvents[0] === selected) {
      return {
        ...base,
        title: "Abrir O.S.",
        impact:
          "Ajuda a destravar execução antes que vire falha de SLA ou cobrança.",
        primaryActionLabel: "Abrir O.S.",
        primaryRoute: "/service-orders",
      };
    }
    if (evidence.appointmentRiskEvents[0] === selected) {
      return {
        ...base,
        title: "Abrir agendamento",
        impact:
          "Permite revisar entrada operacional problemática antes de nova execução.",
        primaryActionLabel: "Abrir agendamento",
        primaryRoute: "/appointments",
      };
    }
    if (evidence.governanceEvents[0] === selected) {
      return {
        ...base,
        title: "Abrir governança",
        impact:
          "Conecta a evidência oficial à decisão, risco ou restrição operacional.",
        primaryActionLabel: "Abrir governança",
        primaryRoute: "/governance",
      };
    }

    return {
      ...base,
      title: "Revisar histórico recente",
      impact:
        "Confirma a cadeia de evidências sem acionar fluxo desnecessário quando não há problema relevante.",
      primaryActionLabel: "Ver evento selecionado",
      primaryRoute: eventRoute(selected),
    };
  }, [filteredEvents, operationalEvidence]);

  const operationalFlowStages = useMemo(
    (): Array<{
      id: string;
      label: string;
      summary: string;
      state: OperationalFlowStageState;
      countOrValue?: string;
      hrefLabel?: string;
      onClick?: () => void;
    }> => [
      {
        id: "event",
        label: "Evento",
        summary:
          filteredEvents.length > 0
            ? "Eventos reais sustentam a prova oficial."
            : "Sem evento real no recorte carregado.",
        countOrValue: String(filteredEvents.length),
        state: filteredEvents.length > 0 ? "done" : "idle",
      },
      {
        id: "registry",
        label: "Registro",
        summary: isInitialLoading
          ? "Feed ainda carregando."
          : hasInitialError
            ? "Falha no carregamento da prova."
            : "Feed carregado como memória auditável.",
        state: hasInitialError
          ? "blocked"
          : isInitialLoading
            ? "idle"
            : "active",
        hrefLabel: "Ver feed",
        onClick: () => setSeverityFilter("all"),
      },
      {
        id: "impact",
        label: "Impacto",
        summary:
          operationalEvidence.riskEvents.length > 0
            ? "Eventos indicam atenção ou restrição."
            : "Sem risco dominante detectado.",
        countOrValue: String(operationalEvidence.riskEvents.length),
        state:
          operationalState.level === "RESTRICTED" ||
          operationalState.level === "SUSPENDED"
            ? "blocked"
            : operationalState.level === "WARNING"
              ? "warning"
              : "idle",
        hrefLabel: "Filtrar risco",
        onClick: () => setSeverityFilter("high"),
      },
      {
        id: "decision",
        label: "Decisão",
        summary:
          operationalEvidence.governanceEvents.length > 0
            ? "Há evidências de risco/estado operacional."
            : "Sem evento de governança no recorte.",
        countOrValue: String(operationalEvidence.governanceEvents.length),
        state: operationalEvidence.governanceEvents.some(
          hasCriticalOperationalMetadata
        )
          ? "warning"
          : operationalEvidence.governanceEvents.length > 0
            ? "active"
            : "idle",
        hrefLabel: "Abrir governança",
        onClick: () => navigate("/governance"),
      },
      {
        id: "action",
        label: "Ação",
        summary: nextBestAction.title,
        state:
          filteredEvents.length > 0 || nextBestAction.applyPrimary
            ? "active"
            : "idle",
        hrefLabel: nextBestAction.primaryActionLabel,
        onClick: () => {
          if (nextBestAction.applyPrimary) nextBestAction.applyPrimary();
          else if (nextBestAction.primaryRoute)
            navigate(nextBestAction.primaryRoute);
        },
      },
      {
        id: "audit",
        label: "Auditoria",
        summary: "Exportar ou revisar evidência oficial do período.",
        state: filteredEvents.length > 0 ? "done" : "idle",
        hrefLabel: "Exportar",
        onClick: exportCsv,
      },
    ],
    [
      filteredEvents.length,
      hasInitialError,
      isInitialLoading,
      navigate,
      nextBestAction,
      operationalEvidence.governanceEvents,
      operationalEvidence.riskEvents.length,
      operationalState.level,
    ]
  );

  const officialEvidenceEvents = useMemo(
    () =>
      [...filteredEvents]
        .sort((a, b) => {
          const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
          const severityDelta =
            severityWeight[eventSeverity(b)] - severityWeight[eventSeverity(a)];
          if (severityDelta !== 0) return severityDelta;
          return (
            new Date(String(b?.createdAt ?? 0)).getTime() -
            new Date(String(a?.createdAt ?? 0)).getTime()
          );
        })
        .slice(0, 4)
        .map(event => ({
          id: String(
            event?.id ?? `${eventEntityId(event)}-${event?.createdAt}`
          ),
          type: eventSeverityLabel(eventSeverity(event)),
          occurredAt: formatDateTime(event?.createdAt),
          entity: eventPrimarySubject(event),
          actor: eventActorLabel(event),
          summary: eventOperationalConsequence(event),
        })),
    [filteredEvents]
  );

  function loadMore() {
    const last = events[events.length - 1];
    if (!last?.id) return;
    setCursor(`${String(last.createdAt)}_${String(last.id)}`);
  }

  function clearFilters() {
    setSearchValue("");
    setEventTypeFilter("all");
    setModuleFilter("all");
    setEntityFilter("all");
    setClientFilter("all");
    setResponsibleFilter("all");
    setSeverityFilter("all");
    setPeriodFilter("7d");
  }

  function exportCsv() {
    const headers = [
      "evento_humano",
      "descricao",
      "entidade",
      "entidade_id",
      "cliente",
      "responsavel",
      "modulo",
      "criticidade",
      "data_hora",
    ];

    const rows = filteredEvents.map(item => [
      eventDisplayTitle(item),
      text(eventReason(item), ""),
      eventEntityLabel(item),
      eventEntityId(item),
      eventCustomerId(item),
      eventActorLabel(item),
      eventModule(item),
      eventSeverity(item),
      formatDateTime(item?.createdAt),
    ]);

    const content = [headers, ...rows]
      .map(cols =>
        cols.map(col => `"${String(col).split('"').join('""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timeline-operacional-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const modulePanorama = useMemo(
    () =>
      MODULE_OPTIONS.filter(option => option.value !== "all").map(option => {
        const count = filteredEvents.filter(
          event => eventModule(event) === option.value
        ).length;
        const critical = filteredEvents.some(
          event =>
            eventModule(event) === option.value &&
            eventSeverity(event) === "critical"
        );
        const attention = filteredEvents.some(
          event =>
            eventModule(event) === option.value &&
            ["critical", "high"].includes(eventSeverity(event))
        );
        return {
          ...option,
          count,
          state:
            count === 0
              ? "Sem histórico"
              : critical
                ? "Crítico"
                : attention
                  ? "Atenção"
                  : "Saudável",
          helper:
            count === 0
              ? "Sem sinal real no período."
              : "Evidência oficial no recorte.",
        };
      }),
    [filteredEvents]
  );

  const latestEventLabel = operationalEvidence.latestEvent
    ? formatDateTime(operationalEvidence.latestEvent?.createdAt)
    : "Sem eventos no período";

  const attentionCount =
    operationalEvidence.criticalEvents.length +
    operationalEvidence.highEvents.length;
  const revenueImpactCount = operationalEvidence.financeRiskEvents.length;

  return (
    <AppPageShell className="gap-3">
      <AppOperationalHeader
        title="Centro de Evidências Operacionais"
        description="Fonte oficial para provar o que aconteceu, quando, quem fez e qual entidade foi afetada."
        density="compact"
        primaryAction={
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> Exportar
          </Button>
        }
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: "24h", label: "Hoje" },
              { value: "7d", label: "7 dias" },
              { value: "30d", label: "30 dias" },
            ].map(option => {
              const isActive = periodFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriodFilter(option.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        }
      />

      <OperationalPanel
        title="Leitura do período"
        subtitle="Resumo compacto para entender volume, atenção, impacto de receita e último acontecimento sem transformar auditoria em dashboard."
        variant="default"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OperationalKpiCard
            label="Eventos registrados"
            value={filteredEvents.length}
            helper={
              filteredEvents.length > 0
                ? "Evidências reais no recorte."
                : "0 eventos registrados."
            }
          />
          <OperationalKpiCard
            label="Exigem atenção"
            value={attentionCount}
            helper={
              attentionCount > 0
                ? "Sinais para diagnóstico operacional."
                : "Sem eventos no período exigindo atenção."
            }
            tone={attentionCount > 0 ? "warning" : "default"}
          />
          <OperationalKpiCard
            label="Impactam receita"
            value={revenueImpactCount}
            helper={
              revenueImpactCount > 0
                ? "Eventos financeiros com consequência."
                : "Sem impacto financeiro detectado."
            }
          />
          <OperationalKpiCard
            label="Último evento"
            value={latestEventLabel}
            helper="Data/hora retornada pela fonte oficial."
          />
        </div>
      </OperationalPanel>

      <OperationalPanel
        title="Panorama por módulo"
        subtitle="Financeiro, Ordens de Serviço, Agendamentos, WhatsApp, Clientes e Governança lidos sem fabricar histórico."
        variant="compact"
      >
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {modulePanorama.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setModuleFilter(item.value)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-left transition-colors hover:border-[var(--accent-primary)]"
            >
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {item.label}
              </span>
              <strong className="mt-1 block text-xl text-[var(--text-primary)]">
                {item.count}
              </strong>
              <AppStatusBadge label={item.state} />
              <span className="mt-2 block text-[11px] text-[var(--text-muted)]">
                {item.helper}
              </span>
            </button>
          ))}
        </div>
      </OperationalPanel>

      <OperationalPanel variant="compact">
        <div className="grid gap-2 text-xs md:grid-cols-4">
          <div>
            <span className="font-semibold text-[var(--success)]">
              Saudável
            </span>
            <p className="text-[var(--text-muted)]">
              Sem crítico no recorte carregado.
            </p>
          </div>
          <div>
            <span className="font-semibold text-[var(--warning)]">Atenção</span>
            <p className="text-[var(--text-muted)]">
              Risco, atraso, falha ou silêncio recente.
            </p>
          </div>
          <div>
            <span className="font-semibold text-[var(--danger)]">Crítico</span>
            <p className="text-[var(--text-muted)]">
              Evento restritivo priorizado acima do ruído.
            </p>
          </div>
          <div>
            <span className="font-semibold text-[var(--text-primary)]">
              Vazio/erro
            </span>
            <p className="text-[var(--text-muted)]">
              Estado explícito: sem inventar histórico.
            </p>
          </div>
        </div>
      </OperationalPanel>

      <div className="grid gap-3 xl:grid-cols-3">
        <OperationalStateCard
          title="Estado da evidência operacional"
          level={operationalState.level}
          reason={operationalState.reason}
          impact={operationalState.impact}
          detailsLabel={operationalState.detailsLabel}
          onDetails={operationalState.onDetails}
        />
        <OperationalRiskCard
          title={operationalRisk.title}
          reason={operationalRisk.reason}
          impact={operationalRisk.impact}
          ctaLabel={operationalRisk.ctaLabel}
          onClick={() => navigate(operationalRisk.route)}
        />
        {/* Próxima melhor ação canônica */}
        <NextBestActionCard
          title={nextBestAction.title}
          entity={nextBestAction.entity}
          reason={nextBestAction.reason}
          impact={nextBestAction.impact}
          safetyNote={nextBestAction.safetyNote}
          primaryActionLabel={nextBestAction.primaryActionLabel}
          onPrimaryAction={() => {
            if (nextBestAction.applyPrimary) nextBestAction.applyPrimary();
            else if (nextBestAction.primaryRoute)
              navigate(nextBestAction.primaryRoute);
          }}
          secondaryActionLabel={nextBestAction.secondaryActionLabel}
          onSecondaryAction={
            nextBestAction.secondaryRoute
              ? () => navigate(nextBestAction.secondaryRoute ?? "/timeline")
              : undefined
          }
        />
      </div>

      <OperationalFlowCard
        title="Evento → Registro → Impacto → Decisão → Ação → Auditoria"
        subtitle="A Timeline funciona como prova oficial: registra o evento, revela risco e orienta a próxima investigação sem executar ação automática."
        stages={operationalFlowStages}
      />

      <EntityTimelineCard
        title="Eventos oficiais mais relevantes"
        subtitle="Até 4 eventos reais normalizados pelo recorte atual para responder o que aconteceu, quando, quem fez e qual entidade foi afetada."
        events={officialEvidenceEvents}
        fullTimelineLabel="Ver feed filtrado"
        onFullTimeline={() => setSeverityFilter("all")}
      />

      <div className="grid gap-3 xl:grid-cols-12">
        <AppSectionBlock
          title="Feed / Linha do Tempo"
          subtitle="Linha do tempo auditável agrupada por data, com títulos humanos e consequência operacional."
          className="xl:col-span-8"
          compact
        >
          {isInitialLoading ? (
            <div className="space-y-2">
              <AppPageLoadingState
                title="Carregando memória oficial"
                description="Organizando histórico com rastreabilidade por entidade, ator e motivo."
              />
              <AppSkeleton className="h-20" />
              <AppSkeleton className="h-20" />
            </div>
          ) : hasInitialError ? (
            <AppPageErrorState
              description="A fonte oficial da Timeline está indisponível no momento. Nenhum dado técnico foi exibido."
              actionLabel="Tentar novamente"
              onAction={() => void timelineQuery.refetch()}
            />
          ) : filteredEvents.length === 0 ? (
            <AppPageEmptyState
              title="Sem eventos para este recorte"
              description="Ajuste os filtros para investigar outra janela operacional."
            />
          ) : (
            <div
              className="max-h-[620px] space-y-3 overflow-y-auto pr-1"
              aria-live="polite"
            >
              {timelineQuery.error ? (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-lg border border-[var(--warning)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    Os eventos já carregados continuam disponíveis, mas o
                    próximo lote não pôde ser consultado.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void timelineQuery.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : null}
              {groupedEvents.map(([dateLabel, dayEvents]) => (
                <section key={dateLabel} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {dateLabel}
                  </p>
                  <AppTimeline>
                    {summarizeEvidenceGroups(dayEvents).map(group => {
                      const isExpanded =
                        expandedEvidenceGroups[group.key] ??
                        group.items.length <= 2;
                      const countsByTitle = `${group.items.length} evidência(s) de ${group.title.toLowerCase()}`;

                      return (
                        <div key={group.key} className="space-y-2">
                          {group.items.length > 2 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedEvidenceGroups(prev => ({
                                  ...prev,
                                  [group.key]: !isExpanded,
                                }))
                              }
                              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-left"
                            >
                              <span className="text-xs font-semibold text-[var(--text-muted)]">
                                {eventModuleLabel(group.module)}
                              </span>
                              <strong className="mt-1 block text-sm text-[var(--text-primary)]">
                                {group.items.length} evidências
                              </strong>
                              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                                {countsByTitle}.{" "}
                                {isExpanded
                                  ? "Ocultar detalhes"
                                  : "Expandir detalhes"}
                                .
                              </span>
                            </button>
                          ) : null}

                          {(isExpanded
                            ? group.items
                            : group.items.slice(0, 1)
                          ).map(event => {
                            const module = eventModule(event);
                            const severity = eventSeverity(event);
                            const isSelected =
                              String(event?.id) ===
                              String(selectedEvent?.id ?? "");

                            return (
                              <AppTimelineItem
                                key={String(
                                  event?.id ??
                                    `${eventEntityId(event)}-${event?.createdAt}`
                                )}
                                className={timelineItemClass({
                                  isSelected,
                                  severity,
                                  module,
                                })}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                aria-label={`Ver detalhes: ${eventDisplayTitle(event)}`}
                                onClick={() =>
                                  setSelectedEventId(String(event?.id))
                                }
                                onKeyDown={keyboardEvent => {
                                  if (
                                    keyboardEvent.key === "Enter" ||
                                    keyboardEvent.key === " "
                                  ) {
                                    keyboardEvent.preventDefault();
                                    setSelectedEventId(String(event?.id));
                                  }
                                }}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <EventIcon event={event} />
                                      <span className="text-xs font-semibold text-[var(--text-muted)]">
                                        {formatEventTime(event?.createdAt)}
                                      </span>
                                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                        {eventDisplayTitle(event)}
                                      </p>
                                    </div>
                                    <div className="mt-2 grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-2">
                                      <p>
                                        <strong>Tipo:</strong>{" "}
                                        {eventHumanTitle(event)}
                                      </p>
                                      <p>
                                        <strong>Resumo:</strong>{" "}
                                        {eventReason(event)}
                                      </p>
                                      <p>
                                        <strong>Impactado:</strong>{" "}
                                        {eventPrimarySubject(event)}
                                      </p>
                                      <p>
                                        <strong>Módulo:</strong>{" "}
                                        {eventModuleLabel(module)}
                                      </p>
                                      <p>
                                        <strong>Ação segura:</strong>{" "}
                                        {eventRecommendedAction(event)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <AppPriorityBadge
                                      label={eventSeverityLabel(severity)}
                                    />
                                    <AppStatusBadge
                                      label={eventModuleLabel(module)}
                                    />
                                  </div>
                                </div>

                                <div className="mt-2 grid gap-1 text-xs text-[var(--text-muted)] md:grid-cols-2">
                                  <p>Quem: {eventActorLabel(event)}</p>
                                  <p>
                                    Quando: {formatDateTime(event?.createdAt)}
                                  </p>
                                  <p>Entidade: {eventPrimarySubject(event)}</p>
                                </div>
                                {usefulMetadataPairs(event).length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {usefulMetadataPairs(event)
                                      .slice(0, 3)
                                      .map(pair => (
                                        <span
                                          key={pair.key}
                                          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                                        >
                                          {pair.key}: {pair.value}
                                        </span>
                                      ))}
                                  </div>
                                ) : null}
                                {eventAuditFallbacks(event).length > 0 ? (
                                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                                    Fallback honesto:{" "}
                                    {eventAuditFallbacks(event).join("; ")}.
                                  </p>
                                ) : null}
                              </AppTimelineItem>
                            );
                          })}
                        </div>
                      );
                    })}
                  </AppTimeline>
                </section>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">
                  Exibindo lote de ingestão {PAGE_SIZE} evento(s).
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadMore}
                  disabled={!hasMore || timelineQuery.isFetching}
                >
                  {timelineQuery.isFetching
                    ? "Carregando..."
                    : hasMore
                      ? `Carregar mais ${PAGE_SIZE}`
                      : "Sem mais eventos"}
                </Button>
              </div>
              <AppPagination
                currentPage={currentPage}
                totalItems={filteredEvents.length}
                pageSize={LIST_PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </AppSectionBlock>

        <AppSectionBlock
          title="Contexto do evento"
          subtitle="Leitura humana primeiro; resumo técnico fica secundário."
          className="xl:col-span-4"
        >
          {!selectedEvent ? (
            <AppPageEmptyState
              title="Selecione um evento"
              description="Clique em um item da timeline para abrir diagnóstico, metadados e ação."
            />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-3 text-sm">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  O que aconteceu
                </p>
                <p className="mt-1 font-semibold text-[var(--text-primary)]">
                  {eventDisplayTitle(selectedEvent)}
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {eventReason(selectedEvent)}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-3 text-sm">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Consequência operacional
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {eventOperationalConsequence(selectedEvent)}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Quem foi impactado
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                  <li>Impactado: {eventPrimarySubject(selectedEvent)}</li>
                  <li>Responsável: {eventActorLabel(selectedEvent)}</li>
                  <li>Data/hora: {formatDateTime(selectedEvent?.createdAt)}</li>
                  <li>
                    Módulo: {eventModuleLabel(eventModule(selectedEvent))}
                  </li>
                  <li>Entidade: {eventPrimarySubject(selectedEvent)}</li>
                </ul>
                {usefulMetadataPairs(selectedEvent).length > 0 ? (
                  <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      Resumo técnico
                    </p>
                    <dl className="mt-2 grid gap-1 text-xs text-[var(--text-secondary)]">
                      {usefulMetadataPairs(selectedEvent).map(pair => (
                        <div
                          key={pair.key}
                          className="grid grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] gap-2"
                        >
                          <dt className="truncate text-[var(--text-muted)]">
                            {pair.key}
                          </dt>
                          <dd className="break-words font-medium text-[var(--text-secondary)]">
                            {pair.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
                    Metadados não vieram em formato resumível pela fonte
                    oficial.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Diagnóstico de risco
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  Próxima ação recomendada
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {eventRealCtas(selectedEvent)[0]?.label ?? "Ver no feed"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AppStatusBadge
                    label={
                      eventSeverity(selectedEvent) === "critical"
                        ? "Em risco"
                        : "Monitorado"
                    }
                  />
                  {eventModule(selectedEvent) === "governance" ? (
                    <ShieldAlert className="h-4 w-4 text-[var(--accent-primary)]" />
                  ) : null}
                  {eventModule(selectedEvent) === "finance" ? (
                    <BadgeDollarSign className="h-4 w-4 text-[var(--success)]" />
                  ) : null}
                  {eventSeverity(selectedEvent) === "critical" ? (
                    <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {eventModule(selectedEvent) === "governance" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/governance")}
                  >
                    Abrir governança
                  </Button>
                ) : null}
                {eventRealCtas(selectedEvent).map(cta => (
                  <Button
                    key={cta.label}
                    type="button"
                    variant="outline"
                    title={cta.reason}
                    onClick={() => navigate(cta.route)}
                  >
                    {cta.label}
                  </Button>
                ))}
                {eventRealCtas(selectedEvent).length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Sem CTA de entidade: a fonte não trouxe entityType/entityId
                    utilizável para cliente, O.S., financeiro, agendamento ou
                    WhatsApp.
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(eventRoute(selectedEvent))}
                >
                  Abrir contexto <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </AppSectionBlock>
      </div>

      <AppSectionBlock
        title="Prova operacional"
        subtitle="Extrato oficial de evidências do período selecionado."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <AppStatCard
            label="Eventos oficiais"
            value={filteredEvents.length}
            helper="Registros reais carregados."
          />
          <AppStatCard
            label="Financeiro"
            value={
              modulePanorama.find(item => item.value === "finance")?.count ?? 0
            }
            helper="Receita e cobranças."
          />
          <AppStatCard
            label="Ordens de Serviço"
            value={
              modulePanorama.find(item => item.value === "service_order")
                ?.count ?? 0
            }
            helper="Execução operacional."
          />
          <AppStatCard
            label="Governança"
            value={
              modulePanorama.find(item => item.value === "governance")?.count ??
              0
            }
            helper={
              filteredEvents.length === 0
                ? "Sem sinal / sem histórico."
                : "Decisão e risco."
            }
          />
        </div>
        <div className="mt-4">
          <AppDataTable className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="p-3">Data/hora</th>
                <th className="p-3">Módulo</th>
                <th className="p-3">Evento humano</th>
                <th className="p-3">Entidade/cliente</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.slice(0, 8).map(event => (
                <tr
                  key={String(
                    event?.id ?? `${eventEntityId(event)}-${event?.createdAt}`
                  )}
                  className="border-t border-[var(--border-subtle)]"
                >
                  <td className="p-3 text-[var(--text-secondary)]">
                    {formatDateTime(event?.createdAt)}
                  </td>
                  <td className="p-3">
                    {eventModuleLabel(eventModule(event))}
                  </td>
                  <td className="p-3 font-medium text-[var(--text-primary)]">
                    {eventDisplayTitle(event)}
                  </td>
                  <td className="p-3 text-[var(--text-secondary)]">
                    {eventPrimarySubject(event)}
                  </td>
                  <td className="p-3">
                    {eventSeverityLabel(eventSeverity(event))}
                  </td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setSeverityFilter("all")}
        >
          Ver feed filtrado
        </Button>
      </AppSectionBlock>

      <AppSectionBlock
        title="Filtros"
        subtitle="Tipo, cliente, módulo, entidade, criticidade e ator."
      >
        <AppFiltersBar className="grid grid-cols-1 gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            aria-label="Buscar na Timeline"
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            placeholder="Buscar evento, entidade, responsável ou contexto"
            className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <AppSelect
            value={eventTypeFilter}
            onValueChange={setEventTypeFilter}
            options={[
              { value: "all", label: "Tipo de evento" },
              ...eventTypeOptions,
            ]}
          />
          <AppSelect
            value={moduleFilter}
            onValueChange={value => setModuleFilter(value as ModuleFilter)}
            options={MODULE_OPTIONS}
          />
          <AppSelect
            value={severityFilter}
            onValueChange={value => setSeverityFilter(value as SeverityFilter)}
            options={[
              { value: "all", label: "Criticidade" },
              { value: "critical", label: "Crítico" },
              { value: "high", label: "Alta" },
              { value: "medium", label: "Média" },
              { value: "low", label: "Baixa" },
            ]}
          />
          <AppSelect
            value={clientFilter}
            onValueChange={setClientFilter}
            options={[{ value: "all", label: "Cliente" }, ...clientOptions]}
          />
          <AppSelect
            value={entityFilter}
            onValueChange={setEntityFilter}
            options={[{ value: "all", label: "Entidade" }, ...entityOptions]}
          />
          <AppSelect
            value={responsibleFilter}
            onValueChange={setResponsibleFilter}
            options={[
              { value: "all", label: "Ator (usuário/sistema)" },
              ...responsibleOptions,
            ]}
          />
          <AppSelect
            value={periodFilter}
            onValueChange={setPeriodFilter}
            options={[
              { value: "24h", label: "Últimas 24h" },
              { value: "7d", label: "Últimos 7 dias" },
              { value: "30d", label: "Últimos 30 dias" },
              { value: "all", label: "Período total" },
            ]}
          />
        </AppFiltersBar>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearFilters}
          >
            Limpar filtros
          </Button>
          <span className="text-xs text-[var(--text-muted)]">
            {filteredEvents.length} evento(s) no recorte atual.
          </span>
        </div>
      </AppSectionBlock>
    </AppPageShell>
  );
}

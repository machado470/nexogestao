import type { ReactNode } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDashed,
  CreditCard,
  History,
  Lock,
  MessageCircle,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { AppSectionCard, AppStatusBadge } from "@/components/app-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OperationalStateLevel =
  | "NORMAL"
  | "WARNING"
  | "RESTRICTED"
  | "SUSPENDED"
  | "UNKNOWN";

export type OperationalFlowStageState =
  | "done"
  | "active"
  | "warning"
  | "blocked"
  | "idle"
  | "unavailable";

const operationalStateTone: Record<
  OperationalStateLevel,
  {
    label: string;
    badgeTone: "success" | "warning" | "accent" | "danger";
    className: string;
  }
> = {
  NORMAL: {
    label: "Operação saudável",
    badgeTone: "success",
    className: "border-[var(--success)]/30",
  },
  WARNING: {
    label: "Atenção necessária",
    badgeTone: "warning",
    className: "border-[var(--warning)]/35",
  },
  RESTRICTED: {
    label: "Operação comprometida",
    badgeTone: "accent",
    className: "border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]/35",
  },
  SUSPENDED: {
    label: "Operação bloqueada",
    badgeTone: "danger",
    className: "border-[var(--danger)]/40 bg-[var(--danger)]/8",
  },
  UNKNOWN: {
    label: "Estado não determinado",
    badgeTone: "accent",
    className: "border-[var(--border-subtle)]/75",
  },
};

const flowStageTone: Record<
  OperationalFlowStageState,
  { badge: string; container: string; icon: ReactNode; rail: string }
> = {
  done: {
    badge: "Concluído",
    container: "border-[var(--success)]/25 bg-[var(--surface-primary)]/45",
    icon: <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />,
    rail: "bg-[var(--success)]/60",
  },
  active: {
    badge: "Ativo",
    container: "border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]/55",
    icon: <Circle className="h-4 w-4 text-[var(--accent-primary)]" />,
    rail: "bg-[var(--accent-primary)]/70",
  },
  warning: {
    badge: "Atenção",
    container: "border-[var(--warning)]/35 bg-[var(--warning)]/10",
    icon: <CircleAlert className="h-4 w-4 text-[var(--warning)]" />,
    rail: "bg-[var(--warning)]/70",
  },
  blocked: {
    badge: "Bloqueado",
    container: "border-[var(--danger)]/35 bg-[var(--danger)]/8",
    icon: <Lock className="h-4 w-4 text-[var(--danger)]" />,
    rail: "bg-[var(--danger)]/70",
  },
  unavailable: {
    badge: "Estado indisponível",
    container:
      "border-[var(--border-subtle)]/75 bg-[var(--surface-primary)]/35",
    icon: <CircleDashed className="h-4 w-4 text-[var(--text-muted)]" />,
    rail: "bg-[var(--border-strong)]/45",
  },
  idle: {
    badge: "Sem sinal",
    container:
      "border-[var(--border-subtle)]/75 bg-[var(--surface-primary)]/35",
    icon: <CircleDashed className="h-4 w-4 text-[var(--text-muted)]" />,
    rail: "bg-[var(--border-strong)]/45",
  },
};

export function NexoGovernanceDecisionCard({
  level,
  reason,
  impact,
  title = "Estado da operação",
  detailsLabel = "Ver detalhes",
  onDetails,
  metrics = [],
  className,
}: {
  level: OperationalStateLevel;
  reason: string;
  impact: string;
  title?: string;
  detailsLabel?: string;
  onDetails?: () => void;
  metrics?: Array<{
    label: string;
    value: string;
    tone?: "neutral" | "warning" | "danger";
  }>;
  className?: string;
}) {
  const tone = operationalStateTone[level];

  return (
    <AppSectionCard
      className={cn("flex h-full flex-col gap-2", tone.className, className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="nexo-overline">Comando operacional</p>
          <h3 className="mt-0.5 text-lg font-black uppercase leading-tight tracking-tight text-[var(--text-primary)]">
            {level === "UNKNOWN" ? "Estado não determinado" : level}
          </h3>
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            {title}
          </p>
        </div>
        <AppStatusBadge label={tone.label} tone={tone.badgeTone} />
      </div>
      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
          {metrics.map(metric => (
            <div
              key={metric.label}
              className={cn(
                "rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/45 p-2",
                metric.tone === "danger"
                  ? "border-[var(--danger)]/25 bg-[var(--danger)]/8"
                  : metric.tone === "warning"
                    ? "border-[var(--warning)]/25 bg-[var(--warning)]/10"
                    : undefined
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {metric.label}
              </p>
              <p className="mt-0.5 truncate font-semibold text-[var(--text-primary)]">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-1.5 text-xs leading-4 text-[var(--text-secondary)] sm:grid-cols-2">
        <p>
          <strong className="text-[var(--text-primary)]">Problema:</strong>{" "}
          {reason}
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Consequência:</strong>{" "}
          {impact}
        </p>
      </div>
      {onDetails ? (
        <Button
          className="mt-auto h-8 justify-between px-3 text-xs"
          variant="secondary"
          onClick={onDetails}
        >
          {detailsLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </AppSectionCard>
  );
}

export function NexoPriorityPanel({
  title,
  entity,
  reason,
  impact,
  safetyNote,
  primaryValue,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: {
  title: string;
  entity: string;
  reason: string;
  impact: string;
  safetyNote?: string;
  primaryValue?: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}) {
  return (
    <AppSectionCard
      className={cn(
        "flex h-full flex-col gap-2 border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]/35",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-primary)]/25 bg-[var(--surface-primary)]/60">
          <Zap className="h-4 w-4 text-[var(--accent-primary)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="nexo-overline">Próxima ação</p>
          {primaryValue ? (
            <p className="mt-1 text-4xl font-bold leading-none tracking-tight text-[var(--text-primary)] sm:text-5xl">
              {primaryValue}
            </p>
          ) : null}
          <h3
            className={cn(
              "text-base font-semibold leading-tight text-[var(--text-primary)]",
              primaryValue ? "mt-2" : "mt-1"
            )}
          >
            {title}
          </h3>
          <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
            {entity}
          </p>
        </div>
      </div>
      <div className="grid gap-2 text-xs leading-4 text-[var(--text-secondary)] md:grid-cols-2">
        <p>
          <strong className="text-[var(--text-primary)]">Problema:</strong>{" "}
          {reason}
        </p>
        <p>
          <strong className="text-[var(--text-primary)]">Consequência:</strong>{" "}
          {impact}
        </p>
      </div>
      {safetyNote ? (
        <p className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/50 px-2.5 py-1.5 text-[11px] leading-4 text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Segurança:</strong>{" "}
          {safetyNote}
        </p>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <Button
          className="h-9 flex-[1.35] justify-between px-3 text-sm font-semibold"
          onClick={onPrimaryAction}
        >
          {primaryActionLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={onSecondaryAction}
          >
            {secondaryActionLabel}
          </Button>
        ) : null}
      </div>
    </AppSectionCard>
  );
}

export function NexoOperationalPipeline({
  title = "Fluxo operacional transversal",
  subtitle = "Cliente → Agendamento → O.S. → Cobrança → Pagamento",
  stages,
  className,
}: {
  title?: string;
  subtitle?: string;
  stages: Array<{
    id: string;
    label: string;
    summary: string;
    state: OperationalFlowStageState;
    countOrValue?: string;
    hrefLabel?: string;
    onClick?: () => void;
  }>;
  className?: string;
}) {
  const primaryStages = stages.slice(0, 5);
  const auxiliaryStages = stages.slice(5);

  return (
    <AppSectionCard className={cn("space-y-3", className)}>
      <div>
        <p className="nexo-overline">Pipeline operacional</p>
        <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          {subtitle}
        </p>
      </div>
      <div className="grid gap-2 lg:grid-cols-5 xl:gap-3">
        {primaryStages.map((stage, index) => {
          const tone = flowStageTone[stage.state];
          const isBottleneck =
            stage.state === "blocked" || stage.state === "warning";
          return (
            <article
              key={stage.id}
              className={cn(
                "relative min-w-[9.5rem] rounded-xl border p-2.5 shadow-sm",
                tone.container,
                isBottleneck
                  ? "ring-1 ring-[var(--accent-primary)]/25"
                  : undefined
              )}
            >
              {index < primaryStages.length - 1 ? (
                <span className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 items-center text-[var(--text-muted)] lg:flex">
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {tone.icon}
                  <span className="whitespace-normal text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--text-secondary)] xl:text-[11px]">
                    {stage.label}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {tone.badge}
                </span>
              </div>
              {stage.countOrValue ? (
                <p className="mt-1.5 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                  {stage.countOrValue}
                </p>
              ) : null}
              <p className="mt-1 min-h-[32px] text-xs leading-4 text-[var(--text-secondary)]">
                {stage.summary}
              </p>
              {stage.onClick ? (
                <Button
                  className="mt-2 h-auto px-0 py-0 text-[var(--accent-primary)]"
                  variant="link"
                  size="sm"
                  onClick={stage.onClick}
                >
                  {stage.hrefLabel ?? "Abrir etapa"}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
      {auxiliaryStages.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)]/70 pt-2">
          {auxiliaryStages.map(stage => {
            const tone = flowStageTone[stage.state];
            return (
              <button
                type="button"
                key={stage.id}
                className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/45 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)]"
                onClick={stage.onClick}
              >
                {tone.icon}
                <span className="font-semibold text-[var(--text-primary)]">
                  {stage.label}
                </span>
                <span className="truncate">
                  {stage.countOrValue} · {stage.summary}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </AppSectionCard>
  );
}

function getEvidenceTimelineIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("mensagem"))
    return (
      <MessageCircle className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
    );
  if (normalized.includes("agendamento"))
    return (
      <CalendarClock className="h-3.5 w-3.5 text-[var(--dashboard-info)]" />
    );
  if (normalized.includes("o.s."))
    return normalized.includes("conclu") ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
    ) : (
      <Wrench className="h-3.5 w-3.5 text-[var(--warning)]" />
    );
  if (normalized.includes("pagamento"))
    return <Banknote className="h-3.5 w-3.5 text-[var(--success)]" />;
  if (normalized.includes("cobran"))
    return <CreditCard className="h-3.5 w-3.5 text-[var(--warning)]" />;
  return <Circle className="h-3.5 w-3.5 text-[var(--text-muted)]" />;
}

export function NexoEvidenceTimeline({
  title = "Últimos eventos oficiais",
  subtitle = "Prova operacional recente usada para sustentar a leitura transversal.",
  events,
  fullTimelineLabel = "Abrir Timeline completa",
  onFullTimeline,
  className,
}: {
  title?: string;
  subtitle?: string;
  events: Array<{
    id: string;
    type: string;
    occurredAt: string;
    entity: string;
    actor?: string;
    summary: string;
    tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  }>;
  fullTimelineLabel?: string;
  onFullTimeline?: () => void;
  className?: string;
}) {
  return (
    <AppSectionCard className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nexo-overline">Prova operacional</p>
          <h3 className="mt-0.5 text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-[var(--text-muted)]">
            {subtitle}
          </p>
        </div>
        <History className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
      </div>
      {events.length > 0 ? (
        <ol className="divide-y divide-[var(--border-subtle)]/70">
          {events.map(event => (
            <li key={event.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-primary)]">
                  {getEvidenceTimelineIcon(event.type)}
                </span>
                <AppStatusBadge
                  label={event.type}
                  tone={event.tone ?? "neutral"}
                />
                <span className="text-[var(--text-muted)]">
                  {event.occurredAt}
                </span>
                <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">
                  {event.entity}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs leading-4 text-[var(--text-secondary)]">
                {event.summary}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/45 p-3 text-sm leading-5 text-[var(--text-secondary)]">
          Nenhum evento oficial foi retornado nesta leitura. O Nexo não cria
          histórico fictício; abra a Timeline para investigar a trilha completa.
        </div>
      )}
      {onFullTimeline ? (
        <Button
          className="h-8 w-full justify-between px-3 text-xs"
          variant="secondary"
          onClick={onFullTimeline}
        >
          {fullTimelineLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      ) : null}
    </AppSectionCard>
  );
}

export function NexoIncidentList({
  title,
  reason,
  impact,
  ctaLabel,
  onClick,
  className,
}: {
  title: string;
  reason: string;
  impact: string;
  ctaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <AppSectionCard
      className={cn(
        "flex h-full flex-col gap-3 border-[var(--danger)]/30",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
        <div>
          <p className="nexo-overline">Maior risco agora</p>
          <h3 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
            {title}
          </h3>
        </div>
      </div>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Problema:</strong>{" "}
        {reason}
      </p>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Consequência:</strong>{" "}
        {impact}
      </p>
      <Button
        className="mt-auto justify-between"
        variant="secondary"
        onClick={onClick}
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </AppSectionCard>
  );
}

export const OperationalStateCard = NexoGovernanceDecisionCard;
export const NextBestActionCard = NexoPriorityPanel;
export const OperationalFlowCard = NexoOperationalPipeline;
export const EntityTimelineCard = NexoEvidenceTimeline;
export const OperationalRiskCard = NexoIncidentList;

export function NexoExecutiveMetric(props: {
  title: string;
  value: string;
  context: string;
  ctaLabel: string;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <AppSectionCard
      className={cn("flex h-full flex-col gap-2", props.className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nexo-overline">Métrica executiva</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {props.title}
          </h3>
        </div>
        {props.icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--surface-primary)]/45 text-[var(--text-secondary)]">
            {props.icon}
          </span>
        ) : null}
      </div>
      <p className="text-2xl font-bold leading-tight text-[var(--text-primary)]">
        {props.value}
      </p>
      <p className="text-xs leading-5 text-[var(--text-secondary)]">
        {props.context}
      </p>
      <Button
        className="mt-auto h-8 justify-between px-3 text-xs"
        variant="secondary"
        onClick={props.onClick}
      >
        {props.ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </AppSectionCard>
  );
}

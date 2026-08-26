import { Button } from "@/components/ui/button";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";


type OperationalTone =
  | "default"
  | "elevated"
  | "subtle"
  | "critical"
  | "success"
  | "warning"
  | "muted"
  | "selected"
  | "hero"
  | "compact"
  | "rail"
  | "ghost";
type PriorityTone = "high" | "medium" | "low" | "neutral";

const toneClasses: Record<string, string> = {
  default:
    "border-[var(--nexo-border-subtle,var(--border-subtle))] bg-[var(--nexo-card-bg,var(--surface-base))]",
  elevated:
    "border-[var(--nexo-border-subtle,var(--border-subtle))] bg-[var(--nexo-card-bg,var(--surface-base))] shadow-sm",
  subtle:
    "border-[var(--nexo-border-subtle,var(--border-subtle))] bg-[var(--nexo-control-bg,var(--surface-subtle))]",
  muted:
    "border-[var(--nexo-border-subtle,var(--border-subtle))] bg-[var(--nexo-control-bg,var(--surface-subtle))] opacity-90",
  selected: "border-[var(--accent-primary)]/45 bg-[var(--accent-soft)]/25",
  critical:
    "border-[var(--danger,var(--status-critical))]/35 bg-[var(--danger-soft,var(--surface-subtle))]/35",
  success:
    "border-[var(--success,var(--status-normal))]/30 bg-[var(--success-soft,var(--surface-subtle))]/35",
  warning:
    "border-[var(--warning,var(--status-warning))]/35 bg-[var(--warning-soft,var(--surface-subtle))]/35",
  hero: "border-[var(--accent-primary)]/25 bg-[linear-gradient(135deg,var(--nexo-card-bg,var(--surface-base)),var(--accent-soft),var(--nexo-control-bg,var(--surface-subtle)))] shadow-sm",
  compact:
    "border-[var(--nexo-border-subtle,var(--border-subtle))] bg-[var(--nexo-card-bg,var(--surface-base))]/80",
  rail: "border-transparent bg-transparent",
  ghost: "border-transparent bg-transparent",
};

const barClasses: Record<string, string> = {
  default: "bg-[var(--accent-primary)]",
  success: "bg-[var(--success,var(--status-normal))]",
  warning: "bg-[var(--warning,var(--status-warning))]",
  critical: "bg-[var(--danger,var(--status-critical))]",
  muted: "bg-[var(--nexo-text-muted,var(--text-muted))]",
  subtle: "bg-[var(--accent-primary)]/70",
};

function clampPct(value?: number | null, max = 100) {
  if (value == null || !Number.isFinite(value) || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

export function OperationalPanel({
  title,
  subtitle,
  icon,
  action,
  children,
  variant = "default",
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: Exclude<OperationalTone, "muted" | "selected">;
}) {
  return (
    <section
      className={cn(
        "nexo-operational-panel rounded-2xl border p-4 transition-[border-color,box-shadow,transform] duration-200 md:p-5",
        variant === "hero" ? "p-5 md:p-7" : "hover:-translate-y-0.5",
        variant === "compact" ? "p-3 md:p-3" : null,
        variant === "ghost" ? "p-0 md:p-0" : null,
        toneClasses[variant],
        className
      )}
      {...props}
    >
      {title || subtitle || icon || action ? (
        <div
          className={cn(
            "mb-4 flex items-start justify-between gap-3",
            variant === "compact" && "mb-2"
          )}
        >
          <div className="flex min-w-0 gap-3">
            {icon ? (
              <div className="mt-0.5 text-[var(--accent-primary)]">{icon}</div>
            ) : null}
            <div className="min-w-0">
              {title ? (
                <h2 className="text-base font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p className="mt-1 text-sm text-[var(--nexo-text-muted,var(--text-muted))]">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function OperationalInnerCard({
  variant = "default",
  interactive = false,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: OperationalTone;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "nexo-operational-inner-card rounded-xl border p-3 transition-[border-color,background-color,transform] duration-200",
        toneClasses[variant],
        interactive &&
          "hover:-translate-y-0.5 hover:border-[var(--accent-primary)]/35",
        className
      )}
      {...props}
    />
  );
}

export function OperationalKpiCard({
  label,
  value,
  trend,
  tone = "default",
  helper,
}: {
  label: ReactNode;
  value: ReactNode;
  trend?: ReactNode;
  tone?: OperationalTone;
  helper?: ReactNode;
}) {
  return (
    <OperationalInnerCard variant={tone} className="min-h-24">
      <p className="text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
          {value}
        </p>
        {trend ? (
          <span className="text-xs font-medium text-[var(--accent-primary)]">
            {trend}
          </span>
        ) : null}
      </div>
      {helper ? (
        <p className="mt-2 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
          {helper}
        </p>
      ) : null}
    </OperationalInnerCard>
  );
}

export function OperationalWorkloadBar({
  value,
  max = 100,
  tone = "default",
  label,
  className,
}: {
  value?: number | null;
  max?: number;
  tone?: keyof typeof barClasses;
  label?: string;
  className?: string;
}) {
  const pct = clampPct(value, max);
  return (
    <div
      className={cn("nexo-operational-workload space-y-1", className)}
      aria-label={
        label ?? (pct == null ? "Carga indisponível" : `Carga ${pct}%`)
      }
      role="meter"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="flex justify-between gap-2 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
        <span>{label ?? "Carga"}</span>
        <span>{pct == null ? "indisponível" : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--nexo-control-bg,var(--surface-subtle))]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            barClasses[tone] ?? barClasses.default
          )}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function OperationalTimelineItem({
  title,
  description,
  actor,
  time,
  tone = "default",
  icon,
  entityLabel,
  withLine = true,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  actor?: ReactNode;
  time?: ReactNode;
  tone?: OperationalTone;
  icon?: ReactNode;
  entityLabel?: ReactNode;
  withLine?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="nexo-operational-timeline-item relative flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "timeline-dot flex h-8 w-8 items-center justify-center rounded-full border text-[var(--accent-primary)]",
            toneClasses[tone]
          )}
        >
          {icon}
        </span>
        {withLine ? (
          <span className="timeline-line mt-1 min-h-6 w-px flex-1 bg-[var(--nexo-border-subtle,var(--border-subtle))]" />
        ) : null}
      </div>
      <OperationalInnerCard variant={tone} className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
              {title}
            </p>
            {description ? (
              <p className="mt-1 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
                {description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
              {[entityLabel, actor, time].filter(Boolean).map((item, index) => (
                <span key={index}>
                  {index > 0 ? " · " : ""}
                  {item}
                </span>
              ))}
            </p>
          </div>
          {action}
        </div>
      </OperationalInnerCard>
    </div>
  );
}

export function OperationalFlow({
  stages,
  className,
  variant = "card",
}: {
  stages: Array<{
    label: ReactNode;
    value?: ReactNode;
    state?: ReactNode;
    tone?: OperationalTone;
    active?: boolean;
    bottleneck?: boolean;
  }>;
  className?: string;
  variant?: "rail" | "card" | "compact";
}) {
  return (
    <div
      className={cn(
        "nexo-operational-flow relative grid gap-0 overflow-hidden rounded-2xl border bg-[var(--nexo-card-bg,var(--surface-base))] md:grid-cols-5",
        variant === "rail"
          ? "nexo-operational-flow-rail border-transparent bg-transparent p-0 before:absolute before:left-8 before:right-8 before:top-1/2 before:hidden before:h-0.5 before:-translate-y-1/2 before:bg-[var(--nexo-border-subtle,var(--border-subtle))] md:before:block"
          : "border-[var(--nexo-border-subtle,var(--border-subtle))] p-2",
        variant === "compact" && "p-1",
        className
      )}
    >
      {stages.map((stage, index) => (
        <div key={index} className="relative min-w-0 p-1">
          <div
            className={cn(
              "flow-stage relative rounded-xl p-3 text-sm transition-[border-color,box-shadow,transform] duration-200",
              variant === "rail"
                ? "min-h-20 border bg-[var(--nexo-card-bg,var(--surface-base))]/95 shadow-sm"
                : "min-h-24",
              toneClasses[stage.tone ?? (stage.active ? "selected" : "subtle")],
              stage.bottleneck &&
                "bottleneck shadow-[0_0_0_3px_var(--warning-soft,var(--surface-subtle))]"
            )}
          >
            <p className="text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
              {stage.label}
            </p>
            {stage.value != null ? (
              <p className="mt-1 text-lg font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
                {stage.value}
              </p>
            ) : null}
            {stage.state ? (
              <p className="mt-2 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
                {stage.state}
              </p>
            ) : null}
          </div>
          {index < stages.length - 1 ? (
            <span className="flow-connector pointer-events-none absolute right-[-0.45rem] top-1/2 z-10 hidden h-0.5 w-5 -translate-y-1/2 bg-[var(--accent-primary)]/45 after:absolute after:right-0 after:top-1/2 after:h-2 after:w-2 after:-translate-y-1/2 after:rotate-45 after:border-r after:border-t after:border-[var(--accent-primary)]/60 md:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function OperationalPriorityItem({
  tone = "neutral",
  title,
  description,
  action,
  className,
}: {
  tone?: PriorityTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const border =
    tone === "high"
      ? "border-l-[var(--danger,var(--status-critical))]"
      : tone === "medium"
        ? "border-l-[var(--warning,var(--status-warning))]"
        : tone === "low"
          ? "border-l-[var(--success,var(--status-normal))]"
          : "border-l-[var(--nexo-border-subtle,var(--border-subtle))]";
  return (
    <OperationalInnerCard
      className={cn(
        "nexo-operational-priority-item border-l-4",
        border,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
            {title}
          </p>
          {description ? (
            <p className="mt-1 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </OperationalInnerCard>
  );
}

export function OperationalHealthRing({
  value,
  label,
  tone = "default",
  compact = false,
}: {
  value?: number | null;
  label: ReactNode;
  tone?: keyof typeof barClasses;
  compact?: boolean;
}) {
  const pct = clampPct(value, 100);
  return (
    <div
      className={cn(
        "nexo-operational-health-ring flex items-center gap-3",
        compact && "text-sm"
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-full",
          compact ? "h-10 w-10" : "h-16 w-16"
        )}
        style={{
          background:
            pct == null
              ? "var(--nexo-control-bg,var(--surface-subtle))"
              : `conic-gradient(var(--accent-primary) ${pct * 3.6}deg, var(--nexo-control-bg,var(--surface-subtle)) 0deg)`,
        }}
      >
        <div
          className={cn(
            "grid place-items-center rounded-full bg-[var(--nexo-card-bg,var(--surface-base))] text-xs font-semibold",
            compact ? "h-8 w-8" : "h-12 w-12"
          )}
        >
          {pct == null ? "—" : `${pct}%`}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
          {label}
        </p>
        <p className="text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
          {tone === "critical"
            ? "exige ação"
            : tone === "warning"
              ? "acompanhar"
              : "sob controle"}
        </p>
      </div>
    </div>
  );
}

export function OperationalActionPanel({
  title,
  description,
  impact,
  safety,
  primaryAction,
  secondaryAction,
  tone = "success",
  display = "expandedProblem",
  className,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  description: ReactNode;
  impact?: ReactNode;
  safety?: ReactNode;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tone?: OperationalTone;
  display?: "compactHealthy" | "expandedProblem";
}) {
  return (
    <OperationalInnerCard
      variant={tone}
      className={cn(
        "nexo-operational-action-panel",
        display === "compactHealthy" &&
          "flex flex-wrap items-center justify-between gap-3 border-0 bg-transparent p-0",
        className
      )}
      {...props}
    >
      <div>
        <p className="text-base font-semibold text-[var(--nexo-text-primary,var(--text-primary))]">
          {title}
        </p>
        <p className="mt-1 text-sm text-[var(--nexo-text-muted,var(--text-muted))]">
          {description}
        </p>
      </div>
      {impact ? (
        <p className="mt-3 text-sm font-medium text-[var(--nexo-text-primary,var(--text-primary))]">
          Impacto: {impact}
        </p>
      ) : null}
      {safety ? (
        <p className="mt-1 text-xs text-[var(--nexo-text-muted,var(--text-muted))]">
          Segurança: {safety}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap gap-2",
          display === "compactHealthy" ? "mt-0" : "mt-3"
        )}
      >
        {primaryAction ? (
          <Button
            size="sm"
            variant={display === "compactHealthy" ? "ghost" : undefined}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        ) : null}
        {secondaryAction ? (
          <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        ) : null}
      </div>
    </OperationalInnerCard>
  );
}

export function OperationalSectionGrid({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "nexo-operational-section-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4",
        className
      )}
      {...props}
    />
  );
}

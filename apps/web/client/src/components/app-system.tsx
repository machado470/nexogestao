import { Button } from "@/components/ui/button";
import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";
import { useActionHandler } from "@/hooks/useActionHandler";
import type { AppAction } from "@/lib/actions/types";

export function AppPageShell({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "nexo-page-shell w-full min-w-0 max-w-none flex flex-col gap-4",
        className
      )}
      {...props}
    />
  );
}

export function AppPageHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      className={cn("nexo-page-header nexo-section-reveal", className)}
      {...props}
    />
  );
}

export function AppPageSection({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn("nexo-page-section nexo-section-reveal", className)}
      {...props}
    />
  );
}

export function AppToolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "nexo-app-toolbar nexo-card-informative flex flex-wrap items-center justify-between rounded-xl",
        className
      )}
      {...props}
    />
  );
}

export const AppFiltersBar = AppToolbar;

const appSectionCardVariants = cva("nexo-card-kpi", {
  variants: {
    variant: {
      default: "border-[var(--app-border-subtle)]/85 bg-[var(--app-surface-1)]",
      decision:
        "border-[var(--app-border-strong)] bg-[var(--app-surface-2)] shadow-[var(--app-shadow-soft)]",
      action:
        "border-[color-mix(in_srgb,var(--app-accent)_34%,var(--app-border-subtle))] bg-[color-mix(in_srgb,var(--app-accent)_7%,var(--app-surface-1))]",
      context: "border-[var(--app-border-subtle)] bg-[var(--app-surface-1)]",
      evidence:
        "border-[color-mix(in_srgb,var(--app-border-subtle)_78%,transparent)] bg-[var(--app-surface-1)] shadow-none",
      critical:
        "border-[var(--app-border-critical)] bg-[var(--app-surface-critical)] shadow-[var(--app-shadow-soft)]",
      warning:
        "border-[var(--app-border-warning)] bg-[var(--app-surface-warning)]",
      success:
        "border-[color-mix(in_srgb,var(--app-success)_42%,var(--app-border-subtle))] bg-[var(--app-surface-success)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export function AppSectionCard({
  className,
  variant,
  ...props
}: ComponentProps<"section"> & VariantProps<typeof appSectionCardVariants>) {
  return (
    <section
      className={cn(appSectionCardVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AppStatCard({
  icon,
  label,
  value,
  helper,
  delta,
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  delta?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("nexo-card-kpi h-full", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nexo-overline">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {value}
          </p>

          {helper ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {helper}
            </p>
          ) : null}
        </div>

        {icon ? <div className="nexo-icon-tile">{icon}</div> : null}
      </div>

      {delta ? <div className="mt-3">{delta}</div> : null}
    </article>
  );
}

export function AppInfoCard({
  className,
  ...props
}: ComponentProps<"article">) {
  return (
    <article
      className={cn("nexo-card-informative p-4", className)}
      {...props}
    />
  );
}

export function AppEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="nexo-card-informative flex flex-col items-center justify-center gap-2.5 p-8 text-center">
      <p className="text-base font-semibold leading-tight text-[var(--text-primary)]">
        {title}
      </p>
      <p className="max-w-xl text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="pt-1">{action}</div> : null}
    </section>
  );
}

export function AppDataTable({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]/85 bg-[var(--surface-primary)] shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]">
      <table
        className={cn("w-full min-w-full nexo-data-table text-sm", className)}
        {...props}
      />
    </div>
  );
}
export type AppStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

export function AppStatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: AppStatusTone;
  className?: string;
}) {
  return (
    <span className={cn("nexo-badge", `nexo-badge-${tone}`, className)}>
      {label}
    </span>
  );
}

export type AppOperationalStatus = "NORMAL" | "ATENÇÃO" | "RISCO" | "CRÍTICO";

const appOperationalStatusTone: Record<
  AppOperationalStatus,
  ComponentProps<typeof AppStatusBadge>["tone"]
> = {
  NORMAL: "success",
  ATENÇÃO: "warning",
  RISCO: "accent",
  CRÍTICO: "danger",
};

export function AppOperationalStatusBadge({
  status,
  label = status,
  className,
}: {
  status: AppOperationalStatus;
  label?: string;
  className?: string;
}) {
  return (
    <AppStatusBadge
      label={label}
      tone={appOperationalStatusTone[status]}
      className={className}
    />
  );
}

export type AppPriorityLevel = "P0" | "P1" | "P2" | "P3";

const appPriorityTone: Record<
  AppPriorityLevel,
  ComponentProps<typeof AppStatusBadge>["tone"]
> = {
  P0: "danger",
  P1: "warning",
  P2: "info",
  P3: "neutral",
};

const appPriorityLabel: Record<AppPriorityLevel, string> = {
  P0: "P0 · agir agora",
  P1: "P1 · resolver hoje",
  P2: "P2 · acompanhar",
  P3: "P3 · informativo",
};

export function AppPriorityBadge({
  priority,
  label = appPriorityLabel[priority],
  className,
}: {
  priority: AppPriorityLevel;
  label?: string;
  className?: string;
}) {
  return (
    <AppStatusBadge
      label={label}
      tone={appPriorityTone[priority]}
      className={className}
    />
  );
}

export function AppRowActionsDropdown({
  triggerLabel = "Ações",
  items,
  contentClassName,
}: {
  triggerLabel?: string;
  items: Array<
    | {
        type?: "item";
        label: string;
        onSelect: () => void;
        disabled?: boolean;
        tone?: "default" | "primary";
      }
    | {
        type: "separator";
        label?: string;
      }
  >;
  contentClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] shadow-none hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0"
          aria-label={triggerLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn("min-w-[220px] p-2", contentClassName)}
      >
        {items.map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={`separator-${index}`} className="space-y-1 py-1">
                {item.label ? (
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {item.label}
                  </p>
                ) : null}
                <DropdownMenuSeparator />
              </div>
            );
          }

          return (
            <DropdownMenuItem
              key={`${item.label}-${index}`}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                "px-3 py-2.5",
                item.tone === "primary"
                  ? "font-semibold text-[var(--accent-primary)] focus:text-[var(--accent-primary)]"
                  : undefined
              )}
            >
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppPagination({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    />
  );
}

export function AppForm({ className, ...props }: ComponentProps<"form">) {
  return <form className={cn("space-y-4", className)} {...props} />;
}

export function AppFormSection({
  title,
  subtitle,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "nexo-form-section space-y-3 rounded-xl border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4",
        className
      )}
    >
      {title ? (
        <h3 className="text-sm font-semibold text-[var(--modal-section-text)]">
          {title}
        </h3>
      ) : null}
      {subtitle ? (
        <p className="nexo-helper-text text-xs text-[var(--modal-section-muted)]">
          {subtitle}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function AppField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <AppInlineHint>{hint}</AppInlineHint> : null}
    </div>
  );
}

export function AppFieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)} {...props} />
  );
}

export const AppTextarea = Textarea;
export const AppCheckbox = Checkbox;
export const AppRadio = RadioGroup;

export function AppSelect({
  value,
  onValueChange,
  placeholder,
  options,
  ariaLabel,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: Array<{ label: string; value: string }>;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} />;
}

export function AppInlineHint({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs text-[var(--text-muted)]", className)}
      {...props}
    />
  );
}

export function AppFormActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 pt-1",
        className
      )}
      {...props}
    />
  );
}

export const AppDropdown = DropdownMenu;
export const AppDropdownTrigger = DropdownMenuTrigger;
export const AppDropdownContent = DropdownMenuContent;
export const AppDropdownItem = DropdownMenuItem;
export const AppDropdownLabel = DropdownMenuLabel;
export const AppDropdownSeparator = DropdownMenuSeparator;

export const AppPopover = Popover;
export const AppPopoverTrigger = PopoverTrigger;
export const AppPopoverContent = PopoverContent;

const toastTone = cva("rounded-xl border p-3", {
  variants: {
    tone: {
      info: "border-[var(--border)] bg-[var(--surface-elevated)]",
      success:
        "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--surface-elevated))]",
      warning:
        "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface-elevated))]",
      danger:
        "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface-elevated))]",
    },
  },
  defaultVariants: { tone: "info" },
});

export function AppToast({
  className,
  tone,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof toastTone>) {
  return <div className={cn(toastTone({ tone }), className)} {...props} />;
}

export function AppAlert({
  className,
  ...props
}: ComponentProps<typeof Alert>) {
  return (
    <Alert className={cn("border-[var(--border)]", className)} {...props} />
  );
}
export { AlertTitle as AppAlertTitle, AlertDescription as AppAlertDescription };

export function AppLoadingState({
  label = "Carregando...",
}: {
  label?: string;
}) {
  return (
    <div className="nexo-card-informative p-4 text-sm text-[var(--text-muted)]">
      {label}
    </div>
  );
}

export function AppSkeleton({
  className,
  ...props
}: ComponentProps<typeof Skeleton>) {
  return <Skeleton className={cn("h-4 w-full", className)} {...props} />;
}

export function AppSuccessState({ message }: { message: string }) {
  return (
    <AppToast tone="success">
      <p className="text-sm text-[var(--text-primary)]">{message}</p>
    </AppToast>
  );
}

export function AppErrorState({ message }: { message: string }) {
  return (
    <AppToast tone="danger">
      <p className="text-sm text-[var(--text-primary)]">{message}</p>
    </AppToast>
  );
}

export function AppTimeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol className={cn("space-y-3", className)} {...props} />;
}

export function AppTimelineItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "nexo-card-timeline rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-1)] p-3 shadow-none",
        className
      )}
      {...props}
    />
  );
}

export function AppTrendHint({
  label,
  tone = "neutral",
  className,
}: {
  label?: string | null;
  tone?: "success" | "warning" | "danger" | "neutral";
  className?: string;
}) {
  if (!label) return null;
  const toneClass = {
    success: "text-[var(--app-success)]",
    warning: "text-[var(--app-warning)]",
    danger: "text-[var(--app-danger)]",
    neutral: "text-[var(--app-text-muted)]",
  }[tone];
  return (
    <span className={cn("text-xs font-medium", toneClass, className)}>
      {label}
    </span>
  );
}

export const AppActivityFeed = AppTimeline;

type AppOperationalState =
  | AppOperationalStatus
  | "WARNING"
  | "RESTRICTED"
  | "SUSPENDED";

const operationalStateTone: Record<
  AppOperationalState,
  {
    badgeTone: ComponentProps<typeof AppStatusBadge>["tone"];
    borderClass: string;
  }
> = {
  NORMAL: { badgeTone: "success", borderClass: "border-[var(--success)]/30" },
  ATENÇÃO: { badgeTone: "warning", borderClass: "border-[var(--warning)]/30" },
  RISCO: { badgeTone: "accent", borderClass: "border-[var(--accent)]/35" },
  CRÍTICO: { badgeTone: "danger", borderClass: "border-[var(--danger)]/35" },
  WARNING: { badgeTone: "warning", borderClass: "border-[var(--warning)]/30" },
  RESTRICTED: { badgeTone: "accent", borderClass: "border-[var(--accent)]/35" },
  SUSPENDED: { badgeTone: "danger", borderClass: "border-[var(--danger)]/35" },
};

export function NexoOperationalState({
  state,
  title,
  description,
  primaryMetric,
  secondaryMetrics = [],
  impact,
  nextEvaluationLabel,
  lastEvaluationLabel,
  ctaLabel,
  href,
  onCtaClick,
  compact = false,
  showIcon = true,
  trendLabel,
  titleClassName,
}: {
  state: "NORMAL" | "WARNING" | "RESTRICTED" | "SUSPENDED";
  title: string;
  description: string;
  primaryMetric?: ReactNode;
  secondaryMetrics?: Array<{ label: string; value: ReactNode }>;
  impact?: string;
  nextEvaluationLabel?: string;
  lastEvaluationLabel?: string;
  ctaLabel?: string;
  href?: string;
  onCtaClick?: () => void;
  compact?: boolean;
  showIcon?: boolean;
  trendLabel?: string | null;
  titleClassName?: string;
}) {
  const config = {
    NORMAL: {
      label: "Operação saudável",
      tone: "success" as const,
      Icon: CheckCircle2,
      variant: "success" as const,
    },
    WARNING: {
      label: "Atenção necessária",
      tone: "warning" as const,
      Icon: AlertTriangle,
      variant: "warning" as const,
    },
    RESTRICTED: {
      label: "Operação comprometida",
      tone: "accent" as const,
      Icon: ShieldAlert,
      variant: "critical" as const,
    },
    SUSPENDED: {
      label: "Operação bloqueada",
      tone: "danger" as const,
      Icon: Lock,
      variant: "critical" as const,
    },
  }[state];
  const Icon = config.Icon;
  const cta = ctaLabel ? (
    <Button
      asChild={Boolean(href)}
      onClick={href ? undefined : onCtaClick}
      className="w-full sm:w-auto"
    >
      {href ? <a href={href}>{ctaLabel}</a> : ctaLabel}
    </Button>
  ) : null;

  return (
    <AppSectionCard
      variant={config.variant}
      className={cn(
        "overflow-hidden shadow-none",
        compact ? "p-4" : "p-5 md:p-6"
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr] lg:items-stretch">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {showIcon ? (
              <span className="rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-2 text-[var(--app-accent)]">
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
            <AppStatusBadge label={config.label} tone={config.tone} />
            <AppTrendHint
              label={trendLabel}
              tone={
                state === "NORMAL"
                  ? "success"
                  : state === "WARNING"
                    ? "warning"
                    : "danger"
              }
            />
          </div>
          <h2
            className={cn(
              "mt-3 font-bold tracking-tight text-[var(--app-text-primary)]",
              compact ? "text-2xl" : "text-4xl md:text-6xl",
              titleClassName
            )}
          >
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--app-text-secondary)] md:text-base">
            {description}
          </p>
          {impact ? (
            <p className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--app-border-subtle)_70%,transparent)] bg-[var(--app-surface-2)] p-3 text-sm text-[var(--app-text-secondary)]">
              <strong className="text-[var(--app-text-primary)]">
                Impacto:{" "}
              </strong>
              {impact}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col justify-between border-t border-[color-mix(in_srgb,var(--app-border-subtle)_58%,transparent)] bg-[color-mix(in_srgb,var(--app-surface-2)_72%,transparent)] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          {primaryMetric ? (
            <div className="text-3xl font-bold text-[var(--app-text-primary)]">
              {primaryMetric}
            </div>
          ) : null}
          {secondaryMetrics.length ? (
            <div className="mt-3 grid gap-2">
              {secondaryMetrics.map(metric => (
                <div
                  key={metric.label}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-[var(--app-text-muted)]">
                    {metric.label}
                  </span>
                  <strong className="text-right text-[var(--app-text-primary)]">
                    {metric.value}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
          {lastEvaluationLabel || nextEvaluationLabel ? (
            <div className="mt-3 space-y-1 border-t border-[var(--app-border-subtle)] pt-3 text-xs text-[var(--app-text-muted)]">
              {lastEvaluationLabel ? (
                <p>Última: {lastEvaluationLabel}</p>
              ) : null}
              {nextEvaluationLabel ? (
                <p>Próxima: {nextEvaluationLabel}</p>
              ) : null}
            </div>
          ) : null}
          {cta ? <div className="mt-4">{cta}</div> : null}
        </div>
      </div>
    </AppSectionCard>
  );
}

export function AppActionCard({
  priority,
  title,
  problem,
  impact,
  recommendation,
  ctaLabel,
  href,
  onClick,
  status,
  severity = "info",
  className,
}: {
  priority?: string | number;
  title: string;
  problem?: string;
  impact?: string;
  recommendation?: string;
  ctaLabel?: string;
  href?: string;
  onClick?: () => void;
  status?: string;
  severity?: "critical" | "warning" | "info" | "success" | "subtle";
  className?: string;
}) {
  const variant =
    severity === "critical"
      ? "critical"
      : severity === "warning"
        ? "warning"
        : severity === "success"
          ? "success"
          : severity === "subtle"
            ? "default"
            : "action";
  return (
    <AppSectionCard
      variant={variant}
      className={cn("flex h-full flex-col gap-3 p-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {priority ? (
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-accent)]">
              Prioridade {priority}
            </p>
          ) : null}
          <h3 className="mt-1 text-base font-bold text-[var(--app-text-primary)]">
            {title}
          </h3>
        </div>
        {status ? (
          <AppStatusBadge
            label={status}
            tone={
              severity === "critical"
                ? "danger"
                : severity === "warning"
                  ? "warning"
                  : "info"
            }
          />
        ) : null}
      </div>
      {problem ? (
        <p className="text-sm text-[var(--app-text-secondary)]">{problem}</p>
      ) : null}
      {impact ? (
        <p className="text-sm text-[var(--app-text-secondary)]">
          <strong className="text-[var(--app-text-primary)]">Impacto: </strong>
          {impact}
        </p>
      ) : null}
      {recommendation ? (
        <p className="text-sm text-[var(--app-text-secondary)]">
          <strong className="text-[var(--app-text-primary)]">
            Recomendação:{" "}
          </strong>
          {recommendation}
        </p>
      ) : null}
      {ctaLabel ? (
        <Button
          asChild={Boolean(href)}
          onClick={href ? undefined : onClick}
          size="sm"
          className="mt-auto w-full"
        >
          {href ? <a href={href}>{ctaLabel}</a> : ctaLabel}
        </Button>
      ) : null}
    </AppSectionCard>
  );
}

export function AppOperationalStateBadge({
  state,
  className,
}: {
  state: AppOperationalState;
  className?: string;
}) {
  return (
    <AppStatusBadge
      className={className}
      tone={operationalStateTone[state].badgeTone}
      label={state}
    />
  );
}

export function AppOperationalStateCard({
  state,
  summary,
  impact,
  recommendation,
  className,
}: {
  state: AppOperationalState;
  summary: string;
  impact: string;
  recommendation?: string;
  className?: string;
}) {
  return (
    <AppSectionCard
      className={cn(
        "min-h-[240px] lg:min-h-[280px] space-y-3",
        operationalStateTone[state].borderClass,
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Estado operacional
        </p>
        <AppOperationalStateBadge state={state} />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{summary}</p>
      <div className="nexo-card-informative p-3 text-xs text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Impacto:</strong>{" "}
        {impact}
      </div>
      {recommendation ? (
        <p className="text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text-primary)]">
            Recomendado agora:
          </strong>{" "}
          {recommendation}
        </p>
      ) : null}
    </AppSectionCard>
  );
}

export function AppOperationalStatePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 lg:grid-cols-3", className)}>{children}</div>
  );
}

export type AppNextActionItem = {
  id: string;
  title: string;
  description: string;
  severity: "healthy" | "pending" | "overdue" | "critical";
  action?: AppAction;
  href?: string;
  onRun?: () => void;
};

export function AppNextActionButton({
  action,
  className,
}: {
  action: AppNextActionItem;
  className?: string;
}) {
  const { executeAction, isExecuting } = useActionHandler();

  return (
    <Button
      className={className}
      variant={action.severity === "critical" ? "default" : "secondary"}
      disabled={action.action ? isExecuting(action.action.id) : false}
      onClick={() => {
        if (action.action) {
          void executeAction(action.action);
          return;
        }
        if (action.href) {
          void executeAction({
            id: `next-action-href-${action.id}`,
            type: "navigate",
            payload: { path: action.href },
          });
          return;
        }

        action.onRun?.();
      }}
    >
      {action.action && isExecuting(action.action.id)
        ? "Abrindo ação..."
        : action.href
          ? "Abrir caminho"
          : "Resolver agora"}
    </Button>
  );
}

export function AppNextActionCard({ action }: { action: AppNextActionItem }) {
  const tone: Record<
    AppNextActionItem["severity"],
    ComponentProps<typeof AppStatusBadge>["tone"]
  > = {
    healthy: "success",
    pending: "warning",
    overdue: "accent",
    critical: "danger",
  };

  return (
    <article className="nexo-card-informative flex items-start justify-between gap-3 p-3">
      <div className="space-y-1">
        <AppStatusBadge
          label={action.severity.toUpperCase()}
          tone={tone[action.severity]}
        />
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {action.title}
        </p>
        <p className="text-xs text-[var(--text-muted)]">{action.description}</p>
      </div>
      <AppNextActionButton action={action} />
    </article>
  );
}

export function AppNextActionList({
  actions,
  className,
}: {
  actions: AppNextActionItem[];
  className?: string;
}) {
  if (actions.length === 0) {
    return (
      <AppEmptyState
        title="Sem ações imediatas"
        description="A operação está estável neste momento."
      />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {actions.map(action => (
        <AppNextActionCard key={action.id} action={action} />
      ))}
    </div>
  );
}

export function AppEntityContextPanel({
  title = "Fluxo conectado",
  links,
}: {
  title?: string;
  links: Array<{ id: string; label: string; href: string; active?: boolean }>;
}) {
  return (
    <AppSectionCard>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {links.map((link, index) => (
          <div key={link.id} className="inline-flex items-center gap-2">
            <a
              className={cn(
                "rounded-full border border-[var(--border-soft)] bg-[var(--nexo-card-muted)] px-3 py-1 text-[var(--text-secondary)]",
                link.active &&
                  "border-[color-mix(in_srgb,var(--accent-primary)_72%,var(--nexo-border-strong))] bg-[var(--accent-primary)] text-[var(--primary-foreground)] shadow-[0_8px_18px_-16px_var(--accent-primary)]"
              )}
              href={link.href}
            >
              {link.label}
            </a>
            {index < links.length - 1 ? (
              <span className="text-[var(--text-muted)]">→</span>
            ) : null}
          </div>
        ))}
      </div>
    </AppSectionCard>
  );
}

export const AppTabs = Tabs;
export const AppTabsList = TabsList;
export const AppTabsTrigger = TabsTrigger;
export const AppTabsContent = TabsContent;

export {
  Breadcrumb as AppBreadcrumbs,
  BreadcrumbItem as AppBreadcrumbItem,
  BreadcrumbLink as AppBreadcrumbLink,
  BreadcrumbList as AppBreadcrumbList,
  BreadcrumbPage as AppBreadcrumbPage,
  BreadcrumbSeparator as AppBreadcrumbSeparator,
  RadioGroupItem as AppRadioItem,
};

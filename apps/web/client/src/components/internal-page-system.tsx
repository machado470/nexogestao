import { isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  operationalSeverityLabel,
  operationalSeverityTone,
} from "@/lib/operational-semantics";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleCheck,
  Inbox,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AppPageShell,
  AppPageHeader as BasePageHeader,
  AppFiltersBar as BaseFiltersBar,
  AppSectionCard,
  AppSkeleton as BaseSkeleton,
  AppStatusBadge as BaseAppStatusBadge,
} from "@/components/app-system";
import {
  AppCardCTA,
  AppEmptyState as AppBaseEmptyState,
  AppLoadingState as BaseLoadingState,
  AppRowActions,
  AppTrendIndicator,
} from "@/components/app";
import { normalizePriorityLabel } from "@/lib/operations";

export function AppPageHeader({
  title,
  description,
  ctaLabel,
  onCta,
  secondaryActions,
  actions,
  cta,
}: {
  title: string;
  description?: ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  secondaryActions?: ReactNode;
  actions?: ReactNode;
  cta?: ReactNode;
}) {
  const resolvedActions =
    actions ??
    cta ??
    (ctaLabel ? <Button onClick={onCta}>{ctaLabel}</Button> : null);

  return (
    <BasePageHeader>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nexo-page-header-title">{title}</h1>
          {description ? (
            <p className="nexo-page-header-description">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {resolvedActions}
        </div>
      </div>
    </BasePageHeader>
  );
}

export function AppOperationalHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  contextChips,
  children,
  className,
  density = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  contextChips?: ReactNode;
  children?: ReactNode;
  className?: string;
  density?: "default" | "compact";
}) {
  const isCompact = density === "compact";

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-6",
        isCompact ? "py-4" : "py-5",
        className
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between",
          isCompact ? "gap-2.5" : "gap-3"
        )}
      >
        <div className="min-w-0 flex-1">
          <h1 className="nexo-page-header-title">{title}</h1>
          {description ? (
            <p
              className={cn(
                "nexo-page-header-description",
                isCompact ? "mt-0.5" : "mt-1"
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>

      {contextChips ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            isCompact ? "mt-2.5" : "mt-3"
          )}
        >
          {contextChips}
        </div>
      ) : null}

      {children ? (
        <div
          className={cn(
            "border-t border-[var(--border-subtle)]",
            isCompact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function AppFiltersBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <BaseFiltersBar className={className}>{children}</BaseFiltersBar>;
}

export function AppContextChip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "success" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
        tone === "neutral" &&
          "border-[var(--border-subtle)] bg-[var(--surface-primary)]/45 text-[var(--text-secondary)]",
        tone === "accent" &&
          "border-[var(--accent-primary)]/30 bg-[var(--accent-soft)] text-[var(--accent-primary)]",
        tone === "danger" &&
          "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700",
        className
      )}
    >
      {children}
    </span>
  );
}

export function AppSecondaryTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const tabClasses = (isActive: boolean) =>
    cn(
      "relative inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors",
      isActive
        ? "border-[color-mix(in_srgb,var(--accent-primary)_72%,black)] bg-[var(--accent-primary)] text-[var(--primary-foreground)] shadow-[0_8px_18px_-16px_var(--accent-primary)]"
        : "border-[var(--border-subtle)] bg-[var(--surface-primary)]/45 text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] hover:bg-[var(--surface-primary)]/65 hover:text-[var(--text-primary)]"
    );

  return (
    <nav
      className={cn(
        "overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/35 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      aria-label="Navegação secundária"
    >
      <div className="flex min-w-max items-center gap-1.5">
        {items.map(item => {
          const isActive = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={tabClasses(isActive)}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

type AppPaginationProps = {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function buildPagination(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages] as const;
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ] as const;
  }

  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ] as const;
}

export function AppPagination({
  currentPage,
  totalItems,
  pageSize = 8,
  onPageChange,
  className,
}: AppPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem =
    totalItems === 0 ? 0 : Math.min(safePage * pageSize, totalItems);
  const pages = buildPagination(safePage, totalPages);

  const baseButtonClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={cn(
        "mt-2 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-xs text-[var(--text-muted)]">
        Mostrando {startItem}–{endItem} de {totalItems} registros
      </p>

      <div className="hidden items-center gap-1 sm:flex">
        <button
          type="button"
          className={baseButtonClass}
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((item, index) =>
          item === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1 text-xs text-[var(--text-muted)]"
            >
              ...
            </span>
          ) : (
            <button
              key={`page-${item}`}
              type="button"
              onClick={() => onPageChange(item)}
              className={cn(
                baseButtonClass,
                safePage === item
                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : undefined
              )}
              aria-current={safePage === item ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className={baseButtonClass}
          disabled={safePage === totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 sm:hidden">
        <button
          type="button"
          className={baseButtonClass}
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Anterior
        </button>
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {safePage}/{totalPages}
        </span>
        <button
          type="button"
          className={baseButtonClass}
          disabled={safePage === totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function AppOperationalBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar",
  quickFilters,
  activeFilterChips,
  advancedFiltersContent,
  advancedFiltersLabel = "Filtros",
  onClearAllFilters,
  className,
  variant = "standalone",
}: {
  tabs: Array<{ value: T; label: string }>;
  activeTab: T;
  onTabChange: (value: T) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  quickFilters?: ReactNode;
  activeFilterChips?: Array<{
    key: string;
    label: string;
    onRemove?: () => void;
  }>;
  advancedFiltersContent?: ReactNode;
  advancedFiltersLabel?: string;
  onClearAllFilters?: () => void;
  className?: string;
  variant?: "standalone" | "embedded";
}) {
  const hasAdvancedFilters = Boolean(advancedFiltersContent);
  const hasActiveAdvancedFilters = (activeFilterChips?.length ?? 0) > 0;

  const tabClasses = (isActive: boolean) =>
    cn(
      "relative inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors",
      isActive
        ? "border-[color-mix(in_srgb,var(--accent-primary)_72%,black)] bg-[var(--accent-primary)] text-[var(--primary-foreground)] shadow-[0_8px_18px_-16px_var(--accent-primary)]"
        : "border-[var(--border-subtle)] bg-[var(--surface-primary)]/45 text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] hover:bg-[var(--surface-primary)]/65 hover:text-[var(--text-primary)]"
    );

  return (
    <section
      className={cn(
        variant === "standalone"
          ? "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]"
          : "bg-transparent",
        className
      )}
    >
      <div className="overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center gap-1.5">
          {tabs.map(tab => {
            const isActive = tab.value === activeTab;
            return (
              <button
                key={tab.value}
                type="button"
                className={tabClasses(isActive)}
                onClick={() => onTabChange(tab.value)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] p-3">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 border-[var(--border-subtle)] bg-[var(--surface-base)] pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {quickFilters}
            </div>

            {hasAdvancedFilters ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {advancedFiltersLabel}
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={10}
                  className="w-[min(92vw,380px)] space-y-3 rounded-xl border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
                >
                  {advancedFiltersContent}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          {hasActiveAdvancedFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterChips?.map(chip => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {chip.label}
                  {chip.onRemove ? (
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
                      aria-label={`Remover ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              ))}
              {onClearAllFilters ? (
                <button
                  type="button"
                  onClick={onClearAllFilters}
                  className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function appSelectionPillClasses(isActive: boolean) {
  return cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    isActive
      ? "border-[color-mix(in_srgb,var(--accent-primary)_72%,black)] bg-[var(--accent-primary)] text-[var(--primary-foreground)] shadow-[0_8px_18px_-16px_var(--accent-primary)]"
      : "border-[var(--border-subtle)] bg-[var(--surface-primary)]/35 text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] hover:bg-[var(--surface-primary)]/55 hover:text-[var(--text-primary)]"
  );
}

type MetricTrend = "up" | "down" | "neutral";

export type AppMetricCardItem = {
  title: string;
  value: ReactNode;
  delta?: string;
  trend?: MetricTrend;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "important" | "critical";
  loading?: boolean;
  emphasis?: "strong" | "compact";
  footer?: ReactNode;
  onClick?: () => void;
  ctaLabel?: string;
};

function MetricTrendBadge({
  trend,
  delta,
}: {
  trend?: MetricTrend;
  delta?: string;
}) {
  if (!delta || !trend) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        trend === "up" && "text-emerald-500",
        trend === "down" && "text-rose-500",
        trend === "neutral" && "text-[var(--text-muted)]"
      )}
    >
      {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
      {trend === "down" ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
      {trend === "neutral" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
      {delta}
    </span>
  );
}

export function AppMetricCard({
  title,
  value,
  delta,
  trend,
  hint,
  icon,
  tone = "default",
  loading = false,
  emphasis = "compact",
  footer,
  onClick,
  ctaLabel,
}: AppMetricCardItem) {
  const content = (
    <article
      className={cn(
        "nexo-card-kpi flex h-full min-h-[118px] flex-col p-3.5 md:p-4",
        tone === "important" && "nexo-card-kpi--important",
        tone === "critical" && "nexo-card-kpi--critical"
      )}
    >
      <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {title}
          </p>
          {loading ? (
            <div
              className="h-8 w-28 rounded-md bg-[var(--surface-elevated)]/70"
              aria-hidden
            />
          ) : (
            <p
              className={cn(
                "font-semibold leading-none tracking-tight text-[var(--text-primary)]",
                emphasis === "strong" ? "text-3xl md:text-[2rem]" : "text-2xl"
              )}
            >
              {value}
            </p>
          )}
          {hint ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
          ) : null}
        </div>
        {icon ? <div className="nexo-icon-tile">{icon}</div> : null}
      </div>

      {delta || footer || onClick ? (
        <div className="mt-4 flex min-h-7 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)]/70 pt-3">
          <div className="min-w-0">
            <MetricTrendBadge trend={trend} delta={delta} />
            {footer ? (
              <div className="truncate text-xs text-[var(--text-muted)]">
                {footer}
              </div>
            ) : null}
          </div>
          {onClick ? (
            <AppCardCTA label={ctaLabel ?? "Abrir"} onClick={onClick} />
          ) : null}
        </div>
      ) : null}
    </article>
  );

  if (!onClick) return content;
  return (
    <button type="button" className="h-full w-full text-left" onClick={onClick}>
      {content}
    </button>
  );
}

export function AppKpiCard({
  label,
  value,
  trend,
  context,
  onClick,
}: {
  label: string;
  value: string;
  trend: number;
  context: string;
  onClick?: () => void;
}) {
  const direction: MetricTrend =
    trend > 0 ? "up" : trend < 0 ? "down" : "neutral";
  const delta = Number.isFinite(trend)
    ? `${trend >= 0 ? "+" : ""}${trend.toFixed(1).replace(".", ",")}%`
    : undefined;
  return (
    <AppMetricCard
      title={label}
      value={value}
      trend={delta ? direction : undefined}
      delta={delta}
      hint={context}
      onClick={onClick}
    />
  );
}

export function AppKpiRow({
  items,
  emphasis = "compact",
  gridClassName,
}: {
  items: Array<
    | AppMetricCardItem
    | {
        label: string;
        value: string;
        trend?: number;
        context?: string;
        onClick?: () => void;
      }
  >;
  emphasis?: "strong" | "compact";
  gridClassName?: string;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <section
      className={cn(
        "grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
        gridClassName
      )}
    >
      {safeItems.map((item, index) => {
        if (!item || typeof item !== "object") {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.error("[kpi] item inválido recebido em AppKpiRow", {
              item,
              index,
            });
          }
          return null;
        }

        const normalized: AppMetricCardItem =
          "title" in item
            ? item
            : {
                title: item.label,
                value: item.value,
                hint: item.context,
                onClick: item.onClick,
                delta:
                  typeof item.trend === "number"
                    ? `${item.trend >= 0 ? "+" : ""}${item.trend.toFixed(1).replace(".", ",")}%`
                    : undefined,
                trend:
                  typeof item.trend === "number"
                    ? item.trend > 0
                      ? "up"
                      : item.trend < 0
                        ? "down"
                        : "neutral"
                    : undefined,
              };

        const safeTitle =
          typeof normalized.title === "string" &&
          normalized.title.trim().length > 0
            ? normalized.title
            : `Métrica ${index + 1}`;

        return (
          <AppMetricCard
            key={`${safeTitle}-${index}`}
            {...normalized}
            title={safeTitle}
            emphasis={normalized.emphasis ?? emphasis}
          />
        );
      })}
    </section>
  );
}

export function AppChartPanel({
  title,
  description,
  children,
  trendLabel,
  trendValue,
  ctaLabel = "Ver detalhes",
  onCtaClick,
}: {
  title: string;
  description: string;
  children: ReactNode;
  trendLabel?: string;
  trendValue?: number;
  ctaLabel?: string;
  onCtaClick?: () => void;
}) {
  return (
    <AppSectionCard>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        </div>
        {typeof trendValue === "number" ? (
          <AppTrendIndicator value={trendValue} />
        ) : null}
      </div>
      {children}
      {trendLabel || onCtaClick ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">{trendLabel}</span>
          {onCtaClick ? (
            <Button size="sm" variant="ghost" onClick={onCtaClick}>
              {ctaLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </AppSectionCard>
  );
}

export function AppSectionBlock({
  title,
  subtitle,
  children,
  className,
  ctaLabel,
  onCtaClick,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  compact?: boolean;
}) {
  return (
    <AppSectionCard
      className={cn(
        compact ? "min-h-0 md:p-4" : "min-h-0",
        className
      )}
    >
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)]/60 pb-3.5">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]"
            title={title}
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {onCtaClick ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCtaClick}
            className="max-w-full shrink-0"
          >
            <span className="truncate">
              {ctaLabel ?? "Ver detalhes da operação"}
            </span>
          </Button>
        ) : null}
      </div>
      {children}
    </AppSectionCard>
  );
}

export function AppDataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldWrapInTable = !(
    isValidElement(children) &&
    typeof children.type === "string" &&
    children.type === "table"
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]/85 bg-[var(--surface-primary)] shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]">
      {shouldWrapInTable ? (
        <table className={cn("w-full min-w-full text-sm", className)}>{children}</table>
      ) : (
        children
      )}
    </div>
  );
}

export function AppListBlock({
  items,
  className,
  maxItems = 8,
  minItems = 5,
  compact = false,
  showPlaceholders = false,
}: {
  items: Array<{
    title: string;
    subtitle?: string;
    right?: ReactNode;
    action?: ReactNode;
  }>;
  className?: string;
  maxItems?: number;
  minItems?: number;
  compact?: boolean;
  showPlaceholders?: boolean;
}) {
  const normalizedItems = items.slice(0, maxItems).map((item, index) => ({
    ...item,
    subtitle: item.subtitle ?? "Ação operacional disponível para execução.",
    action: item.action ?? (
      <Button size="sm" variant="outline">
        Executar
      </Button>
    ),
    __key: `${item.title}-${index}`,
  }));
  while (showPlaceholders && normalizedItems.length < minItems) {
    const idx = normalizedItems.length + 1;
    normalizedItems.push({
      title: `Ação complementar ${idx}`,
      subtitle:
        "Preencha este espaço com uma ação direta do fluxo operacional.",
      action: (
        <Button size="sm" variant="outline">
          Configurar
        </Button>
      ),
      __key: `placeholder-${idx}`,
    });
  }

  return (
    <div
      className={cn(
        compact ? "min-h-0 space-y-2" : "min-h-[220px] space-y-2.5",
        className
      )}
    >
      {normalizedItems.map(item => (
        <div
          key={item.__key}
          className={cn(
            "rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/70",
            compact ? "px-3 py-2.5" : "px-3.5 py-3"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-5 text-[var(--text-primary)]">
                {item.title}
              </p>
              {item.subtitle ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                  {item.subtitle}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2 self-center">
              {item.right ? <div className="shrink-0">{item.right}</div> : null}
              <div className="shrink-0">{item.action}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppAlertList({
  alerts,
}: {
  alerts: Array<{ text: string; tone?: "warning" | "danger" | "info" }>;
}) {
  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.text}
          className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/70 p-3"
        >
          <TriangleAlert
            className={cn(
              "mt-0.5 h-4 w-4",
              alert.tone === "danger"
                ? "text-rose-500"
                : alert.tone === "warning"
                  ? "text-amber-500"
                  : "text-sky-500"
            )}
          />
          <p className="text-sm text-[var(--text-primary)]">{alert.text}</p>
        </div>
      ))}
    </div>
  );
}

export function AppRecentActivity({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li
          key={item}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-3 text-sm text-[var(--text-secondary)]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function AppStatusBadge({ label }: { label: string }) {
  const normalizedLabel =
    typeof label === "string" && label.trim().length > 0
      ? operationalSeverityLabel(label)
      : operationalSeverityLabel("pending");
  const safeLabel =
    normalizedLabel.trim().length > 0
      ? normalizedLabel
      : operationalSeverityLabel("pending");

  return (
    <BaseAppStatusBadge
      label={safeLabel}
      tone={operationalSeverityTone(label)}
      className="h-6 px-2.5 py-0 text-[10px] font-semibold uppercase tracking-[0.08em]"
    />
  );
}

export function AppPriorityBadge({ label }: { label: string }) {
  return <AppStatusBadge label={normalizePriorityLabel(label)} />;
}

type AppNextActionSeverity = "low" | "medium" | "high" | "critical";

const nextActionTone: Record<
  AppNextActionSeverity,
  { container: string; badge: string }
> = {
  low: {
    container: "border-emerald-500/30 bg-emerald-500/10",
    badge: "text-emerald-300",
  },
  medium: {
    container: "border-amber-500/35 bg-amber-500/10",
    badge: "text-amber-300",
  },
  high: {
    container: "border-orange-500/35 bg-orange-500/10",
    badge: "text-orange-300",
  },
  critical: {
    container: "border-rose-500/40 bg-rose-500/12",
    badge: "text-rose-300",
  },
};

export function AppNextActionCard({
  title,
  description,
  severity,
  action,
  metadata,
  automationStatus,
}: {
  title: string;
  description: string;
  severity: AppNextActionSeverity;
  action: { label: string; onClick: () => void };
  metadata?: string;
  automationStatus?: string;
}) {
  const tone = nextActionTone[severity];

  return (
    <div className={cn("min-w-0 rounded-lg border p-3", tone.container)}>
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.12em]",
          tone.badge
        )}
      >
        {severity.toUpperCase()}
      </p>
      <p
        className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]"
        title={title}
      >
        {title}
      </p>
      <p
        className="mt-1 text-xs leading-5 text-[var(--text-secondary)]"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {description}
      </p>
      {metadata ? (
        <p className="mt-1 truncate text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Origem: {metadata}
        </p>
      ) : null}
      {automationStatus ? (
        <p className="mt-1 truncate text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {automationStatus}
        </p>
      ) : null}
      <Button
        className="mt-2 max-w-full"
        size="sm"
        type="button"
        variant="default"
        onClick={action.onClick}
      >
        <span className="truncate">{action.label}</span>
      </Button>
    </div>
  );
}

export function AppInsightPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-orange-500/25 bg-orange-500/8 p-3 text-sm text-[var(--text-primary)]">
      {children}
    </div>
  );
}

export function AppEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <AppBaseEmptyState title={title} description={description} />;
}

export function AppPageLoadingState({
  title = "Carregando dados",
  description = "Estamos preparando o contexto operacional desta tela.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <AppSectionCard className="space-y-3">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/65">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-secondary)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        {description}
      </p>
      <BaseLoadingState rows={4} />
    </AppSectionCard>
  );
}

export function AppPageErrorState({
  title = "Não foi possível carregar",
  description,
  actionLabel = "Tentar novamente",
  onAction,
}: {
  title?: string;
  description: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <AppSectionCard className="space-y-3">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10">
        <TriangleAlert className="h-4 w-4 text-[var(--danger)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        {description}
      </p>
      <Button variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    </AppSectionCard>
  );
}

export function AppPageEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppSectionCard className="flex flex-col items-center justify-center gap-2.5 p-8 text-center">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/65">
        <Inbox className="h-4 w-4 text-[var(--text-secondary)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        {description}
      </p>
    </AppSectionCard>
  );
}

export const AppAttentionBlock = AppSectionBlock;
export const AppNextBestActionBlock = AppSectionBlock;
export const AppOperationalToolbar = AppFiltersBar;
export const AppActionBar = AppFiltersBar;
export const AppActionRail = AppListBlock;
export const AppContextWorkspace = AppSectionBlock;
export const AppOperationalEmptyState = AppPageEmptyState;
export const AppOperationalLoadingState = AppPageLoadingState;
export const AppOperationalErrorState = AppPageErrorState;

export function AppOperationalKpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function AppOperationalStatusSummary({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; helper?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map(item => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3"
        >
          <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {item.value}
          </p>
          {item.helper ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {item.helper}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AppEmbeddedTimeline({
  items,
  emptyMessage = "Sem eventos para este contexto.",
}: {
  items: Array<{
    id: string;
    type: string;
    summary: string;
    entity?: string;
    actor?: string;
    happenedAt?: string;
    action?: ReactNode;
  }>;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li
          key={item.id}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5"
        >
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {item.type}
          </p>
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {item.summary}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {item.entity ?? "Entidade não informada"} ·{" "}
            {item.actor ?? "Sistema"} · {item.happenedAt ?? "Data indisponível"}
          </p>
          {item.action ? <div className="mt-1.5">{item.action}</div> : null}
        </li>
      ))}
    </ul>
  );
}

export function AppInlineSuccessState({ message }: { message: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--success)]">
      <CircleCheck className="h-3.5 w-3.5" />
      {message}
    </div>
  );
}

export function AppSkeleton({
  className,
  ...props
}: ComponentProps<typeof BaseSkeleton>) {
  return (
    <BaseSkeleton
      className={cn("bg-[var(--surface-elevated)]/70", className)}
      {...props}
    />
  );
}

export { AppPageShell, Input, AppRowActions };
export const AppLoadingState = BaseLoadingState;

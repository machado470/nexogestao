import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  Loader2,
  X } from "lucide-react"; import { Dialog,
  DialogContent,
  DialogTitle } from "@/components/ui/dialog";

type ModalAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  processing?: boolean;
};

type SummaryItem = {
  label: string;
  value: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  status?: string;
  priority?: string;
  summary?: SummaryItem[];
  headerActions?: ReactNode;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  quickActions?: ModalAction[];
  feedback?: ReactNode;
  feedbackTone?: "neutral" | "success" | "error";
  contentLoading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function AppOperationalModal({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  priority,
  summary = [],
  headerActions,
  primaryAction,
  secondaryAction,
  quickActions = [],
  feedback,
  feedbackTone = "neutral",
  contentLoading = false,
  loadingLabel = "Preparando contexto operacional...",
  children,
}: Props) {
  const hasAnyProcessing = Boolean(
    primaryAction?.processing ||
      secondaryAction?.processing ||
      quickActions.some(action => action.processing)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[min(96vw,1280px)] max-w-none flex-col gap-0 overflow-hidden border-[var(--app-overlay-border)] bg-[var(--app-overlay-surface)] p-0 text-[var(--app-overlay-text)] shadow-[var(--app-overlay-shadow)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-1 data-[state=closed]:slide-out-to-bottom-1 data-[state=open]:zoom-in-[0.995] data-[state=closed]:zoom-out-[0.995]"
        onOpenAutoFocus={event => {
          event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--app-overlay-surface)]/95 px-6 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {subtitle}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {status ? (
                  <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {status}
                  </span>
                ) : null}
                {priority ? (
                  <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {priority}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <Button variant="secondary"
                type="button"
                className="h-9 px-3"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-1 h-4 w-4" /> Fechar
              </Button>
            </div>
          </div>
          {summary.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {summary.map(item => (
                <div
                  key={item.label}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </header>

        <div className="nexo-modal-body min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {contentLoading ? (
            <div className="space-y-4">
              <div className="h-3 w-56 animate-pulse rounded bg-[var(--surface-subtle)]" />
              <div className="h-20 animate-pulse rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]" />
              <div className="h-14 animate-pulse rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]" />
              <div className="h-28 animate-pulse rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]" />
              <p className="text-xs text-[var(--text-muted)]">{loadingLabel}</p>
            </div>
          ) : (
            children
          )}
        </div>

        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--border-subtle)] bg-[var(--app-overlay-surface)]/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {primaryAction ? (
                <Button
                  type="button"
                  onClick={primaryAction.onClick}
                  disabled={
                    primaryAction.disabled ||
                    hasAnyProcessing ||
                    primaryAction.processing
                  }
                  className="h-9 min-w-[148px] px-4"
                >
                  {primaryAction.processing ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {primaryAction.label}
                </Button>
              ) : null}
              {secondaryAction ? (
                <Button variant="secondary"
                  type="button"
                  onClick={secondaryAction.onClick}
                  disabled={
                    secondaryAction.disabled ||
                    hasAnyProcessing ||
                    secondaryAction.processing
                  }
                  className="h-9 min-w-[122px] px-4"
                >
                  {secondaryAction.processing ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {secondaryAction.label}
                </Button>
              ) : null}
              {quickActions.map(action => (
                <Button variant="secondary"
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled || hasAnyProcessing || action.processing}
                  className="h-9 px-3 text-xs"
                >
                  {action.processing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {action.label}
                </Button>
              ))}
            </div>
            {feedback ? (
              <div
                className={`rounded-md border px-2.5 py-1.5 text-xs ${
                  feedbackTone === "success"
                    ? "border-[var(--dashboard-success)]/40 bg-[var(--dashboard-success)]/10 text-[var(--dashboard-success)]"
                    : feedbackTone === "error"
                      ? "border-[var(--dashboard-danger)]/40 bg-[var(--dashboard-danger)]/10 text-[var(--dashboard-danger)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                }`}
              >
                {feedback}
              </div>
            ) : null}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

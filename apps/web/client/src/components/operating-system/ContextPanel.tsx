import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  Bot,
  Sparkles,
  User,
  X } from "lucide-react"; import {   Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  } from "@/components/ui/sheet"; import { PrimaryActionButton } from "@/components/operating-system/PrimaryActionButton"; import { Textarea } from "@/components/ui/textarea"; import { cn } from "@/lib/utils"; import { Badge } from "@/components/ui/badge";

type ContextPanelAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type ContextPanelTimelineItem = {
  id: string;
  label: string;
  description?: string;
  source?: "system" | "user";
};

type ContextPanelExplainLayer = {
  reason: string;
  conditions: string[];
  afterAction: string;
  impact?: string;
  riskOfInaction?: string;
  elapsedTime?: string;
  contextualPriority?: string;
};

type ContextPanelWhatsAppPreview = {
  contextLabel: string;
  contextDescription: string;
  message: string;
  editable?: boolean;
  onMessageChange?: (value: string) => void;
};

export function ContextPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  statusLabel,
  summary,
  primaryAction,
  secondaryActions = [],
  timeline = [],
  explainLayer,
  whatsAppPreview,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  summary?: Array<{ label: string; value: string }>;
  primaryAction?: ContextPanelAction;
  secondaryActions?: ContextPanelAction[];
  timeline?: ContextPanelTimelineItem[];
  explainLayer?: ContextPanelExplainLayer;
  whatsAppPreview?: ContextPanelWhatsAppPreview;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl [&>button]:hidden">
        <SheetHeader className="shrink-0 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-left">{title}</SheetTitle>
              {subtitle ? (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {subtitle}
                </p>
              ) : null}
              {statusLabel ? (
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className="border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--bg-surface)_82%,transparent)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                  >
                    Status: {statusLabel}
                  </Badge>
                </div>
              ) : null}
            </div>
            <Button variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4 pb-1">
            {summary?.length ? (
              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Resumo operacional
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {summary.map(item => (
                    <div
                      key={item.label}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {explainLayer ? (
              <section className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Por que agir agora
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {explainLayer.reason}
                </p>
                <div className="flex flex-wrap gap-1">
                  {explainLayer.impact ? (
                    <span className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)]/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      Impacto: {explainLayer.impact}
                    </span>
                  ) : null}
                  {explainLayer.riskOfInaction ? (
                    <span className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)]/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]">
                      Risco: {explainLayer.riskOfInaction}
                    </span>
                  ) : null}
                  {explainLayer.elapsedTime ? (
                    <span className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)]/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      Tempo: {explainLayer.elapsedTime}
                    </span>
                  ) : null}
                  {explainLayer.contextualPriority ? (
                    <span className="rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)]/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      Prioridade: {explainLayer.contextualPriority}
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Condições detectadas
                  </p>
                  <ul className="mt-1 space-y-1">
                    {explainLayer.conditions.map(condition => (
                      <li
                        key={condition}
                        className="text-xs text-[var(--text-primary)]"
                      >
                        • {condition}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold">Depois:</span>{" "}
                  {explainLayer.afterAction}
                </p>
              </section>
            ) : null}

            {whatsAppPreview ? (
              <section className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  WhatsApp no fluxo operacional
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {whatsAppPreview.contextLabel}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {whatsAppPreview.contextDescription}
                </p>
                {whatsAppPreview.editable ? (
                  <Textarea
                    rows={4}
                    value={whatsAppPreview.message}
                    onChange={event =>
                      whatsAppPreview.onMessageChange?.(event.target.value)
                    }
                    className="text-xs"
                  />
                ) : (
                  <div className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-primary)]">
                    {whatsAppPreview.message}
                  </div>
                )}
              </section>
            ) : null}

            {secondaryActions.length > 0 ? (
              <section className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ações rápidas
                </p>
                <div className="flex flex-wrap gap-2">
                  {secondaryActions.map(action => (
                    <Button variant="secondary"
                      key={action.label}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className="h-9 px-3 text-xs"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            {timeline.length > 0 ? (
              <section className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timeline resumida
                </p>
                {timeline.map(item => (
                  <div
                    key={item.id}
                    className="rounded-md border bg-muted/30 p-2"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {item.source ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                            item.source === "system"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                          )}
                        >
                          {item.source === "system" ? (
                            <Bot className="mr-1 h-3 w-3" />
                          ) : (
                            <User className="mr-1 h-3 w-3" />
                          )}
                          {item.source === "system" ? "Sistema" : "Usuário"}
                        </span>
                      ) : null}
                      {item.label}
                    </p>
                    {item.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

            {children}
          </div>
        </div>

        {primaryAction || secondaryActions.length > 0 ? (
          <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-base)] px-5 py-3">
            {primaryAction ? (
              <PrimaryActionButton
                className="w-full"
                label={primaryAction.label}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
              />
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

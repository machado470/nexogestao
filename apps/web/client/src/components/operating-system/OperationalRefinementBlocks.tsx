import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";


type NextActionCardProps = {
  title: string;
  reason: string;
  urgency?: string;
  impact?: string;
};

export function OperationalNextAction({
  title,
  reason,
  urgency,
  impact,
}: NextActionCardProps) {
  return (
    <section className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Próxima melhor ação
      </p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="text-xs text-[var(--text-secondary)]">{reason}</p>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {urgency ? (
          <span className="rounded-full border border-[var(--dashboard-danger)]/35 bg-[var(--dashboard-danger)]/10 px-2 py-0.5 font-medium text-[var(--dashboard-danger)]">
            {urgency}
          </span>
        ) : null}
        {impact ? (
          <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-base)] px-2 py-0.5 text-[var(--text-secondary)]">
            Impacto: {impact}
          </span>
        ) : null}
      </div>
    </section>
  );
}

type FlowStep = {
  label: string;
  state: "done" | "current" | "pending";
};

export function OperationalFlowState({ steps }: { steps: FlowStep[] }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Progresso do fluxo
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-1 text-[11px] ${
                step.state === "done"
                  ? "border-[var(--dashboard-success)]/35 bg-[var(--dashboard-success)]/10 text-[var(--dashboard-success)]"
                  : step.state === "current"
                    ? "border-[var(--accent-primary)]/35 bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "border-[var(--border-soft)] bg-[var(--surface-base)] text-[var(--text-muted)]"
              }`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="text-[10px] text-[var(--text-muted)]">→</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function OperationalRelationSummary({
  title = "Relações",
  items,
}: {
  title?: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5 border-t border-[var(--border-subtle)] pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </p>
      <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function EmptyActionState({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <section className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p>
      <Button variant="secondary" type="button" className="mt-2 h-8 px-3 text-xs" onClick={onCta}>
        {ctaLabel}
      </Button>
    </section>
  );
}

export function OperationalInlineFeedback({
  tone = "neutral",
  nextStep,
  children,
}: {
  tone?: "neutral" | "success" | "error";
  nextStep?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border p-2 text-xs ${
        tone === "success"
          ? "border-[var(--dashboard-success)]/35 bg-[var(--dashboard-success)]/10 text-[var(--dashboard-success)]"
          : tone === "error"
            ? "border-[var(--dashboard-danger)]/35 bg-[var(--dashboard-danger)]/10 text-[var(--dashboard-danger)]"
            : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
      }`}
    >
      <div>{children}</div>
      {nextStep ? (
        <p className="mt-1 text-[11px] opacity-90">Próximo passo: {nextStep}</p>
      ) : null}
    </div>
  );
}

export function OperationalAutomationNote({
  label = "Automação operacional",
  detail,
}: {
  label?: string;
  detail: string;
}) {
  return (
    <section className="rounded-md border border-[var(--accent-primary)]/25 bg-[var(--accent-soft)]/40 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-primary)]">
        {label}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>
    </section>
  );
}

export function explainOperationalError(input: {
  fallback: string;
  cause?: string;
  suggestion?: string;
  tone?: "technical" | "operational";
}) {
  const { fallback, cause, suggestion, tone = "operational" } = input;
  if (!cause && !suggestion) return fallback;
  const prefix =
    tone === "technical"
      ? "Não foi possível concluir por falha técnica."
      : "Não foi possível concluir a ação.";
  return [prefix, cause, suggestion ? `Como resolver: ${suggestion}` : null]
    .filter(Boolean)
    .join(" ");
}

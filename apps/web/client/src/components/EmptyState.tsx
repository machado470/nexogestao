import { Button } from "@/components/ui/button";
import { ReactNode } from 'react';


interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="nexo-surface-operational flex flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="mb-3 inline-flex items-center rounded-full border border-orange-200/70 bg-orange-100/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
        Próxima ação recomendada
      </div>

      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-slate-100 text-slate-500 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
        {icon}
      </div>

      <h3 className="nexo-text-wrap mb-2 text-lg font-semibold text-[var(--text-primary)] dark:text-white">{title}</h3>

      <p className="nexo-text-wrap mb-5 max-w-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]">{description}</p>

      <div className="flex flex-wrap justify-center gap-2.5">
        {action && (
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        )}
        {secondaryAction && (
          <Button onClick={secondaryAction.onClick} variant="outline" size="sm">
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}

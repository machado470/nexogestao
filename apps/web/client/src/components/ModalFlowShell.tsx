import { Button } from "@/components/ui/button";
import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { FormModal } from "@/components/app-modal-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  isSubmitting?: boolean;
  closeBlocked?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  loadingTimeoutMs?: number;
  hasDirtyState?: boolean;
  contentClassName?: string;
};

export default function ModalFlowShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  isSubmitting = false,
  closeBlocked = false,
  isLoading = false,
  hasError = false,
  errorMessage,
  onRetry,
  loadingTimeoutMs = 9000,
  hasDirtyState = false,
  contentClassName,
}: Props) {
  useEffect(() => {
    if (!open || !isSubmitting) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Uma ação crítica está em andamento.";
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isSubmitting, open]);

  return (
    <FormModal
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && (closeBlocked || isSubmitting)) return;
        onOpenChange(nextOpen);
      }}
      title={title}
      description={description}
      size="lg"
      contentClassName={contentClassName}
      closeBlocked={closeBlocked || isSubmitting}
      footer={
        <>
          {footer}
          {hasDirtyState ? (
            <div className="w-full rounded-md border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--surface-elevated))] px-3 py-2 text-xs text-[var(--text-secondary)]">
              Alterações não salvas detectadas.
            </div>
          ) : null}
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]">
          <p className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            Carregando dados do fluxo...
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Se ultrapassar {Math.ceil(loadingTimeoutMs / 1000)}s, use retry para
            evitar estado morto.
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : hasError ? (
        <div className="space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_36%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface-elevated))] p-4 text-sm text-[var(--text-secondary)]">
          <p className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
            {errorMessage || "Não foi possível carregar este fluxo."}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </FormModal>
  );
}

import { Button } from "@/components/ui/button";

import { AlertCircle, Loader2 } from "lucide-react";
import { BaseModal } from "@/components/app-modal-system";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemName?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  title,
  message,
  itemName,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => (!open ? onCancel() : null)}
      size="sm"
      closeBlocked={isLoading}
      title={
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--color-danger)]" />
          <span>{title}</span>
        </div>
      }
      fixedHeader={false}
      fixedFooter={false}
      footer={
        <>
          <Button onClick={onCancel} disabled={isLoading} variant="outline">
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isLoading} variant="danger">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deletando...
              </>
            ) : (
              "Deletar"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[var(--text-secondary)]">{message}</p>
        {itemName ? (
          <div className="rounded-lg bg-[var(--surface-base)] p-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {itemName}
            </p>
          </div>
        ) : null}
        <p className="text-sm text-[var(--text-muted)]">
          Esta ação não pode ser desfeita.
        </p>
      </div>
    </BaseModal>
  );
}

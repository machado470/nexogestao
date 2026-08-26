import { Button } from "@/components/ui/button";
import type { ReactNode, RefObject } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const modalSizeMap = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
  full: "sm:max-w-[96vw]",
} as const;

export type ModalIntent = "create" | "edit" | "confirm" | "detail-legacy";

export function BaseModal({
  open,
  onOpenChange,
  size = "md",
  title,
  description,
  children,
  footer,
  closeBlocked = false,
  fixedHeader = true,
  fixedFooter = true,
  initialFocusRef,
  intent = "edit",
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: keyof typeof modalSizeMap;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeBlocked?: boolean;
  fixedHeader?: boolean;
  fixedFooter?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  intent?: ModalIntent;
  contentClassName?: string;
}) {
  if (import.meta.env.DEV && intent === "detail-legacy") {
    // eslint-disable-next-line no-console
    console.warn(
      "[modal] detail-legacy detectado. Priorizar migração gradual para workspace contextual."
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && closeBlocked) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (closeBlocked) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (closeBlocked) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          if (!initialFocusRef?.current) return;
          event.preventDefault();
          initialFocusRef.current.focus();
        }}
        className={cn(
          "flex max-h-[90vh] min-h-[220px] flex-col overflow-hidden rounded-2xl border-[var(--modal-section-border)] bg-[var(--modal-bg)] p-0 text-[var(--modal-section-text)] shadow-[var(--app-overlay-shadow)]",
          modalSizeMap[size],
          contentClassName
        )}
      >
        <ModalHeader fixed={fixedHeader}>
          <DialogTitle className="text-lg font-semibold text-[var(--modal-section-text)]">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-sm text-[var(--modal-section-muted)]">
              {description}
            </DialogDescription>
          ) : null}
        </ModalHeader>

        <ModalBody>{children}</ModalBody>

        {footer ? (
          <ModalFooter fixed={fixedFooter}>{footer}</ModalFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ModalHeader({
  children,
  fixed = true,
}: {
  children: ReactNode;
  fixed?: boolean;
}) {
  return (
    <DialogHeader
      className={cn(
        "border-b border-[var(--modal-section-border)] bg-[var(--modal-header-bg)] px-6 py-5",
        fixed ? "shrink-0" : ""
      )}
    >
      {children}
    </DialogHeader>
  );
}

export function ModalBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-scrollbar="nexo"
      className={cn(
        "nexo-modal-body min-h-0 flex-1 overflow-y-auto bg-[var(--modal-body-bg)] px-6 py-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ModalFooter({
  children,
  fixed = true,
}: {
  children: ReactNode;
  fixed?: boolean;
}) {
  return (
    <DialogFooter
      className={cn(
        "border-t border-[var(--modal-section-border)] bg-[var(--modal-footer-bg)] px-6 py-4",
        fixed ? "shrink-0" : ""
      )}
    >
      {children}
    </DialogFooter>
  );
}

export function BaseOperationalModal(
  props: Omit<
    Parameters<typeof BaseModal>[0],
    "fixedHeader" | "fixedFooter" | "intent"
  >
) {
  return <BaseModal {...props} fixedHeader fixedFooter intent="edit" />;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      intent="confirm"
      title={title}
      description={description}
      closeBlocked={isPending}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-[var(--modal-section-muted)]">
        Esta ação é auditada e pode impactar o fluxo operacional.
      </div>
    </BaseModal>
  );
}

export function QuickActionModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeBlocked = false,
  initialFocusRef,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  size?: keyof typeof modalSizeMap;
  closeBlocked?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  contentClassName?: string;
}) {
  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      intent="edit"
      title={title}
      description={description}
      size={size}
      closeBlocked={closeBlocked}
      initialFocusRef={initialFocusRef}
      footer={footer}
      contentClassName={contentClassName}
    >
      <div className="space-y-4">{children}</div>
    </BaseModal>
  );
}

export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "lg",
  closeBlocked = false,
  initialFocusRef,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  size?: keyof typeof modalSizeMap;
  closeBlocked?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  contentClassName?: string;
}) {
  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      intent="edit"
      title={title}
      description={description}
      size={size}
      closeBlocked={closeBlocked}
      footer={footer}
      initialFocusRef={initialFocusRef}
      contentClassName={contentClassName}
    >
      {children}
    </BaseModal>
  );
}

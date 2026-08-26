import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

type ActionFeedbackState = "idle" | "loading" | "success" | "error";

type ActionFeedbackButtonProps = {
  state: ActionFeedbackState;
  idleLabel: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  onClick: () => void;
  onRetry?: () => void;
  icon?: ReactNode;
  variant?: "default" | "outline" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
};

export function ActionFeedbackButton({
  state,
  idleLabel,
  loadingLabel = "Processando...",
  successLabel = "Concluído",
  errorLabel = "Falhou",
  onClick,
  onRetry,
  icon,
  variant = "default",
  size = "sm",
  className,
  disabled = false,
}: ActionFeedbackButtonProps) {
  if (state === "error" && onRetry) {
    return (
      <Button type="button" variant="outline" size={size} className="gap-2" onClick={onRetry}>
        <RotateCcw className="h-4 w-4" />
        {errorLabel} • Tentar novamente
      </Button>
    );
  }

  const label =
    state === "loading"
      ? loadingLabel
      : state === "success"
        ? successLabel
        : state === "error"
          ? errorLabel
          : idleLabel;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      aria-busy={state === "loading"}
      disabled={state === "loading" || disabled}
      className={cn("gap-2", className)}
    >
      {icon}
      {label}
    </Button>
  );
}

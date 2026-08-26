import { Button } from "@/components/ui/button";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";


type OperationalStateProps = {
  type: "loading" | "empty" | "error";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function OperationalState({
  type,
  title,
  description,
  actionLabel,
  onAction,
}: OperationalStateProps) {
  const Icon = type === "loading" ? Loader2 : type === "error" ? AlertTriangle : Inbox;

  return (
    <div className="nexo-surface-operational m-4 flex min-h-[180px] flex-col items-center justify-center gap-3 px-5 py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-contrast)]">
        <Icon className={`h-5 w-5 text-[var(--text-secondary)] ${type === "loading" ? "animate-spin" : ""}`} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button type="button" variant={type === "error" ? "default" : "outline"} size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

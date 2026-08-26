import { Button } from "@/components/design-system";
import { Pencil, AlertCircle, MessageCircle, Eye } from "lucide-react";

import type { ServiceOrder, StageTone } from "./service-order.types";

import {
  normalizeStatus,
  buildWhatsAppUrlFromServiceOrder,
} from "@/lib/operations/operations.utils";

import { getServiceOrderNextAction } from "@/lib/operations/operations.selectors";
import { AppStatusBadge } from "@/components/app-system";
import { mapFinanceStatus, mapServiceOrderStatus } from "@/lib/status-badge";

interface Props {
  os: ServiceOrder;
  isProcessing: boolean;
  chargeBadge: { label: string; className: string };

  operationalStage: StageTone;
  financialStage: StageTone;

  onEdit: (id: string) => void;
  onOpenDeepLink: (id: string) => void;
  onOpenWhatsApp?: (url: string) => void;

  isUpdating: boolean;
}

function formatTimeAgo(date?: string | Date | null) {
  if (!date) return "sem atividade";

  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);

  if (h < 1) return "agora";
  if (h < 24) return `há ${h}h`;

  return `${Math.floor(h / 24)}d`;
}

function normalizeFinanceBadgeLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "pago") return "PAID";
  if (normalized === "pendente") return "PENDING";
  if (normalized === "vencido") return "OVERDUE";
  if (normalized === "cancelado") return "CANCELED";
  return "NONE";
}

function getCardToneClass(tone: string) {
  if (tone === "red") return "border-red-500 ring-2 ring-red-200";
  if (tone === "amber") return "border-amber-400";
  if (tone === "blue") return "border-orange-400";
  if (tone === "green") return "border-green-400";
  return "";
}

export default function ServiceOrderCard({
  os,
  isProcessing,
  chargeBadge,
  operationalStage,
  financialStage,
  onEdit,
  onOpenDeepLink,
  onOpenWhatsApp,
  isUpdating,
}: Props) {
  const status = normalizeStatus(os.status);

  const lastActivityAt =
    os.updatedAt || os.finishedAt || os.startedAt || os.createdAt;

  const timeAgo = formatTimeAgo(lastActivityAt);
  const nextAction = getServiceOrderNextAction(os);
  const disabled = isProcessing || isUpdating;

  const whatsappUrl = buildWhatsAppUrlFromServiceOrder(os);

  return (
    <div
      onClick={() => onOpenDeepLink(os.id)}
      className={`cursor-pointer rounded-xl border p-4 transition hover:bg-gray-50 ${getCardToneClass(
        nextAction.tone
      )}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{os.title}</h3>

          <AppStatusBadge {...mapServiceOrderStatus(status)} />

          <AppStatusBadge
            {...mapFinanceStatus(normalizeFinanceBadgeLabel(chargeBadge.label))}
            label={chargeBadge.label}
          />

          <span className="text-xs text-gray-400">{timeAgo}</span>

          {nextAction.tone === "red" && (
            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
              <AlertCircle className="h-3 w-3" />
              Ação urgente
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded border px-2 py-1 text-xs ${operationalStage.className}`}
          >
            {operationalStage.label}
          </span>

          <span
            className={`rounded border px-2 py-1 text-xs ${financialStage.className}`}
          >
            {financialStage.label}
          </span>
        </div>

        <div className="rounded-lg border bg-gray-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">
            Próxima ação
          </div>
          <div className="text-sm font-medium text-gray-800">
            {nextAction.title}
          </div>
          <div className="text-xs text-gray-600">{nextAction.description}</div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              onOpenDeepLink(os.id);
            }}
            disabled={disabled}
          >
            <Eye className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              if (whatsappUrl && onOpenWhatsApp) {
                onOpenWhatsApp(whatsappUrl);
              }
            }}
            disabled={disabled || !whatsappUrl || !onOpenWhatsApp}
          >
            <MessageCircle className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            onClick={e => {
              e.stopPropagation();
              onEdit(os.id);
            }}
            disabled={disabled}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

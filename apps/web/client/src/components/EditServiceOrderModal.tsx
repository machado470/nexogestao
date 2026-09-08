import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ClipboardList,
  CalendarDays,
  Wallet,
  AlertCircle,
  Flag,
  User,
  FileText,
  Ban,
} from "lucide-react";
import { serviceOrderEditSchema } from "@/lib/validations";
import { useLocation } from "wouter";
import { buildServiceOrdersDeepLink } from "@/lib/operations/operations.utils";
import { useCriticalActionGuard } from "@/hooks/useCriticalActionGuard";
import { invalidateOperationalGraph } from "@/lib/operationalConsistency";
import { PersonAssignmentWarning } from "@/components/PersonAssignmentWarning";
import { useAssigneeWarningTelemetry } from "@/hooks/useAssigneeWarningTelemetry";
import {
  getConcurrencyErrorMessage,
  isConcurrentConflictError,
} from "@/lib/concurrency";

type ServiceOrderStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELED";

interface EditServiceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceOrderId: string | null;
  people: Array<{ id: string; name: string }>;
}

type ServiceOrderDetails = {
  title?: string | null;
  description?: string | null;
  priority?: number | null;
  scheduledFor?: string | null;
  assignedToPersonId?: string | null;
  amountCents?: number | null;
  dueDate?: string | null;
  status?: ServiceOrderStatus | null;
  cancellationReason?: string | null;
  outcomeSummary?: string | null;
  updatedAt?: string | null;
  customer?: { name?: string | null } | null;
  customerName?: string | null;
  clientName?: string | null;
  client?: { name?: string | null } | null;
  assignedTo?: { name?: string | null } | null;
  financialSummary?: { hasCharge?: boolean | null } | null;
};

function getServiceOrderCustomerName(serviceOrder: ServiceOrderDetails | null) {
  return (
    serviceOrder?.customer?.name ??
    serviceOrder?.customerName ??
    serviceOrder?.clientName ??
    serviceOrder?.client?.name ??
    "Cliente não identificado"
  );
}

function normalizeServiceOrderPayload(payload: unknown): ServiceOrderDetails | null {
  const raw = (payload as { data?: unknown } | null | undefined)?.data ?? payload;
  if (!raw || typeof raw !== "object") return null;
  return raw as ServiceOrderDetails;
}

function parseAmountToCents(raw: string): number | undefined {
  const normalized = raw.replace(",", ".").trim();

  if (!normalized) return undefined;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value * 100);
}

function formatCurrencyFromInput(raw: string) {
  const cents = parseAmountToCents(raw);
  if (!cents) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDateTimePreview(value: string) {
  if (!value) return "Não definido";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "OPEN":
      return "Aberta";
    case "ASSIGNED":
      return "Atribuída";
    case "IN_PROGRESS":
      return "Em andamento";
    case "DONE":
      return "Concluída";
    case "CANCELED":
      return "Cancelada";
    default:
      return status || "—";
  }
}

function getStatusBadgeClass(status?: string) {
  switch (status) {
    case "OPEN":
      return "bg-orange-500/12 text-orange-700 dark:text-orange-200";
    case "ASSIGNED":
      return "bg-amber-500/14 text-amber-700 dark:text-amber-200";
    case "IN_PROGRESS":
      return "bg-orange-500/16 text-orange-700 dark:text-orange-200";
    case "DONE":
      return "bg-emerald-500/14 text-emerald-700 dark:text-emerald-200";
    case "CANCELED":
      return "bg-[var(--summary-bg)] text-[var(--summary-muted)]";
    default:
      return "bg-[var(--summary-bg)] text-[var(--summary-muted)]";
  }
}

function getPriorityLabel(priority?: number | string | null) {
  switch (Number(priority ?? 2)) {
    case 1:
      return "Muito baixa";
    case 2:
      return "Baixa";
    case 3:
      return "Média";
    case 4:
      return "Alta";
    case 5:
      return "Urgente";
    default:
      return "Baixa";
  }
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--modal-section-text)]">
          {title}
        </h3>
        <p className="text-xs text-[var(--modal-section-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

export default function EditServiceOrderModal({
  isOpen,
  onClose,
  onSuccess,
  serviceOrderId,
  people,
}: EditServiceOrderModalProps) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const assigneeWarningTelemetry = useAssigneeWarningTelemetry("SERVICE_ORDER");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "2",
    scheduledFor: "",
    assignedToPersonId: "",
    amount: "",
    dueDate: "",
    status: "OPEN" as ServiceOrderStatus,
    cancellationReason: "",
    outcomeSummary: "",
  });
  const [initialSnapshot, setInitialSnapshot] = useState("");

  const getServiceOrder = trpc.serviceOrders.getById.useQuery(
    { id: serviceOrderId || "" },
    {
      enabled: isOpen && !!serviceOrderId,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const updateServiceOrder = trpc.serviceOrders.update.useMutation();
  useCriticalActionGuard({
    isPending: updateServiceOrder.isPending,
    reason: "Atualizando O.S. com sincronização global.",
  });
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isOpen) assigneeWarningTelemetry.reset();
  }, [assigneeWarningTelemetry.reset, isOpen]);

  useEffect(() => {
    if (!getServiceOrder.data) return;

    const serviceOrder = normalizeServiceOrderPayload(getServiceOrder.data);
    if (!serviceOrder?.status) return;

    const nextData = {
      title: serviceOrder?.title || "",
      description: serviceOrder?.description || "",
      priority: String(serviceOrder?.priority ?? 2),
      scheduledFor: serviceOrder?.scheduledFor
        ? new Date(serviceOrder.scheduledFor).toISOString().slice(0, 16)
        : "",
      assignedToPersonId: serviceOrder?.assignedToPersonId || "",
      amount:
        typeof serviceOrder?.amountCents === "number" &&
        Number.isFinite(serviceOrder.amountCents) &&
        serviceOrder.amountCents >= 0
          ? (serviceOrder.amountCents / 100).toFixed(2)
          : "",
      dueDate: serviceOrder?.dueDate
        ? new Date(serviceOrder.dueDate).toISOString().slice(0, 16)
        : "",
      status: serviceOrder.status,
      cancellationReason: serviceOrder?.cancellationReason || "",
      outcomeSummary: serviceOrder?.outcomeSummary || "",
    };
    setFormData(nextData);
    setInitialSnapshot(JSON.stringify(nextData));
  }, [getServiceOrder.data]);

  useEffect(() => {
    if (!isOpen || !getServiceOrder.isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setLoadingTimedOut(true), 9000);
    return () => window.clearTimeout(timeoutId);
  }, [getServiceOrder.isLoading, isOpen]);

  const selectedPersonName = useMemo(() => {
    if (!formData.assignedToPersonId) return "Ainda não atribuído";

    return (
      people.find((person) => person.id === formData.assignedToPersonId)?.name ??
      "Responsável não encontrado"
    );
  }, [people, formData.assignedToPersonId]);

  const canAssignOrStart = Boolean(formData.assignedToPersonId);

  const statusOptions = useMemo(() => {
    const current = formData.status;

    const base: Array<{ value: ServiceOrderStatus; label: string; disabled?: boolean }> =
      [{ value: current, label: getStatusLabel(current) }];

    if (current === "OPEN") {
      base.push(
        { value: "ASSIGNED", label: "Atribuída", disabled: !canAssignOrStart },
        { value: "CANCELED", label: "Cancelada" }
      );
    }

    if (current === "ASSIGNED") {
      base.push(
        { value: "IN_PROGRESS", label: "Em andamento", disabled: !canAssignOrStart },
        { value: "CANCELED", label: "Cancelada" }
      );
    }

    if (current === "IN_PROGRESS") {
      base.push(
        { value: "DONE", label: "Concluída" },
        { value: "CANCELED", label: "Cancelada" }
      );
    }

    if (current === "DONE" || current === "CANCELED") {
      return [{ value: current, label: getStatusLabel(current) }];
    }

    return base;
  }, [canAssignOrStart, formData.status]);

  const isPersistedClosed =
    formData.status === "DONE" || formData.status === "CANCELED";
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return initialSnapshot !== JSON.stringify(formData);
  }, [formData, initialSnapshot]);

  const shouldShowCancellationReason = formData.status === "CANCELED";
  const shouldShowOutcomeSummary = formData.status === "DONE";

  const transitionHint = useMemo(() => {
    if (formData.status === "DONE") {
      return "Ao concluir, a O.S. exige um resumo final e pode seguir para cobrança automaticamente.";
    }

    if (formData.status === "CANCELED") {
      return "Ao cancelar, a O.S. exige um motivo claro para manter rastreabilidade operacional.";
    }

    if (formData.status === "IN_PROGRESS") {
      return "Esta O.S. está em execução. O próximo passo válido é concluir ou cancelar.";
    }

    if (formData.status === "ASSIGNED") {
      return "Esta O.S. já está atribuída. O próximo passo válido é iniciar a execução ou cancelar.";
    }

    return "O fluxo operacional segue a sequência: aberta → atribuída → em andamento → concluída.";
  }, [formData.status]);

  const submitUpdate = async () => {
    if (!serviceOrderId) return;

    const priority = Number(formData.priority);
    if (!Number.isFinite(priority)) {
      toast.error("Prioridade inválida.");
      return;
    }

    const amountCents = parseAmountToCents(formData.amount);

    if (formData.amount.trim() && amountCents === undefined) {
      toast.error("Valor inválido.");
      return;
    }

    const parsed = serviceOrderEditSchema.safeParse({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      priority,
      scheduledFor: formData.scheduledFor.trim() || "",
      status: formData.status,
      assignedToPersonId: formData.assignedToPersonId.trim() || "",
      amountCents,
      dueDate: formData.dueDate.trim() || "",
      cancellationReason: formData.cancellationReason.trim() || "",
      outcomeSummary: formData.outcomeSummary.trim() || "",
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Dados inválidos";
      toast.error(firstError);
      return;
    }

    try {
      assigneeWarningTelemetry.trackConfirmed(parsed.data.assignedToPersonId, serviceOrderId);

      const updated = await updateServiceOrder.mutateAsync({
        id: serviceOrderId,
        title: parsed.data.title,
        description: parsed.data.description || undefined,
        priority: parsed.data.priority,
        scheduledFor: parsed.data.scheduledFor || undefined,
        status: parsed.data.status,
        assignedToPersonId: parsed.data.assignedToPersonId
          ? parsed.data.assignedToPersonId
          : null,
        amountCents: parsed.data.amountCents,
        dueDate: parsed.data.dueDate || undefined,
        cancellationReason:
          parsed.data.status === "CANCELED"
            ? parsed.data.cancellationReason || undefined
            : undefined,
        outcomeSummary:
          parsed.data.status === "DONE"
            ? parsed.data.outcomeSummary || undefined
            : undefined,
        expectedUpdatedAt:
          typeof serviceOrder?.updatedAt === "string"
            ? serviceOrder.updatedAt
            : undefined,
      });
      const resolvedCustomerId =
        String((updated as any)?.customerId ?? (serviceOrder as any)?.customerId ?? "").trim() ||
        String((serviceOrder as any)?.customer?.id ?? "").trim();
      await invalidateOperationalGraph(utils, resolvedCustomerId, serviceOrderId);
      await utils.dashboard.alerts.invalidate();
      toast.success(`O.S. atualizada: ${parsed.data.title}`, {
        action: {
          label: "Ver O.S.",
          onClick: () => navigate(buildServiceOrdersDeepLink(serviceOrderId)),
        },
      });
      onSuccess();
      onClose();
    } catch (error) {
      if (isConcurrentConflictError(error)) {
        toast.error(getConcurrencyErrorMessage("ordem de serviço"), {
          action: {
            label: "Recarregar",
            onClick: () => void getServiceOrder.refetch(),
          },
        });
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao atualizar ordem de serviço";
      toast.error(message);
    }
  };

  const serviceOrder = normalizeServiceOrderPayload(getServiceOrder.data);
  const persistedStatus = serviceOrder?.status as ServiceOrderStatus | undefined;
  const isPersistedDone = persistedStatus === "DONE";
  const isPersistedCanceled = persistedStatus === "CANCELED";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !updateServiceOrder.isPending) {
          if (isDirty && !window.confirm("Existem alterações não salvas. Deseja descartar?")) {
            return;
          }
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (updateServiceOrder.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (updateServiceOrder.isPending) event.preventDefault();
        }}
        className="w-full max-w-[820px] max-h-[90vh] flex flex-col overflow-hidden border border-[var(--modal-section-border)] bg-[var(--modal-bg)] p-0 shadow-[var(--app-overlay-shadow)]"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--border-subtle)] px-6 py-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle className="text-lg font-semibold text-[var(--modal-section-text)]">
                O.S. #{serviceOrderId ?? "—"}
              </DialogTitle>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(formData.status)}`}>
                {getStatusLabel(formData.status)}
              </span>
            </div>
            <DialogDescription className="text-sm text-[var(--modal-section-muted)]">
              {getServiceOrderCustomerName(serviceOrder)} · {formData.amount.trim() ? formatCurrencyFromInput(formData.amount) : "Sem valor"}
            </DialogDescription>
          </div>
        </DialogHeader>
        {getServiceOrder.isLoading ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-5">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            <p className="text-sm text-[var(--modal-section-muted)]">
              Carregando dados da ordem de serviço...
            </p>
            {loadingTimedOut ? (
              <Button type="button" variant="outline" onClick={() => void getServiceOrder.refetch()}>
                Recarregar dados
              </Button>
            ) : null}
          </div>
        ) : getServiceOrder.error ? (
          <div className="m-6 space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--modal-section-bg))] p-5 text-sm text-[var(--danger)]">
            <p>Não foi possível carregar os dados da ordem de serviço.</p>
            <Button type="button" variant="outline" onClick={() => void getServiceOrder.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
        <div className="nexo-modal-body min-h-0 flex-1 overflow-y-auto bg-[var(--modal-body-bg)] px-6 py-5">
          <div className="space-y-5">
            {formData.status === "DONE" ? (
              <Button
                onClick={() => void submitUpdate()}
                disabled={updateServiceOrder.isPending || getServiceOrder.isLoading || !isDirty}
                className="w-full bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
                type="button"
              >
                {updateServiceOrder.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Concluindo...
                  </span>
                ) : (
                  "Concluir O.S."
                )}
              </Button>
            ) : null}

            <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
              <SectionTitle
                icon={ClipboardList}
                title="Contexto atual"
                subtitle="Leitura rápida da ordem antes de editar."
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Cliente
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {getServiceOrderCustomerName(serviceOrder)}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Status atual
                  </p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                        serviceOrder?.status ?? undefined
                      )}`}
                    >
                      {getStatusLabel(serviceOrder?.status ?? undefined)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Responsável atual
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {serviceOrder?.assignedTo?.name || "Ainda não atribuído"}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Cobrança
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {serviceOrder?.financialSummary?.hasCharge
                      ? "Já vinculada"
                      : "Ainda sem cobrança"}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Motivo de cancelamento
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {serviceOrder?.cancellationReason || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Resumo final
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {serviceOrder?.outcomeSummary || "—"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
              <SectionTitle
                icon={ClipboardList}
                title="Dados operacionais"
                subtitle="Atualize o que muda no serviço sem sair da tela principal."
              />

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--modal-section-text)]">
                    Título *
                  </label>
                  <input
                    className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((state) => ({ ...state, title: e.target.value }))
                    }
                    disabled={updateServiceOrder.isPending || isPersistedClosed}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--modal-section-text)]">
                    Descrição
                  </label>
                  <textarea
                    className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                    rows={4}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((state) => ({
                        ...state,
                        description: e.target.value,
                      }))
                    }
                    disabled={updateServiceOrder.isPending || isPersistedClosed}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--modal-section-text)]">
                      <Flag className="h-4 w-4 text-gray-500" />
                      Prioridade
                    </label>
                    <select
                      className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData((state) => ({
                          ...state,
                          priority: e.target.value,
                        }))
                      }
                      disabled={updateServiceOrder.isPending || isPersistedClosed}
                    >
                      <option value="1">Muito baixa</option>
                      <option value="2">Baixa</option>
                      <option value="3">Média</option>
                      <option value="4">Alta</option>
                      <option value="5">Urgente</option>
                    </select>
                    <p className="mt-1 text-xs text-[var(--modal-section-muted)]">
                      Prioridade atual: {getPriorityLabel(formData.priority)}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--modal-section-text)]">
                      <CalendarDays className="h-4 w-4 text-gray-500" />
                      Agendada para
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                      value={formData.scheduledFor}
                      onChange={(e) =>
                        setFormData((state) => ({
                          ...state,
                          scheduledFor: e.target.value,
                        }))
                      }
                      disabled={updateServiceOrder.isPending || isPersistedClosed}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--modal-section-text)]">
                    <User className="h-4 w-4 text-gray-500" />
                    Responsável
                  </label>
                  <select
                    value={formData.assignedToPersonId}
                    onChange={(e) => {
                      const nextAssignedToPersonId = e.target.value;
                      setFormData((state) => {
                        const nextState = {
                          ...state,
                          assignedToPersonId: nextAssignedToPersonId,
                        };

                        if (
                          !nextAssignedToPersonId &&
                          (state.status === "ASSIGNED" || state.status === "IN_PROGRESS")
                        ) {
                          nextState.status = "OPEN";
                        }

                        return nextState;
                      });
                    }}
                    className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2.5 text-[var(--modal-section-text)] focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={updateServiceOrder.isPending || isPersistedClosed}
                  >
                    <option value="">Remover responsável</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--modal-section-muted)]">
                    Responsável final: {selectedPersonName}
                  </p>
                  <div className="mt-2">
                    <PersonAssignmentWarning
                      personId={formData.assignedToPersonId}
                      onWarningShown={assigneeWarningTelemetry.trackShown}
                    />
                  </div>
                </div>

                {!canAssignOrStart && !isPersistedClosed ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                    Defina um responsável antes de usar os status Atribuída ou Em andamento.
                  </div>
                ) : null}

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--modal-section-text)]">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData((state) => ({
                        ...state,
                        status: e.target.value as ServiceOrderStatus,
                        cancellationReason:
                          e.target.value === "CANCELED" ? state.cancellationReason : "",
                        outcomeSummary:
                          e.target.value === "DONE" ? state.outcomeSummary : "",
                      }))
                    }
                    className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2.5 text-[var(--modal-section-text)] focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      updateServiceOrder.isPending || isPersistedDone || isPersistedCanceled
                    }
                  >
                    {statusOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={Boolean(option.disabled)}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-[var(--modal-section-muted)]">
                    {transitionHint}
                  </p>
                </div>
              </div>
            </section>

            {shouldShowCancellationReason ? (
              <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
                <SectionTitle
                  icon={Ban}
                  title="Motivo do cancelamento"
                  subtitle="Explique por que a O.S. foi encerrada sem continuidade."
                />

                <textarea
                  className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                  rows={4}
                  value={formData.cancellationReason}
                  onChange={(e) =>
                    setFormData((state) => ({
                      ...state,
                      cancellationReason: e.target.value,
                    }))
                  }
                  disabled={updateServiceOrder.isPending || isPersistedCanceled}
                  placeholder="Ex: Cliente adiou sem nova data, acesso ao local indisponível, escopo cancelado..."
                />
                <p className="mt-1 text-xs text-[var(--modal-section-muted)]">
                  Esse motivo fica registrado para auditoria e rastreabilidade.
                </p>
              </section>
            ) : null}

            {shouldShowOutcomeSummary ? (
              <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
                <SectionTitle
                  icon={FileText}
                  title="Resumo final da execução"
                  subtitle="Registre o resultado operacional da O.S. concluída."
                />

                <textarea
                  className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40"
                  rows={5}
                  value={formData.outcomeSummary}
                  onChange={(e) =>
                    setFormData((state) => ({
                      ...state,
                      outcomeSummary: e.target.value,
                    }))
                  }
                  disabled={updateServiceOrder.isPending || isPersistedDone}
                  placeholder="Ex: Serviço concluído com sucesso, limpeza finalizada, itens revisados, cliente orientado sobre próximos passos..."
                />
                <p className="mt-1 text-xs text-[var(--modal-section-muted)]">
                  Esse resumo ajuda a fechar a operação com contexto real.
                </p>
              </section>
            ) : null}

            <details className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
              <summary className="cursor-pointer list-none">
                <SectionTitle
                  icon={Wallet}
                  title="Financeiro"
                  subtitle="Mantenha valor e vencimento alinhados para o fechamento com cobrança."
                />
              </summary>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--modal-section-text)]">
                    Valor (R$)
                  </label>
                  <input inputMode="decimal" className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40" value={formData.amount} onChange={(e) => setFormData((state) => ({ ...state, amount: e.target.value }))} disabled={updateServiceOrder.isPending || isPersistedClosed} />
                  <p className="mt-1 text-xs text-[var(--modal-section-muted)]">Valor atual: {formatCurrencyFromInput(formData.amount)}</p>
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--modal-section-text)]">
                    <CalendarDays className="h-4 w-4 text-gray-500" />
                    Vencimento
                  </label>
                  <input type="datetime-local" className="w-full rounded-lg nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] p-2.5 text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-text)]/40 focus:border-orange-500/40 focus:outline-none focus:ring-1 focus:ring-orange-500/40 hover:border-[var(--accent-primary)]/40" value={formData.dueDate} onChange={(e) => setFormData((state) => ({ ...state, dueDate: e.target.value }))} disabled={updateServiceOrder.isPending || isPersistedClosed} />
                </div>
              </div>
            </details>

            <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold text-[var(--modal-section-text)]">
                  Resumo antes de salvar
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Status final
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {getStatusLabel(formData.status)}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Responsável final
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {selectedPersonName}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Prioridade
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {getPriorityLabel(formData.priority)}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Agendamento previsto
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {formatDateTimePreview(formData.scheduledFor)}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Base financeira
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {formData.amount.trim()
                      ? formatCurrencyFromInput(formData.amount)
                      : "Ainda sem valor"}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--modal-section-muted)]">
                    Fechamento operacional
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--modal-section-text)]">
                    {formData.status === "CANCELED"
                      ? formData.cancellationReason.trim() || "Motivo pendente"
                      : formData.status === "DONE"
                        ? formData.outcomeSummary.trim() || "Resumo pendente"
                        : "Ainda em fluxo"}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
        )}
        <DialogFooter className="shrink-0 gap-3 border-t border-[var(--modal-section-border)] bg-[var(--modal-footer-bg)] px-6 py-4 sm:justify-between">
          <div className="mr-auto flex flex-wrap gap-6 text-sm text-[var(--modal-section-muted)]">
            <span>Status: <strong className="text-[var(--modal-section-text)]">{getStatusLabel(formData.status)}</strong></span>
            <span>Valor: <strong className="text-[var(--modal-section-text)]">{formData.amount.trim() ? formatCurrencyFromInput(formData.amount) : "—"}</strong></span>
          </div>
          <Button
            onClick={() => {
              if (isDirty && !window.confirm("Existem alterações não salvas. Deseja descartar?")) {
                return;
              }
              onClose();
            }}
            variant="outline"
            type="button"
            disabled={updateServiceOrder.isPending || getServiceOrder.isLoading}
          >
            Cancelar
          </Button>
          {serviceOrderId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                navigate(buildServiceOrdersDeepLink(serviceOrderId));
                onClose();
              }}
              disabled={updateServiceOrder.isPending || getServiceOrder.isLoading}
            >
              Ver O.S.
            </Button>
          ) : null}
          <Button
            onClick={() => void submitUpdate()}
            disabled={updateServiceOrder.isPending || getServiceOrder.isLoading || !isDirty}
            className="bg-orange-500 text-[var(--modal-section-text)] hover:bg-orange-600"
            type="button"
          >
            {updateServiceOrder.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </span>
            ) : (
              "Salvar alterações"
            )}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

import { Loader2 } from "lucide-react";
import { serviceOrderSchema } from "@/lib/validations";
import { registerActionFlowEvent } from "@/lib/actionFlow";
import { useLocation } from "wouter";
import { buildServiceOrdersDeepLink } from "@/lib/operations/operations.utils";
import { useCriticalActionGuard } from "@/hooks/useCriticalActionGuard";
import { invalidateOperationalGraph } from "@/lib/operationalConsistency";
import { PersonAssignmentWarning } from "@/components/PersonAssignmentWarning";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useAssigneeWarningTelemetry } from "@/hooks/useAssigneeWarningTelemetry";
import { notify } from "@/stores/notificationStore";
import { FormModal } from "@/components/app-modal-system";
import {
  AppField,
  AppFieldGroup,
  AppForm,
  AppInlineHint,
  AppInput,
  AppSectionCard,
  AppSelect,
  AppTextarea,
} from "@/components/app-system";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Props = {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onCreated?: (created?: { id: string; customerId: string }) => void;
  onSuccess?: () => void;
  customers: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  initialCustomerId?: string | null;
  appointmentId?: string | null;
};

type FormState = {
  customerId: string;
  assignedToPersonId: string;
  title: string;
  description: string;
  priority: string;
  scheduledFor: string;
  amount: string;
  dueDate: string;
};

const INITIAL_FORM: FormState = {
  customerId: "",
  assignedToPersonId: "",
  title: "",
  description: "",
  priority: "2",
  scheduledFor: "",
  amount: "",
  dueDate: "",
};

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

export default function CreateServiceOrderModal({
  open,
  isOpen,
  onClose,
  onCreated,
  onSuccess,
  customers,
  people,
  initialCustomerId,
  appointmentId,
}: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { track } = useProductAnalytics();
  const assigneeWarningTelemetry = useAssigneeWarningTelemetry("SERVICE_ORDER");
  const resolvedOpen = open ?? isOpen ?? false;
  const [createdServiceOrder, setCreatedServiceOrder] = useState<{
    id: string;
    title: string;
    customerId: string;
  } | null>(null);
  const [formData, setFormData] = useState<FormState>({
    ...INITIAL_FORM,
    customerId: initialCustomerId ? String(initialCustomerId) : "",
  });

  const createMutation = trpc.nexo.serviceOrders.create.useMutation();
  useCriticalActionGuard({
    isPending: createMutation.isPending,
    reason: "Criando O.S. e atualizando cliente, cobrança e timeline.",
  });

  const canSubmit = useMemo(() => {
    return (
      customers.length > 0 &&
      formData.customerId.trim().length > 0 &&
      formData.title.trim().length > 0
    );
  }, [customers.length, formData.customerId, formData.title]);
  const isDirty = useMemo(() => {
    return Object.entries(formData).some(([, value]) => value.trim().length > 0);
  }, [formData]);

  const hasAmount = formData.amount.trim().length > 0;
  const selectedCustomerName =
    customers.find((customer) => customer.id === formData.customerId)?.name ??
    "Cliente não definido";
  const summaryAmount = formatCurrencyFromInput(formData.amount);

  const handleClose = () => {
    if (createMutation.isPending) return;
    if (!createdServiceOrder && isDirty && !window.confirm("Existem dados não salvos. Deseja fechar e descartar?")) {
      return;
    }
    setCreatedServiceOrder(null);
    setFormData({
      ...INITIAL_FORM,
      customerId: initialCustomerId ? String(initialCustomerId) : "",
    });
    onClose();
  };

  useEffect(() => {
    if (!resolvedOpen) {
      assigneeWarningTelemetry.reset();
      return;
    }
    setFormData((current) => ({
      ...current,
      customerId: current.customerId || (initialCustomerId ? String(initialCustomerId) : ""),
    }));
  }, [assigneeWarningTelemetry.reset, initialCustomerId, resolvedOpen]);

  const submit = async () => {
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

    const parsed = serviceOrderSchema.safeParse({
      customerId: formData.customerId.trim(),
      assignedToPersonId: formData.assignedToPersonId.trim() || "",
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      priority,
      scheduledFor: formData.scheduledFor.trim() || "",
      amountCents,
      dueDate: formData.dueDate.trim() || "",
    });

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message || "Dados inválidos para criar a O.S.";
      toast.error(firstError);
      return;
    }

    const payload = {
      customerId: parsed.data.customerId,
      appointmentId: appointmentId ? String(appointmentId) : undefined,
      assignedToPersonId: parsed.data.assignedToPersonId || undefined,
      title: parsed.data.title,
      description: parsed.data.description || undefined,
      priority: parsed.data.priority,
      scheduledFor: parsed.data.scheduledFor || undefined,
      amountCents: parsed.data.amountCents,
      dueDate: parsed.data.dueDate || undefined,
    };

    const previousServiceOrders = utils.nexo.serviceOrders.list.getData({ page: 1, limit: 100 });
    const tempId = `temp-os-${Date.now()}`;
    utils.nexo.serviceOrders.list.setData({ page: 1, limit: 100 }, (old: any) => {
      const raw = old as any[] | { data?: any[] } | undefined;
      const optimistic = { id: tempId, ...payload, createdAt: new Date().toISOString() };
      if (Array.isArray(raw)) return [optimistic, ...raw];
      if (raw && Array.isArray(raw.data)) return { ...raw, data: [optimistic, ...raw.data] };
      return [optimistic];
    });

    assigneeWarningTelemetry.trackConfirmed(payload.assignedToPersonId);

    createMutation.mutate(payload, {
      onSuccess: async (created) => {
        utils.nexo.serviceOrders.list.setData({ page: 1, limit: 100 }, (old: any) => {
          const raw = old as any[] | { data?: any[] } | undefined;
          const applyReplace = (items: any[]) =>
            items.map((item) => (String(item?.id) === tempId ? created : item));
          if (Array.isArray(raw)) return applyReplace(raw);
          if (raw && Array.isArray(raw.data)) return { ...raw, data: applyReplace(raw.data) };
          return [created];
        });
        await invalidateOperationalGraph(
          utils,
          payload.customerId,
          String((created as any)?.id ?? "")
        );
        await utils.dashboard.alerts.invalidate();

        setCreatedServiceOrder({
          id: String((created as any)?.id ?? ""),
          title: String((created as any)?.title ?? payload.title),
          customerId: payload.customerId,
        });
        onCreated?.({
          id: String((created as any)?.id ?? ""),
          customerId: payload.customerId,
        });
        registerActionFlowEvent("service_order_created");
        track("create_service_order", {
          screen: "service-orders",
          serviceOrderId: String((created as any)?.id ?? ""),
          customerId: payload.customerId,
          hasAmount: Boolean(payload.amountCents),
        });
        toast.success(`O.S. criada: ${String((created as any)?.title ?? payload.title)}`, {
          action: {
            label: "Ver O.S.",
            onClick: () =>
              navigate(buildServiceOrdersDeepLink(String((created as any)?.id ?? ""))),
          },
        });
        notify.successPersistent(
          "O.S. criada com sucesso",
          "Próximo passo: gerar a cobrança para transformar execução em receita.",
          {
            label: "Ir para Financeiro",
            onClick: () => navigate(`/finances?serviceOrderId=${String((created as any)?.id ?? "")}`),
          }
        );
      },
      onError: (error) => {
        utils.nexo.serviceOrders.list.setData(
          { page: 1, limit: 100 },
          previousServiceOrders as any
        );
        toast.error(error.message || "Erro ao criar ordem de serviço");
        notify.error(
          "Falha ao criar O.S.",
          "Você pode revisar os dados e tentar novamente sem recarregar a tela.",
          {
            label: "Tentar novamente",
            onClick: () => {
              void submit();
            },
          }
        );
      },
    });
  };

  return (
    <FormModal
      open={resolvedOpen}
      onOpenChange={(open) => (!open ? handleClose() : undefined)}
      title="Nova O.S."
      description={`${selectedCustomerName} · ${hasAmount ? summaryAmount : "Sem valor definido"}`}
      closeBlocked={createMutation.isPending}
      size="lg"
      contentClassName="w-full max-w-[820px] border border-[var(--app-overlay-border)] bg-[var(--app-overlay-surface)] shadow-[var(--app-overlay-shadow)]"
      footer={
        <>
          {createdServiceOrder ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Fechar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreatedServiceOrder(null);
                  setFormData({
                    ...INITIAL_FORM,
                    customerId: initialCustomerId ? String(initialCustomerId) : "",
                  });
                }}
              >
                Criar outra O.S.
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onSuccess?.();
                  navigate(buildServiceOrdersDeepLink(createdServiceOrder.id));
                  handleClose();
                }}
              >
                Ver O.S.
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigate(`/customers?customerId=${createdServiceOrder.customerId}`);
                  handleClose();
                }}
              >
                Ver cliente
              </Button>
            </>
          ) : null}
          {!createdServiceOrder ? (
            <>
              <div className="mr-auto flex flex-wrap gap-6 text-sm text-[var(--modal-section-muted)]">
                <span>Status: <strong className="text-[var(--modal-section-text)]">Aberta</strong></span>
                <span>Valor: <strong className="text-[var(--modal-section-text)]">{hasAmount ? summaryAmount : "—"}</strong></span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={createMutation.isPending || !canSubmit}
                className="bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
              >
                {createMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </span>
                ) : "Salvar alteração"}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {createdServiceOrder ? (
        <AppSectionCard variant="success" className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--modal-section-text)]">
            Ordem de serviço criada com sucesso
          </h3>
          <p className="text-sm text-[var(--modal-section-muted)]">
            <strong>{createdServiceOrder.title}</strong> já está registrada no fluxo operacional.
          </p>
          <p className="text-xs text-[var(--modal-section-muted)]">
            Você pode abrir a O.S., ir para o cliente ou criar uma nova sem sair da tela.
          </p>
        </AppSectionCard>
      ) : null}

      {!createdServiceOrder ? (
        <AppForm id="create-service-order-form" className="space-y-5">
          <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--modal-section-muted)]">Identificador</p>
                <p className="text-sm font-semibold text-[var(--modal-section-text)]">Nova O.S.</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--modal-section-muted)]">Cliente</p>
                <p className="text-sm font-medium text-[var(--modal-section-text)]">{selectedCustomerName}</p>
              </div>
            </div>
          </section>

          {customers.length === 0 ? (
            <AppSectionCard
              variant="warning"
              role="alert"
              className="text-sm text-[var(--modal-section-text)]"
            >
              Você precisa ter ao menos um cliente para criar uma O.S. Cadastre um cliente e volte aqui.
            </AppSectionCard>
          ) : null}

          <Accordion type="multiple" defaultValue={["main", "financial"]} className="space-y-3">
            <AccordionItem value="main" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
              <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                Dados principais
                <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                  {formData.title.trim() || "Sem título"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <AppField label="Cliente *">
                  <AppSelect
                    value={formData.customerId}
                    onValueChange={(customerId) =>
                      setFormData((state) => ({ ...state, customerId }))
                    }
                    placeholder="Selecione um cliente"
                    options={customers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                    }))}
                  />
                </AppField>

                <AppField label="Responsável pela execução">
                  <div className="space-y-1.5">
                    <AppSelect
                      value={formData.assignedToPersonId || undefined}
                      onValueChange={(assignedToPersonId) =>
                        setFormData((state) => ({ ...state, assignedToPersonId }))
                      }
                      placeholder="Selecione um colaborador"
                      options={people.map((person) => ({
                        value: person.id,
                        label: person.name,
                      }))}
                    />
                    <PersonAssignmentWarning
                      personId={formData.assignedToPersonId}
                      onWarningShown={assigneeWarningTelemetry.trackShown}
                    />
                    {formData.assignedToPersonId ? (
                      <button
                        type="button"
                        className="text-xs text-[var(--modal-section-muted)] transition-colors hover:text-[var(--modal-section-text)]"
                        onClick={() =>
                          setFormData((state) => ({ ...state, assignedToPersonId: "" }))
                        }
                      >
                        Limpar responsável
                      </button>
                    ) : null}
                  </div>
                </AppField>

                <AppField label="Serviço que será feito *">
                  <AppInput
                    placeholder="Ex: Manutenção elétrica no quadro do condomínio"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((state) => ({ ...state, title: e.target.value }))
                    }
                    disabled={createMutation.isPending}
                  />
                </AppField>

                <AppField label="Detalhes para a equipe">
                  <AppTextarea
                    placeholder="Ex: Levar escada, trocar disjuntor e testar iluminação da área comum."
                    rows={3}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((state) => ({ ...state, description: e.target.value }))
                    }
                    disabled={createMutation.isPending}
                  />
                </AppField>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="financial" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
              <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                Financeiro
                <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                  {hasAmount ? summaryAmount : "Sem valor"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <AppFieldGroup>
                  <AppField label="Data prevista (opcional)">
                    <AppInput
                      type="datetime-local"
                      value={formData.scheduledFor}
                      onChange={(e) =>
                        setFormData((state) => ({ ...state, scheduledFor: e.target.value }))
                      }
                      disabled={createMutation.isPending}
                    />
                    {appointmentId ? (
                      <AppInlineHint>
                        Sugestão: esta O.S. pode herdar contexto do agendamento #{appointmentId}.
                      </AppInlineHint>
                    ) : null}
                  </AppField>
                  <AppField label="Valor (R$)">
                    <AppInput
                      inputMode="decimal"
                      placeholder="Ex: 890,00"
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData((state) => ({ ...state, amount: e.target.value }))
                      }
                      disabled={createMutation.isPending}
                    />
                    <AppInlineHint>Valor atual: {summaryAmount}</AppInlineHint>
                  </AppField>
                </AppFieldGroup>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="advanced" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
              <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                Avançado
                <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                  {formData.dueDate.trim() ? "Com vencimento" : "Sem vencimento"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <AppField label="Vencimento">
                  <AppInput
                    type="datetime-local"
                    value={formData.dueDate}
                    onChange={(e) => setFormData((state) => ({ ...state, dueDate: e.target.value }))}
                    disabled={createMutation.isPending}
                  />
                </AppField>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {hasAmount ? (
            <p className="text-xs text-[var(--modal-section-muted)]">
              Se o vencimento ficar vazio, o backend pode definir um padrão automático.
            </p>
          ) : null}
        </AppForm>
      ) : null}
    </FormModal>
  );
}

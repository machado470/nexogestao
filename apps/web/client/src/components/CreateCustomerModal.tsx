import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import { Loader2 } from "lucide-react";
import { customerSchema } from "@/lib/validations";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { registerActionFlowEvent } from "@/lib/actionFlow";
import ModalFlowShell from "@/components/ModalFlowShell";
import { useCriticalActionGuard } from "@/hooks/useCriticalActionGuard";
import { invalidateOperationalGraph } from "@/lib/operationalConsistency";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { notify } from "@/stores/notificationStore";
import { useLocation } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (createdCustomer?: {
    id?: string | null;
    name?: string;
  }) => Promise<void> | void;
};

export default function CreateCustomerModal({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [address, setAddress] = useState("");
  const [nextStep, setNextStep] = useState<
    "schedule" | "message" | "billing" | "only_register"
  >("schedule");
  const [createdCustomer, setCreatedCustomer] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { track } = useProductAnalytics();
  const createCustomer = trpc.customers.create.useMutation();

  useCriticalActionGuard({
    isPending: createCustomer.isPending,
    reason: "Salvando cliente e sincronizando contexto operacional.",
  });

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && phone.trim().length >= 10;
  }, [name, phone]);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setCpfCnpj("");
    setAddress("");
    setNextStep("schedule");
  };

  const hasDraft =
    name.trim().length > 0 ||
    phone.trim().length > 0 ||
    email.trim().length > 0 ||
    cpfCnpj.trim().length > 0 ||
    address.trim().length > 0 ||
    notes.trim().length > 0;

  const close = () => {
    if (createCustomer.isPending) return;
    if (
      !createdCustomer &&
      hasDraft &&
      !window.confirm(
        "Existem dados não salvos. Deseja descartar este cadastro?"
      )
    ) {
      return;
    }
    setCreatedCustomer(null);
    reset();
    onOpenChange(false);
  };

  const submit = async () => {
    const parsed = customerSchema.safeParse({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
      cpfCnpj: cpfCnpj.trim(),
      address: address.trim(),
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      toast.error(firstError);
      return;
    }

    const normalizedCpfCnpj = parsed.data.cpfCnpj
      ? parsed.data.cpfCnpj.replace(/\D/g, "")
      : "";

    const previousCustomers = utils.customers.list.getData(undefined);

    try {
      const tempId = `temp-customer-${Date.now()}`;
      const optimisticTimestamp = new Date().toISOString();
      const optimisticCustomer = {
        id: tempId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
        cpfCnpj: normalizedCpfCnpj || null,
        address: parsed.data.address?.trim() ? parsed.data.address.trim() : null,
        active: true,
        createdAt: optimisticTimestamp,
        updatedAt: optimisticTimestamp,
      };

      utils.customers.list.setData(undefined, old => [
        optimisticCustomer,
        ...(old ?? []),
      ]);

      const created = await createCustomer.mutateAsync({
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || undefined,
        notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : undefined,
        cpfCnpj: normalizedCpfCnpj || undefined,
        address: parsed.data.address?.trim() ? parsed.data.address.trim() : undefined,
      });

      utils.customers.list.setData(undefined, old =>
        (old ?? []).map(item => (item.id === tempId ? created : item))
      );

      const createdId = created.id;
      const createdName = created.name;

      toast.success(`Cliente criado: ${createdName}`, {
        action: {
          label:
            nextStep === "schedule"
              ? "Criar agendamento"
              : nextStep === "message"
                ? "Enviar mensagem"
                : nextStep === "billing"
                  ? "Criar cobrança"
                  : "Ver cliente",
          onClick: async () => {
            if (nextStep === "schedule")
              return navigate(
                `/appointments?customerId=${createdId}&source=customer_created`
              );
            if (nextStep === "message")
              return navigate(
                `/whatsapp?customerId=${createdId}&source=customer_created`
              );
            if (nextStep === "billing")
              return navigate(
                `/finances?customerId=${createdId}&source=customer_created`
              );
            await onCreated?.({ id: createdId, name: createdName });
            close();
          },
        },
      });
      notify.successPersistent(
        "Cliente criado e sincronizado",
        nextStep === "schedule"
          ? "Próximo passo escolhido: criar agendamento para manter continuidade."
          : nextStep === "message"
            ? "Próximo passo escolhido: iniciar contato contextual por WhatsApp."
            : nextStep === "billing"
              ? "Próximo passo escolhido: criar cobrança para ativar o fluxo financeiro."
              : "Cadastro concluído. Abra o workspace para seguir com operação.",
        {
          label:
            nextStep === "schedule"
              ? "Abrir agenda"
              : nextStep === "message"
                ? "Abrir WhatsApp"
                : nextStep === "billing"
                  ? "Abrir financeiro"
                  : "Criar O.S.",
          onClick: () => {
            if (nextStep === "schedule")
              return navigate(`/appointments?customerId=${createdId}`);
            if (nextStep === "message")
              return navigate(`/whatsapp?customerId=${createdId}`);
            if (nextStep === "billing")
              return navigate(`/finances?customerId=${createdId}`);
            navigate(`/service-orders?customerId=${createdId}`);
          },
        }
      );

      registerActionFlowEvent("customer_created");
      track("create_customer", {
        screen: "customers",
        customerId: createdId,
        nextStep,
      });
      setCreatedCustomer({ id: createdId, name: createdName });
      reset();
      await invalidateOperationalGraph(utils, createdId);
    } catch (err: any) {
      utils.customers.list.setData(undefined, previousCustomers as any);
      toast.error("Falha ao criar cliente: " + (err?.message ?? "erro"));
      notify.error(
        "Não foi possível criar o cliente",
        "Confira os dados e tente novamente.",
        {
          label: "Tentar novamente",
          onClick: () => {
            void submit();
          },
        }
      );
    }
  };

  return (
    <ModalFlowShell
      open={open}
      onOpenChange={nextOpen => (nextOpen ? onOpenChange(nextOpen) : close())}
      title="Novo Cliente"
      description={`${name.trim() || "Cliente em cadastro"} · ${phone.trim() || "Sem telefone"}`}
      isSubmitting={createCustomer.isPending}
      closeBlocked={createCustomer.isPending}
      hasDirtyState={hasDraft}
      contentClassName="w-full max-w-[760px] border border-[var(--app-overlay-border)] bg-[var(--app-overlay-surface)] shadow-[var(--app-overlay-shadow)]"
      footer={
        createdCustomer ? (
          <>
            <Button type="button" variant="outline" onClick={close}>
              Fechar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreatedCustomer(null)}
            >
              Criar outro
            </Button>
            <Button
              type="button"
              onClick={async () => {
                track("cta_click", {
                  screen: "customers",
                  ctaId: "customer_created_view_customer",
                  target: "customer_workspace",
                });
                await onCreated?.({
                  id: createdCustomer.id,
                  name: createdCustomer.name,
                });
                close();
              }}
            >
              Ver cliente
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                track("cta_click", {
                  screen: "customers",
                  ctaId: "customer_created_go_service_order",
                  target: "service-orders",
                });
                await onCreated?.({
                  id: createdCustomer.id,
                  name: createdCustomer.name,
                });
                navigate(
                  `/service-orders?customerId=${createdCustomer.id}&source=customer_created`
                );
              }}
            >
              Criar O.S.
            </Button>
          </>
        ) : (
          <>
            <div className="mr-auto flex flex-wrap gap-6 text-sm text-[var(--modal-section-muted)]">
              <span>
                Status: <strong className="text-[var(--modal-section-text)]">Cadastro inicial</strong>
              </span>
              <span>
                Próximo passo:{" "}
                <strong className="text-[var(--modal-section-text)]">
                  {nextStep === "only_register" ? "Somente registro" : "Operacional"}
                </strong>
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={createCustomer.isPending}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={submit}
              disabled={createCustomer.isPending || !canSubmit}
              className="bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
            >
              {createCustomer.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </span>
              ) : (
                "Criar cliente e continuar"
              )}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5 pb-1">
        {createdCustomer ? (
          <section className="space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_26%,var(--border))] bg-[color-mix(in_srgb,var(--success)_8%,var(--surface-base))] p-4">
            <p className="text-sm font-semibold text-[var(--modal-section-text)]">
              Cliente criado com sucesso
            </p>
            <p className="text-sm text-[var(--modal-section-muted)]">
              <strong>{createdCustomer.name}</strong> já está pronto para seguir
              no fluxo operacional.
            </p>
            <p className="text-xs text-[var(--modal-section-muted)]">
              Próximo passo recomendado: abrir o workspace ou iniciar uma O.S.
            </p>
          </section>
        ) : null}

        {!createdCustomer ? (
          <>
            <section className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--modal-section-muted)]">Contexto</p>
              <p className="text-sm text-[var(--modal-section-text)]">Cliente em cadastro · próximo passo {nextStep === "only_register" ? "apenas registrar" : "operacional"}</p>
            </section>

            <Accordion type="multiple" defaultValue={["main"]} className="space-y-3">
              <AccordionItem value="main" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                  Dados principais
                  <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                    {name.trim() || "Sem nome"} · {phone.trim() || "Sem telefone"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Nome *</Label>
                    <Input id="customer-name" className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cliente Demo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-phone">Telefone / WhatsApp *</Label>
                    <Input id="customer-phone" className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: +5547999999999" />
                    <p className="text-xs text-[var(--modal-section-muted)]">Pode mandar com +55 ou só números. O backend normaliza.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-email">Email</Label>
                    <Input id="customer-email" className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@demo.com" type="email" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="financial" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                  Financeiro
                  <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                    {cpfCnpj.trim() || "Sem CPF/CNPJ"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-cpf-cnpj">CPF/CNPJ</Label>
                    <Input id="customer-cpf-cnpj" className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="Ex.: 123.456.789-00 ou 12.345.678/0001-99" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="advanced" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                  Avançado
                  <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                    {address.trim() || notes.trim() ? "Com observações" : "Sem detalhes"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-address">Endereço</Label>
                    <Textarea id="customer-address" className="rounded-lg border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={address} onChange={e => setAddress(e.target.value)} placeholder="Ex.: Rua X, 123, Bairro, Cidade" rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-notes">Observações</Label>
                    <Textarea id="customer-notes" className="rounded-lg border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informações úteis sobre o cliente" rows={3} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--modal-section-text)]">
                Próximo passo
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "schedule" as const,
                    label: "Criar agendamento",
                    hint: "Mantém a continuidade da operação na agenda.",
                  },
                  {
                    id: "message" as const,
                    label: "Enviar mensagem inicial",
                    hint: "Inicia contato contextual no WhatsApp.",
                  },
                  {
                    id: "billing" as const,
                    label: "Criar cobrança",
                    hint: "Ativa camada financeira do fluxo.",
                  },
                  {
                    id: "only_register" as const,
                    label: "Apenas cadastrar",
                    hint: "Finaliza cadastro sem próxima ação automática.",
                  },
                ].map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setNextStep(option.id)}
                    className={`min-h-[88px] rounded-xl border p-4 text-left transition-colors ${
                      nextStep === option.id
                        ? "border-orange-500/40 bg-orange-500/10"
                        : "border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] hover:border-[var(--accent-primary)]/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--modal-section-text)]">
                      {option.label}
                    </p>
                    <p className="mt-1 text-xs text-[var(--modal-section-muted)]">
                      {option.hint}
                    </p>
                  </button>
                ))}
              </div>
              {nextStep === "schedule" ? (
                <p className="text-xs text-[var(--modal-section-muted)]">
                  Após criar, vamos preparar o fluxo para abrir agenda.
                </p>
              ) : null}
              {nextStep === "message" ? (
                <p className="text-xs text-[var(--modal-section-muted)]">
                  Após criar, o contato pode seguir direto para o WhatsApp
                  contextual.
                </p>
              ) : null}
              {nextStep === "billing" ? (
                <p className="text-xs text-[var(--modal-section-muted)]">
                  Após criar, já será possível iniciar a cobrança deste cliente.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </ModalFlowShell>
  );
}

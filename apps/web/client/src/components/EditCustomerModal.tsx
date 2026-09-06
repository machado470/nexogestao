import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { customerSchema } from "@/lib/validations";
import { FormModal } from "@/components/app-modal-system";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { normalizeObjectPayload } from "@/lib/query-helpers";
import { useCriticalActionGuard } from "@/hooks/useCriticalActionGuard";
import { invalidateOperationalGraph } from "@/lib/operationalConsistency";
import {
  getConcurrencyErrorMessage,
  isConcurrentConflictError,
} from "@/lib/concurrency";

type Props = {
  open: boolean;
  customerId?: string | number | null;
  onClose: () => void;
  onSaved?: (savedCustomer?: { id?: string | null }) => void | Promise<void>;
};

type CustomerDetails = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean | null;
  updatedAt?: string | null;
};

function normalizeCustomerPayload(payload: unknown): CustomerDetails | null {
  const root = normalizeObjectPayload<any>(payload);
  const raw =
    root && typeof root === "object" && root.data && typeof root.data === "object"
      ? root.data
      : root;
  if (!raw || typeof raw !== "object") return null;
  return raw as CustomerDetails;
}

export default function EditCustomerModal({ open, customerId, onClose, onSaved }: Props) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  const idStr = customerId != null ? String(customerId) : undefined;

  const customerQuery = trpc.customers.getById.useQuery(
    { id: idStr! },
    {
      enabled: open && !!idStr,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const updateMutation = trpc.customers.update.useMutation();
  useCriticalActionGuard({
    isPending: updateMutation.isPending,
    reason: "Atualizando cliente e sincronizando dependências.",
  });

  const customer = useMemo(() => {
    return normalizeCustomerPayload(customerQuery.data);
  }, [customerQuery.data]);

  useEffect(() => {
    if (!open) return;

    if (customer) {
      setName(customer.name ?? "");
      setPhone(customer.phone ?? "");
      setEmail(customer.email ?? "");
      setNotes(customer.notes ?? "");
      setActive(Boolean(customer.active));
      setInitialSnapshot(
        JSON.stringify({
          name: customer.name ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          notes: customer.notes ?? "",
          active: Boolean(customer.active),
        })
      );
      return;
    }

    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setActive(true);
    setInitialSnapshot("");
  }, [open, customer]);

  useEffect(() => {
    if (!open || !customerQuery.isLoading || customer) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setLoadingTimedOut(true), 9000);
    return () => window.clearTimeout(timeoutId);
  }, [customer, customerQuery.isLoading, open]);

  const isDirty = useMemo(() => {
    const current = JSON.stringify({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
      active,
    });
    return Boolean(initialSnapshot) && initialSnapshot !== current;
  }, [active, email, initialSnapshot, name, notes, phone]);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && phone.trim().length >= 10 && isDirty;
  }, [isDirty, name, phone]);
  const operationalSummary = useMemo(
    () => ({
      status: active ? "Ativo" : "Inativo",
      contact: phone.trim().length > 0 ? phone : "Sem telefone",
    }),
    [active, phone]
  );

  const submit = async () => {
    if (!idStr) return;

    const parsed = customerSchema.safeParse({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      toast.error(firstError);
      return;
    }

    const previousCustomers = utils.customers.list.getData(undefined);

    try {
      const updatedPayload = {
        id: idStr,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || undefined,
        notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : undefined,
        active,
        expectedUpdatedAt:
          typeof customer?.updatedAt === "string" ? customer.updatedAt : undefined,
      };

      utils.customers.list.setData(undefined, (old: any) => {
        const raw = old as { data?: any[] } | any[] | undefined;
        const applyUpdate = (items: any[]) =>
          items.map((item) =>
            String(item?.id) === idStr ? { ...item, ...updatedPayload } : item
          );

        if (Array.isArray(raw)) return applyUpdate(raw);
        if (raw && Array.isArray(raw.data)) return { ...raw, data: applyUpdate(raw.data) };
        return old;
      });

      await updateMutation.mutateAsync(updatedPayload);
      await invalidateOperationalGraph(utils, idStr);
      toast.success(`Cliente atualizado: ${parsed.data.name}`, {
        action: {
          label: "Ver cliente",
          onClick: () => {
            window.location.assign(`/customers?customerId=${idStr}`);
          },
        },
      });
      await onSaved?.({ id: idStr });
      onClose();
    } catch (error) {
      utils.customers.list.setData(undefined, previousCustomers as any);
      if (isConcurrentConflictError(error)) {
        toast.error(getConcurrencyErrorMessage("cliente"), {
          action: {
            label: "Recarregar",
            onClick: () => void customerQuery.refetch(),
          },
        });
        return;
      }
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar cliente";
      toast.error(message);
    }
  };

  const handleClose = () => {
    if (updateMutation.isPending) return;
    if (isDirty && !window.confirm("Existem alterações não salvas. Deseja descartar?")) return;
    onClose();
  };

  return (
    <FormModal
      open={open}
      onOpenChange={(nextOpen) => (!nextOpen ? handleClose() : undefined)}
      title={`Cliente #${idStr ?? "novo"}`}
      description={`${name.trim() || "Sem nome definido"} · ${operationalSummary.contact} · ${operationalSummary.status}`}
      closeBlocked={updateMutation.isPending}
      contentClassName="w-full max-w-[760px] border border-[var(--app-overlay-border)] bg-[var(--app-overlay-surface)] shadow-[var(--app-overlay-shadow)]"
      footer={
        <>
          <div className="mr-auto flex flex-wrap gap-6 text-sm text-[var(--modal-section-muted)]">
            <span>Status: <strong className="text-[var(--modal-section-text)]">{operationalSummary.status}</strong></span>
            <span>Contato: <strong className="text-[var(--modal-section-text)]">{operationalSummary.contact}</strong></span>
          </div>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={submit}
            disabled={updateMutation.isPending || customerQuery.isLoading || !canSubmit}
            className="bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
          >
            {updateMutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </span>
            ) : (
              "Salvar"
            )}
          </Button>
        </>
      }
    >
        <div className="space-y-5">
          {customerQuery.isLoading && !customer ? (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--modal-section-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-500" />
              Carregando...
              {loadingTimedOut ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void customerQuery.refetch()}>
                  Recarregar
                </Button>
              ) : null}
            </div>
          ) : customerQuery.error ? (
            <div className="space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--app-overlay-surface))] p-5 text-sm text-[var(--danger)]">
              <p>Não foi possível carregar os dados do cliente.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void customerQuery.refetch()}
                className="border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,var(--app-overlay-surface))]"
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={["main", "advanced"]} className="space-y-3">
              <AccordionItem value="main" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                  Dados principais
                  <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                    {name.trim() || "Sem nome"} · {phone.trim() || "Sem telefone"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-name">Nome *</Label>
                    <Input id="edit-customer-name" value={name} onChange={(e) => setName(e.target.value)} className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" placeholder="Ex: Cliente Demo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-phone">Telefone / WhatsApp *</Label>
                    <Input id="edit-customer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" placeholder="Ex: +5547999999999" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-email">Email</Label>
                    <Input id="edit-customer-email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" placeholder="cliente@demo.com" type="email" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="advanced" className="rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-[var(--modal-section-text)]">
                  Avançado
                  <span className="ml-2 text-xs font-normal text-[var(--modal-section-muted)]">
                    {active ? "Cliente ativo" : "Cliente inativo"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-notes">Observações</Label>
                    <Textarea id="edit-customer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-[var(--field-border)] bg-[var(--field-bg)] text-[var(--modal-section-text)] placeholder:text-[var(--modal-section-muted)] hover:border-[var(--accent-primary)]/40 focus-visible:border-orange-500/40 focus-visible:ring-[3px] focus-visible:ring-orange-500/30" placeholder="Informações úteis sobre o cliente" rows={4} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--modal-section-text)]">Cliente ativo</p>
                      <p className="text-xs text-[var(--modal-section-muted)]">Desative para tirar o cliente do fluxo sem apagar histórico.</p>
                    </div>
                    <button type="button" onClick={() => setActive((prev) => !prev)} className={`inline-flex min-w-[88px] items-center justify-center rounded-full px-3 py-2 text-xs font-medium transition-colors ${active ? "bg-emerald-500/15 text-emerald-300" : "bg-[var(--surface-elevated)] text-[var(--modal-section-muted)]"}`}>
                      {active ? "Ativo" : "Inativo"}
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
    </FormModal>
  );
}

import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { BaseOperationalModal } from "@/components/app-modal-system";
import { AppNextActionCard, AppSectionBlock, AppStatusBadge } from "@/components/internal-page-system";

import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload, normalizeObjectPayload } from "@/lib/query-helpers";
import { presentationStatusLabel } from "@/lib/presentation-status";

function listOf(input: unknown) {
  return normalizeArrayPayload<any>(input);
}

function asRecord(input: unknown) {
  return (normalizeObjectPayload<any>(input) ?? {}) as Record<string, any>;
}

type CustomerWorkspaceModalProps = {
  open: boolean;
  customerId: string | null;
  customerName?: string;
  onOpenChange: (open: boolean) => void;
};

export function CustomerWorkspaceModal({ open, customerId, customerName, onOpenChange }: CustomerWorkspaceModalProps) {
  const [, navigate] = useLocation();
  const workspaceQuery = trpc.nexo.customers.workspace.useQuery(
    { id: customerId ?? "" },
    { enabled: open && Boolean(customerId), retry: false }
  );
  const operationalSummaryQuery = trpc.nexo.customers.operationalSummary.useQuery(undefined, {
    enabled: open && Boolean(customerId),
    retry: false,
  });

  const workspace = useMemo(() => asRecord(workspaceQuery.data), [workspaceQuery.data]);
  const customer = asRecord(workspace.customer);
  const appointments = listOf(workspace.appointments ?? workspace.customerAppointments);
  const serviceOrders = listOf(workspace.serviceOrders ?? workspace.orders);
  const charges = listOf(workspace.charges ?? workspace.finance);
  const messages = listOf(workspace.messages ?? workspace.whatsappMessages);
  const timeline = listOf(workspace.timeline ?? workspace.events).slice(0, 8);
  const operationalSummary = operationalSummaryQuery.data?.customers.find(
    item => item.customerId === customerId
  ) ?? null;

  const headerName = String(customer.name ?? customerName ?? "Cliente");
  return (
    <BaseOperationalModal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={`Workspace · ${headerName}`}
      description="Contexto completo do cliente com vínculo real entre agenda, O.S., cobrança, WhatsApp e timeline."
      footer={(
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={() => navigate(`/appointments?customerId=${customerId ?? ""}`)}>
            Criar agendamento
          </Button>
          <Button type="button" onClick={() => navigate(`/service-orders?customerId=${customerId ?? ""}`)}>
            Criar O.S.
          </Button>
        </>
      )}
    >
      {workspaceQuery.isLoading ? (
        <div className="text-sm text-[var(--text-muted)]">Carregando workspace do cliente...</div>
      ) : workspaceQuery.error ? (
        <div className="rounded-lg border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-300">
          Falha ao carregar workspace: {workspaceQuery.error.message}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-3">
            <AppSectionBlock title="Estado operacional" subtitle="Saúde e risco do cliente">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AppStatusBadge label={operationalSummary?.operationalStatus ?? "Indisponível"} />
                  <AppStatusBadge label={operationalSummary?.riskSignal ?? "Decisão oficial indisponível"} />
                  <AppStatusBadge label={customer.active === false ? "Inativo" : "Ativo"} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {operationalSummaryQuery.isLoading
                    ? "Consultando decisão oficial..."
                    : operationalSummary?.interventionReason ?? "Sem recomendação oficial disponível para este cliente."}
                </p>
              </div>
            </AppSectionBlock>
            <AppSectionBlock title="Resumo encadeado" subtitle="Cliente → execução → receita">
              <p className="text-sm text-[var(--text-secondary)]">
                {appointments.length} agendamento(s) · {serviceOrders.length} O.S. · {charges.length} cobrança(s) · {messages.length} interação(ões) WhatsApp · {timeline.length} evento(s) recentes.
              </p>
            </AppSectionBlock>
            <AppNextActionCard
              title="Próxima ação do cliente"
              description={operationalSummary?.interventionReason ?? "A autoridade operacional não forneceu uma recomendação."}
              severity={operationalSummary?.operationalStatus === "CRÍTICO" ? "critical" : operationalSummary?.operationalStatus === "RISCO" ? "high" : "medium"}
              metadata={operationalSummary ? `Prioridade oficial ${operationalSummary.priority}` : "Decisão oficial indisponível"}
              action={{
                label: operationalSummary?.recommendedActionLabel ?? "Abrir clientes",
                onClick: () => navigate(operationalSummary?.recommendedActionTarget === "FINANCES" ? "/finances" : operationalSummary?.recommendedActionTarget === "SERVICE_ORDERS" ? "/service-orders" : operationalSummary?.recommendedActionTarget === "WHATSAPP" ? `/whatsapp?customerId=${customerId ?? ""}` : operationalSummary?.recommendedActionTarget === "APPOINTMENTS" ? `/appointments?customerId=${customerId ?? ""}` : "/customers"),
              }}
            />
          </div>

          <AppSectionBlock title="Dados básicos" subtitle="Identificação e contato">
            <div className="grid gap-3 md:grid-cols-2">
              <p className="text-sm text-[var(--text-secondary)]">Nome: <span className="text-[var(--text-primary)]">{headerName}</span></p>
              <p className="text-sm text-[var(--text-secondary)]">Telefone: <span className="text-[var(--text-primary)]">{String(customer.phone ?? "—")}</span></p>
              <p className="text-sm text-[var(--text-secondary)]">E-mail: <span className="text-[var(--text-primary)]">{String(customer.email ?? "—")}</span></p>
              <p className="text-sm text-[var(--text-secondary)]">Endereço: <span className="text-[var(--text-primary)]">{String(customer.address ?? "—")}</span></p>
            </div>
            {customer.notes ? <p className="text-sm text-[var(--text-muted)]">Observações: {String(customer.notes)}</p> : null}
          </AppSectionBlock>

          <div className="grid gap-3 xl:grid-cols-2">
            <AppSectionBlock title="Agendamentos" subtitle="Relacionados ao cliente">
              {appointments.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Sem agendamentos.</p> : (
                <ul className="space-y-2">
                  {appointments.slice(0, 5).map((item) => (
                    <li key={String(item?.id)} className="rounded-md border border-[var(--border-subtle)] p-2 text-sm">
                      <p className="font-medium text-[var(--text-primary)]">{item?.startsAt ? new Date(String(item.startsAt)).toLocaleString("pt-BR") : "Sem data"}</p>
                      <AppStatusBadge label={presentationStatusLabel(item?.status, "Agendado")} />
                    </li>
                  ))}
                </ul>
              )}
            </AppSectionBlock>

            <AppSectionBlock title="Ordens de serviço" subtitle="Pipeline operacional do cliente">
              {serviceOrders.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Sem O.S. vinculada.</p> : (
                <ul className="space-y-2">
                  {serviceOrders.slice(0, 5).map((item) => (
                    <li key={String(item?.id)} className="rounded-md border border-[var(--border-subtle)] p-2 text-sm">
                      <p className="font-medium text-[var(--text-primary)]">{String(item?.title ?? `O.S. ${item?.id ?? ""}`)}</p>
                      <AppStatusBadge label={presentationStatusLabel(item?.status, "Aguardando ação")} />
                    </li>
                  ))}
                </ul>
              )}
            </AppSectionBlock>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <AppSectionBlock title="Cobranças" subtitle="Estado financeiro atual">
              {charges.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Sem cobrança cadastrada.</p> : (
                <ul className="space-y-2">
                  {charges.slice(0, 5).map((item) => (
                    <li key={String(item?.id)} className="rounded-md border border-[var(--border-subtle)] p-2 text-sm">
                      <p className="font-medium text-[var(--text-primary)]">R$ {(Number(item?.amountCents ?? 0) / 100).toFixed(2)}</p>
                      <AppStatusBadge label={presentationStatusLabel(item?.status, "Aguardando ação")} />
                    </li>
                  ))}
                </ul>
              )}
            </AppSectionBlock>

            <AppSectionBlock title="WhatsApp" subtitle="Mensagens e último contato">
              {messages.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Sem mensagens enviadas.</p> : (
                <ul className="space-y-2">
                  {messages.slice(0, 5).map((item) => (
                    <li key={String(item?.id)} className="rounded-md border border-[var(--border-subtle)] p-2 text-sm">
                      <p className="text-[var(--text-primary)]">{String(item?.text ?? item?.content ?? "Mensagem")}</p>
                      <p className="text-xs text-[var(--text-muted)]">{item?.createdAt ? new Date(String(item.createdAt)).toLocaleString("pt-BR") : "Sem data"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </AppSectionBlock>
          </div>

          <AppSectionBlock title="Timeline resumida" subtitle="Eventos recentes do cliente">
            {timeline.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Sem eventos na timeline.</p> : (
              <ul className="space-y-2">
                {timeline.map((item) => (
                  <li key={String(item?.id ?? `${item?.entityId}-${item?.createdAt}`)} className="rounded-md border border-[var(--border-subtle)] p-2 text-sm">
                    <p className="font-medium text-[var(--text-primary)]">{String(item?.title ?? item?.action ?? "Evento")}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item?.createdAt ? new Date(String(item.createdAt)).toLocaleString("pt-BR") : "Sem data"}</p>
                  </li>
                ))}
              </ul>
            )}
          </AppSectionBlock>
        </div>
      )}
    </BaseOperationalModal>
  );
}

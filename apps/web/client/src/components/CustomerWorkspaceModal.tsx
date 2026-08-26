import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { BaseOperationalModal } from "@/components/app-modal-system";
import { AppNextActionCard, AppSectionBlock, AppStatusBadge } from "@/components/internal-page-system";

import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload, normalizeObjectPayload } from "@/lib/query-helpers";
import { useOperationalDecisions } from "@/lib/decision-engine/useOperationalDecisions";
import { executeDecision } from "@/lib/decision-engine/execution.handler";
import { presentationStatusLabel } from "@/lib/presentation-status";
import { getCustomerSeverity, getNextActionCustomer, getOperationalSeverityLabel } from "@/lib/operations/operational-intelligence";

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

  const workspace = useMemo(() => asRecord(workspaceQuery.data), [workspaceQuery.data]);
  const customer = asRecord(workspace.customer);
  const appointments = listOf(workspace.appointments ?? workspace.customerAppointments);
  const serviceOrders = listOf(workspace.serviceOrders ?? workspace.orders);
  const charges = listOf(workspace.charges ?? workspace.finance);
  const messages = listOf(workspace.messages ?? workspace.whatsappMessages);
  const timeline = listOf(workspace.timeline ?? workspace.events).slice(0, 8);
  const overdueCharges = charges.filter((item) => String(item?.status ?? "").toUpperCase() === "OVERDUE").length;
  const pendingCharges = charges.filter((item) => String(item?.status ?? "").toUpperCase() === "PENDING").length;
  const customerSeverity = getCustomerSeverity({
    active: customer.active !== false,
    overdueCharges,
    pendingCharges,
    openServiceOrders: serviceOrders.filter((item) => !["DONE", "CANCELED"].includes(String(item?.status ?? "").toUpperCase())).length,
  });
  const customerRisk = overdueCharges > 0 ? "Alto" : pendingCharges > 0 ? "Moderado" : "Baixo";
  const nextAction = getNextActionCustomer({
    active: customer.active !== false,
    overdueCharges,
    pendingCharges,
    openServiceOrders: serviceOrders.length,
  });

  const headerName = String(customer.name ?? customerName ?? "Cliente");
  const { decisions: customerDecisions } = useOperationalDecisions({
    navigate,
    customerId,
    enabled: open && Boolean(customerId),
  });

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
                  <AppStatusBadge label={getOperationalSeverityLabel(customerSeverity)} />
                  <AppStatusBadge label={`Risco ${customerRisk}`} />
                  <AppStatusBadge label={customer.active === false ? "Inativo" : "Ativo"} />
                </div>
                {customerDecisions.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Sem decisões operacionais críticas para este cliente.</p>
                ) : (
                  <ul className="space-y-2">
                    {customerDecisions.slice(0, 3).map((decision) => (
                      <li key={decision.id} className="rounded-md border border-[var(--border-subtle)] p-2">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{decision.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">{decision.description}</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 h-8"
                          onClick={() => executeDecision(decision)}
                        >
                          {decision.action.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AppSectionBlock>
            <AppSectionBlock title="Resumo encadeado" subtitle="Cliente → execução → receita">
              <p className="text-sm text-[var(--text-secondary)]">
                {appointments.length} agendamento(s) · {serviceOrders.length} O.S. · {charges.length} cobrança(s) · {messages.length} interação(ões) WhatsApp · {timeline.length} evento(s) recentes.
              </p>
            </AppSectionBlock>
            <AppNextActionCard
              title="Próxima ação do cliente"
              description={overdueCharges > 0 ? "Cobranças vencidas exigem contato imediato." : "Mantenha o fluxo ativo com a próxima etapa operacional."}
              severity={overdueCharges > 0 ? "critical" : pendingCharges > 0 ? "high" : "medium"}
              metadata="workspace do cliente"
              action={{
                label: overdueCharges > 0 ? "Cobrar no WhatsApp" : nextAction.label,
                onClick: () => navigate(overdueCharges > 0 ? `/whatsapp?customerId=${customerId ?? ""}` : `/appointments?customerId=${customerId ?? ""}`),
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

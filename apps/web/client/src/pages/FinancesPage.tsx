import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreateChargeModal } from "@/components/CreateChargeModal";
import { FormModal } from "@/components/app-modal-system";
import {
  AppDataTable,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
} from "@/components/internal-page-system";
import {
  AppAlert,
  AppAlertDescription,
  AppEmptyState,
  AppField,
  AppFieldGroup,
  AppForm,
  AppFormActions,
  AppInfoCard,
  AppInput,
  AppSelect,
  AppStatusBadge,
  AppPageShell,
} from "@/components/app-system";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { safeDate } from "@/lib/operational/kpi";
import { formatCurrency } from "@/lib/operations/operations.utils";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";
import { trpc } from "@/lib/trpc";

type Charge = Record<string, any>;
type PaymentMethod = "PIX" | "CASH" | "CARD" | "TRANSFER" | "OTHER";

const methodOptions = [
  { value: "PIX", label: "PIX" },
  { value: "CARD", label: "Cartão" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "CASH", label: "Dinheiro" },
  { value: "OTHER", label: "Outro" },
];

function money(value: unknown) {
  return typeof value === "number" ? formatCurrency(value) : "Indisponível";
}

function date(value: unknown) {
  const parsed = safeDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "Não informada";
}

function factualLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

const chargeStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  OVERDUE: "Vencida",
  PAID: "Paga",
  CANCELED: "Cancelada",
};

function statusLabel(value: unknown) {
  const status = String(value ?? "").trim();
  return chargeStatusLabels[status] ?? (status || "Não informado");
}

function statusTone(
  value: unknown
): "success" | "warning" | "danger" | "neutral" {
  if (value === "PAID") return "success";
  if (value === "OVERDUE") return "danger";
  if (value === "PENDING") return "warning";
  return "neutral";
}

function priorityLabel(value: unknown) {
  const labels: Record<string, string> = {
    HIGH: "Alta",
    MEDIUM: "Média",
    LOW: "Baixa",
  };
  const priority = String(value ?? "").trim();
  return labels[priority] ?? (priority || "Não classificada");
}

function riskLabel(value: unknown) {
  const labels: Record<string, string> = {
    NORMAL: "Normal",
    WARNING: "Atenção",
    RESTRICTED: "Restrito",
    SUSPENDED: "Suspenso",
  };
  const risk = String(value ?? "").trim();
  return labels[risk] ?? (risk || "Não informado");
}

function officialSeverity(value: unknown): OperationalSeverity {
  const severityByOfficialRisk: Record<string, OperationalSeverity> = {
    NORMAL: "healthy",
    WARNING: "pending",
    RESTRICTED: "overdue",
    SUSPENDED: "critical",
  };
  return severityByOfficialRisk[String(value)] ?? "pending";
}

function actionLabel(value: unknown) {
  const labels: Record<string, string> = {
    SEND_PAYMENT_LINK: "Enviar link de pagamento",
    SEND_REMINDER: "Enviar lembrete",
    CALL_CUSTOMER: "Contatar cliente",
    REVIEW_CHARGE: "Revisar cobrança",
    WAIT_FOR_DUE_DATE: "Aguardar vencimento",
  };
  const action = String(value ?? "").trim();
  return labels[action] ?? (action || "Sem recomendação oficial");
}

export default function FinancesPage() {
  const [, navigate] = useLocation();
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const cancellationInputRef = useRef<HTMLInputElement>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState<Charge | null>(null);
  const [canceling, setCanceling] = useState<Charge | null>(null);
  const [amountCents, setAmountCents] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationError, setCancellationError] = useState<string | null>(
    null
  );

  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 500 },
    { retry: false }
  );
  const statsQuery = trpc.finance.charges.stats.useQuery({}, { retry: false });
  const queueQuery = trpc.finance.operationalQueue.useQuery(
    { limit: 50 },
    { retry: false }
  );
  const pay = trpc.finance.charges.pay.useMutation();
  const cancel = trpc.finance.charges.cancel.useMutation();
  const charges = normalizeArrayPayload<Charge>(chargesQuery.data);
  const queue = normalizeArrayPayload<Charge>(queueQuery.data);
  const stats = statsQuery.data as any;

  const visibleCharges = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return charges.filter(charge => {
      if (status !== "all" && String(charge.status) !== status) return false;
      if (!term) return true;
      return `${charge.customer?.name ?? ""} ${charge.serviceOrder?.number ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [charges, search, status]);

  const refresh = async () => {
    await Promise.all([
      chargesQuery.refetch(),
      statsQuery.refetch(),
      queueQuery.refetch(),
    ]);
  };

  const openPayment = (charge: Charge) => {
    setPaymentError(null);
    setAmountCents(
      typeof charge.balanceCents === "number" ? String(charge.balanceCents) : ""
    );
    setMethod("PIX");
    setPaying(charge);
  };

  const submitPayment = async () => {
    if (!paying) return;
    const exactAmount = Number(amountCents);
    if (!Number.isInteger(exactAmount) || exactAmount < 1) {
      setPaymentError("Informe um valor inteiro maior que zero, em centavos.");
      return;
    }
    setPaymentError(null);
    try {
      await pay.mutateAsync({
        chargeId: String(paying.id),
        amountCents: exactAmount,
        method,
        idempotencyKey: crypto.randomUUID(),
      });
      await refresh();
      setPaying(null);
      toast.success("Pagamento confirmado pelo serviço financeiro.");
    } catch (error: any) {
      setPaymentError(
        error?.message ?? "Não foi possível registrar o pagamento."
      );
    }
  };

  const submitCancellation = async () => {
    if (!canceling) return;
    const reason = cancellationReason.trim();
    if (reason.length < 3) {
      setCancellationError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }
    setCancellationError(null);
    try {
      await cancel.mutateAsync({
        chargeId: String(canceling.id),
        cancellationReason: reason,
        expectedUpdatedAt: canceling.updatedAt,
      });
      await refresh();
      setCanceling(null);
      toast.success("Cobrança cancelada pelo serviço financeiro.");
    } catch (error: any) {
      setCancellationError(
        error?.message ?? "Não foi possível cancelar a cobrança."
      );
    }
  };

  if (chargesQuery.isLoading)
    return (
      <AppPageShell>
        <AppPageLoadingState title="Carregando carteira oficial" />
      </AppPageShell>
    );
  if (chargesQuery.isError && charges.length === 0) {
    return (
      <AppPageShell>
        <AppPageErrorState
          description="A carteira financeira está indisponível. Sua sessão continua válida."
          actionLabel="Tentar novamente"
          onAction={() => void refresh()}
        />
      </AppPageShell>
    );
  }

  return (
    <AppPageShell className="gap-4" data-testid="finances-authoritative-page">
      <AppOperationalHeader
        title="Financeiro operacional"
        description="Cobranças, pagamentos e decisões fornecidos pelos contratos financeiros oficiais."
        primaryAction={
          <Button onClick={() => setOpenCreate(true)}>Nova cobrança</Button>
        }
        secondaryActions={
          <Button variant="outline" onClick={() => void refresh()}>
            Atualizar
          </Button>
        }
        contextChips={
          <>
            <AppStatusBadge
              label={`${charges.length} cobrança(s) no recorte`}
            />
            <AppStatusBadge label={`Avaliação: ${date(stats?.evaluatedAt)}`} />
          </>
        }
      />

      <AppSectionBlock
        title="Indicadores oficiais"
        subtitle="Zero é exibido como valor legítimo; ausência e erro permanecem explícitos."
      >
        {statsQuery.isLoading ? (
          <AppPageLoadingState title="Carregando indicadores" />
        ) : statsQuery.isError ? (
          <AppAlert>
            <AppAlertDescription>
              Indicadores indisponíveis. A carteira permanece visível.{" "}
              <Button
                variant="outline"
                onClick={() => void statsQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </AppAlertDescription>
          </AppAlert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Recebido", stats?.paid],
              ["A receber", stats?.pending],
              ["Vencido", stats?.overdue],
            ].map(([title, metric]) => (
              <AppInfoCard key={String(title)}>
                <p className="text-sm text-muted-foreground">{String(title)}</p>
                <strong>{money((metric as any)?.amountCents)}</strong>
                <p>
                  {typeof (metric as any)?.count === "number"
                    ? `${(metric as any).count} cobrança(s)`
                    : "Quantidade indisponível"}
                </p>
              </AppInfoCard>
            ))}
          </div>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Fila operacional oficial"
        subtitle="A ordem, prioridade, risco, motivo, ação e destino são apresentados exatamente como recebidos."
      >
        {queueQuery.isError ? (
          <AppAlert>
            <AppAlertDescription>
              Fila indisponível. Nenhuma recomendação local foi criada.{" "}
              <Button
                variant="outline"
                onClick={() => void queueQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </AppAlertDescription>
          </AppAlert>
        ) : queueQuery.isLoading ? (
          <AppPageLoadingState title="Carregando fila oficial" />
        ) : queue.length === 0 ? (
          <AppEmptyState
            title="Fila sem itens"
            description="O serviço financeiro não retornou recomendações operacionais para este recorte."
          />
        ) : (
          <AppDataTable className="min-w-[900px]">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Saldo e vencimento</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Risco</th>
                <th scope="col">Recomendação oficial</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(item => {
                const summary = item.financialOperationalSummary ?? {};
                return (
                  <tr
                    key={String(item.id)}
                    data-operational-severity={officialSeverity(
                      summary.riskLevel
                    )}
                  >
                    <td>
                      <strong>
                        {factualLabel(
                          item.customer?.name,
                          "Cliente não informado"
                        )}
                      </strong>
                      <span className="block text-xs text-muted-foreground">
                        {factualLabel(
                          summary.priorityReason,
                          "Motivo não informado"
                        )}
                      </span>
                    </td>
                    <td>
                      {money(item.balanceCents)}
                      <span className="block text-xs">
                        Vence {date(item.dueDate)}
                      </span>
                    </td>
                    <td>
                      <AppStatusBadge label={priorityLabel(summary.priority)} />
                    </td>
                    <td>
                      <AppStatusBadge label={riskLabel(summary.riskLevel)} />
                    </td>
                    <td>{actionLabel(summary.recommendedAction)}</td>
                    <td>
                      {summary.recommendedActionTarget === "CUSTOMER" &&
                      item.customerId ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/whatsapp?customerId=${item.customerId}&chargeId=${item.id}`
                            )
                          }
                        >
                          {actionLabel(summary.recommendedAction)}
                        </Button>
                      ) : summary.recommendedActionTarget === "CHARGE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayment(item)}
                        >
                          Abrir cobrança
                        </Button>
                      ) : (
                        <span>Sem destino oficial</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AppDataTable>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Carteira oficial"
        subtitle="Os filtros atuam apenas sobre campos factuais já recebidos."
      >
        <AppFiltersBar className="mb-3 grid gap-2 sm:grid-cols-2">
          <AppField label="Buscar cliente ou O.S." htmlFor="finance-search">
            <AppInput
              id="finance-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Nome ou número da O.S."
            />
          </AppField>
          <AppField label="Status oficial">
            <AppSelect
              ariaLabel="Filtrar por status oficial"
              value={status}
              onValueChange={setStatus}
              options={[
                { value: "all", label: "Todos" },
                { value: "PENDING", label: "Pendentes" },
                { value: "OVERDUE", label: "Vencidas" },
                { value: "PAID", label: "Pagas" },
                { value: "CANCELED", label: "Canceladas" },
              ]}
            />
          </AppField>
        </AppFiltersBar>
        {visibleCharges.length === 0 ? (
          <AppEmptyState
            title="Nenhuma cobrança encontrada"
            description="A carteira oficial não contém itens para os filtros selecionados."
          />
        ) : (
          <AppDataTable className="min-w-[980px]">
            <thead>
              <tr>
                <th scope="col">Cliente / origem</th>
                <th scope="col">Status</th>
                <th scope="col">Vencimento / atraso oficial</th>
                <th scope="col">Valores</th>
                <th scope="col">Pagamentos registrados</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleCharges.map(charge => (
                <tr key={String(charge.id)}>
                  <td>
                    <strong>
                      {factualLabel(
                        charge.customer?.name,
                        "Cliente não informado"
                      )}
                    </strong>
                    <span className="block text-xs text-muted-foreground">
                      O.S.:{" "}
                      {factualLabel(
                        charge.serviceOrder?.number,
                        "Não vinculada"
                      )}
                    </span>
                  </td>
                  <td>
                    <AppStatusBadge
                      label={statusLabel(charge.status)}
                      tone={statusTone(charge.status)}
                    />
                  </td>
                  <td>
                    {date(charge.dueDate)}
                    <span className="block text-xs">
                      {typeof charge.daysOverdue === "number"
                        ? `${charge.daysOverdue} dia(s) de atraso`
                        : "Atraso não calculado"}
                    </span>
                  </td>
                  <td>
                    <span className="block">
                      Original: {money(charge.amountCents)}
                    </span>
                    <span className="block">
                      Pago: {money(charge.paidAmountCents)}
                    </span>
                    <strong>Saldo: {money(charge.balanceCents)}</strong>
                  </td>
                  <td>
                    {Array.isArray(charge.payments) &&
                    charge.payments.length > 0 ? (
                      charge.payments.map((payment: any, index: number) => (
                        <span
                          className="block text-xs"
                          key={`${payment.paidAt ?? "payment"}-${index}`}
                        >
                          {money(payment.amountCents)} · {date(payment.paidAt)}{" "}
                          ·{" "}
                          {factualLabel(payment.method, "Método não informado")}
                        </span>
                      ))
                    ) : (
                      <span>Não informado pelo contrato</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {["PENDING", "OVERDUE"].includes(
                        String(charge.status)
                      ) ? (
                        <>
                          <Button size="sm" onClick={() => openPayment(charge)}>
                            Registrar pagamento
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCancellationError(null);
                              setCancellationReason("");
                              setCanceling(charge);
                            }}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <span>Sem ação disponível</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        )}
      </AppSectionBlock>

      <FormModal
        open={Boolean(paying)}
        onOpenChange={open => {
          if (!open) setPaying(null);
        }}
        title="Registrar pagamento manual"
        description={`Cobrança de ${factualLabel(paying?.customer?.name, "cliente não informado")}. Saldo oficial: ${money(paying?.balanceCents)}`}
        closeBlocked={pay.isPending}
        initialFocusRef={paymentInputRef}
        footer={
          <AppFormActions>
            <Button
              type="button"
              variant="outline"
              disabled={pay.isPending}
              onClick={() => setPaying(null)}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="manual-payment-form"
              disabled={pay.isPending}
            >
              {pay.isPending ? "Confirmando…" : "Confirmar pagamento"}
            </Button>
          </AppFormActions>
        }
      >
        <AppForm
          id="manual-payment-form"
          onSubmit={event => {
            event.preventDefault();
            void submitPayment();
          }}
        >
          {paymentError ? (
            <AppAlert>
              <AppAlertDescription id="payment-error">
                {paymentError}
              </AppAlertDescription>
            </AppAlert>
          ) : null}
          <AppFieldGroup>
            <AppField
              label="Valor exato em centavos"
              htmlFor="payment-amount"
              hint="O valor é validado novamente pelo serviço financeiro."
            >
              <AppInput
                ref={paymentInputRef}
                id="payment-amount"
                inputMode="numeric"
                value={amountCents}
                onChange={event => setAmountCents(event.target.value)}
                aria-invalid={Boolean(paymentError)}
                aria-describedby={paymentError ? "payment-error" : undefined}
              />
            </AppField>
            <AppField label="Método" htmlFor="payment-method">
              <AppSelect
                ariaLabel="Método do pagamento"
                value={method}
                onValueChange={value => setMethod(value as PaymentMethod)}
                options={methodOptions}
              />
            </AppField>
          </AppFieldGroup>
        </AppForm>
      </FormModal>

      <FormModal
        open={Boolean(canceling)}
        onOpenChange={open => {
          if (!open) setCanceling(null);
        }}
        title="Cancelar cobrança"
        description="Confirme a alteração de estado informando o motivo auditável."
        closeBlocked={cancel.isPending}
        initialFocusRef={cancellationInputRef}
        footer={
          <AppFormActions>
            <Button
              type="button"
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => setCanceling(null)}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="cancel-charge-form"
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelando…" : "Cancelar cobrança"}
            </Button>
          </AppFormActions>
        }
      >
        <AppForm
          id="cancel-charge-form"
          onSubmit={event => {
            event.preventDefault();
            void submitCancellation();
          }}
        >
          {cancellationError ? (
            <AppAlert>
              <AppAlertDescription id="cancellation-error">
                {cancellationError}
              </AppAlertDescription>
            </AppAlert>
          ) : null}
          <AppField
            label="Motivo do cancelamento"
            htmlFor="cancellation-reason"
            hint="O motivo será registrado na operação."
          >
            <AppInput
              ref={cancellationInputRef}
              id="cancellation-reason"
              value={cancellationReason}
              onChange={event => setCancellationReason(event.target.value)}
              aria-invalid={Boolean(cancellationError)}
              aria-describedby={
                cancellationError ? "cancellation-error" : undefined
              }
            />
          </AppField>
        </AppForm>
      </FormModal>

      <CreateChargeModal
        isOpen={openCreate}
        onClose={() => setOpenCreate(false)}
        onSuccess={() => {
          setOpenCreate(false);
          void refresh();
        }}
      />
    </AppPageShell>
  );
}

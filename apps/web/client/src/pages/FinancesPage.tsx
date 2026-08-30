import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreateChargeModal } from "@/components/CreateChargeModal";
import {
  AppPageErrorState,
  AppPageLoadingState,
  AppOperationalHeader,
  AppSectionBlock,
} from "@/components/internal-page-system";
import {
  AppInfoCard,
  AppInput,
  AppPageShell,
  AppSelect,
  AppStatusBadge,
} from "@/components/app-system";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { safeDate } from "@/lib/operational/kpi";
import { trpc } from "@/lib/trpc";
import type { OperationalSeverity } from "@/lib/operations/operational-intelligence";

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
  if (typeof value !== "number") return "Não calculada";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function date(value: unknown) {
  const parsed = safeDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "Não informada";
}

function label(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    OVERDUE: "Vencida",
    PAID: "Paga",
    CANCELED: "Cancelada",
  };
  return labels[String(value)] ?? "Não avaliado";
}

function priorityLabel(value: unknown) {
  const labels: Record<string, string> = {
    HIGH: "Alta",
    MEDIUM: "Média",
    LOW: "Baixa",
    P0: "P0",
    P1: "P1",
    P2: "P2",
    P3: "P3",
  };
  return labels[String(value)] ?? "Não classificada";
}

function riskLabel(value: unknown) {
  const labels: Record<string, string> = {
    NORMAL: "Normal (avaliação oficial)",
    WARNING: "Atenção",
    RESTRICTED: "Restrito",
    SUSPENDED: "Suspenso",
  };
  return labels[String(value)] ?? "Não informado";
}

function actionLabel(value: unknown) {
  const labels: Record<string, string> = {
    SEND_PAYMENT_LINK: "Enviar link de pagamento",
    SEND_REMINDER: "Enviar lembrete",
    CALL_CUSTOMER: "Contatar cliente",
    REVIEW_CHARGE: "Revisar cobrança",
    WAIT_FOR_DUE_DATE: "Aguardar vencimento",
  };
  return labels[String(value)] ?? "Sem recomendação oficial";
}

function officialSeverity(value: unknown): OperationalSeverity {
  const severityByRisk: Record<string, OperationalSeverity> = {
    NORMAL: "healthy",
    WARNING: "pending",
    RESTRICTED: "overdue",
    SUSPENDED: "critical",
  };
  return severityByRisk[String(value)] ?? "pending";
}

export default function FinancesPage() {
  const [, navigate] = useLocation();
  const [openCreate, setOpenCreate] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState<Charge | null>(null);
  const [amountCents, setAmountCents] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");

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

  const submitPayment = async () => {
    if (!paying) return;
    const exactAmount = Number(amountCents);
    if (!Number.isInteger(exactAmount) || exactAmount < 1) {
      toast.error("Informe o valor exato em centavos.");
      return;
    }
    try {
      await pay.mutateAsync({
        chargeId: String(paying.id),
        amountCents: exactAmount,
        method,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("Pagamento enviado para confirmação oficial.");
      setPaying(null);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível registrar o pagamento.");
    }
  };

  const cancelCharge = async (charge: Charge) => {
    const reason = window.prompt("Informe o motivo do cancelamento:");
    if (!reason?.trim()) return;
    try {
      await cancel.mutateAsync({
        chargeId: String(charge.id),
        cancellationReason: reason.trim(),
        expectedUpdatedAt: charge.updatedAt,
      });
      toast.success("Cobrança cancelada.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível cancelar a cobrança.");
    }
  };

  if (chargesQuery.isLoading) {
    return (
      <AppPageShell>
        <AppPageLoadingState title="Carregando carteira oficial" />
      </AppPageShell>
    );
  }
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
        description="Carteira, métricas e decisões fornecidas pelos contratos financeiros oficiais."
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
              label={label(stats?.operationalState, "Não avaliado")}
            />
            <AppStatusBadge label={`Avaliação: ${date(stats?.evaluatedAt)}`} />
          </>
        }
      />

      <AppSectionBlock
        title="Indicadores oficiais"
        subtitle="Valores da carteira completa; ausência nunca é convertida em zero saudável."
      >
        {statsQuery.isError ? (
          <AppInfoCard className="space-y-2">
            <p>
              Indicadores indisponíveis. A carteira permanece visível e a sessão
              foi preservada.
            </p>
            <Button variant="outline" onClick={() => void statsQuery.refetch()}>
              Tentar indicadores novamente
            </Button>
          </AppInfoCard>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <AppInfoCard>
              <p className="text-sm text-muted-foreground">Recebido</p>
              <strong>{money(stats?.paid?.amountCents)}</strong>
              <p>{stats?.paid?.count ?? "Não calculada"} cobrança(s)</p>
            </AppInfoCard>
            <AppInfoCard>
              <p className="text-sm text-muted-foreground">Pendente</p>
              <strong>{money(stats?.pending?.amountCents)}</strong>
              <p>{stats?.pending?.count ?? "Não calculada"} cobrança(s)</p>
            </AppInfoCard>
            <AppInfoCard>
              <p className="text-sm text-muted-foreground">Em atraso</p>
              <strong>{money(stats?.overdue?.amountCents)}</strong>
              <p>{stats?.overdue?.count ?? "Não calculada"} cobrança(s)</p>
            </AppInfoCard>
          </div>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Fila operacional oficial"
        subtitle="Ordenação, prioridade, risco, motivo e próxima ação são definidos pela API."
      >
        {queueQuery.isError ? (
          <AppInfoCard className="space-y-2">
            <p>
              Fila de decisão indisponível. Nenhuma recomendação local será
              criada.
            </p>
            <Button variant="outline" onClick={() => void queueQuery.refetch()}>
              Tentar fila novamente
            </Button>
          </AppInfoCard>
        ) : queueQuery.isLoading ? (
          <AppPageLoadingState title="Carregando avaliação operacional" />
        ) : queue.length === 0 ? (
          <AppInfoCard>Sem recomendações oficiais no momento.</AppInfoCard>
        ) : (
          <div className="space-y-2">
            {queue.map(item => {
              const summary = item.financialOperationalSummary ?? {};
              return (
                <AppInfoCard
                  key={String(item.id)}
                  data-operational-severity={officialSeverity(
                    summary.riskLevel
                  )}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <strong>
                      {label(item.customer?.name, "Cliente não informado")}
                    </strong>
                    <p>
                      {money(item.balanceCents ?? item.amountCents)} · vence{" "}
                      {date(item.dueDate)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {label(
                        summary.priorityReason,
                        "Motivo da intervenção não informado"
                      )}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p>Prioridade: {priorityLabel(summary.priority)}</p>
                    <p>Risco: {riskLabel(summary.riskLevel)}</p>
                    <p>Ação: {actionLabel(summary.recommendedAction)}</p>
                  </div>
                  {summary.recommendedActionTarget === "CUSTOMER" &&
                  item.customerId ? (
                    <Button
                      onClick={() =>
                        navigate(
                          `/whatsapp?customerId=${item.customerId}&chargeId=${item.id}`
                        )
                      }
                    >
                      {actionLabel(summary.recommendedAction)}
                    </Button>
                  ) : summary.recommendedActionTarget === "CHARGE" ? (
                    <Button variant="outline" onClick={() => setPaying(item)}>
                      Abrir cobrança
                    </Button>
                  ) : null}
                </AppInfoCard>
              );
            })}
          </div>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Carteira oficial"
        subtitle="Filtros abaixo apenas ocultam valores oficiais para apresentação."
      >
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <AppInput
            aria-label="Buscar na carteira"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar cliente ou O.S."
          />
          <AppSelect
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
        </div>
        <div className="space-y-2">
          {visibleCharges.map(charge => (
            <AppInfoCard
              key={String(charge.id)}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <strong>
                  {label(charge.customer?.name, "Cliente não informado")}
                </strong>
                <p>
                  {statusLabel(charge.status)} · vence {date(charge.dueDate)}
                </p>
                <p className="text-sm text-muted-foreground">
                  O.S.: {label(charge.serviceOrder?.number, "Não vinculada")}
                </p>
              </div>
              <div className="text-sm">
                <p>Original: {money(charge.amountCents)}</p>
                <p>Pago: {money(charge.paidAmountCents)}</p>
                <p>Saldo: {money(charge.balanceCents)}</p>
                <p>
                  Atraso:{" "}
                  {typeof charge.daysOverdue === "number"
                    ? `${charge.daysOverdue} dia(s)`
                    : "Não calculada"}
                </p>
              </div>
              <div className="flex gap-2">
                {["PENDING", "OVERDUE"].includes(String(charge.status)) ? (
                  <Button
                    onClick={() => {
                      setPaying(charge);
                      setAmountCents(String(charge.balanceCents ?? ""));
                    }}
                  >
                    Registrar pagamento
                  </Button>
                ) : null}
                {["PENDING", "OVERDUE"].includes(String(charge.status)) ? (
                  <Button
                    variant="outline"
                    onClick={() => void cancelCharge(charge)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </AppInfoCard>
          ))}
        </div>
      </AppSectionBlock>

      {paying ? (
        <AppInfoCard className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl space-y-3 border">
          <h2 className="font-semibold">Pagamento manual protegido</h2>
          <p>Saldo oficial: {money(paying.balanceCents)}</p>
          <AppInput
            aria-label="Valor exato em centavos"
            inputMode="numeric"
            value={amountCents}
            onChange={event => setAmountCents(event.target.value)}
          />
          <AppSelect
            value={method}
            onValueChange={value => setMethod(value as PaymentMethod)}
            options={methodOptions}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaying(null)}>
              Voltar
            </Button>
            <Button
              disabled={pay.isPending}
              onClick={() => void submitPayment()}
            >
              Confirmar valor exato
            </Button>
          </div>
        </AppInfoCard>
      ) : null}

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

// Billing hierarchy keeps subscription status first; plan cards remain secondary AppSectionCard content.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AppDataTable,
  AppPageShell,
  AppSectionCard,
  AppStatusBadge,
} from "@/components/app-system";
import { BaseModal } from "@/components/app-modal-system";
import {
  OperationalActionPanel,
  OperationalKpiCard,
  OperationalPanel,
  OperationalPriorityItem,
  OperationalTimelineItem,
} from "@/components/operational";
import { trpc } from "@/lib/trpc";
import {
  formatCurrencyCents,
  formatQuotaCount,
  humanizePlanFeatures,
  normalizePlanCatalog,
  type PlanName,
} from "@/lib/billing/plan-catalog";

type VisiblePlan = "STARTER" | "PRO" | "BUSINESS";
type AccountStatus =
  | "ACTIVE"
  | "TRIAL"
  | "PAST_DUE"
  | "CANCELED"
  | "NO_SUBSCRIPTION"
  | "SUSPENDED";
type InvoiceStatus = "PAID" | "PENDING" | "FAILED" | "REFUNDED";
type GovernanceStatus = "NORMAL" | "WARNING" | "RESTRICTED" | "SUSPENDED";
type PlanRelation = "current" | "upgrade" | "downgrade" | "available";

const PLAN_PRICE_ID: Record<PlanName, string | null> = {
  FREE: null,
  STARTER: "price_starter",
  PRO: "price_pro",
  BUSINESS: "price_business",
};

const VISIBLE_PLANS: VisiblePlan[] = ["STARTER", "PRO", "BUSINESS"];

const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: "Assinatura ativa",
  TRIAL: "Período de avaliação",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Assinatura cancelada",
  NO_SUBSCRIPTION: "Sem assinatura ativa",
  SUSPENDED: "Assinatura suspensa",
};

const GOVERNANCE_STATUS_LABEL: Record<GovernanceStatus, string> = {
  NORMAL: "Operação saudável",
  WARNING: "Atenção necessária",
  RESTRICTED: "Operação comprometida",
  SUSPENDED: "Operação bloqueada",
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PAID: "Pago",
  PENDING: "Aguardando pagamento",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
};
const PLAN_ORDER: Record<PlanName, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  BUSINESS: 3,
};

function normalizePlanName(value: unknown): PlanName | null {
  if (!value) return null;
  const candidate = String(value).toUpperCase();
  const normalized = candidate === "SCALE" ? "BUSINESS" : candidate;
  return ["FREE", "STARTER", "PRO", "BUSINESS"].includes(normalized)
    ? (normalized as PlanName)
    : null;
}

function safePlanName(value: unknown): PlanName {
  return normalizePlanName(value) ?? "FREE";
}

function visibleCurrentPlan(value: unknown): VisiblePlan | null {
  const plan = normalizePlanName(value);
  return plan && VISIBLE_PLANS.includes(plan as VisiblePlan)
    ? (plan as VisiblePlan)
    : null;
}

function planRelation(
  plan: VisiblePlan,
  currentVisiblePlan: VisiblePlan | null
): PlanRelation {
  if (!currentVisiblePlan) return "available";
  if (plan === currentVisiblePlan) return "current";
  return PLAN_ORDER[plan] > PLAN_ORDER[currentVisiblePlan]
    ? "upgrade"
    : "downgrade";
}

function planBadgeLabel(relation: PlanRelation) {
  if (relation === "current") return "Plano atual";
  if (relation === "upgrade") return "Upgrade";
  if (relation === "downgrade") return "Downgrade";
  return "Disponível";
}

function planCtaLabel(relation: PlanRelation) {
  if (relation === "current") return "Revisar plano atual";
  if (relation === "upgrade") return "Fazer upgrade";
  if (relation === "downgrade") return "Fazer downgrade";
  return "Revisar plano";
}

function planRelationTone(
  relation: PlanRelation
): "success" | "info" | "warning" | "neutral" {
  if (relation === "current") return "success";
  if (relation === "upgrade") return "info";
  if (relation === "downgrade") return "warning";
  return "neutral";
}

function accountStatus(value: unknown): AccountStatus {
  const status = String(value ?? "ACTIVE").toUpperCase();
  if (status === "TRIALING") return "TRIAL";
  if (status === "UNPAID") return "PAST_DUE";
  return [
    "ACTIVE",
    "TRIAL",
    "PAST_DUE",
    "CANCELED",
    "NO_SUBSCRIPTION",
    "SUSPENDED",
  ].includes(status)
    ? (status as AccountStatus)
    : "ACTIVE";
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function invoiceAmount(
  event: any,
  fallbackCents: number | null | undefined
) {
  const candidate =
    event?.amountCents ?? event?.amount ?? event?.totalCents ?? fallbackCents;

  if (candidate === null || candidate === undefined) return null;

  const amount = Number(candidate);
  return Number.isFinite(amount) ? amount : fallbackCents ?? null;
}

function hasPaymentFailure(events: any[]) {
  return events.some(event => {
    const status = String(event?.status ?? event?.state ?? "").toUpperCase();
    const type = String(event?.type ?? event?.description ?? "").toUpperCase();
    return ["FAILED", "FAILURE", "PAST_DUE", "UNPAID"].some(
      token => status.includes(token) || type.includes(token)
    );
  });
}

function statusTone(
  status: AccountStatus
): "success" | "info" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE") return "success";
  if (status === "TRIAL") return "info";
  if (status === "PAST_DUE") return "warning";
  if (status === "CANCELED" || status === "SUSPENDED") return "danger";
  return "neutral";
}

function governanceTone(
  status: GovernanceStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "NORMAL") return "success";
  if (status === "WARNING") return "warning";
  if (status === "RESTRICTED") return "danger";
  return "neutral";
}

function timelineLabel(event: any) {
  const raw = String(event?.type ?? event?.status ?? event?.description ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (raw.includes("CREATED") || raw.includes("CREATE")) return "Plano criado";
  if (raw.includes("TRIAL")) return "Trial iniciado";
  if (raw.includes("PLAN") || raw.includes("UPDATED")) return "Plano alterado";
  if (raw.includes("PAID") || raw.includes("SUCCEEDED"))
    return "Pagamento recebido";
  if (raw.includes("FAILED") || raw.includes("PAST_DUE"))
    return "Pagamento falhou";
  if (raw.includes("RENEW")) return "Renovação executada";
  if (raw.includes("CANCEL")) return "Assinatura cancelada";
  return "Fatura gerada";
}

function invoiceStatus(event: any): InvoiceStatus {
  const raw = String(event?.status ?? event?.state ?? "PENDING").toUpperCase();
  if (["PAID", "COMPLETED", "SUCCEEDED"].some(token => raw.includes(token)))
    return "PAID";
  if (
    ["FAILED", "FAILURE", "PAST_DUE", "UNPAID"].some(token =>
      raw.includes(token)
    )
  )
    return "FAILED";
  if (raw.includes("REFUND")) return "REFUNDED";
  return "PENDING";
}

function invoiceTone(
  status: InvoiceStatus
): "success" | "warning" | "danger" | "neutral" {
  return status === "PAID"
    ? "success"
    : status === "FAILED"
      ? "danger"
      : status === "PENDING"
        ? "warning"
        : "neutral";
}

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState<VisiblePlan | null>(null);
  const plansQuery = trpc.billing.plans.useQuery(undefined, { retry: false });
  const statusQuery = trpc.billing.status.useQuery(undefined, { retry: false });
  const limitsQuery = trpc.billing.limits.useQuery(undefined, { retry: false });
  const readinessQuery = trpc.integrations.readiness.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();

  const planCatalog = useMemo(
    () => normalizePlanCatalog(plansQuery.data),
    [plansQuery.data]
  );
  const planByName = useMemo(
    () => new Map(planCatalog.map(plan => [plan.name, plan] as const)),
    [planCatalog]
  );

  const rawCurrentPlan = statusQuery.data?.plan ?? limitsQuery.data?.plan;
  const currentPlan = safePlanName(rawCurrentPlan);
  const currentVisiblePlan = visibleCurrentPlan(rawCurrentPlan);
  const currentCatalogPlan = planByName.get(currentPlan) ?? null;
  const currentPlanDisplayName =
    currentCatalogPlan?.displayName ?? currentPlan;
  const status = accountStatus(
    statusQuery.data?.status ?? limitsQuery.data?.status
  );
  const stripeConfigured =
    readinessQuery.data?.integrations?.stripe === "configured" ||
    readinessQuery.data?.stripe?.configured === true;
  const nextRenewal =
    statusQuery.data?.currentPeriodEnd ?? limitsQuery.data?.trial?.endsAt;
  const nextChargeAt = statusQuery.data?.nextBillingAt ?? nextRenewal;
  const nextChargeValue =
    statusQuery.data?.nextAmountCents ??
    statusQuery.data?.amountCents ??
    currentCatalogPlan?.priceCents ??
    null;
  const rawPaymentMethod =
    statusQuery.data?.paymentMethodBrand ?? statusQuery.data?.paymentMethod;
  const hasPaymentMethod = Boolean(String(rawPaymentMethod ?? "").trim());
  const paymentMethod = hasPaymentMethod
    ? String(rawPaymentMethod)
    : "Não informado";
  const events = Array.isArray(statusQuery.data?.events)
    ? statusQuery.data.events
    : [];
  const paymentFailed = hasPaymentFailure(events) || status === "PAST_DUE";
  const activeUsers = Number(
    limitsQuery.data?.usage?.users?.used ?? statusQuery.data?.activeUsers ?? 1
  );
  const governanceStatus: GovernanceStatus =
    status === "SUSPENDED"
      ? "SUSPENDED"
      : status === "CANCELED" || paymentFailed
        ? "RESTRICTED"
        : status === "TRIAL" || paymentMethod === "Não informado"
          ? "WARNING"
          : "NORMAL";
  const paymentActionLabel = hasPaymentMethod
    ? "Atualizar pagamento"
    : "Configurar pagamento";
  const primaryActionLabel =
    status === "CANCELED"
      ? "Revisar assinatura"
      : status === "PAST_DUE" || governanceStatus === "WARNING"
        ? paymentActionLabel
        : "Trocar plano";
  const riskDays = nextChargeAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(String(nextChargeAt)).getTime() - Date.now()) / 86400000
        )
      )
    : null;

  const checkoutMutation = trpc.billing.checkout.useMutation({
    onSuccess: payload => {
      const checkoutUrl = payload?.url ?? payload?.checkoutUrl;
      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }
      toast.success("Plano atualizado.");
      void Promise.all([
        utils.billing.status.invalidate(),
        utils.billing.limits.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || "Falha ao iniciar checkout."),
  });

  const cancelMutation = trpc.billing.cancel.useMutation({
    onSuccess: async () => {
      toast.success("Assinatura cancelada para o próximo ciclo.");
      await Promise.all([
        utils.billing.status.invalidate(),
        utils.billing.limits.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || "Não foi possível cancelar."),
  });

  const startCheckout = (plan: PlanName) => {
    if (!stripeConfigured) {
      toast.error("Checkout indisponível sem Stripe configurado.");
      return;
    }
    const priceId = PLAN_PRICE_ID[plan];
    if (!priceId) return;
    checkoutMutation.mutate({
      priceId,
      successUrl: `${window.location.origin}/billing`,
      cancelUrl: `${window.location.origin}/billing`,
    });
  };

  const timelineEvents = useMemo(() => events.slice(0, 8), [events]);
  const selectedPlanMeta = selectedPlan
    ? planByName.get(selectedPlan) ?? null
    : null;
  const selectedPlanFeatures = selectedPlanMeta
    ? humanizePlanFeatures(selectedPlanMeta.features)
    : [];
  const selectedPlanRelation = selectedPlan
    ? planRelation(selectedPlan, currentVisiblePlan)
    : null;

  return (
    <AppPageShell className="gap-3">
        <OperationalPanel
          title="Controle da assinatura do Nexo"
          subtitle="Qual plano eu tenho, quanto pago, quando renova e o que acontece se houver problema?"
          variant="hero"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div>
                <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Controle da assinatura do Nexo
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Empresa → plano → assinatura → renovação → acesso.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AppStatusBadge
                  label={ACCOUNT_STATUS_LABEL[status]}
                  tone={statusTone(status)}
                />
                <AppStatusBadge
                  label={`Operacional: ${governanceStatus} — ${GOVERNANCE_STATUS_LABEL[governanceStatus]}`}
                  tone={governanceTone(governanceStatus)}
                />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  Plano {currentPlanDisplayName}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formatCurrencyCents(nextChargeValue)} / mês
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OperationalKpiCard
              label="Próxima renovação"
              value={formatDate(nextRenewal)}
              helper="Renovação automática da assinatura."
            />
            <OperationalKpiCard
              label="Próxima cobrança"
              value={formatDate(nextChargeAt)}
              helper={
                paymentFailed
                  ? "Falha recente registrada."
                  : "Nenhuma falha registrada."
              }
              tone={paymentFailed ? "warning" : "default"}
            />
            <OperationalKpiCard
              label="Método"
              value={paymentMethod}
              helper={hasPaymentMethod ? "Método em uso." : "Ação necessária."}
              tone={hasPaymentMethod ? "default" : "warning"}
            />
            <OperationalKpiCard
              label="Usuários ativos"
              value={String(activeUsers)}
              helper="Uso atual da empresa."
            />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(280px,0.4fr)]">
            <OperationalPriorityItem
              tone={paymentFailed || !hasPaymentMethod ? "high" : "low"}
              title={
                paymentFailed
                  ? "Pagamento exige atenção"
                  : hasPaymentMethod
                    ? "Assinatura sem bloqueio de pagamento"
                    : "Método de pagamento pendente"
              }
              description={
                paymentFailed
                  ? "Há falha recente registrada; atualize o pagamento para evitar restrição de acesso."
                  : hasPaymentMethod
                    ? "Plano, renovação e método estão legíveis para a empresa."
                    : "Adicione um método para manter a renovação previsível."
              }
            />
            <OperationalActionPanel
              title="Ação principal da assinatura"
              description={
                paymentFailed || !hasPaymentMethod
                  ? "Atualize o pagamento antes da próxima tentativa."
                  : "Gerencie plano e faturas sem misturar Billing com financeiro operacional."
              }
              tone={paymentFailed || !hasPaymentMethod ? "warning" : "success"}
              display="compactHealthy"
              primaryAction={{
                label:
                  paymentFailed || !hasPaymentMethod
                    ? "Atualizar pagamento"
                    : "Ver faturas",
                onClick: () =>
                  document
                    .getElementById(
                      paymentFailed || !hasPaymentMethod
                        ? "billing-payment"
                        : "billing-invoices"
                    )
                    ?.scrollIntoView({ behavior: "smooth" }),
              }}
              secondaryAction={{
                label: "Trocar plano",
                onClick: () =>
                  document
                    .getElementById("billing-plans")
                    ?.scrollIntoView({ behavior: "smooth" }),
              }}
            />
          </div>
        </OperationalPanel>

        <AppSectionCard className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Ações rápidas
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Próxima melhor ação e demais controles disponíveis para a
                assinatura atual.
              </p>
            </div>
            <AppStatusBadge
              label={`CTA principal: ${primaryActionLabel}`}
              tone={governanceTone(governanceStatus)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              onClick={() => startCheckout(currentPlan)}
              disabled={currentPlan === "FREE"}
              variant={
                primaryActionLabel === paymentActionLabel
                  ? "default"
                  : "outline"
              }
            >
              {paymentActionLabel}
            </Button>
            <Button
              onClick={() =>
                setSelectedPlan(currentPlan === "BUSINESS" ? "PRO" : "BUSINESS")
              }
              variant={
                primaryActionLabel === "Trocar plano" ? "default" : "outline"
              }
            >
              Trocar plano
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                document
                  .getElementById("billing-history")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Ver histórico
            </Button>
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || currentPlan === "FREE"}
            >
              Cancelar assinatura
            </Button>
          </div>
        </AppSectionCard>

        <AppSectionCard
          className={`space-y-3 ${governanceStatus === "NORMAL" ? "" : "border-[color-mix(in_srgb,var(--warning)_45%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-primary))]"}`}
        >
          <AppStatusBadge
            label={
              governanceStatus === "NORMAL"
                ? "Sem risco crítico"
                : "Atenção na assinatura"
            }
            tone={governanceTone(governanceStatus)}
          />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {governanceStatus === "NORMAL"
              ? "Sem risco crítico de Billing"
              : "Atenção na assinatura"}
          </h2>
          {governanceStatus === "NORMAL" ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Sua assinatura está ativa e sem falhas de pagamento retornadas.
            </p>
          ) : (
            <div className="grid gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-2 xl:grid-cols-4">
              <p>
                <strong className="text-[var(--text-primary)]">Motivo:</strong>{" "}
                renovação pendente ou dados de pagamento incompletos.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Impacto:</strong>{" "}
                a assinatura pode entrar em restrição se o pagamento não for
                processado.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Prazo:</strong>{" "}
                próxima tentativa{" "}
                {riskDays === null
                  ? "em data não informada"
                  : `em ${riskDays} dias`}
                .
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">
                  Ação recomendada:
                </strong>{" "}
                {paymentActionLabel.toLowerCase()}.
              </p>
            </div>
          )}
          {governanceStatus === "NORMAL" ? null : (
            <Button
              className="w-full sm:w-fit"
              onClick={() => startCheckout(currentPlan)}
            >
              {paymentActionLabel}
            </Button>
          )}
        </AppSectionCard>

        <AppSectionCard className="space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Estado operacional
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                Governança do Billing
              </h2>
            </div>
            <AppStatusBadge
              label={`${governanceStatus} — ${GOVERNANCE_STATUS_LABEL[governanceStatus]}`}
              tone={governanceTone(governanceStatus)}
            />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Motivo:</strong>{" "}
            {governanceStatus === "NORMAL"
              ? "assinatura ativa e pagamento sem falha retornada"
              : governanceStatus === "WARNING"
                ? "renovação pendente ou dados de pagamento incompletos"
                : paymentFailed
                  ? "pagamento falhou ou está pendente"
                  : "assinatura sem acesso operacional regular"}
            .
          </p>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-3 text-sm text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">
              Próximos passos automáticos:
            </strong>
            <ul className="mt-2 space-y-1">
              <li>• manter acesso quando a assinatura estiver regular</li>
              <li>• enviar lembrete administrativo quando houver atenção</li>
              <li>• {paymentActionLabel.toLowerCase()}</li>
              <li>• aplicar restrição, se necessário</li>
              <li>• registrar evento na timeline</li>
            </ul>
          </div>
        </AppSectionCard>

        <AppSectionCard id="billing-invoices" className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Faturas e pagamentos
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Tabela operacional da cobrança da plataforma Nexo.
            </p>
          </div>
          <AppDataTable className="min-w-[920px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2">Pagamento</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {events.length ? (
                events.slice(0, 10).map((event: any, index: number) => {
                  const st = invoiceStatus(event);
                  return (
                    <tr
                      key={String(event?.id ?? index)}
                      className="border-b border-[var(--border-subtle)]/60"
                    >
                      <td className="px-3 py-3">
                        {String(
                          event?.period ??
                            event?.invoiceNumber ??
                            `Ciclo ${index + 1}`
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {formatCurrencyCents(invoiceAmount(event, currentCatalogPlan?.priceCents))}
                      </td>
                      <td className="px-3 py-3">
                        <AppStatusBadge
                          label={INVOICE_STATUS_LABEL[st]}
                          tone={invoiceTone(st)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {String(event?.method ?? paymentMethod)}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(event?.dueAt ?? event?.dueDate)}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(event?.paidAt ?? event?.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline">
                            visualizar
                          </Button>
                          <Button size="sm" variant="outline">
                            baixar
                          </Button>
                          <Button size="sm" variant="outline">
                            reenviar
                          </Button>
                          {st === "FAILED" ? (
                            <Button
                              size="sm"
                              onClick={() => startCheckout(currentPlan)}
                            >
                              pagar novamente
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-6">
                    <div className="space-y-3 text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">
                        Nenhuma fatura retornada pela fonte de Billing.
                      </p>
                      <p className="text-sm">
                        Quando a primeira cobrança da plataforma for gerada, ela
                        aparecerá aqui.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void statusQuery.refetch()}
                        >
                          Atualizar leitura
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            document
                              .getElementById("billing-history")
                              ?.scrollIntoView({ behavior: "smooth" })
                          }
                        >
                          Ver histórico
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </AppDataTable>
        </AppSectionCard>

        <OperationalPanel
          id="billing-history"
          title="Histórico da assinatura"
          subtitle="Timeline oficial de eventos de Billing."
        >
          <div className="space-y-3">
            {timelineEvents.length ? (
              timelineEvents.map((event: any, index: number) => (
                <OperationalTimelineItem
                  key={String(event?.id ?? index)}
                  title={String(event?.description ?? timelineLabel(event))}
                  description={`Responsável: ${String(event?.actor ?? event?.user ?? "Sistema Billing")} • Origem: ${String(event?.provider ?? event?.source ?? "Nexo Billing")}`}
                  entityLabel={timelineLabel(event)}
                  time={formatDate(
                    event?.createdAt ?? event?.date ?? event?.paidAt
                  )}
                  tone={
                    invoiceStatus(event) === "FAILED" ? "warning" : "default"
                  }
                  withLine={index < timelineEvents.length - 1}
                />
              ))
            ) : (
              <OperationalPriorityItem
                tone="neutral"
                title="Histórico ainda não disponível para esta assinatura."
                description="Nenhum evento oficial foi retornado pela fonte de Billing. Nenhum histórico fictício foi criado."
              />
            )}
          </div>
        </OperationalPanel>

        <AppSectionCard id="billing-plans" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Trocar plano
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Compare limites e recursos antes de alterar sua assinatura.
            </p>
          </div>

          {plansQuery.isLoading ? (
            <OperationalPriorityItem
              tone="neutral"
              title="Carregando catálogo comercial"
              description="Consultando preços e limites na fonte oficial de Billing."
            />
          ) : plansQuery.isError ||
            !VISIBLE_PLANS.some(plan => planByName.has(plan)) ? (
            <div className="space-y-3">
              <OperationalPriorityItem
                tone="medium"
                title="Catálogo comercial indisponível"
                description="Nenhum preço ou limite local foi usado como substituto. Atualize a leitura para consultar a fonte oficial."
              />
              <Button
                variant="outline"
                onClick={() => void plansQuery.refetch()}
              >
                Atualizar catálogo
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {VISIBLE_PLANS.map(plan => {
                const planMeta = planByName.get(plan);
                if (!planMeta) return null;

                const relation = planRelation(plan, currentVisiblePlan);
                const featureLabels = humanizePlanFeatures(planMeta.features);

                return (
                  <AppSectionCard key={plan} className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                          {planMeta.displayName}
                        </h3>
                        <p className="text-2xl font-semibold text-[var(--text-primary)]">
                          {formatCurrencyCents(planMeta.priceCents)}
                        </p>
                      </div>

                      <AppStatusBadge
                        label={planBadgeLabel(relation)}
                        tone={planRelationTone(relation)}
                      />
                    </div>

                    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                      <p>
                        Usuários:{" "}
                        <strong className="text-[var(--text-primary)]">
                          {formatQuotaCount(planMeta.quotas.users)}
                        </strong>
                      </p>

                      <p>
                        Clientes:{" "}
                        <strong className="text-[var(--text-primary)]">
                          {formatQuotaCount(planMeta.quotas.customers)}
                        </strong>
                      </p>

                      {featureLabels.map(feature => (
                        <p key={feature}>• {feature}</p>
                      ))}
                    </div>

                    <Button
                      className="w-full"
                      variant={relation === "current" ? "outline" : "default"}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      {planCtaLabel(relation)}
                    </Button>
                  </AppSectionCard>
                );
              })}
            </div>
          )}
        </AppSectionCard>

        <BaseModal
          open={Boolean(selectedPlan)}
          onOpenChange={open => !open && setSelectedPlan(null)}
          title="Revisar assinatura"
          description="Esta ação abre o fluxo administrativo de assinatura. Nenhuma cobrança ou alteração será executada automaticamente nesta tela."
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedPlan(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => selectedPlan && startCheckout(selectedPlan)}
                disabled={!selectedPlan || checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? "Processando..." : "Confirmar"}
              </Button>
            </div>
          }
        >
          {selectedPlanMeta && selectedPlan && selectedPlanRelation ? (
            <div className="space-y-3 text-sm text-[var(--text-secondary)]">
              <AppStatusBadge
                label={planBadgeLabel(selectedPlanRelation).toUpperCase()}
                tone={planRelationTone(selectedPlanRelation)}
              />
              <p className="text-base font-semibold text-[var(--text-primary)]">
                {selectedPlanRelation === "upgrade"
                  ? `Você está prestes a fazer upgrade para o plano ${selectedPlanMeta.displayName}.`
                  : selectedPlanRelation === "downgrade"
                    ? `Você está prestes a fazer downgrade para o plano ${selectedPlanMeta.displayName}.`
                    : selectedPlanRelation === "current"
                      ? "Você está revisando seu plano atual."
                      : `Você está revisando o plano ${selectedPlanMeta.displayName}.`}
              </p>
              <p>
                Esta ação abre o fluxo administrativo de assinatura. Nenhuma
                cobrança ou alteração será executada automaticamente nesta tela.
              </p>
              <p className="font-medium text-[var(--text-primary)]">
                {selectedPlanMeta.displayName} —{" "}
                  {formatCurrencyCents(selectedPlanMeta.priceCents)} / mês
              </p>
              <p>
                  Usuários permitidos:{" "}
                  {formatQuotaCount(selectedPlanMeta.quotas.users)}
                </p>
              <p>
                  Clientes permitidos:{" "}
                  {formatQuotaCount(selectedPlanMeta.quotas.customers)}
                </p>
              <p>
                  Recursos:{" "}
                  {selectedPlanFeatures.length
                    ? selectedPlanFeatures.join(", ")
                    : "Recursos padrão do plano"}
                  .
                </p>
            </div>
          ) : null}
        </BaseModal>
    </AppPageShell>
  );
}

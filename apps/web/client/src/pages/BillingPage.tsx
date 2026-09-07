import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmModal } from "@/components/app-modal-system";
import {
  AppAlert,
  AppAlertDescription,
  AppAlertTitle,
  AppPageShell,
  AppSectionCard,
  AppStatusBadge,
} from "@/components/app-system";
import {
  AppOperationalHeader,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
} from "@/components/internal-page-system";
import { Button } from "@/components/ui/button";
import {
  formatPlanPrice,
  formatPlanQuota,
  normalizeBillingPlanCatalog,
  type BillingPlanCatalogEntry,
  type BillingPlanName,
} from "@/lib/billing-plan-catalog";
import { trpc } from "@/lib/trpc";

type SubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "CANCELED"
  | "PAST_DUE"
  | "SUSPENDED"
  | "NO_SUBSCRIPTION";

const STATUS_PRESENTATION: Record<
  SubscriptionStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  TRIALING: { label: "Em avaliação", tone: "info" },
  CANCELED: { label: "Cancelada", tone: "danger" },
  PAST_DUE: { label: "Pagamento pendente", tone: "warning" },
  SUSPENDED: { label: "Suspensa", tone: "danger" },
  NO_SUBSCRIPTION: { label: "Sem assinatura", tone: "neutral" },
};

const CHECKOUT_PLANS: BillingPlanName[] = ["STARTER", "PRO", "BUSINESS"];
const USAGE_LABELS: Record<string, string> = {
  customers: "Clientes",
  appointments: "Agendamentos",
  messages: "Mensagens",
  serviceOrders: "Ordens de serviço",
  users: "Usuários",
};

function parseStatus(value: unknown): SubscriptionStatus | null {
  const status = String(value ?? "").toUpperCase();
  return status in STATUS_PRESENTATION ? (status as SubscriptionStatus) : null;
}

function parsePlanName(value: unknown): BillingPlanName | null {
  const name = String(value ?? "").toUpperCase();
  return ["FREE", "STARTER", "PRO", "BUSINESS"].includes(name)
    ? (name as BillingPlanName)
    : null;
}

function formatDate(value: unknown): string {
  if (!value) return "Não informada";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Não informada"
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

function planDescription(plan: BillingPlanCatalogEntry): string {
  const quotas = ["users", "customers"]
    .filter(key => key in plan.quotas)
    .map(key => `${USAGE_LABELS[key]}: ${formatPlanQuota(plan.quotas[key])}`);
  return quotas.join(" · ");
}

export default function BillingPage() {
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlanName | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const plansQuery = trpc.billing.plans.useQuery(undefined, { retry: false });
  const statusQuery = trpc.billing.status.useQuery(undefined, { retry: false });
  const limitsQuery = trpc.billing.limits.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const catalog = useMemo(
    () => normalizeBillingPlanCatalog(plansQuery.data),
    [plansQuery.data]
  );
  const status = parseStatus(statusQuery.data?.status);
  const currentPlanName = parsePlanName(statusQuery.data?.plan);
  const currentPlan = catalog.find(plan => plan.name === currentPlanName) ?? null;
  const checkoutOptions = catalog.filter(plan =>
    CHECKOUT_PLANS.includes(plan.name)
  );
  const usage = Object.entries(limitsQuery.data?.usage ?? {}).filter(
    ([key, value]) =>
      key in USAGE_LABELS && value && typeof value === "object"
  ) as Array<[string, { used?: unknown; limit?: unknown; unlimited?: unknown }]>;

  const refresh = () => {
    void Promise.all([
      statusQuery.refetch(),
      plansQuery.refetch(),
      limitsQuery.refetch(),
    ]);
  };

  const checkoutMutation = trpc.billing.checkout.useMutation({
    onSuccess: payload => {
      const destination = payload?.url ?? payload?.checkoutUrl;
      if (destination) {
        window.location.assign(destination);
        return;
      }
      setCheckoutPlan(null);
      toast.success("Assinatura atualizada pelo serviço de Billing.");
      void Promise.all([
        utils.billing.status.invalidate(),
        utils.billing.limits.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || "Não foi possível abrir o checkout."),
  });

  const cancelMutation = trpc.billing.cancel.useMutation({
    onSuccess: async () => {
      setCancelOpen(false);
      toast.success("Cancelamento confirmado pelo serviço de Billing.");
      await Promise.all([
        utils.billing.status.invalidate(),
        utils.billing.limits.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || "Não foi possível cancelar a assinatura."),
  });

  const startCheckout = () => {
    if (!checkoutPlan || checkoutPlan === "FREE") return;
    checkoutMutation.mutate({
      planName: checkoutPlan,
      successUrl: `${window.location.origin}/billing`,
      cancelUrl: `${window.location.origin}/billing`,
    });
  };

  return (
    <AppPageShell className="gap-4 p-3 md:p-5">
      <AppOperationalHeader
        title="Billing"
        description="Plano e assinatura da organização para utilizar o NexoGestão."
        secondaryActions={
          <Button
            type="button"
            variant="outline"
            onClick={refresh}
            disabled={
              statusQuery.isFetching || plansQuery.isFetching || limitsQuery.isFetching
            }
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
        contextChips={
          <>
            {currentPlan ? <AppStatusBadge label={currentPlan.displayName} /> : null}
            {status ? (
              <AppStatusBadge
                label={STATUS_PRESENTATION[status].label}
                tone={STATUS_PRESENTATION[status].tone}
              />
            ) : null}
          </>
        }
      />

      <AppSectionBlock
        title="Assinatura atual"
        subtitle="Estado retornado pelo Billing e preço vigente do catálogo comercial."
      >
        {statusQuery.isLoading ? (
          <AppPageLoadingState
            title="Carregando assinatura"
            description="Consultando a assinatura da organização autenticada."
          />
        ) : statusQuery.isError ? (
          <AppPageErrorState
            title="Assinatura indisponível"
            description="A fonte oficial de Billing não pôde ser consultada. Nenhum plano ou status foi presumido."
            onAction={() => void statusQuery.refetch()}
          />
        ) : !status ? (
          <AppPageErrorState
            title="Status não reconhecido"
            description="Billing retornou um estado fora do contrato conhecido. Ele não foi convertido em assinatura ativa."
            onAction={() => void statusQuery.refetch()}
          />
        ) : status === "NO_SUBSCRIPTION" ? (
          <AppPageEmptyState
            title="Nenhuma assinatura encontrada"
            description="Billing informou que esta organização não possui assinatura. Isso não foi convertido em uma assinatura ativa."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AppSectionCard className="min-w-0 p-4">
              <p className="text-xs text-[var(--text-muted)]">Plano</p>
              <p className="mt-1 truncate font-semibold text-[var(--text-primary)]">
                {currentPlan?.displayName ?? "Catálogo indisponível"}
              </p>
            </AppSectionCard>
            <AppSectionCard className="min-w-0 p-4">
              <p className="text-xs text-[var(--text-muted)]">Status oficial</p>
              <div className="mt-1">
                <AppStatusBadge
                  label={STATUS_PRESENTATION[status].label}
                  tone={STATUS_PRESENTATION[status].tone}
                />
              </div>
            </AppSectionCard>
            <AppSectionCard className="min-w-0 p-4">
              <p className="text-xs text-[var(--text-muted)]">Preço no catálogo</p>
              <p className="mt-1 break-words font-semibold text-[var(--text-primary)]">
                {currentPlan ? formatPlanPrice(currentPlan.priceCents) : "Não informado"}
              </p>
            </AppSectionCard>
            <AppSectionCard className="min-w-0 p-4">
              <p className="text-xs text-[var(--text-muted)]">Fim do período atual</p>
              <p className="mt-1 font-semibold text-[var(--text-primary)]">
                {formatDate(statusQuery.data?.currentPeriodEnd)}
              </p>
            </AppSectionCard>
          </div>
        )}

        {!plansQuery.isLoading && plansQuery.isError ? (
          <AppAlert className="mt-4">
            <AppAlertTitle>Preço do catálogo indisponível</AppAlertTitle>
            <AppAlertDescription>
              A assinatura continua visível, mas nenhum preço local foi usado como fallback.
            </AppAlertDescription>
          </AppAlert>
        ) : null}
      </AppSectionBlock>

      <AppSectionBlock
        title="Uso e limites"
        subtitle="Métricas calculadas no backend para a organização autenticada."
      >
        {limitsQuery.isLoading ? (
          <AppPageLoadingState title="Carregando uso e limites" />
        ) : limitsQuery.isError ? (
          <AppPageErrorState
            title="Uso indisponível"
            description="A consulta de quotas falhou. A página não contou entidades no navegador."
            onAction={() => void limitsQuery.refetch()}
          />
        ) : usage.length ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {usage.map(([key, item]) => (
              <AppSectionCard
                key={key}
                className="min-w-0 p-4"
              >
                <dt className="text-xs text-[var(--text-muted)]">{USAGE_LABELS[key]}</dt>
                <dd className="mt-1 break-words font-semibold text-[var(--text-primary)]">
                  {String(item.used ?? "Não informado")} / {item.unlimited === true ? "Ilimitado" : formatPlanQuota(item.limit)}
                </dd>
              </AppSectionCard>
            ))}
          </dl>
        ) : (
          <AppPageEmptyState
            title="Uso não retornado"
            description="O contrato de quotas não retornou métricas para apresentação."
          />
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Gerenciar assinatura"
        subtitle="Checkout e cancelamento são executados pelo backend com a organização derivada da sessão autenticada."
      >
        {plansQuery.isLoading ? (
          <AppPageLoadingState title="Carregando opções de plano" />
        ) : plansQuery.isError ? (
          <AppPageErrorState
            title="Catálogo indisponível"
            description="Não foi possível consultar os planos autorizados para checkout."
            onAction={() => void plansQuery.refetch()}
          />
        ) : checkoutOptions.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {checkoutOptions.map(plan => (
              <AppSectionCard
                key={plan.name}
                className="flex min-w-0 flex-col justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {plan.displayName}
                    </h3>
                    {plan.name === currentPlanName ? (
                      <AppStatusBadge label="Plano atual" tone="success" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                    {formatPlanPrice(plan.priceCents)}
                  </p>
                  {planDescription(plan) ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {planDescription(plan)}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant={plan.name === currentPlanName ? "outline" : "default"}
                  onClick={() => setCheckoutPlan(plan.name)}
                >
                  <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                  {plan.name === currentPlanName ? "Abrir checkout" : "Escolher plano"}
                </Button>
              </AppSectionCard>
            ))}
          </div>
        ) : (
          <AppPageEmptyState
            title="Nenhum plano disponível"
            description="O catálogo oficial não retornou planos habilitados para checkout."
          />
        )}

        {status && !["NO_SUBSCRIPTION", "CANCELED"].includes(status) ? (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>
              Cancelar assinatura
            </Button>
          </div>
        ) : null}
      </AppSectionBlock>

      <ConfirmModal
        open={checkoutPlan !== null}
        onOpenChange={open => !open && setCheckoutPlan(null)}
        title="Abrir checkout da assinatura?"
        description="O destino será exclusivamente o retornado pelo serviço de Billing. A organização é resolvida pela sessão autenticada."
        confirmLabel={checkoutMutation.isPending ? "Abrindo..." : "Continuar para checkout"}
        onConfirm={startCheckout}
        isPending={checkoutMutation.isPending}
      />

      <ConfirmModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar assinatura agora?"
        description="O contrato atual solicita cancelamento imediato. O backend confirmará a alteração antes de a página mostrar sucesso."
        confirmLabel={cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelamento"}
        onConfirm={() => cancelMutation.mutate()}
        isPending={cancelMutation.isPending}
      />
    </AppPageShell>
  );
}

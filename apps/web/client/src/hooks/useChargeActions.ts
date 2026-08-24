import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { buildFinanceChargeUrl } from "@/lib/operations/operations.utils";
import { toast } from "sonner";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { notify } from "@/stores/notificationStore";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { resolveOperationFeedback } from "@/lib/operations/operation-feedback";

type NavigateFn = (path: string) => void;

type PaymentMethod = "PIX" | "CASH" | "CARD" | "TRANSFER" | "OTHER";

type RefreshAction = () => void | Promise<unknown>;

type ChargeLike = {
  id: string;
  amountCents: number;
};

type UseChargeActionsOptions = {
  navigate?: NavigateFn;
  location?: string;
  returnPath?: string;
  refreshActions?: RefreshAction[];
};

function buildChargeFinancePath(chargeId: string, returnPath?: string) {
  const base = buildFinanceChargeUrl(chargeId);

  if (!returnPath) {
    return base;
  }

  const params = new URLSearchParams();
  params.set("chargeId", chargeId);
  params.set("returnTo", returnPath);

  return `/finances?${params.toString()}`;
}

export function useChargeActions(options?: UseChargeActionsOptions) {
  const [locationWouter, navigateWouter] = useLocation();

  const navigate = options?.navigate ?? navigateWouter;
  const location = options?.location ?? locationWouter;
  const returnPath = options?.returnPath ?? location ?? "/finances";
  const refreshActions = options?.refreshActions ?? [];

  const utils = trpc.useUtils();
  const { track } = useProductAnalytics();

  const runRefreshActions = async () => {
    for (const action of refreshActions) {
      try {
        await action();
      } catch {
        notify.warning(
          "Atualização parcial",
          "Pagamento salvo, mas parte da tela ainda está sincronizando."
        );
      }
    }
  };

  const payCharge = trpc.finance.charges.pay.useMutation({
    onSuccess: async (result, variables) => {
      utils.finance.charges.list.setData(undefined, (old: any) => {
        const raw = old as { data: any[]; pagination: any } | undefined;
        const applyPaid = (items: any[]) =>
          items.map((item) =>
            String(item?.id) === String(variables.chargeId)
              ? {
                  ...item,
                  status: "PAID",
                  paidAt: new Date().toISOString(),
                  paidAmountCents: variables.amountCents,
                  paidMethod: variables.method,
                }
              : item
          );
        if (!raw || !Array.isArray(raw.data)) return undefined;
        return { ...raw, data: applyPaid(raw.data) };
      });

      const operationStatus = String((result as any)?.operation?.status ?? "").toLowerCase();
      const degraded = (result as any)?.degraded;
      const message = resolveOperationFeedback({
        operationStatus,
        degradedStatus: degraded?.status,
        executedMessage: "Pagamento registrado com sucesso",
        duplicateMessage: "Pagamento já havia sido processado. Resultado reaproveitado sem duplicação.",
        retryScheduledMessage: "Pagamento registrado. Confirmação WhatsApp ficou pendente para retry.",
      });
      toast.success(message);
      notify.successPersistent(
        "Receita confirmada no caixa",
        "Próximo passo: validar a O.S. relacionada e concluir o ciclo operacional.",
        {
          label: "Ir para O.S.",
          onClick: () => {
            navigate("/service-orders");
          },
        }
      );
      track("payment_registered", {
        screen: "finances",
        chargeId: variables.chargeId,
        method: variables.method,
        amountCents: variables.amountCents,
      });
      await Promise.all([
        utils.finance.charges.stats.invalidate(),
        utils.dashboard.alerts.invalidate(),
        utils.dashboard.kpis.invalidate(),
      ]);

      await Promise.all([
        utils.nexo.timeline.listByOrg.invalidate(),
        utils.governance.summary.invalidate(),
        utils.governance.runs.invalidate(),
        utils.governance.autoScore.invalidate()
      ]);

      await runRefreshActions();
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível registrar o pagamento");
    },
  });

  const registerPayment = async (charge: ChargeLike, method: PaymentMethod) => {
    return await payCharge.mutateAsync({
      chargeId: charge.id,
      method,
      amountCents: charge.amountCents,
      idempotencyKey: buildIdempotencyKey("finance.pay_charge", charge.id),
    });
  };

  const generateCheckout = async (charge: Pick<ChargeLike, "id"> | null | undefined) => {
    if (!charge?.id) {
      return;
    }

    track("checkout_started", {
      screen: "finances",
      chargeId: String(charge.id),
      source: "charge_action",
    });
    navigate(buildChargeFinancePath(String(charge.id), returnPath));
  };

  return {
    registerPayment,
    generateCheckout,
    isSubmitting: payCharge.isPending,
  };
}

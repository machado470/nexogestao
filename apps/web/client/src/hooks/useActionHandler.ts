import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { executeAction } from "@/lib/actions/execute-action";
import type { AppAction } from "@/lib/actions/types";

type ExecutionMap = Record<string, boolean>;

export function useActionHandler() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [executingById, setExecutingById] = useState<ExecutionMap>({});

  const generateChargeMutation = trpc.serviceOrders.generateCharge.useMutation();
  const payChargeMutation = trpc.finance.charges.pay.useMutation();
  const updateAppointmentMutation = trpc.appointments.update.useMutation();

  const invalidateOperationalData = useCallback(async () => {
    await Promise.all([
      utils.serviceOrders.list.invalidate(),
      utils.finance.charges.list.invalidate(),
      utils.finance.charges.stats.invalidate(),
      utils.appointments.list.invalidate(),
      utils.dashboard.kpis.invalidate(),
      utils.dashboard.alerts.invalidate(),
    ]);
  }, [utils]);

  const runMutation = useCallback(
    async (mutationKey: string, payload?: Record<string, unknown>) => {
      if (mutationKey === "service_order.generate_charge") {
        const serviceOrderId = String(payload?.serviceOrderId ?? "").trim();
        if (!serviceOrderId) throw new Error("serviceOrderId é obrigatório.");
        await generateChargeMutation.mutateAsync({ id: serviceOrderId });
        await invalidateOperationalData();
        return { message: "Cobrança gerada com sucesso." };
      }

      if (mutationKey === "finance.charge.mark_paid") {
        const chargeId = String(payload?.chargeId ?? "").trim();
        const amountCents = Number(payload?.amountCents ?? 0);
        if (!chargeId || amountCents <= 0) {
          throw new Error("chargeId e amountCents são obrigatórios.");
        }

        await payChargeMutation.mutateAsync({ chargeId, amountCents, method: "PIX" });
        await invalidateOperationalData();
        return { message: "Pagamento registrado com sucesso." };
      }

      if (mutationKey === "appointment.confirm") {
        const appointmentId = String(payload?.appointmentId ?? "").trim();
        if (!appointmentId) throw new Error("appointmentId é obrigatório.");

        await updateAppointmentMutation.mutateAsync({ id: appointmentId, status: "CONFIRMED" });
        await invalidateOperationalData();
        return { message: "Agendamento confirmado." };
      }

      throw new Error(`Mutation não suportada: ${mutationKey}`);
    },
    [generateChargeMutation, invalidateOperationalData, payChargeMutation, updateAppointmentMutation]
  );

  const execute = useCallback(
    async (action: AppAction) => {
      setExecutingById(prev => ({ ...prev, [action.id]: true }));

      const result = await executeAction(action, {
        navigate,
        openExternal: (url, target) => {
          if (target === "_self") {
            window.location.href = url;
            return;
          }
          window.open(url, "_blank", "noopener,noreferrer");
        },
        mutate: runMutation,
      });

      setExecutingById(prev => ({ ...prev, [action.id]: false }));

      if (result.ok) {
        toast.success(result.message ?? "Ação executada com sucesso.");
      } else {
        toast.error(result.error ?? "Falha ao executar ação.");
      }

      return result;
    },
    [navigate, runMutation]
  );

  return {
    executeAction: execute,
    isExecuting: (actionId: string) => Boolean(executingById[actionId]),
  };
}

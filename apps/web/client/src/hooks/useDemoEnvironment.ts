import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useDemoEnvironment() {
  const utils = trpc.useUtils();

  const bootstrapDemo = trpc.demo.bootstrapLive.useMutation();
  const isGenerating = bootstrapDemo.isPending;

  const generateDemoEnvironment = async () => {
    try {
      const payload = await bootstrapDemo.mutateAsync();
      const data =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as { data?: Record<string, unknown> }).data ?? payload
          : payload;

      await Promise.all([
        utils.dashboard.alerts.invalidate(),
        utils.customers.list.invalidate(),
        utils.appointments.list.invalidate(),
        utils.serviceOrders.list.invalidate(),
        utils.finance.charges.list.invalidate(),
        utils.finance.charges.stats.invalidate(),
        utils.timeline.listByOrg.invalidate(),
        utils.governance.summary.invalidate(),
        utils.governance.runs.invalidate(),
        utils.governance.autoScore.invalidate(),
        utils.whatsapp.messages.invalidate(),
      ]);

      const chain =
        data && typeof data === "object" && "chain" in (data as Record<string, unknown>)
          ? (data as Record<string, any>).chain
          : null;

      toast.success("Ambiente demo gerado com sucesso.");
      if (chain) {
        toast.message(
          `Fluxo oficial: O.S. ${chain.serviceOrderStatus} → cobrança ${chain.chargeStatus} → governança ${chain.governanceScore}.`
        );
      }

      return data;
    } catch (error: any) {
      const message = String(
        error?.message || "Falha ao gerar ambiente de demonstração."
      );
      const isConnectivityIssue =
        message.includes("NEXO_API_URL") ||
        message.toLowerCase().includes("falha ao conectar");
      toast.error(
        isConnectivityIssue
          ? "Não foi possível acessar a API do demo. Verifique NEXO_API_URL e se o backend está ativo."
          : message
      );
      throw error;
    }
  };

  return {
    isGenerating,
    generateDemoEnvironment,
  };
}

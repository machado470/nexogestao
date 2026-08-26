import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useChargeActions } from "@/hooks/useChargeActions";
import {
  buildWhatsAppUrlFromServiceOrder,
  formatCurrency,
  formatDate,
  formatDateTime,
  normalizeOrders,
  normalizeStatus,
} from "@/lib/operations/operations.utils";
import {
  getFinancialStage,
  getOperationalStage,
  getServiceOrderFlowSteps,
  getServiceOrderNextAction,
} from "@/lib/operations/operations.selectors";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Play,
  Receipt,
  Send,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { resolveOperationFeedback } from "@/lib/operations/operation-feedback";
import { runActionChain } from "@/lib/operations/flowChain";

import type {
  ExecutionRecord,
  ServiceOrder,
  TimelineEvent,
} from "./service-order.types";

function getActionToneClass(tone: string) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "blue") return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200";
  if (tone === "green") return "border-green-200 bg-green-50 text-green-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function getFlowStepClasses(done: boolean, active: boolean) {
  if (done) {
    return {
      box: "border-green-200 bg-green-50 text-green-700",
      icon: CheckCircle2,
    };
  }

  if (active) {
    return {
      box: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200",
      icon: Clock3,
    };
  }

  return {
    box: "border-gray-200 bg-gray-50 text-gray-500",
    icon: CircleDollarSign,
  };
}

const LEGACY_TIMELINE_EVENT_ALIASES: Record<string, string> = {
  EXECUTION_STARTED: "SERVICE_ORDER_STARTED",
  EXECUTION_DONE: "SERVICE_ORDER_COMPLETED",
  EXECUTION_COMPLETED: "SERVICE_ORDER_COMPLETED",
  SERVICE_ORDER_DONE: "SERVICE_ORDER_COMPLETED",
  SERVICE_ORDER_CHARGE_CREATED: "CHARGE_CREATED",
};

function normalizeTimelineEventType(eventType: string) {
  const normalized = String(eventType ?? "").trim().toUpperCase();
  return LEGACY_TIMELINE_EVENT_ALIASES[normalized] ?? normalized;
}

function getTimelineLabel(event: TimelineEvent) {
  const action = normalizeTimelineEventType(String(event.action ?? event.type ?? ""));

  if (action === "CHARGE_CREATED") return "Cobrança gerada";
  if (action === "CHARGE_PAID" || action === "PAYMENT_RECEIVED") {
    return "Pagamento recebido";
  }
  if (action === "CHARGE_OVERDUE") return "Cobrança vencida";
  if (action === "SERVICE_ORDER_CREATED") return "O.S. criada";
  if (action === "SERVICE_ORDER_UPDATED") return "O.S. atualizada";
  if (action === "SERVICE_ORDER_STARTED") return "Execução iniciada";
  if (action === "SERVICE_ORDER_COMPLETED") {
    return "Execução concluída";
  }

  return event.description || event.action || event.type || "Evento";
}

function getExecutionStatusLabel(value?: string | null) {
  const status = normalizeStatus(value);

  if (status === "DONE" || status === "COMPLETED") return "Concluída";
  if (status === "IN_PROGRESS") return "Em andamento";
  if (status === "OPEN") return "Aberta";

  return status || "—";
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withReturnTo(url: string, returnTo: string) {
  const [pathname, rawQuery = ""] = url.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("returnTo", returnTo);
  return `${pathname}?${params.toString()}`;
}

export default function ServiceOrderDetailsPanel({ os }: { os: ServiceOrder }) {
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [composeCompleteAndCharge, setComposeCompleteAndCharge] = useState(true);
  const [composeChargeAndMessage, setComposeChargeAndMessage] = useState(true);
  const [composeReceiveAndConfirm, setComposeReceiveAndConfirm] = useState(true);
  const [inlineMessage, setInlineMessage] = useState("");
  const [lastSuggestions, setLastSuggestions] = useState<Array<{ label: string; reason: string }>>([]);

  const whatsappUrl = buildWhatsAppUrlFromServiceOrder(os);
  const whatsappUrlWithReturn = whatsappUrl
    ? withReturnTo(whatsappUrl, `/service-orders?os=${os.id}`)
    : null;

  const timelineQuery = trpc.nexo.timeline.listByServiceOrder.useQuery(
    { serviceOrderId: os.id, limit: 20 },
    { retry: false }
  );

  const executionQuery = trpc.nexo.executions.listByServiceOrder.useQuery(
    { serviceOrderId: os.id, limit: 20 },
    { retry: false }
  );

  const invalidateOperationalData = async () => {
    await Promise.all([
      utils.nexo.serviceOrders.list.invalidate(),
      utils.nexo.serviceOrders.getById.invalidate({ id: os.id }),
      utils.finance.charges.list.invalidate(),
      utils.finance.charges.stats.invalidate(),
      utils.dashboard.alerts.invalidate(),
      utils.nexo.timeline.listByOrg.invalidate(),
      utils.nexo.timeline.listByServiceOrder.invalidate(),
    ]);
  };

  const { registerPayment, generateCheckout, isSubmitting } = useChargeActions({
    location,
    navigate,
    returnPath: `/service-orders?os=${os.id}`,
    refreshActions: [invalidateOperationalData],
  });

  const sendInlineMessage = trpc.nexo.whatsapp.send.useMutation();

  const startExecution = trpc.nexo.executions.start.useMutation({
    onSuccess: async () => {
      toast.success("Execução iniciada");
      await invalidateOperationalData();
      await executionQuery.refetch();
      await timelineQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao iniciar execução");
    },
  });

  const finishExecution = trpc.nexo.executions.complete.useMutation({
    onSuccess: async () => {
      toast.success("Execução finalizada");
      await invalidateOperationalData();
      await executionQuery.refetch();
      await timelineQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao finalizar execução");
    },
  });

  const generateCharge = trpc.nexo.serviceOrders.generateCharge.useMutation();

  const timeline = useMemo(
    () => normalizeOrders<TimelineEvent>(timelineQuery.data),
    [timelineQuery.data]
  );

  const executions = useMemo(
    () => normalizeOrders<ExecutionRecord>(executionQuery.data),
    [executionQuery.data]
  );

  const latestExecution = executions[0] ?? null;

  const canStart = ["OPEN", "ASSIGNED"].includes(normalizeStatus(os.status));
  const canFinish =
    normalizeStatus(os.status) === "IN_PROGRESS" &&
    Boolean(latestExecution?.id) &&
    normalizeStatus(latestExecution?.status) === "IN_PROGRESS";
  const canGenerateCharge =
    normalizeStatus(os.status) === "DONE" && !os.financialSummary?.hasCharge;

  const operationalStage = getOperationalStage(os);
  const financialStage = getFinancialStage(os);
  const nextAction = getServiceOrderNextAction(os);
  const flowSteps = getServiceOrderFlowSteps(os);
  const chargeIsPaid =
    normalizeStatus(os.financialSummary?.chargeStatus) === "PAID";

  const charge =
    os.financialSummary?.hasCharge && isValidId(os.financialSummary.chargeId)
      ? {
          id: os.financialSummary.chargeId,
          customerId: os.customerId,
          amountCents: os.financialSummary.chargeAmountCents ?? 0,
          serviceOrderId: os.id,
          serviceOrder: { title: os.title },
        }
      : null;

  const OperationalIcon = operationalStage.icon;
  const FinancialIcon = financialStage.icon;

  const canSendInline =
    Boolean(os.customerId) && inlineMessage.trim().length > 0 && !sendInlineMessage.isPending;

  async function createChargeInline() {
    try {
      await generateCharge.mutateAsync({ id: os.id });
      toast.success("Cobrança gerada");
      await invalidateOperationalData();
      await timelineQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar cobrança";
      toast.error(message);
      throw error;
    }
  }

  async function sendInlineWhatsAppMessage() {
    if (!os.customerId || inlineMessage.trim().length === 0) return;
    const result = await sendInlineMessage.mutateAsync({
      customerId: os.customerId,
      content: inlineMessage.trim(),
      entityType: "SERVICE_ORDER",
      entityId: os.id,
      messageType: "SERVICE_UPDATE",
      serviceOrderId: os.id,
      idempotencyKey: buildIdempotencyKey("service-order.inline.whatsapp", os.id),
    });
    await invalidateOperationalData();
    setInlineMessage("");
    const operationStatus = String((result as any)?.operation?.status ?? "").toLowerCase();
    toast.success(
      resolveOperationFeedback({
        operationStatus,
        degradedStatus: null,
        executedMessage: operationStatus === "queued" ? "Mensagem enfileirada para envio." : "Mensagem enviada",
        duplicateMessage: "Envio duplicado detectado: mensagem anterior reaproveitada.",
        retryScheduledMessage: "Mensagem enfileirada para retry.",
        blockedMessage: "Envio bloqueado por política operacional.",
      })
    );
  }

  async function runExecutionFlow(rootAction: "complete_service" | "generate_charge" | "receive_payment") {
    const nodes = {
      complete_service: {
        id: "complete_service" as const,
        label: "Concluir serviço",
        run: async () => {
          if (!latestExecution?.id || !canFinish) return;
          await finishExecution.mutateAsync({ executionId: latestExecution.id });
        },
        suggestNext: () =>
          composeCompleteAndCharge
            ? [{ actionId: "generate_charge" as const, label: "Gerar cobrança agora", reason: "Serviço concluído sem cobrança" }]
            : [{ actionId: "send_whatsapp" as const, label: "Enviar atualização ao cliente", reason: "Fechar ciclo de comunicação" }],
      },
      generate_charge: {
        id: "generate_charge" as const,
        label: "Gerar cobrança",
        run: async () => {
          if (!canGenerateCharge) return;
          await createChargeInline();
        },
        suggestNext: () =>
          composeChargeAndMessage && os.customerId
            ? [{ actionId: "send_whatsapp" as const, label: "Cobrar via WhatsApp", reason: "Cobrança criada e pronta para envio" }]
            : [],
      },
      send_whatsapp: {
        id: "send_whatsapp" as const,
        label: "Enviar WhatsApp",
        run: async () => {
          if (inlineMessage.trim().length > 0) {
            await sendInlineWhatsAppMessage();
          }
        },
        suggestNext: () => [],
      },
      receive_payment: {
        id: "receive_payment" as const,
        label: "Receber pagamento",
        run: async () => {
          if (!charge || chargeIsPaid) return;
          await registerPayment(charge, "CASH");
        },
        suggestNext: () =>
          composeReceiveAndConfirm
            ? [{ actionId: "confirm_payment" as const, label: "Enviar confirmação", reason: "Pagamento recebido" }]
            : [],
      },
      confirm_payment: {
        id: "confirm_payment" as const,
        label: "Confirmar pagamento",
        run: async () => {
          if (inlineMessage.trim().length > 0) {
            await sendInlineWhatsAppMessage();
          }
        },
        suggestNext: () => [],
      },
    };

    const result = await runActionChain({
      actionId: rootAction,
      actionLabel: nodes[rootAction].label,
      nodes,
    });
    setLastSuggestions(result.suggestions.map((item) => ({ label: item.label, reason: item.reason })));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-xl">{os.title}</CardTitle>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded border px-3 py-1 text-xs ${operationalStage.className}`}
                >
                  <OperationalIcon className="h-4 w-4" />
                  {operationalStage.label}
                </span>

                <span
                  className={`inline-flex items-center gap-2 rounded border px-3 py-1 text-xs ${financialStage.className}`}
                >
                  <FinancialIcon className="h-4 w-4" />
                  {financialStage.label}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => startExecution.mutate({ serviceOrderId: os.id })}
                disabled={startExecution.isPending || !canStart}
              >
                <Play className="mr-2 h-4 w-4" />
                Iniciar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void runExecutionFlow("complete_service")}
                disabled={finishExecution.isPending || !canFinish}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Finalizar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void runExecutionFlow("generate_charge")}
                disabled={generateCharge.isPending || !canGenerateCharge}
              >
                <Receipt className="mr-2 h-4 w-4" />
                Gerar cobrança
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (whatsappUrlWithReturn) navigate(whatsappUrlWithReturn);
                }}
                disabled={!whatsappUrlWithReturn}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 ${getActionToneClass(nextAction.tone)}`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">{nextAction.title}</div>
                <div className="text-sm opacity-90">{nextAction.description}</div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-xl border border-orange-200/70 bg-orange-50/60 p-4 dark:border-orange-500/30 dark:bg-orange-500/10">
            <div className="text-sm font-semibold">Ações compostas (execução contínua)</div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <label className="flex items-center justify-between rounded-lg border bg-white/80 p-2 text-xs dark:bg-zinc-900/50">
                <span>Concluir + Cobrar</span>
                <Switch checked={composeCompleteAndCharge} onCheckedChange={setComposeCompleteAndCharge} />
              </label>
              <label className="flex items-center justify-between rounded-lg border bg-white/80 p-2 text-xs dark:bg-zinc-900/50">
                <span>Cobrar + Enviar mensagem</span>
                <Switch checked={composeChargeAndMessage} onCheckedChange={setComposeChargeAndMessage} />
              </label>
              <label className="flex items-center justify-between rounded-lg border bg-white/80 p-2 text-xs dark:bg-zinc-900/50">
                <span>Receber + Confirmar</span>
                <Switch checked={composeReceiveAndConfirm} onCheckedChange={setComposeReceiveAndConfirm} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Cliente
              </div>
              <div className="mt-1 font-medium">
                {os.customer?.name || os.customerId || "—"}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Responsável
              </div>
              <div className="mt-1 font-medium">
                {os.assignedTo?.name || "Não atribuído"}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Agendamento
              </div>
              <div className="mt-1 font-medium">
                {formatDateTime(os.scheduledFor || os.appointment?.startsAt)}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Valor da O.S.
              </div>
              <div className="mt-1 font-medium">
                {formatCurrency(os.amountCents)}
              </div>
            </div>
          </div>

          {os.description ? (
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Descrição
              </div>
              <div className="mt-2 text-sm">{os.description}</div>
            </div>
          ) : null}

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              <h4 className="font-semibold">Fluxo operacional</h4>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {flowSteps.map((step) => {
                const visual = getFlowStepClasses(step.done, step.active);
                const StepIcon = visual.icon;

                return (
                  <div
                    key={step.key}
                    className={`rounded-xl border p-3 ${visual.box}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <StepIcon className="h-4 w-4" />
                      {step.label}
                    </div>
                    <div className="mt-1 text-xs opacity-80">
                      {step.done
                        ? "Etapa concluída"
                        : step.active
                        ? "Etapa atual"
                        : "Aguardando etapa anterior"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financeiro</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {!os.financialSummary?.hasCharge ? (
              <div className="space-y-3 rounded-xl border border-dashed p-4">
                <div className="text-sm text-muted-foreground">
                  Ainda não existe cobrança vinculada a esta O.S.
                </div>

                <Button
                  onClick={() => void runExecutionFlow("generate_charge")}
                  disabled={generateCharge.isPending || !canGenerateCharge}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Gerar cobrança
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Status
                    </div>
                    <div className="mt-1 font-medium">
                      {os.financialSummary.chargeStatus || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Valor
                    </div>
                    <div className="mt-1 font-medium">
                      {formatCurrency(os.financialSummary.chargeAmountCents)}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Vencimento
                    </div>
                    <div className="mt-1 font-medium">
                      {formatDate(os.financialSummary.chargeDueDate)}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pago em
                    </div>
                    <div className="mt-1 font-medium">
                      {formatDateTime(os.financialSummary.paidAt)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!chargeIsPaid && charge ? (
                    <>
                      <Button
                        onClick={() => void generateCheckout(charge)}
                        disabled={isSubmitting}
                      >
                        Checkout
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => void runExecutionFlow("receive_payment")}
                        disabled={isSubmitting}
                      >
                        Marcar pago
                      </Button>
                    </>
                  ) : null}

                  <Button
                    variant="outline"
                    onClick={() => {
                      if (whatsappUrlWithReturn) navigate(whatsappUrlWithReturn);
                    }}
                    disabled={!whatsappUrlWithReturn}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {chargeIsPaid ? "Falar com cliente" : "Cobrar no WhatsApp"}
                  </Button>
                </div>

                <div className="space-y-2 rounded-xl border border-dashed p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Composer inline (sem navegar para WhatsApp)
                  </p>
                  <Input
                    value={inlineMessage}
                    onChange={(event) => setInlineMessage(event.target.value)}
                    placeholder="Mensagem pré-preenchida para cobrança/confirmação"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void sendInlineWhatsAppMessage()}
                    disabled={!canSendInline}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {sendInlineMessage.isPending ? "Enviando..." : "Enviar mensagem inline"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execução</CardTitle>
          </CardHeader>

          <CardContent>
            {executionQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">
                Carregando execução...
              </div>
            ) : latestExecution ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Status
                    </div>
                    <div className="mt-1 font-medium">
                      {getExecutionStatusLabel(latestExecution.status)}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Modo
                    </div>
                    <div className="mt-1 font-medium">
                      {latestExecution.mode || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Início
                    </div>
                    <div className="mt-1 font-medium">
                      {formatDateTime(latestExecution.startedAt)}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Fim
                    </div>
                    <div className="mt-1 font-medium">
                      {formatDateTime(latestExecution.endedAt)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Observações
                  </div>
                  <div className="mt-2 text-sm">
                    {latestExecution.notes || "Sem observações registradas."}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Nenhuma execução registrada para esta O.S.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fila de prioridade operacional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            !chargeIsPaid && os.financialSummary?.chargeStatus === "OVERDUE"
              ? "Crítico: cobrança vencida, agir agora."
              : null,
            canGenerateCharge ? "Alta: serviço concluído sem cobrança vinculada." : null,
            canFinish ? "Média: execução em andamento aguardando conclusão." : null,
          ]
            .filter(Boolean)
            .map((item) => (
              <div key={item} className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
                {item}
              </div>
            ))}
          {lastSuggestions.map((item) => (
            <div key={item.label} className="rounded-lg border border-orange-300/70 bg-orange-50/80 p-2 text-sm text-orange-900 dark:border-orange-700/40 dark:bg-orange-900/20 dark:text-orange-200">
              Próxima ação sugerida: <strong>{item.label}</strong> · {item.reason}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>

        <CardContent>
          {timelineQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">
              Carregando timeline...
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum evento encontrado para esta O.S.
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.map((event) => (
                <div key={event.id} className="rounded-xl border p-3">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="font-medium">{getTimelineLabel(event)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </div>
                  </div>

                  {event.description ? (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {event.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

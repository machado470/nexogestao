import { useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { executeExecutionAction } from "@/lib/execution/execute-action";
import { runExecutionMutation } from "@/lib/execution/mutation-adapter";
import { useExecutionMemory } from "@/lib/execution/execution-memory";
import { buildExecutionKey, hasRecentExecutionByKey } from "@/lib/execution/idempotency";
import { evaluateExecutionPolicy } from "@/lib/execution/policy";
import { trackExecutionEvent } from "@/lib/execution/telemetry";
import type {
  ExecuteActionResult,
  ExecutionAction,
  ExecutionLog,
  ExecutionPolicyStatus,
  ExecutionSource,
  OperationalDecision,
  RiskOperationalState,
} from "@/lib/execution/types";

async function hasRecentExecutionOnBackend(executionKey: string) {
  try {
    const response = await fetch(
      `/execution/logs?executionKey=${encodeURIComponent(executionKey)}&sinceMs=${1000 * 60 * 30}`,
      { credentials: "include" }
    );

    if (!response.ok) return false;
    const payload = (await response.json()) as { logs?: Array<{ status?: string }> };
    return Array.isArray(payload.logs)
      ? payload.logs.some(log => log.status === "success")
      : false;
  } catch {
    return false;
  }
}

type ExecuteParams = {
  source: ExecutionSource;
  decision: OperationalDecision;
  confirmed?: boolean;
  riskOperationalState?: RiskOperationalState;
};

function toFailedStatus(status: ExecuteActionResult["status"]): ExecutionLog["status"] {
  if (status === "blocked") return "blocked";
  if (status === "throttled") return "throttled";
  if (status === "restricted") return "restricted";
  return "failed";
}

function toBlockedLogStatus(
  status: ExecutionPolicyStatus
): Extract<ExecutionLog["status"], "blocked" | "throttled" | "restricted" | "requires_confirmation"> {
  if (status === "throttled") return "throttled";
  if (status === "restricted") return "restricted";
  if (status === "requires_confirmation") return "requires_confirmation";
  return "blocked";
}

export function useExecutionHandler() {
  const [, navigate] = useLocation();
  const apiClient = trpc.useUtils();
  const generateChargeMutation = trpc.nexo.serviceOrders.generateCharge.useMutation();
  const payChargeMutation = trpc.finance.charges.pay.useMutation();
  const { appendExecutionLog, logs, wasRecentlyExecuted, syncExecutionLogAsync, syncExecutionEventAsync } =
    useExecutionMemory();
  const debugExecutionEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "execution";

  const debugExecution = useCallback((payload: Record<string, unknown>) => {
    if (!debugExecutionEnabled) return;
    console.debug("[execution-debug]", payload);
  }, [debugExecutionEnabled]);

  const invalidateOperationalData = useCallback(async () => {
    await Promise.all([
      apiClient.nexo.serviceOrders.list.invalidate(),
      apiClient.finance.charges.list.invalidate(),
      apiClient.finance.charges.stats.invalidate(),
      apiClient.dashboard.alerts.invalidate(),
      apiClient.dashboard.kpis.invalidate(),
      apiClient.nexo.timeline.listByOrg.invalidate(),
      apiClient.governance.summary.invalidate(),
    ]);
  }, [apiClient]);

  const execute = useCallback(
    async (
      action: ExecutionAction,
      params: ExecuteParams
    ): Promise<ExecuteActionResult> => {
      const executionKey = buildExecutionKey(action, {
        decisionId: params.decision.id,
        entityType: params.decision.entityType,
        entityId: params.decision.entityId,
        source: params.source,
      });
      const now = Date.now();

      const baseLogPayload = {
        actionId: action.id,
        decisionId: params.decision.id,
        executionKey,
        executedAt: now,
        entityType: params.decision.entityType,
        entityId: params.decision.entityId,
        mode: action.mode,
        telemetryKey: action.telemetryKey,
      } as const;

      trackExecutionEvent({
        event: "action_clicked",
        actionId: action.id,
        decisionId: params.decision.id,
        source: params.source,
        telemetryKey: action.telemetryKey,
      });

      const requestedEvent: ExecutionLog = {
        id: `${action.id}-${now}-requested`,
        ...baseLogPayload,
        eventType: "EXECUTION_ACTION_REQUESTED",
        status: "pending",
        timestamp: new Date(now).toISOString(),
      };
      void syncExecutionEventAsync(requestedEvent);
      debugExecution({
        stage: "requested",
        actionId: action.id,
        decisionId: params.decision.id,
        executionKey,
      });

      const policy = evaluateExecutionPolicy({
        action,
        decision: params.decision,
        mode: action.mode,
        confirmed: params.confirmed,
        risk: { operationalState: params.riskOperationalState },
        recentLogs: logs,
      });
      debugExecution({
        stage: "policy_evaluated",
        actionId: action.id,
        decisionId: params.decision.id,
        executionKey,
        policyAllowed: policy.allowed,
        policyStatus: policy.status,
        reasonCode: policy.reasonCode,
        message: policy.message,
      });

      if (!policy.allowed) {
        const status =
          policy.status === "requires_confirmation"
            ? "requires_confirmation"
            : policy.status;

        if (status === "requires_confirmation") {
          trackExecutionEvent({
            event: "action_requires_confirmation",
            actionId: action.id,
            decisionId: params.decision.id,
            source: params.source,
            telemetryKey: action.telemetryKey,
            reasonCode: policy.reasonCode,
            status,
            ok: false,
            message: policy.message,
          });

          return {
            ok: false,
            status,
            reasonCode: policy.reasonCode,
            message: policy.message ?? "Confirmação obrigatória.",
          };
        }

        const blockedLog: ExecutionLog = {
          id: `${action.id}-${Date.now()}-blocked`,
          ...baseLogPayload,
          eventType: "EXECUTION_ACTION_BLOCKED",
          status: toBlockedLogStatus(policy.status),
          reasonCode: policy.reasonCode,
          message: policy.message,
        };

        appendExecutionLog(blockedLog);
        void syncExecutionLogAsync(blockedLog);

        trackExecutionEvent({
          event: policy.status === "throttled" ? "action_throttled" : "action_policy_blocked",
          actionId: action.id,
          decisionId: params.decision.id,
          source: params.source,
          telemetryKey: action.telemetryKey,
          reasonCode: policy.reasonCode,
          status: toBlockedLogStatus(policy.status),
          ok: false,
          message: policy.message,
        });

        const deniedStatus: ExecuteActionResult["status"] =
          policy.status === "throttled"
            ? "throttled"
            : policy.status === "restricted"
              ? "restricted"
              : policy.status === "requires_confirmation"
                ? "requires_confirmation"
                : "blocked";

        return {
          ok: false,
          status: deniedStatus,
          reasonCode: policy.reasonCode,
          message: policy.message ?? "Execução bloqueada por política operacional.",
        };
      }

      if (
        action.kind === "mutation" &&
        (wasRecentlyExecuted({
          actionId: action.id,
          decisionId: params.decision.id,
          executionKey,
        }) ||
          hasRecentExecutionByKey({ executionKey, logs }) ||
          (await hasRecentExecutionOnBackend(executionKey)))
      ) {
        debugExecution({
          stage: "deduplicated_recent_execution",
          actionId: action.id,
          decisionId: params.decision.id,
          executionKey,
          reasonCode: "blocked_recent_execution",
        });
        return {
          ok: true,
          status: "executed",
          message: "Ação já executada recentemente. Operação mantida sem duplicidade.",
        };
      }

      const result = await executeExecutionAction(
        action,
        {
          source: params.source,
          decisionId: params.decision.id,
        },
        {
          navigate,
          openExternal: (url) => {
            window.open(url, "_blank", "noopener,noreferrer");
          },
          mutate: async (mutationKey, payload) => {
            return runExecutionMutation(
              mutationKey,
              payload,
              {
                generateChargeFromServiceOrder: async (serviceOrderId) =>
                  generateChargeMutation.mutateAsync({ id: serviceOrderId }),
                payCharge: async (input) => payChargeMutation.mutateAsync(input),
                invalidateOperationalData,
                checkIdempotency: (key) =>
                  wasRecentlyExecuted({
                    actionId: action.id,
                    decisionId: params.decision.id,
                    executionKey: key,
                  }),
                validateExecutionKey: (key) => key.startsWith("exec_"),
              },
              { executionKey }
            );
          },
        }
      );
      debugExecution({
        stage: "executed",
        actionId: action.id,
        decisionId: params.decision.id,
        executionKey,
        ok: result.ok,
        status: result.status,
        reasonCode: result.reasonCode,
        message: result.message,
      });

      if (result.ok && result.message) {
        toast.success(result.message);
      }

      const executionStatus = result.ok ? ("success" as const) : toFailedStatus(result.status);
      const log: ExecutionLog = {
        id: `${action.id}-${Date.now()}`,
        ...baseLogPayload,
        status: executionStatus,
        eventType: result.ok ? "EXECUTION_ACTION_EXECUTED" : "EXECUTION_ACTION_FAILED",
        reasonCode: result.reasonCode,
        message: result.message,
        timestamp: new Date().toISOString(),
      };

      appendExecutionLog(log);
      void syncExecutionLogAsync(log);

      trackExecutionEvent({
        event: result.ok ? "action_executed" : "action_failed",
        actionId: action.id,
        decisionId: params.decision.id,
        source: params.source,
        telemetryKey: action.telemetryKey,
        status: result.status,
        ok: result.ok,
        message: result.message,
        reasonCode: result.reasonCode,
      });

      return result;
    },
    [
      navigate,
      logs,
      appendExecutionLog,
      invalidateOperationalData,
      generateChargeMutation,
      payChargeMutation,
      syncExecutionLogAsync,
      syncExecutionEventAsync,
      wasRecentlyExecuted,
      debugExecution,
    ]
  );

  return { execute };
}

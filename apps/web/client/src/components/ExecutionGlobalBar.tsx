import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getPayloadValue } from "@/lib/query-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/rbac";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ExecutionMode = "manual" | "semi_automatic" | "automatic";
type ModePayload = { mode?: ExecutionMode };
type ExecutionStateSummary = {
  executed?: number;
  blocked?: number;
  blockedRecent?: number;
  failed?: number;
  skipped?: number;
  throttled?: number;
};
type RunOnceResult = {
  executed?: number;
  blocked?: number;
  blockedRecent?: number;
  failed?: number;
  skipped?: number;
};

function normalizeModeLabel(mode?: ExecutionMode) {
  if (mode === "automatic") return "AUTO";
  if (mode === "semi_automatic") return "ASSISTED";
  return "MANUAL";
}

export function ExecutionGlobalBar() {
  // Guardrail arquitetural: este componente é global e deve ser montado
  // somente no MainLayout/AppShell autenticado.
  const { role, loading, isAuthenticated, user } = useAuth();
  const canRenderBar = !loading && isAuthenticated && Boolean(user?.id);
  const canEditMode = role ? can(role, "governance:update") || role === "MANAGER" : false;

  const utils = trpc.useUtils();
  const modeQuery = trpc.nexo.executions.mode.useQuery(undefined, { retry: false, enabled: canRenderBar });
  const summaryQuery = trpc.nexo.executions.stateSummary.useQuery(
    { sinceMs: 1000 * 60 * 60 * 24 },
    { retry: false, enabled: canRenderBar }
  );

  const modePayload = useMemo(() => getPayloadValue<ModePayload>(modeQuery.data) ?? {}, [modeQuery.data]);
  const summary = useMemo(() => getPayloadValue<ExecutionStateSummary>(summaryQuery.data) ?? {}, [summaryQuery.data]);

  const [nextMode, setNextMode] = useState<ExecutionMode>("manual");
  const [showRunOnceResult, setShowRunOnceResult] = useState(false);

  const updateMode = trpc.nexo.executions.updateMode.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.nexo.executions.mode.invalidate(),
        utils.nexo.executions.stateSummary.invalidate(),
        utils.nexo.executions.events.invalidate(),
      ]);
    },
  });

  const runOnce = trpc.nexo.executions.runOnce.useMutation({
    onSuccess: async () => {
      setShowRunOnceResult(true);
      await Promise.all([
        utils.nexo.executions.stateSummary.invalidate(),
        utils.nexo.executions.events.invalidate(),
      ]);
    },
  });

  const runOnceResult = useMemo(() => getPayloadValue<RunOnceResult>(runOnce.data) ?? {}, [runOnce.data]);

  const isLoading = modeQuery.isLoading || summaryQuery.isLoading;
  const selectedMode = modePayload.mode ?? "manual";

  useEffect(() => {
    setNextMode(selectedMode);
  }, [selectedMode]);

  useEffect(() => {
    if (!showRunOnceResult) return;
    const timeout = window.setTimeout(() => setShowRunOnceResult(false), 10000);
    return () => window.clearTimeout(timeout);
  }, [showRunOnceResult]);

  const systemStatus = useMemo(() => {
    if (selectedMode === "manual") return "Modo manual";
    if (Number(summary.blockedRecent ?? 0) > 0) return "Aguardando cooldown";
    return "Engine ativa";
  }, [selectedMode, summary.blockedRecent]);

  if (import.meta.env.DEV && import.meta.env.VITE_BOOT_DIAGNOSTICS === "true") {
    // eslint-disable-next-line no-console
    console.log("[boot] execution bar render", {
      canRenderBar,
      loading,
      isAuthenticated,
      userId: user?.id ?? null,
      selectedMode,
    });
  }

  if (!canRenderBar) {
    return null;
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-base)]/95 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-1">
          Modo atual: <strong>{normalizeModeLabel(selectedMode)}</strong>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-1">
          Sistema: <strong>{systemStatus}</strong>
        </div>

        <Select value={nextMode} onValueChange={(value) => setNextMode(value as ExecutionMode)} disabled={!canEditMode || updateMode.isPending || isLoading}>
          <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Alterar modo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">MANUAL</SelectItem>
            <SelectItem value="semi_automatic">ASSISTED</SelectItem>
            <SelectItem value="automatic">AUTO</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="h-8"
          disabled={!canEditMode || updateMode.isPending || isLoading}
          onClick={() => updateMode.mutate({ mode: nextMode })}
        >
          {updateMode.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Alterar modo
        </Button>

        <Button className="h-8" disabled={!canEditMode || runOnce.isPending} onClick={() => runOnce.mutate()}>
          {runOnce.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1 h-3.5 w-3.5" />}
          Executar agora
        </Button>

        <div className="ml-auto flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">Executadas: {Number(summary.executed ?? 0)}</span>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">Bloqueadas: {Number(summary.blocked ?? 0)}</span>
          <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-orange-700 dark:text-orange-300">Bloq. cooldown: {Number(summary.blockedRecent ?? 0)}</span>
          <span className="rounded-full border border-slate-500/40 bg-slate-500/10 px-2 py-1 text-slate-700 dark:text-slate-300">Ignoradas: {Number(summary.skipped ?? 0)}</span>
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">Falhas: {Number(summary.failed ?? 0)}</span>
        </div>
      </div>

      {selectedMode === "manual" ? (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          A engine não executa automaticamente neste modo.
        </div>
      ) : null}

      {Number(summary.executed ?? 0) === 0 && Number(summary.blockedRecent ?? 0) > 0 ? (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          O sistema está funcionando, mas as ações recentes estão protegidas por cooldown.
        </div>
      ) : null}

      {Number(summary.blockedRecent ?? 0) > 0 ? (
        <div className="mt-2 text-xs text-[var(--text-secondary)]">Algumas ações estão aguardando cooldown.</div>
      ) : null}

      {runOnce.data && showRunOnceResult ? (
        <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-2 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">Execução concluída</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <span>• {Number(runOnceResult.executed ?? 0)} executadas</span>
            <span>• {Number(runOnceResult.blocked ?? 0)} bloqueadas</span>
            <span>• {Number(runOnceResult.failed ?? 0)} falhas</span>
            <span>• {Number(runOnceResult.blockedRecent ?? 0)} ignoradas por cooldown</span>
            <span>• {Number(runOnceResult.skipped ?? 0)} ignoradas</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

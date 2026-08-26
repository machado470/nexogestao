import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getPayloadValue, normalizeArrayPayload } from "@/lib/query-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/rbac";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ExecutionStatusBadge } from "@/components/execution/ExecutionStatusBadge";
import { formatRemainingCooldown, reasonCodeToHuman } from "@/lib/execution/ui";

type ExecutionMode = "manual" | "semi_automatic" | "automatic";

type ExecutionPolicy = {
  allowAutomaticCharge?: boolean;
  allowWhatsAppAuto?: boolean;
  allowOverdueReminderAuto?: boolean;
  allowFinanceTeamNotifications?: boolean;
  allowGovernanceFollowup?: boolean;
  allowChargeFollowupCreation?: boolean;
  allowRiskReviewEscalation?: boolean;
  maxRetries?: number;
  throttleWindowMs?: number;
};
type PolicyBooleanKey =
  | "allowAutomaticCharge"
  | "allowWhatsAppAuto"
  | "allowOverdueReminderAuto"
  | "allowFinanceTeamNotifications"
  | "allowGovernanceFollowup"
  | "allowChargeFollowupCreation"
  | "allowRiskReviewEscalation";

type ModePayload = { mode?: ExecutionMode; policy?: ExecutionPolicy };
type ExecutionStateSummary = {
  pending?: number;
  executed?: number;
  failed?: number;
  blocked?: number;
  blockedRecent?: number;
  skipped?: number;
  throttled?: number;
};
type ExecutionEvent = {
  id: string;
  actionId?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  reasonCode?: string | null;
  timestamp?: string;
  diagnostics?: { executionKey?: string | null; explanation?: Record<string, unknown> | null };
};
type RunOnceResult = {
  executed?: number;
  blocked?: number;
  blockedRecent?: number;
  failed?: number;
  skipped?: number;
};
type ConfigHistoryEntry = {
  id: string;
  actorEmail?: string | null;
  source?: string | null;
  context?: string | null;
  changedAt?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function modeLabel(mode?: ExecutionMode) {
  if (mode === "automatic") return "Automático";
  if (mode === "semi_automatic") return "Semi-automático";
  return "Manual";
}

function formatTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function eventCooldownUntil(event: ExecutionEvent) {
  const explanation = event.diagnostics?.explanation;
  if (!explanation || typeof explanation !== "object") return null;
  const raw = (explanation as Record<string, unknown>).cooldownUntil;
  return typeof raw === "string" ? raw : null;
}

function nextStepByReasonCode(reasonCode?: string | null) {
  if (reasonCode === "mode_manual_explicit_configuration") {
    return { type: "switch_to_auto" as const, text: "Altere para automático para liberar execução" };
  }
  if (reasonCode === "blocked_recent_execution") {
    return { type: "wait" as const, text: "Aguarde o cooldown terminar" };
  }
  if (reasonCode === "limit_exceeded") {
    return { type: "limit" as const, text: "A engine atingiu o limite deste ciclo" };
  }
  return { type: "none" as const, text: "Revise a política operacional" };
}

export function ExecutionOperationsPanel() {
  const { role } = useAuth();
  const canEdit = role ? can(role, "governance:update") || role === "MANAGER" : false;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [showRunOnceResult, setShowRunOnceResult] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [draftMode, setDraftMode] = useState<ExecutionMode>("manual");
  const [draftPolicy, setDraftPolicy] = useState<ExecutionPolicy>({});

  const defaultPolicy: Required<ExecutionPolicy> = {
    allowAutomaticCharge: true,
    allowWhatsAppAuto: false,
    allowOverdueReminderAuto: true,
    allowFinanceTeamNotifications: true,
    allowGovernanceFollowup: true,
    allowChargeFollowupCreation: true,
    allowRiskReviewEscalation: true,
    maxRetries: 3,
    throttleWindowMs: 1800000,
  };

  const utils = trpc.useUtils();
  const modeQuery = trpc.nexo.executions.mode.useQuery(undefined, { retry: false });
  const summaryQuery = trpc.nexo.executions.stateSummary.useQuery({ sinceMs: 1000 * 60 * 60 * 24 }, { retry: false });
  const eventsQuery = trpc.nexo.executions.events.useQuery(
    {
      limit: 60,
      status: statusFilter === "all" ? undefined : statusFilter,
      actionId: actionFilter.trim() || undefined,
      entityType: entityFilter === "all" ? undefined : entityFilter,
    },
    { retry: false }
  );
  const modeHistoryQuery = trpc.nexo.executions.modeHistory.useQuery({ limit: 8 }, { retry: false });

  const updateMode = trpc.nexo.executions.updateMode.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.nexo.executions.mode.invalidate(),
        utils.nexo.executions.events.invalidate(),
        utils.nexo.executions.stateSummary.invalidate(),
        utils.nexo.executions.modeHistory.invalidate(),
      ]);
    },
  });

  const runOnce = trpc.nexo.executions.runOnce.useMutation({
    onSuccess: async () => {
      setShowRunOnceResult(true);
      await Promise.all([
        utils.nexo.executions.events.invalidate(),
        utils.nexo.executions.stateSummary.invalidate(),
      ]);
    },
  });

  const modePayload = useMemo(() => getPayloadValue<ModePayload>(modeQuery.data) ?? {}, [modeQuery.data]);
  const summary = useMemo(() => getPayloadValue<ExecutionStateSummary>(summaryQuery.data) ?? {}, [summaryQuery.data]);
  const events = useMemo(() => normalizeArrayPayload<ExecutionEvent>(eventsQuery.data), [eventsQuery.data]);
  const modeHistory = useMemo(() => normalizeArrayPayload<ConfigHistoryEntry>(modeHistoryQuery.data), [modeHistoryQuery.data]);
  const runOnceResult = useMemo(() => getPayloadValue<RunOnceResult>(runOnce.data) ?? {}, [runOnce.data]);

  const isLoading = modeQuery.isLoading || summaryQuery.isLoading || eventsQuery.isLoading;

  useEffect(() => {
    if (modePayload.mode) setDraftMode(modePayload.mode);
    if (modePayload.policy) setDraftPolicy(modePayload.policy);
  }, [modePayload.mode, modePayload.policy]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showRunOnceResult) return;
    const timeout = window.setTimeout(() => setShowRunOnceResult(false), 12000);
    return () => window.clearTimeout(timeout);
  }, [showRunOnceResult]);

  const saveConfig = async () => {
    const retries = Number(draftPolicy.maxRetries ?? 0);
    const throttle = Number(draftPolicy.throttleWindowMs ?? 5000);
    if (!Number.isInteger(retries) || retries < 0 || retries > 20) return;
    if (!Number.isInteger(throttle) || throttle < 5000 || throttle > 86400000) return;

    await updateMode.mutateAsync({
      mode: draftMode,
      policy: {
        allowAutomaticCharge: Boolean(draftPolicy.allowAutomaticCharge),
        allowWhatsAppAuto: Boolean(draftPolicy.allowWhatsAppAuto),
        allowOverdueReminderAuto: Boolean(draftPolicy.allowOverdueReminderAuto),
        allowFinanceTeamNotifications: Boolean(draftPolicy.allowFinanceTeamNotifications),
        allowGovernanceFollowup: Boolean(draftPolicy.allowGovernanceFollowup),
        allowChargeFollowupCreation: Boolean(draftPolicy.allowChargeFollowupCreation),
        allowRiskReviewEscalation: Boolean(draftPolicy.allowRiskReviewEscalation),
        maxRetries: retries,
        throttleWindowMs: throttle,
      },
    });
  };

  const latestCycleTime = events[0]?.timestamp;
  const oldestVisible = events[events.length - 1]?.timestamp;
  const visibleDurationMs = latestCycleTime && oldestVisible ? new Date(latestCycleTime).getTime() - new Date(oldestVisible).getTime() : null;

  return (
    <section className="nexo-surface p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="nexo-section-title">Execution Control v5</h2>
          <p className="nexo-section-description mt-1">Controle administrativo por organização, policy segura e diagnóstico operacional.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">Modo atual: <strong>{modeLabel(modePayload.mode)}</strong></div>
          <Button onClick={() => runOnce.mutate()} disabled={!canEdit || runOnce.isPending}>{runOnce.isPending ? "Executando..." : "Executar agora"}</Button>
        </div>
      </div>

      {isLoading ? <div className="flex min-h-[120px] items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando execution...</div> : null}

      {showRunOnceResult && runOnce.data ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-3 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">Execução concluída</p>
          <p className="mt-1">- {Number(runOnceResult.executed ?? 0)} executadas</p>
          <p>- {Number(runOnceResult.blocked ?? 0)} bloqueadas</p>
          <p>- {Number(runOnceResult.blockedRecent ?? 0)} bloqueadas por cooldown</p>
          <p>- {Number(runOnceResult.failed ?? 0)} falhas</p>
          <p>- {Number(runOnceResult.skipped ?? 0)} ignoradas</p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-3 text-sm">Pendentes: <strong>{Number(summary.pending ?? 0)}</strong></div>
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm">Executadas: <strong>{Number(summary.executed ?? 0)}</strong></div>
        <div className="rounded-lg border border-red-700/60 bg-red-900/20 p-3 text-sm">Falhas: <strong>{Number(summary.failed ?? 0)}</strong></div>
        <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-3 text-sm">Bloqueadas: <strong>{Number(summary.blocked ?? 0)}</strong></div>
        <div className="rounded-lg border border-orange-700/60 bg-orange-900/20 p-3 text-sm">Cooldown: <strong>{Number(summary.blockedRecent ?? 0)}</strong></div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3 text-sm">Ignoradas: <strong>{Number(summary.skipped ?? 0)}</strong></div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-3 text-sm">Orgs processadas: <strong>{Number((runOnceResult as { orgs?: number })?.orgs ?? 0)}</strong></div>
      </div>

      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-3 text-xs text-[var(--text-secondary)]">
        <p>Último ciclo visível: <strong>{formatTimestamp(latestCycleTime)}</strong></p>
        <p>Duração aproximada (janela visível): <strong>{visibleDurationMs && visibleDurationMs > 0 ? `${Math.round(visibleDurationMs / 1000)} s` : "—"}</strong></p>
        {Number(summary.executed ?? 0) === 0 && Number(summary.blockedRecent ?? 0) > 0 ? (
          <p className="mt-1 text-amber-300">O sistema está funcionando, mas as ações recentes estão protegidas por cooldown.</p>
        ) : null}
        {modePayload.mode === "manual" ? (
          <p className="mt-1 text-amber-300">O sistema está funcionando em modo manual. Nenhuma ação automática será executada até mudança de modo.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-4 space-y-3">
        <div className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--surface-base)] p-3 text-xs text-[var(--text-secondary)]">
          <p><strong>Config atual:</strong> mode {modeLabel(modePayload.mode)} · retries {Number(draftPolicy.maxRetries ?? defaultPolicy.maxRetries)} · throttle {Number(draftPolicy.throttleWindowMs ?? defaultPolicy.throttleWindowMs)}ms</p>
          <p className="mt-1"><strong>Default/fallback:</strong> mode Manual · retries {defaultPolicy.maxRetries} · throttle {defaultPolicy.throttleWindowMs}ms</p>
        </div>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[var(--text-primary)]">Administração de mode/policy</h3>{!canEdit ? <span className="text-xs text-[var(--text-muted)]">Sem permissão de edição</span> : null}</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Select value={draftMode} onValueChange={(v) => setDraftMode(v as ExecutionMode)} disabled={!canEdit || updateMode.isPending}>
            <SelectTrigger><SelectValue placeholder="Modo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="semi_automatic">Semi-automático</SelectItem>
              <SelectItem value="automatic">Automático</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" min={0} max={20} value={String(draftPolicy.maxRetries ?? 3)} disabled={!canEdit || updateMode.isPending} onChange={(e) => setDraftPolicy((prev) => ({ ...prev, maxRetries: Number(e.target.value) }))} placeholder="maxRetries" />
          <Input type="number" min={5000} max={86400000} step={1000} value={String(draftPolicy.throttleWindowMs ?? 1800000)} disabled={!canEdit || updateMode.isPending} onChange={(e) => setDraftPolicy((prev) => ({ ...prev, throttleWindowMs: Number(e.target.value) }))} placeholder="throttleWindowMs" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          {([
            ["allowAutomaticCharge", "Cobrança automática"],
            ["allowWhatsAppAuto", "WhatsApp link automático"],
            ["allowOverdueReminderAuto", "Lembrete de vencida"],
            ["allowFinanceTeamNotifications", "Notificar equipe financeira"],
            ["allowGovernanceFollowup", "Marcar atenção operacional"],
            ["allowChargeFollowupCreation", "Criar follow-up cobrança"],
            ["allowRiskReviewEscalation", "Escalar revisão de risco"],
          ] as [PolicyBooleanKey, string][]).map(([key, label]) => (
            <label key={key} className="rounded-lg border border-[var(--border-subtle)] p-2 flex items-center justify-between gap-2">
              <span>{label}</span>
              <Switch
                checked={Boolean(draftPolicy[key])}
                disabled={!canEdit || updateMode.isPending}
                onCheckedChange={(checked) => setDraftPolicy((prev) => ({ ...prev, [key]: checked }))}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end"><Button onClick={() => void saveConfig()} disabled={!canEdit || updateMode.isPending}>{updateMode.isPending ? "Salvando..." : "Salvar configuração"}</Button></div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Últimas decisões</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="executed">executed</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="blocked">blocked</SelectItem>
              <SelectItem value="throttled">throttled</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Filtrar por action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger><SelectValue placeholder="Entidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas entidades</SelectItem>
              <SelectItem value="charge">charge</SelectItem>
              <SelectItem value="serviceOrder">serviceOrder</SelectItem>
              <SelectItem value="system">system</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void eventsQuery.refetch()}>Atualizar</Button>
        </div>

        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Sem eventos recentes da execution.</p>
          ) : (
            events.map((event) => {
              const cooldownUntil = eventCooldownUntil(event);
              const cooldownLabel = formatRemainingCooldown(cooldownUntil, nowMs);
              const nextStep = nextStepByReasonCode(event.reasonCode);

              return (
                <div key={event.id} className="rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--surface-base)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{event.actionId || "ação_não_informada"}</p>
                    <ExecutionStatusBadge status={event.status} reasonCode={event.reasonCode} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">Entidade: <strong>{event.entityType || "—"}</strong> · {event.entityId || "—"}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">Motivo: <strong>{reasonCodeToHuman(event.reasonCode)}</strong></div>
                  {cooldownLabel ? <div className="mt-1 text-xs text-amber-300">{cooldownLabel}</div> : null}
                  <div className="mt-1 text-xs text-[var(--text-muted)]">Timestamp: {formatTimestamp(event.timestamp)}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">Ação disponível: {nextStep.text}</div>
                  {nextStep.type === "switch_to_auto" ? (
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!canEdit || updateMode.isPending}
                        onClick={() => updateMode.mutate({ mode: "automatic" })}
                      >
                        Alterar para automático
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">Diagnóstico: executionKey {event.diagnostics?.executionKey ?? "—"}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Histórico auditável de configuração</h3>
        {modeHistory.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Sem alterações recentes de mode/policy.</p>
        ) : (
          modeHistory.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--surface-base)] p-3 text-xs text-[var(--text-secondary)]">
              <p>{formatTimestamp(entry.changedAt)} · por <strong>{entry.actorEmail || "sistema"}</strong> · fonte {entry.source || "—"}</p>
              <p className="mt-1">Contexto: {entry.context || "—"}</p>
              <p className="mt-1">Before: {JSON.stringify(entry.before ?? {})}</p>
              <p className="mt-1">After: {JSON.stringify(entry.after ?? {})}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

import { useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Activity, Clock3, FileCheck2, ShieldCheck } from "lucide-react";
import {
  AppPageHeader,
  AppPageShell,
  AppSectionCard,
  AppStatusBadge,
} from "@/components/app-system";
import { trpc } from "@/lib/trpc";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { useRenderWatchdog } from "@/hooks/useRenderWatchdog";
import { setBootPhase } from "@/lib/bootPhase";

type GovernanceState = "NORMAL" | "WARNING" | "RESTRICTED" | "SUSPENDED";
type Priority = "critical" | "high" | "medium";
type ActionType = "Automática" | "Recomendada" | "Bloqueada" | "Manual";

type Signal = {
  id: string;
  title: string;
  reason: string;
  impact: string;
  priority: Priority;
  count: number;
  cta: string;
  path: string;
  source: string;
};

type NextBestAction = {
  problem: string;
  consequence: string;
  recommendation: string;
  primaryActionLabel: string;
  primaryPath: string;
  priority: Priority;
  type: ActionType;
  status: string;
  motive: string;
};

type OfficialEvidence = {
  id: string;
  event: string;
  source: string;
  occurredAt: string;
  impact: string;
  entity: string;
  actionPath?: string;
};

type GovernanceHistoryItem = {
  id: string;
  previousState: string;
  currentState: string;
  reason: string;
  occurredAt: string;
};

type ActivePolicy = {
  name: string;
  objective: string;
  status: "ATIVA" | "SEM SINAL" | "BLOQUEADA";
  impactando: string;
  lastEvaluation: string;
};

const stateCopy: Record<
  GovernanceState,
  {
    label: string;
    title: string;
    tone: "success" | "warning" | "danger" | "neutral";
  }
> = {
  NORMAL: { label: "NORMAL", title: "Operação saudável", tone: "success" },
  WARNING: { label: "ATENÇÃO", title: "Atenção", tone: "warning" },
  RESTRICTED: {
    label: "RESTRITA",
    title: "Operação comprometida",
    tone: "danger",
  },
  SUSPENDED: { label: "SUSPENSA", title: "Operação bloqueada", tone: "danger" },
};

function priorityLabel(priority: Priority) {
  if (priority === "critical") return "Crítica";
  if (priority === "high") return "Alta";
  return "Média";
}

function pluralizePt(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function operationalPriorityLabel(action: NextBestAction) {
  if (action.primaryPath.includes("finances")) return "Impacto financeiro";
  if (action.primaryPath.includes("service-orders"))
    return "Impacto operacional";
  if (action.primaryPath.includes("appointments"))
    return "Impacto de planejamento";
  return "Impacto operacional";
}

function actionTitle(action: NextBestAction) {
  if (action.primaryPath.includes("finances")) return "Cobrar agora";
  if (action.primaryPath.includes("service-orders")) return "Resolver execução";
  if (action.primaryPath.includes("appointments")) return "Confirmar agenda";
  return action.problem;
}

function metric(source: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function textField(source: Record<string, any> | undefined, ...keys: string[]) {
  if (!source) return "";
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function hasState(
  source: Record<string, any> | undefined,
  expected: GovernanceState
) {
  if (!source) return false;
  const values = [
    source.state,
    source.status,
    source.operationalState,
    source.currentState,
    source.level,
    source.result,
  ].map(value => String(value ?? "").toUpperCase());
  return values.includes(expected);
}

function readState(source: Record<string, any> | undefined, fallback = "—") {
  const state = textField(
    source,
    "state",
    "status",
    "operationalState",
    "currentState",
    "level",
    "result"
  ).toUpperCase();
  return state || fallback;
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeReevaluation(value: unknown) {
  if (!value) return "Próxima reavaliação em até 15 minutos";
  const next = new Date(String(value)).getTime();
  if (!Number.isFinite(next)) return "Próxima reavaliação em até 15 minutos";
  const minutes = Math.max(1, Math.round((next - Date.now()) / 60000));
  if (minutes <= 0) return "Reavaliação em andamento";
  return `Próxima reavaliação em ${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

function moneyValue(source: Record<string, any>) {
  for (const key of [
    "amount",
    "total",
    "value",
    "totalAmount",
    "amountDue",
    "balance",
  ]) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function relativeLastAnalysis(value: unknown) {
  if (!value) return "Sem execução recente";
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return "Sem execução recente";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60)
    return `Última análise há ${minutes} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return `Última análise há ${hours} hora${hours === 1 ? "" : "s"}`;
  return `Última análise em ${formatDateTime(value)}`;
}

function isRecentDate(value: unknown, hours = 48) {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= hours * 60 * 60 * 1000;
}

function normalizeGovernanceReason(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") {
    return "Motivo não retornado pelas fontes oficiais.";
  }
  return trimmed;
}

function evidenceIconFor(event: OfficialEvidence) {
  const text = `${event.event} ${event.source}`.toLowerCase();
  if (text.includes("pagamento") || text.includes("cobran")) return FileCheck2;
  if (text.includes("risco") || text.includes("govern")) return ShieldCheck;
  return Activity;
}

function stateFromSignals({
  signals,
  riskScore,
  summary,
  runs,
}: {
  signals: Signal[];
  riskScore: number;
  summary: Record<string, any>;
  runs: any[];
}): GovernanceState {
  const latestRun = runs[0];
  if (hasState(summary, "SUSPENDED") || hasState(latestRun, "SUSPENDED"))
    return "SUSPENDED";
  if (hasState(summary, "RESTRICTED") || hasState(latestRun, "RESTRICTED"))
    return "RESTRICTED";
  if (signals.some(item => item.priority === "critical") || riskScore >= 55)
    return "RESTRICTED";
  if (signals.length > 0 || riskScore >= 30) return "WARNING";
  return "NORMAL";
}

function buildPriorityActions(signals: Signal[]): NextBestAction[] {
  const order = ["overdue", "late-orders", "appointments", "unassigned"];
  return order
    .map(id => signals.find(signal => signal.id === id))
    .filter(Boolean)
    .slice(0, 3)
    .map(signal => {
      if (!signal) throw new Error("Invalid signal");
      if (signal.id === "overdue") {
        return {
          problem: "Cobrar clientes em atraso",
          consequence: `${pluralizePt(signal.count, "cobrança vencida", "cobranças vencidas")}. Impacto: receita parada.`,
          recommendation:
            "Abrir a fila de cobranças vencidas e priorizar contato.",
          primaryActionLabel: "Abrir cobrança",
          primaryPath: signal.path,
          priority: signal.priority,
          type: "Recomendada",
          status: "Aguardando operador",
          motive: "Cobrança vencida afeta caixa.",
        };
      }
      if (signal.id === "late-orders") {
        return {
          problem: "Resolver O.S. atrasadas",
          consequence: `${pluralizePt(signal.count, "O.S. atrasada", "O.S. atrasadas")}. Impacto: previsibilidade em queda.`,
          recommendation:
            "Abrir O.S. atrasadas e atualizar responsável ou prazo.",
          primaryActionLabel: "Abrir O.S.",
          primaryPath: signal.path,
          priority: signal.priority,
          type: "Recomendada",
          status: "Fila crítica",
          motive: "O.S. atrasada reduz previsibilidade.",
        };
      }
      if (signal.id === "appointments") {
        return {
          problem: "Confirmar agendamentos pendentes",
          consequence: `${pluralizePt(signal.count, "agendamento pendente", "agendamentos pendentes")}. Impacto: agenda pouco confiável.`,
          recommendation:
            "Abrir agendamentos e confirmar, concluir ou cancelar.",
          primaryActionLabel: "Abrir agendamento",
          primaryPath: signal.path,
          priority: signal.priority,
          type: "Manual",
          status: "Confirmação pendente",
          motive: "Agenda sem confirmação pode travar execução.",
        };
      }
      return {
        problem: "Atribuir responsáveis",
        consequence: `${pluralizePt(signal.count, "O.S. sem responsável", "O.S. sem responsáveis")}. Impacto: fila invisível.`,
        recommendation: "Definir responsável para cada O.S. aberta.",
        primaryActionLabel: "Abrir O.S.",
        primaryPath: signal.path,
        priority: signal.priority,
        type: "Manual",
        status: "Sem responsável",
        motive: "Fila sem dono precisa de atribuição.",
      };
    });
}

function consequenceForSignal(signal: Signal) {
  if (signal.id === "overdue") return "Receita parada.";
  if (signal.id === "late-orders")
    return "Perda de previsibilidade da execução.";
  if (signal.id === "appointments") return "Agenda menos confiável.";
  if (signal.id === "no-recent-run") return "Trilha operacional incompleta.";
  if (signal.id === "unassigned") return "Fila sem responsável claro.";
  return "Decisão operacional exige acompanhamento.";
}

export default function GovernancePage() {
  setBootPhase("PAGE:Governança");
  useRenderWatchdog("GovernancePage");

  const [, navigate] = useLocation();
  const summaryQuery = trpc.governance.summary.useQuery(undefined, {
    retry: false,
  });
  const runsQuery = trpc.governance.runs.useQuery(
    { limit: 12 },
    { retry: false }
  );
  const overdueChargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 20, status: "OVERDUE" },
    { retry: false }
  );
  const serviceOrdersQuery = trpc.nexo.serviceOrders.list.useQuery(
    { page: 1, limit: 60 },
    { retry: false }
  );
  const appointmentsQuery = trpc.nexo.appointments.list.useQuery(undefined, {
    retry: false,
  });
  const dashboardKpisQuery = trpc.dashboard.kpis.useQuery(undefined, {
    retry: false,
  });

  const summary = useMemo(
    () => normalizeObjectPayload<any>(summaryQuery.data) ?? {},
    [summaryQuery.data]
  );
  const runs = useMemo(
    () => normalizeArrayPayload<any>(runsQuery.data),
    [runsQuery.data]
  );
  const chargesPayload = useMemo(
    () => normalizeObjectPayload<any>(overdueChargesQuery.data) ?? {},
    [overdueChargesQuery.data]
  );
  const serviceOrdersPayload = useMemo(
    () => normalizeObjectPayload<any>(serviceOrdersQuery.data) ?? {},
    [serviceOrdersQuery.data]
  );
  const overdueCharges = useMemo(
    () =>
      normalizeArrayPayload<any>(
        chargesPayload.data ?? chargesPayload.items ?? overdueChargesQuery.data
      ),
    [chargesPayload, overdueChargesQuery.data]
  );
  const serviceOrders = useMemo(
    () =>
      normalizeArrayPayload<any>(
        serviceOrdersPayload.data ??
          serviceOrdersPayload.items ??
          serviceOrdersQuery.data
      ),
    [serviceOrdersPayload, serviceOrdersQuery.data]
  );
  const appointments = useMemo(
    () => normalizeArrayPayload<any>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const dashboardKpis = useMemo(
    () => normalizeObjectPayload<any>(dashboardKpisQuery.data) ?? {},
    [dashboardKpisQuery.data]
  );
  const whatsappSignals =
    normalizeObjectPayload<any>(dashboardKpis.whatsappSignals) ?? {};
  const failedWhatsAppMessages = metric(
    whatsappSignals,
    "failedMessages",
    "failed",
    "failedMessagesCount"
  );
  const customersNoResponse = metric(
    whatsappSignals,
    "customersNoResponse",
    "waitingOperator",
    "waitingConversations"
  );

  const openOrders = serviceOrders.filter(
    item =>
      !["DONE", "COMPLETED", "CANCELED", "CANCELLED"].includes(
        String(item?.status ?? "").toUpperCase()
      )
  );
  const delayedOrders = openOrders.filter(item => {
    if (!item?.dueDate) return false;
    const due = new Date(String(item.dueDate)).getTime();
    return Number.isFinite(due) && due < Date.now();
  });
  const unassignedOrders = openOrders.filter(
    item => !item?.assignedToPersonId && !item?.personId && !item?.ownerId
  );
  const staleAppointments = appointments.filter(item => {
    const status = String(item?.status ?? "").toUpperCase();
    if (
      ["CONFIRMED", "DONE", "COMPLETED", "CANCELED", "CANCELLED"].includes(
        status
      )
    )
      return false;
    const when = new Date(
      String(item?.startAt ?? item?.startsAt ?? item?.date ?? "")
    ).getTime();
    return Number.isFinite(when) && when < Date.now();
  });

  const policyAppliedCount = metric(
    summary,
    "policiesApplied",
    "appliedPolicies",
    "policyApplied",
    "rulesApplied"
  );
  const policyPendingCount = metric(
    summary,
    "pendingPolicies",
    "policiesPending",
    "pendingRules",
    "rulesPending"
  );
  const automaticActionCount = metric(
    summary,
    "automaticActions",
    "actionsExecuted",
    "autoActions"
  );
  const latestRun = runs[0];
  const lastRunAt =
    latestRun?.finishedAt ??
    latestRun?.completedAt ??
    latestRun?.createdAt ??
    latestRun?.startedAt ??
    latestRun?.occurredAt;
  const hasRecentRun = isRecentDate(lastRunAt);

  const signals = useMemo<Signal[]>(() => {
    const items: Signal[] = [];
    const governanceRiskScore = metric(
      summary,
      "riskScore",
      "score",
      "operationalRiskScore"
    );
    const backendAlerts = metric(
      summary,
      "alerts",
      "openAlerts",
      "activeAlerts"
    );
    if (overdueCharges.length > 0) {
      items.push({
        id: "overdue",
        title: "Cobranças vencidas",
        reason: pluralizePt(
          overdueCharges.length,
          "cobrança vencida",
          "cobranças vencidas"
        ),
        impact: "Risco financeiro crescente",
        priority: overdueCharges.length >= 3 ? "critical" : "high",
        count: overdueCharges.length,
        cta: "Abrir cobrança",
        path: "/finances?status=OVERDUE&source=governance",
        source: "Financeiro",
      });
    }
    if (delayedOrders.length > 0) {
      items.push({
        id: "late-orders",
        title: "O.S. atrasadas",
        reason: pluralizePt(
          delayedOrders.length,
          "O.S. atrasada",
          "O.S. atrasadas"
        ),
        impact: "Aumento do risco operacional",
        priority: delayedOrders.length >= 3 ? "critical" : "high",
        count: delayedOrders.length,
        cta: "Abrir O.S.",
        path: "/service-orders?filter=late&source=governance",
        source: "Ordens de Serviço",
      });
    }
    if (staleAppointments.length > 0) {
      items.push({
        id: "appointments",
        title: "Agendamentos sem fechamento",
        reason: pluralizePt(
          staleAppointments.length,
          "agendamento pendente",
          "agendamentos pendentes"
        ),
        impact: "Perda de previsibilidade",
        priority: "medium",
        count: staleAppointments.length,
        cta: "Abrir agendamento",
        path: "/appointments?source=governance",
        source: "Agendamentos",
      });
    }
    if (unassignedOrders.length > 0) {
      items.push({
        id: "unassigned",
        title: "O.S. sem responsável",
        reason: `${unassignedOrders.length} O.S. sem responsável`,
        impact: "Fila operacional sem dono",
        priority: "medium",
        count: unassignedOrders.length,
        cta: "Abrir O.S.",
        path: "/service-orders?filter=unassigned&source=governance",
        source: "Ordens de Serviço",
      });
    }
    if (failedWhatsAppMessages > 0) {
      items.push({
        id: "whatsapp-failures",
        title: "Falhas WhatsApp",
        reason: pluralizePt(
          failedWhatsAppMessages,
          "mensagem com falha",
          "mensagens com falha"
        ),
        impact: "Contato operacional interrompido",
        priority: failedWhatsAppMessages >= 3 ? "critical" : "high",
        count: failedWhatsAppMessages,
        cta: "Revisar WhatsApp",
        path: "/whatsapp?source=governance",
        source: "WhatsApp",
      });
    }
    if (customersNoResponse > 0) {
      items.push({
        id: "customers-no-response",
        title: "Clientes sem resposta",
        reason: pluralizePt(
          customersNoResponse,
          "cliente/responsável sem resposta",
          "clientes/responsáveis sem resposta"
        ),
        impact: "Decisões dependentes de contato podem atrasar",
        priority: "medium",
        count: customersNoResponse,
        cta: "Responder conversas",
        path: "/whatsapp?source=governance",
        source: "WhatsApp",
      });
    }
    if (backendAlerts > 0 || governanceRiskScore >= 30) {
      items.push({
        id: "risk-score",
        title: "Risco consolidado",
        reason: pluralizePt(
          backendAlerts || 1,
          "alerta de risco",
          "alertas de risco"
        ),
        impact: "Risco transversal em acompanhamento",
        priority: governanceRiskScore >= 70 ? "critical" : "high",
        count: Math.max(backendAlerts, 1),
        cta: "Abrir Timeline",
        path: "/timeline?module=governance",
        source: "Governança",
      });
    }
    if (!hasRecentRun && runs.length === 0) {
      items.push({
        id: "no-recent-run",
        title: "Sem avaliação recente",
        reason: "Sem execução recente registrada",
        impact: "Trilha oficial precisa ser conferida",
        priority: "medium",
        count: 1,
        cta: "Abrir Timeline",
        path: "/timeline?module=governance",
        source: "Timeline",
      });
    }
    return items;
  }, [
    delayedOrders.length,
    hasRecentRun,
    overdueCharges.length,
    runs.length,
    staleAppointments.length,
    summary,
    failedWhatsAppMessages,
    customersNoResponse,
    unassignedOrders.length,
  ]);

  const overdueAmount = overdueCharges.reduce(
    (total, charge) => total + moneyValue(charge),
    0
  );
  const riskScore = Math.max(
    metric(summary, "riskScore", "score", "operationalRiskScore"),
    signals.reduce(
      (total, item) =>
        total +
        (item.priority === "critical" ? 25 : item.priority === "high" ? 15 : 8),
      0
    )
  );
  const riskLevel =
    riskScore >= 55 ? "alto" : riskScore >= 30 ? "médio" : "baixo";
  const state = stateFromSignals({ signals, riskScore, summary, runs });
  const statePresentation = stateCopy[state];
  const absenceOfRecentEvaluation = !hasRecentRun && runs.length === 0;
  const operationalSignals = signals.filter(
    signal => signal.id !== "no-recent-run"
  );
  const mainRisk = operationalSignals[0] ?? signals[0];
  const principalReason = mainRisk
    ? mainRisk.reason
    : state === "NORMAL"
      ? "Nenhum bloqueio crítico retornado pelas fontes oficiais."
      : normalizeGovernanceReason(
          textField(summary, "reason", "message", "summary")
        );
  const impactMetrics = [
    {
      label: "Receita em risco",
      value: overdueAmount > 0 ? formatCurrency(overdueAmount) : "R$ 0,00",
      tone: overdueAmount > 0 ? "warning" : "success",
    },
    {
      label: "Clientes afetados",
      value: String(
        new Set(
          overdueCharges.map(charge =>
            String(
              charge?.customerId ??
                charge?.customer?.id ??
                charge?.customerName ??
                charge?.id
            )
          )
        ).size || 0
      ),
      tone: overdueCharges.length > 0 ? "warning" : "success",
    },
    {
      label: "O.S. afetadas",
      value: String(delayedOrders.length + unassignedOrders.length),
      tone:
        delayedOrders.length + unassignedOrders.length > 0
          ? "warning"
          : "success",
    },
    {
      label: "WhatsApp com falha",
      value: String(failedWhatsAppMessages),
      tone: failedWhatsAppMessages > 0 ? "warning" : "success",
    },
    {
      label: "Agendamentos afetados",
      value: String(staleAppointments.length),
      tone: staleAppointments.length > 0 ? "warning" : "success",
    },
  ];
  const operationalImpactSummary =
    overdueAmount > 0 ||
    delayedOrders.length ||
    unassignedOrders.length ||
    staleAppointments.length ||
    failedWhatsAppMessages
      ? `${formatCurrency(overdueAmount)} · ${delayedOrders.length + unassignedOrders.length} O.S. · ${staleAppointments.length} agendas · ${failedWhatsAppMessages} WhatsApp`
      : "Sem sinais críticos carregados; atenção causada por ausência de leitura recente.";
  const operationalDiagnosis = [
    {
      label: "Motivo principal",
      value: absenceOfRecentEvaluation
        ? "Governança sem avaliação recente"
        : mainRisk
          ? mainRisk.reason
          : "Nenhum bloqueio crítico retornado pelas fontes oficiais.",
    },
    {
      label: "Evidência encontrada",
      value: runs.length
        ? `${runs.length} registro(s) oficial(is) de governança carregado(s).`
        : "Nenhuma execução recente da governança foi registrada.",
    },
    {
      label: "Consequência operacional",
      value: absenceOfRecentEvaluation
        ? "A operação está em atenção porque ainda não há validação automática recente."
        : mainRisk
          ? consequenceForSignal(mainRisk)
          : "Sem consequência operacional crítica nas fontes carregadas.",
    },
    {
      label: "Impacto",
      value: operationalImpactSummary,
    },
    {
      label: "Decisão",
      value: `Estado ${statePresentation.label.toLowerCase()} por ${absenceOfRecentEvaluation ? "governança sem avaliação recente" : `risco ${riskLevel}`}.`,
    },
    {
      label: "Ação recomendada",
      value: mainRisk ? mainRisk.cta : "Abrir Timeline ou atualizar sinais.",
    },
  ];

  const impactMetricsAreZero = impactMetrics.every(metric =>
    ["0", "R$ 0,00"].includes(metric.value)
  );
  const recentRuns24h = runs.filter((run: any) =>
    isRecentDate(
      run?.finishedAt ??
        run?.completedAt ??
        run?.createdAt ??
        run?.startedAt ??
        run?.occurredAt,
      24
    )
  );
  const recentStateChanges = recentRuns24h.filter(
    (run: any) =>
      textField(run, "previousState", "fromState") ||
      textField(run, "currentState", "state", "status")
  ).length;
  const nextReevaluation = formatRelativeReevaluation(
    summary.nextEvaluationAt ?? summary.nextRunAt ?? latestRun?.nextEvaluationAt
  );
  const priorityActions = buildPriorityActions(signals);
  const officialEvidence = runs
    .map((run: any, index: number): OfficialEvidence | null => {
      const occurredAt =
        run?.finishedAt ??
        run?.completedAt ??
        run?.createdAt ??
        run?.startedAt ??
        run?.occurredAt;
      if (!occurredAt || formatDateTime(occurredAt) === "—") return null;
      return {
        id: String(run?.id ?? `governance-evidence-${index}`),
        event:
          textField(run, "summary", "message", "reason", "event", "type") ||
          "Avaliação de governança registrada",
        source:
          textField(run, "source", "module", "actorName", "actor") ||
          "Governança",
        occurredAt: formatDateTime(occurredAt),
        impact:
          textField(run, "impact", "result", "status") ||
          "Sustenta o estado operacional atual",
        entity:
          textField(
            run,
            "entityName",
            "customerName",
            "chargeNumber",
            "serviceOrderCode",
            "reference"
          ) || "Leitura oficial",
        actionPath: textField(run, "href", "url", "path") || undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 5) as OfficialEvidence[];

  const history = runs
    .map((run: any, index: number): GovernanceHistoryItem | null => {
      const occurredAt =
        run?.finishedAt ??
        run?.completedAt ??
        run?.createdAt ??
        run?.startedAt ??
        run?.occurredAt;
      if (!occurredAt || formatDateTime(occurredAt) === "—") return null;
      return {
        id: String(run?.id ?? `governance-history-${index}`),
        previousState: textField(run, "previousState", "fromState") || "—",
        currentState: readState(run, state),
        reason: normalizeGovernanceReason(
          textField(run, "reason", "summary", "message")
        ),
        occurredAt: formatDateTime(occurredAt),
      };
    })
    .filter(Boolean)
    .slice(0, 4) as GovernanceHistoryItem[];

  const policies = [
    {
      name: "Cobranças vencidas recebem prioridade máxima",
      objective: "Destravar receita afetada",
      status:
        overdueCharges.length > 0 || policyAppliedCount > 0
          ? "ATIVA"
          : "SEM SINAL",
      impactando:
        overdueCharges.length > 0
          ? pluralizePt(
              overdueCharges.length,
              "cobrança vencida",
              "cobranças vencidas"
            )
          : "Sem impacto ativo",
      lastEvaluation: runs.length
        ? formatDateTime(lastRunAt)
        : "Aguardando execução oficial",
    },
    {
      name: "Sinais críticos são ordenados por impacto",
      objective: "Mostrar o que muda a operação primeiro",
      status:
        signals.length > 0 || automaticActionCount > 0 ? "ATIVA" : "SEM SINAL",
      impactando:
        signals.length > 0
          ? pluralizePt(
              signals.length,
              "sinal operacional",
              "sinais operacionais"
            )
          : "Sem impacto ativo",
      lastEvaluation: runs.length
        ? formatDateTime(lastRunAt)
        : "Aguardando execução oficial",
    },
    {
      name: "Estado operacional é recalculado automaticamente",
      objective: "Manter a decisão atualizada",
      status: hasRecentRun || runs.length > 0 ? "ATIVA" : "SEM SINAL",
      impactando:
        hasRecentRun || runs.length > 0
          ? "Estado operacional"
          : "Sem impacto ativo",
      lastEvaluation: runs.length
        ? formatDateTime(lastRunAt)
        : "Aguardando execução oficial",
    },
    {
      name: "Evidências são registradas em Timeline",
      objective: "Preservar prova operacional; a regra não fabrica provas",
      status: runs.length > 0 ? "ATIVA" : "SEM SINAL",
      impactando:
        runs.length > 0
          ? pluralizePt(runs.length, "registro oficial", "registros oficiais")
          : "Sem evidência nesta leitura",
      lastEvaluation: runs.length
        ? formatDateTime(lastRunAt)
        : "Aguardando execução oficial",
    },
  ] satisfies ActivePolicy[];

  return (
    <AppPageShell className="gap-3 p-3 md:gap-4 md:p-5">
      <AppPageHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)]">
              Governança
            </p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
              Centro de supervisão operacional
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
              Detecta sinais, interpreta impacto e orienta a intervenção sem
              expor logs técnicos.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              void Promise.all([
                summaryQuery.refetch(),
                runsQuery.refetch(),
                overdueChargesQuery.refetch(),
                serviceOrdersQuery.refetch(),
                appointmentsQuery.refetch(),
                dashboardKpisQuery.refetch(),
              ])
            }
          >
            Atualizar sinais
          </Button>
        </div>
      </AppPageHeader>

      <AppSectionCard
        variant="default"
        className="overflow-hidden border-[color-mix(in_srgb,var(--app-accent)_16%,var(--app-border-subtle))] bg-[linear-gradient(180deg,var(--app-surface-2),var(--app-surface-1))] p-0 shadow-none"
      >
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <AppStatusBadge
                label={`Estado: ${statePresentation.label}`}
                tone={statePresentation.tone}
              />
              <span className="text-xs text-[var(--text-muted)]">
                Última execução: {formatDateTime(lastRunAt)}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] md:text-3xl">
              {absenceOfRecentEvaluation
                ? "Governança aguardando leitura"
                : statePresentation.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              {absenceOfRecentEvaluation
                ? "Nenhuma execução recente da governança foi registrada. A operação está em atenção porque ainda não há validação automática recente."
                : principalReason}
            </p>
            {impactMetricsAreZero ? (
              <div className="mt-4 rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Sem impacto operacional ativo nesta leitura
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Sem sinais críticos carregados; atenção causada por ausência
                  de leitura recente.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {impactMetrics.map(metric => (
                    <span
                      key={metric.label}
                      className="rounded-full border border-[var(--app-border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      {metric.label}:{" "}
                      <strong className="text-[var(--text-primary)]">
                        {metric.value}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {impactMetrics.map(metric => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {metric.label}
                    </p>
                    <p
                      className={
                        metric.tone === "warning"
                          ? "mt-1 text-lg font-semibold text-[var(--app-warning)]"
                          : "mt-1 text-lg font-semibold text-[var(--app-success)]"
                      }
                    >
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <aside className="border-t border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-4 md:p-5 lg:border-l lg:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">
              Visão executiva
            </p>
            <h3 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
              Próxima melhor ação
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {mainRisk
                ? consequenceForSignal(mainRisk)
                : "Próxima ação: abrir Timeline ou atualizar sinais."}
            </p>
            <Button
              className="mt-4 w-full justify-center"
              onClick={() =>
                navigate(
                  mainRisk ? mainRisk.path : "/timeline?module=governance"
                )
              }
            >
              {mainRisk ? mainRisk.cta : "Abrir Timeline"}
            </Button>
          </aside>
        </div>
      </AppSectionCard>

      <AppSectionCard variant="default" className="p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">
              Próxima supervisão
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              O que acontece agora
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">
                  Próxima avaliação:
                </strong>{" "}
                {runs.length
                  ? nextReevaluation
                  : "Aguardando próxima execução registrada."}
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">
                  Gatilho observado:
                </strong>{" "}
                {mainRisk
                  ? mainRisk.title
                  : "A governança reavaliará os sinais quando houver nova leitura operacional."}
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">
                  Ação recomendada:
                </strong>{" "}
                {mainRisk
                  ? mainRisk.cta
                  : "Atualizar sinais ou abrir Timeline."}
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">
                  Fila de governança:
                </strong>{" "}
                {priorityActions.length
                  ? `${priorityActions.length} ação(ões) em acompanhamento.`
                  : "Sem ações críticas na fila."}
              </p>
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Nas últimas 24h
            </p>
            {recentRuns24h.length ? (
              <div className="mt-2 grid gap-2 text-sm text-[var(--text-secondary)]">
                <p>
                  Execuções registradas:{" "}
                  <strong className="text-[var(--text-primary)]">
                    {recentRuns24h.length}
                  </strong>
                </p>
                <p>
                  Mudanças de estado:{" "}
                  <strong className="text-[var(--text-primary)]">
                    {recentStateChanges}
                  </strong>
                </p>
                <p>
                  Restrições ou bloqueios:{" "}
                  <strong className="text-[var(--text-primary)]">
                    {
                      operationalSignals.filter(signal =>
                        ["critical", "high"].includes(signal.priority)
                      ).length
                    }
                  </strong>
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Sem base suficiente para calcular atividade recente. Aguardando
                próxima execução registrada.
              </p>
            )}
          </section>
        </div>
      </AppSectionCard>

      <AppSectionCard variant="default" className="p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">
              Ações operacionais
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              Ações que o sistema fará
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              A fila mostra o que será automático, recomendado, manual ou
              bloqueado conforme evidências reais.
            </p>
          </div>
          <AppStatusBadge label={`${priorityActions.length} ações`} />
        </div>
        {priorityActions.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {priorityActions.map((action, index) => (
              <article
                key={action.problem}
                className="flex min-h-full flex-col rounded-2xl border border-[var(--app-border-subtle)] bg-[linear-gradient(180deg,var(--app-surface-2),var(--app-surface-1))] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--app-accent)] text-sm font-semibold text-slate-950">
                    {index + 1}
                  </span>
                  <AppStatusBadge
                    label={operationalPriorityLabel(action)}
                    tone={
                      action.priority === "critical"
                        ? "danger"
                        : action.priority === "high"
                          ? "warning"
                          : "neutral"
                    }
                  />
                </div>
                <h3 className="mt-3 font-semibold text-[var(--text-primary)]">
                  {actionTitle(action)}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {action.consequence}
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {action.recommendation}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)]">
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      Tipo:
                    </strong>{" "}
                    {action.type}
                  </span>
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      Status:
                    </strong>{" "}
                    {action.status}
                  </span>
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      Motivo:
                    </strong>{" "}
                    {action.motive}
                  </span>
                </div>
                <span className="mt-3 w-fit rounded-full border border-[var(--app-border-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Prioridade {priorityLabel(action.priority)}
                </span>
                <Button
                  className="mt-3 w-full justify-center"
                  variant="outline"
                  onClick={() => navigate(action.primaryPath)}
                >
                  {action.primaryActionLabel}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-4">
            <p className="font-semibold text-[var(--text-primary)]">
              Nenhuma intervenção urgente
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              A governança não encontrou bloqueios operacionais críticos nesta
              leitura.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {nextReevaluation}
            </p>
          </div>
        )}
      </AppSectionCard>

      <AppSectionCard variant="evidence" className="p-4 md:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">
          Diagnóstico operacional
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
          Por que estou nesse estado?
        </h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {operationalDiagnosis.map(item => (
            <article
              key={item.label}
              className="rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {item.label}
              </p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {item.value}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">
                Leitura resumida da decisão
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {state === "NORMAL"
                  ? "A leitura atual não exige bloqueio ou contenção."
                  : absenceOfRecentEvaluation
                    ? "Atenção por ausência de validação automática recente, não por impacto operacional ativo."
                    : `A operação exige atenção porque o risco ${riskLevel} tem consequência mensurável.`}
              </p>
            </div>
            <AppStatusBadge
              label={statePresentation.label}
              tone={statePresentation.tone}
            />
          </div>
        </div>
      </AppSectionCard>

      <AppSectionCard variant="default" className="p-4 md:p-5">
        <div>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--app-accent)]">
                Políticas ativas
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Controles compactos usados nesta leitura, sem manual técnico.
              </p>
            </div>
            <AppStatusBadge
              label={`${policies.filter(policy => policy.status === "ATIVA").length} ativas`}
              tone="accent"
            />
          </div>
          <div className="mt-3 divide-y divide-[var(--app-border-subtle)] rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)]">
            {policies.map(policy => (
              <div
                key={policy.name}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    ✓ {policy.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {policy.objective} · {policy.impactando} ·{" "}
                    {policy.lastEvaluation}
                  </p>
                </div>
                <AppStatusBadge
                  label={policy.status}
                  tone={policy.status === "ATIVA" ? "success" : "neutral"}
                />
              </div>
            ))}
          </div>
        </div>
      </AppSectionCard>

      <AppSectionCard variant="evidence" className="p-4 md:p-5">
        <div className="border-b border-[var(--app-border-subtle)] pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--app-accent)]">
            Histórico e evidências
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            Evidências e histórico na mesma trilha
          </h2>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-2xl bg-[color-mix(in_srgb,var(--app-surface-2)_78%,transparent)] p-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Evidências oficiais
            </h3>
            {officialEvidence.length ? (
              <div className="mt-3 grid gap-3">
                {officialEvidence.map(event => {
                  const EvidenceIcon = evidenceIconFor(event);
                  return (
                    <article
                      key={event.id}
                      className="rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-4"
                    >
                      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-3)] text-[var(--app-accent)]">
                          <EvidenceIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-[var(--text-primary)]">
                            {event.event}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {event.source} · {event.entity}
                          </p>
                          <p className="mt-2 text-sm text-[var(--text-secondary)]">
                            <strong className="text-[var(--text-primary)]">
                              Impacto: {""}
                            </strong>
                            {event.impact}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 md:items-end">
                          <span className="text-sm text-[var(--text-muted)]">
                            {event.occurredAt}
                          </span>
                          {event.actionPath ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(event.actionPath!)}
                            >
                              Abrir prova
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--app-accent)_32%,var(--app-border-subtle))] bg-[color-mix(in_srgb,var(--app-accent)_6%,var(--app-surface-1))] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-semibold text-[var(--text-primary)]">
                  Nenhuma evidência registrada nesta leitura.
                </p>
                <p className="mt-1">
                  A próxima execução de governança adicionará provas
                  operacionais aqui.
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/timeline?module=governance")}
                >
                  Abrir Timeline
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-[color-mix(in_srgb,var(--app-surface-2)_78%,transparent)] p-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Histórico de governança
            </h3>
            {history.length ? (
              <div className="mt-3 grid gap-3">
                {history.map(item => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-2)] p-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-3)] text-[var(--app-accent)]">
                        <Clock3 className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <AppStatusBadge
                            label={item.previousState}
                            tone="neutral"
                          />
                          <span className="text-sm text-[var(--text-muted)]">
                            →
                          </span>
                          <AppStatusBadge
                            label={item.currentState}
                            tone="accent"
                          />
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          <strong className="text-[var(--text-primary)]">
                            Motivo: {""}
                          </strong>
                          {item.reason}
                        </p>
                      </div>
                      <span className="text-sm text-[var(--text-muted)] md:text-right">
                        {item.occurredAt}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-[var(--app-border-subtle)] bg-[linear-gradient(180deg,var(--app-surface-2),var(--app-surface-1))] p-4 text-sm text-[var(--text-secondary)]">
                <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-3)] text-[var(--app-accent)]">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                      Container de decisões
                    </p>
                    <p className="mt-1 font-semibold text-[var(--text-primary)]">
                      Nenhuma mudança de governança encontrada nesta leitura.
                    </p>
                    <p className="mt-1">
                      A próxima execução registrada aparecerá aqui.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </AppSectionCard>
    </AppPageShell>
  );
}

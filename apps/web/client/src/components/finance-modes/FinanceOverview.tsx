import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Flame,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";

import { AppRowActionsDropdown } from "@/components/app-system";
import {
  AppChartPanel,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppSectionBlock,
  appSelectionPillClasses,
} from "@/components/internal-page-system";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "month", label: "Mês atual" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

interface QueueItem {
  id: string;
  client: string;
  value: string;
  summary: string;
  intelligenceLabel?: string;
  amountContext?: string;
  dueLabel?: string;
  dateContext?: string;
  status: "overdue" | "pending" | "ready";
  priority: "critical" | "attention" | "healthy";
  recommendedAction:
    | "Cobrar via WhatsApp"
    | "Agendar lembrete"
    | "Registrar pagamento";
  priorityReason?: string;
  impactLabel?: string;
  contextualActions?: readonly string[];
  flowContext?: string;
  onAction: () => void;
}

interface FinanceOverviewProps {
  revenueData: Array<{
    label: string;
    revenue: number;
    projected: number;
    overdue: number;
  }>;
  revenueDataByPeriod: Record<
    Period,
    Array<{
      label: string;
      revenue: number;
      projected: number;
      overdue: number;
    }>
  >;
  revenueLoading: boolean;
  revenueError?: string;
  isRevenueValid: boolean;
  revenueInvalidReason?: string;
  risk: {
    riskAmount: string;
    overdueCount: number;
    dueToday: number;
    dueSoon: number;
  };
  goToMode: (mode: "pending" | "overdue" | "paid") => void;
  openCreate: () => void;
  cobrarAgora: () => void;
  operationalSignals: {
    overdueCount: number;
    dueToday: number;
    dueSoon: number;
    awaitingSettlementCount: number;
    awaitingSettlementTotal: string;
    riskAmount: string;
  };
  queueItems: QueueItem[];
}

export function FinanceOverview(props: FinanceOverviewProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const data = useMemo(
    () => props.revenueDataByPeriod[period] ?? props.revenueData,
    [period, props.revenueData, props.revenueDataByPeriod]
  );

  const totalOverdueEvents = data.reduce(
    (acc, item) => acc + Number(item.overdue ?? 0),
    0
  );
  const revenueStart = Number(data[0]?.revenue ?? 0);
  const revenueEnd = Number(data[data.length - 1]?.revenue ?? 0);
  const revenueDeltaPercent =
    revenueStart > 0 ? ((revenueEnd - revenueStart) / revenueStart) * 100 : 0;
  const dueSoon72hCount = props.queueItems.filter(
    item => item.status === "pending" && item.priority === "attention"
  ).length;
  const riskIntensity = Math.min(
    100,
    Math.round(
      ((props.risk.overdueCount * 2 +
        props.risk.dueToday +
        props.risk.dueSoon * 0.4) /
        Math.max(props.queueItems.length, 1)) *
        42
    )
  );
  const riskSummary =
    props.risk.overdueCount > 0
      ? `${props.risk.overdueCount} cobrança(s) vencida(s) exigem ação hoje.`
      : props.risk.dueToday > 0
        ? `${props.risk.dueToday} cobrança(s) vencem hoje e pedem acompanhamento.`
        : props.risk.dueSoon > 0
          ? `${props.risk.dueSoon} cobrança(s) vencem em até 7 dias.`
          : "Sem pressão imediata no caixa.";
  const nextBestAction = useMemo(() => {
    if (props.operationalSignals.overdueCount > 0) {
      return {
        urgencyLabel: "Crítico",
        headline: "Cobrar vencidas",
        immediateContext: `${props.operationalSignals.overdueCount} cobrança(s) vencida(s) com criticidade financeira.`,
        reason: "Existem pendências vencidas com impacto imediato no caixa.",
        impactContext: `Impacto estimado: ${props.operationalSignals.riskAmount}.`,
        primaryActionLabel: "Cobrar via WhatsApp" as const,
        onPrimaryAction: props.cobrarAgora,
      };
    }
    if (props.operationalSignals.dueToday > 0 || dueSoon72hCount > 0) {
      const urgentCount = props.operationalSignals.dueToday + dueSoon72hCount;
      return {
        urgencyLabel: "Hoje",
        headline: "Cobrar hoje",
        immediateContext: `${urgentCount} cobrança(s) pedem contato imediato.`,
        reason: "Janela crítica nas próximas 72h e risco de virar vencida.",
        impactContext: `Janela sensível: ${props.operationalSignals.riskAmount} em monitoramento.`,
        primaryActionLabel: "Cobrar via WhatsApp" as const,
        onPrimaryAction: props.cobrarAgora,
      };
    }
    if (props.operationalSignals.awaitingSettlementCount > 0) {
      return {
        urgencyLabel: "Processar",
        headline: "Registrar pagamento",
        immediateContext: `${props.operationalSignals.awaitingSettlementCount} recebimento(s) aguardando baixa.`,
        reason: "Entrada já confirmada e ainda não refletida no realizado.",
        impactContext: `Impacto estimado: ${props.operationalSignals.awaitingSettlementTotal}.`,
        primaryActionLabel: "Registrar pagamento" as const,
        onPrimaryAction: () => props.goToMode("paid"),
      };
    }
    return {
      urgencyLabel: "Estável",
        headline: "Monitorar carteira segura",
      immediateContext: "Sem itens críticos no momento.",
      reason: "Fluxo previsível sem pressão imediata no caixa.",
      impactContext: "Ação recomendada: manter acompanhamento periódico.",
      primaryActionLabel: "Ver pendentes" as const,
      onPrimaryAction: () => props.goToMode("pending"),
    };
  }, [
    dueSoon72hCount,
    props.cobrarAgora,
    props.goToMode,
    props.operationalSignals.awaitingSettlementCount,
    props.operationalSignals.awaitingSettlementTotal,
    props.operationalSignals.dueToday,
    props.operationalSignals.overdueCount,
    props.operationalSignals.riskAmount,
  ]);

  return (
    <div className="space-y-8">
      <AppChartPanel
        title="Receita e previsão"
        description="Recebidos, previstos e vencimentos no período selecionado."
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-3 py-1 text-[11px] font-semibold text-emerald-200">
            <Sparkles className="h-3.5 w-3.5" />
            {`${revenueDeltaPercent >= 0 ? "+" : "-"}${Math.abs(revenueDeltaPercent).toFixed(1)}% nos últimos ${period === "7d" ? "7" : period === "30d" ? "30" : period === "90d" ? "90" : "dias do mês"} dias`}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(item => (
              <button
                key={item.value}
                type="button"
                className={appSelectionPillClasses(period === item.value)}
                onClick={() => setPeriod(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]/45 p-4 md:grid-cols-2">
          <div className="flex items-start gap-2.5 border-b border-[var(--border-subtle)]/70 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
            <div className="rounded-md bg-emerald-500/20 p-1.5 text-emerald-200">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Boa trajetória de receita
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Recebimentos acelerando em relação ao ciclo anterior.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="rounded-md bg-amber-500/20 p-1.5 text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Valor em risco: {props.risk.riskAmount}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {props.risk.overdueCount > 0
                  ? `${props.risk.overdueCount} vencida(s) exigem ação imediata.`
                  : "Sem criticidade alta no momento."}
              </p>
            </div>
          </div>
        </div>

        {props.revenueLoading && data.length === 0 ? (
          <AppPageLoadingState description="Carregando evolução de receita..." />
        ) : props.revenueError && data.length === 0 ? (
          <AppPageErrorState
            description={props.revenueError}
            actionLabel="Criar cobrança"
            onAction={props.openCreate}
          />
        ) : !props.isRevenueValid ? (
          <AppPageEmptyState
            title="Erro ao renderizar gráfico"
            description={
              props.revenueInvalidReason ?? "Dados inválidos do gráfico."
            }
          />
        ) : data.length === 0 ? (
          <AppPageEmptyState
            title="Ainda sem histórico"
            description="Registre pagamentos para começar a leitura do caixa."
          />
        ) : (
          <ChartContainer
            className="h-[280px] w-full rounded-xl border border-[var(--border-subtle)]/75 bg-[var(--surface-base)]/25 p-2 lg:h-[310px]"
            config={{
              revenue: { label: "Recebido", color: "hsl(var(--accent))" },
              projected: {
                label: "Previsto",
                color: "hsl(194 70% 56%)",
              },
              overdue: {
                label: "Vencidas",
                color: "hsl(6 82% 64%)",
              },
            }}
          >
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 10, bottom: 4, left: -8 }}
            >
              <CartesianGrid
                strokeDasharray="2 5"
                vertical={false}
                stroke="color-mix(in srgb, var(--border-subtle) 35%, transparent)"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={22}
                tickMargin={10}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={46}
                tick={{ fontSize: 11 }}
                tickMargin={8}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="rounded-xl border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 p-2 shadow-xl"
                    labelFormatter={value => `Data ${String(value)}`}
                    formatter={(value, name, item) => {
                      const metric =
                        name === "revenue"
                          ? "Recebido"
                          : name === "projected"
                            ? "Previsto"
                            : "Vencidas";
                      const formatted =
                        name === "overdue"
                          ? `${Number(value).toLocaleString("pt-BR")}`
                          : `R$ ${Number(value).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`;
                      return (
                        <div className="flex w-full items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            {metric}
                          </span>
                          <span className="font-mono text-foreground text-[11px]">
                            {formatted}
                          </span>
                          {name === "revenue" ? (
                            <span className="sr-only">
                              Previsto{" "}
                              {Number((item as any)?.payload?.projected ?? 0)}
                            </span>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="projected"
                stroke="var(--color-projected)"
                fill="var(--color-projected)"
                fillOpacity={0.08}
                strokeWidth={2}
                strokeDasharray="6 6"
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-revenue)"
                strokeWidth={2.8}
                dot={{
                  r: 2.5,
                  fill: "var(--color-revenue)",
                  strokeWidth: 0,
                }}
                activeDot={{
                  r: 5,
                  fill: "var(--color-revenue)",
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
              />
              {data.map(item =>
                item.overdue > 0 ? (
                  <ReferenceDot
                    key={`${item.label}-overdue`}
                    x={item.label}
                    y={item.revenue}
                    r={4}
                    fill="var(--color-overdue)"
                    stroke="hsl(var(--background))"
                    strokeWidth={1.5}
                  />
                ) : null
              )}
            </ComposedChart>
          </ChartContainer>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            {totalOverdueEvents > 0
              ? `${totalOverdueEvents} pontos críticos no período.`
              : "Sem pontos críticos no período selecionado."}
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Período ativo: {PERIODS.find(item => item.value === period)?.label}
          </span>
        </div>
      </AppChartPanel>

      <div className="grid gap-8 md:grid-cols-2">
        <AppSectionBlock
          title="Riscos atuais"
          subtitle="Risco financeiro imediato da operação."
          className="h-full"
          compact
        >
          <div className="flex h-full flex-col gap-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]/85">
                Valor em risco
              </p>
              <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-200">
                {props.risk.overdueCount > 0
                  ? "Crítico"
                  : props.risk.dueToday > 0
                    ? "Atenção"
                    : "Normal"}
              </span>
            </div>
            <p className="text-[2rem] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
              {props.risk.riskAmount}
            </p>
            <p className="text-sm leading-snug text-[var(--text-secondary)]">
              {riskSummary}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>Risco financeiro</span>
                <span>{riskIntensity}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-base)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400/80 to-rose-500/80"
                  style={{ width: `${riskIntensity}%` }}
                />
              </div>
            </div>
            <div className="mt-0.5 grid grid-cols-3 divide-x divide-[var(--border-subtle)]/90 rounded-md border border-[var(--border-subtle)]/80 bg-[var(--surface-base)]/30">
              <div className="px-2 py-1">
                <Clock3 className="mb-0.5 h-3.5 w-3.5 text-amber-200" />
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Hoje
                </p>
                <p className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
                  {props.risk.dueToday}
                </p>
              </div>
              <div className="px-2 py-1">
                <Flame className="mb-0.5 h-3.5 w-3.5 text-orange-200" />
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  7 dias
                </p>
                <p className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
                  {props.risk.dueSoon}
                </p>
              </div>
              <div className="px-2 py-1">
                <ShieldAlert className="mb-0.5 h-3.5 w-3.5 text-rose-200" />
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  Vencidas
                </p>
                <p className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
                  {props.risk.overdueCount}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => props.goToMode("overdue")}
            >
              Ir para vencidas
            </Button>
          </div>
        </AppSectionBlock>

        <AppSectionBlock
          title="O que fazer agora"
          subtitle="Decisão recomendada com foco em caixa."
          className="h-full"
          compact
        >
          <div className="flex h-full flex-col gap-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Ação imediata
                </span>
                <p className="text-lg font-semibold leading-tight text-[var(--text-primary)]">
                  {nextBestAction.headline}
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-[var(--border-subtle)]/90 bg-[var(--surface-base)]/45 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                {nextBestAction.urgencyLabel}
              </span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/35 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm leading-snug text-[var(--text-secondary)]">
                  {nextBestAction.immediateContext}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Motivo: {nextBestAction.reason}
                </p>
                <p className="text-[13px] font-medium text-[var(--text-primary)]/95">
                  {nextBestAction.impactContext}
                </p>
              </div>
              <div className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)]/60 p-2.5 text-[var(--accent)]">
                <Zap className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)]/85 bg-[var(--surface-base)]/25 px-2.5 py-1.5">
              <p className="text-[11px] text-[var(--text-secondary)]">
                Ação recomendada:{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {nextBestAction.primaryActionLabel}
                </span>
              </p>
              <AppRowActionsDropdown
                triggerLabel="Mais ações da recomendação"
                contentClassName="min-w-[230px]"
                items={[
                  {
                    label: "Cobrar via WhatsApp",
                    onSelect: props.cobrarAgora,
                  },
                  {
                    label: "Agendar lembrete",
                    onSelect: () => props.goToMode("pending"),
                  },
                  {
                    label: "Registrar pagamento",
                    onSelect: () => props.goToMode("paid"),
                  },
                  {
                    label: "Abrir detalhe da cobrança",
                    onSelect: () => props.goToMode("overdue"),
                  },
                  {
                    label: "Ver contexto do cliente",
                    onSelect: () => props.goToMode("pending"),
                  },
                  {
                    label: "Ver origem operacional",
                    onSelect: nextBestAction.onPrimaryAction,
                  },
                ]}
              />
            </div>
          </div>
        </AppSectionBlock>
      </div>

      <AppSectionBlock
        title="Fila operacional"
        subtitle="Prioridades para execução direta."
        className="mt-0.5"
        compact
      >
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)]/40 px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
          >
            Ordenar: Prioridade
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)]/35 px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
            {props.queueItems.length} itens
          </span>
        </div>
        <div className="space-y-2">
          {props.queueItems.length > 0 ? (
            props.queueItems.map(item => (
              <div
                key={item.id}
                className={cn(
                  "group relative w-full rounded-lg border px-3 py-2 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(0,0,0,0.16)]",
                  item.priority === "critical" &&
                    "border-rose-500/35 bg-rose-500/7 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-r-md before:bg-rose-400/65",
                  item.priority === "attention" &&
                    "border-amber-500/30 bg-amber-500/5 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-r-md before:bg-amber-300/65",
                  item.priority === "healthy" &&
                    "border-[var(--border-subtle)] bg-[var(--surface-base)]/45 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-r-md before:bg-emerald-300/55"
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {item.client}
                      </p>
                      <div className="flex min-w-0 items-center gap-2 text-[11px]">
                        <p className="font-semibold text-[var(--text-primary)]">{item.value}</p>
                        <span className="text-[var(--text-muted)]">•</span>
                        <p className="truncate text-[var(--text-muted)]">{item.dueLabel}</p>
                        <span
                          className={cn(
                            "inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                            item.priority === "critical" &&
                              "border-rose-500/45 bg-rose-500/10 text-rose-200",
                            item.priority === "attention" &&
                              "border-amber-500/45 bg-amber-500/10 text-amber-200",
                            item.priority === "healthy" &&
                              "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          )}
                        >
                          {item.priority === "critical" ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : item.priority === "attention" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {item.priority === "critical"
                            ? "Crítica"
                            : item.priority === "attention"
                              ? "Atenção"
                              : "Seguro"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 self-start">
                      <AppRowActionsDropdown
                        triggerLabel={`Mais ações para ${item.client}`}
                        items={[
                          {
                            label: "Cobrar via WhatsApp",
                            onSelect: item.onAction,
                            disabled: item.recommendedAction !== "Cobrar via WhatsApp",
                          },
                          {
                            label: "Agendar lembrete",
                            onSelect: item.onAction,
                            disabled: item.recommendedAction !== "Agendar lembrete",
                          },
                          {
                            label: "Registrar pagamento",
                            onSelect: item.onAction,
                            disabled: item.recommendedAction !== "Registrar pagamento",
                          },
                          { label: "Abrir detalhe da cobrança", onSelect: item.onAction },
                          { label: "Ver contexto do cliente", onSelect: item.onAction },
                          { label: "Ver origem operacional", onSelect: item.onAction },
                        ]}
                      />
                    </div>
                  </div>
                  <p className="truncate text-[11px] text-[var(--text-secondary)]">
                    {item.priorityReason || item.summary}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">
                    {item.impactLabel}
                    {item.flowContext ? ` • ${item.flowContext}` : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-2">
              <AppPageEmptyState
                title="Sem itens na fila"
                description="Carteira sob controle. Crie uma cobrança para novo ciclo."
              />
              <div className="flex justify-start">
                <Button size="sm" variant="outline" onClick={props.openCreate}>
                  Criar cobrança
                </Button>
              </div>
            </div>
          )}
        </div>
      </AppSectionBlock>
    </div>
  );
}

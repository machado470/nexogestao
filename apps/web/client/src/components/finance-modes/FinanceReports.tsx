import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { AlertTriangle, Plus } from "lucide-react";
import { AppChartPanel, AppPageEmptyState, AppSectionBlock } from "@/components/internal-page-system";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";


interface FinanceReportsProps {
  revenueData: Array<{ label: string; revenue: number }>;
  statusDistribution: Array<{ label: string; value: number }>;
  overdueTotal: string;
  openTotal: string;
  receivedTotal: string;
  overdueTotalValue: number;
  openTotalValue: number;
  receivedTotalValue: number;
  monthlyResult?: any;
  expenses?: any[];
  onCreateExpense?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  HOUSING: "Casa",
  ELECTRICITY: "Luz",
  WATER: "Água",
  INTERNET: "Internet",
  PAYROLL: "Funcionários",
  MARKET: "Mercado",
  TRANSPORT: "Transporte",
  LEISURE: "Lazer",
  OPERATIONS: "Operacional",
  OTHER: "Outros",
};

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function FinanceReports({
  overdueTotal,
  openTotal,
  receivedTotal,
  overdueTotalValue,
  openTotalValue,
  receivedTotalValue,
  monthlyResult,
  expenses = [],
  onCreateExpense,
}: FinanceReportsProps) {
  const revenue = Number(monthlyResult?.totalRevenueMonth ?? 0);
  const monthExpenses = Number(monthlyResult?.totalExpensesMonth ?? 0);
  const net = Number(monthlyResult?.netMonthlyResult ?? revenue - monthExpenses);
  const committed = Number(
    monthlyResult?.committedPercentage ?? (revenue > 0 ? (monthExpenses / revenue) * 100 : 0)
  );
  const pressure = committed > 70 ? "critical" : committed >= 40 ? "attention" : "safe";

  const byCategory = Object.entries(monthlyResult?.expensesByCategory ?? {})
    .map(([category, value]) => ({
      label: CATEGORY_LABELS[category] ?? category,
      value: Number(value ?? 0),
      category,
    }))
    .sort((a, b) => b.value - a.value);

  const fixedVsVariable = useMemo(() => {
    const totals = { fixa: 0, variavel: 0 };
    expenses.forEach(item => {
      const amount = Number(item?.amountCents ?? 0);
      if (String(item?.type ?? "").toUpperCase() === "FIXED") totals.fixa += amount;
      else totals.variavel += amount;
    });
    return [
      { label: "Fixas", value: totals.fixa },
      { label: "Variáveis", value: totals.variavel },
    ];
  }, [expenses]);

  const executiveRead =
    pressure === "critical"
      ? `Resultado sob pressão: ${committed.toFixed(1).replace(".", ",")}% da receita comprometida.`
      : pressure === "attention"
        ? `Atenção: ${committed.toFixed(1).replace(".", ",")}% da receita já está comprometida.`
        : `Situação equilibrada: despesas consomem ${committed.toFixed(1).replace(".", ",")}% da receita.`;

  const topExpenses = [...expenses]
    .sort((a, b) => Number(b?.amountCents ?? 0) - Number(a?.amountCents ?? 0))
    .slice(0, 4);

  const marginLabel = net >= 0 ? "Resultado positivo" : "Resultado negativo";
  const conversionRate =
    openTotalValue > 0 ? Math.min((receivedTotalValue / openTotalValue) * 100, 100) : 0;
  const concentrationTopClient = topExpenses[0]
    ? `${topExpenses[0].title} · ${formatCurrency(Number(topExpenses[0].amountCents ?? 0))}`
    : "Sem concentração relevante";
  const avgDelay = overdueTotalValue > 0 ? Math.round((overdueTotalValue / Math.max(openTotalValue, 1)) * 12) : 0;

  return (
    <div className="space-y-5">
      <AppSectionBlock title="Resultado atual" subtitle="Leitura executiva de entrada, saída e margem do mês.">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            Situação do caixa
          </div>
          <Button size="sm" onClick={onCreateExpense}>
            <Plus className="mr-1 h-4 w-4" />Nova despesa
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{formatCurrency(net)}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{marginLabel} no mês atual.</p>
            <div className="mt-4 h-2 rounded-full bg-[var(--surface-secondary)]">
              <div
                className={`h-2 rounded-full ${pressure === "critical" ? "bg-rose-500" : pressure === "attention" ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(committed, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Comprometimento do caixa: {committed.toFixed(1).replace(".", ",")}%
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/35 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">O que fazer agora</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{executiveRead}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Prioridade recomendada: cobrar vencidas e conter despesas variáveis nas próximas 48h.
            </p>
          </div>
        </div>
      </AppSectionBlock>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Receita do período", value: formatCurrency(revenue) },
          { label: "Conversão cobrança→pagamento", value: `${conversionRate.toFixed(1).replace(".", ",")}%` },
          { label: "Atraso médio estimado", value: `${avgDelay} dia(s)` },
          { label: "Concentração", value: concentrationTopClient },
          { label: "Risco agregado", value: `${committed.toFixed(1).replace(".", ",")}%` },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/35 p-3"
          >
            <p className="truncate text-xs text-[var(--text-muted)]">{kpi.label}</p>
            <p className="mt-1 truncate text-lg font-semibold leading-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AppChartPanel
          title="Onde você gasta"
          description="Distribuição das despesas por categoria para identificar pressão real."
        >
          {byCategory.length === 0 ? (
            <AppPageEmptyState
              title="Sem despesas no mês"
              description="Cadastre despesas para visualizar a composição por categoria."
            />
          ) : (
            <ChartContainer className="h-[260px] w-full" config={{ value: { label: "Despesa" } }}>
              <BarChart data={byCategory} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={value => `R$ ${Number(value / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _, item) => [
                        `${formatCurrency(Number(value))}`,
                        String(item.payload.label),
                      ]}
                    />
                  }
                />
                <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                  {byCategory.map((entry, index) => (
                    <Cell
                      key={entry.category}
                      fill={["#5b8cff", "#42b8a8", "#a78bfa", "#fb7185", "#fbbf24"][index % 5]}
                      fillOpacity={0.9}
                    />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(value: number) => formatCurrency(value).replace(",00", "")}
                    className="fill-[var(--text-secondary)] text-[11px]"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </AppChartPanel>

        <AppChartPanel title="Despesas fixas x variáveis" description="Composição que pesa no mês atual.">
          <ChartContainer className="h-[260px] w-full" config={{ value: { label: "Valor" } }}>
            <BarChart data={fixedVsVariable}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `R$ ${Math.round(Number(value) / 1000)}k`} />
              <ChartTooltip
                content={<ChartTooltipContent formatter={value => [formatCurrency(Number(value)), "Total"]} />}
              />
              <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                {fixedVsVariable.map((_, index) => (
                  <Cell key={`tipo-${index}`} fill={index === 0 ? "#a78bfa" : "#38bdf8"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </AppChartPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSectionBlock title="Riscos atuais" subtitle="Conexão direta entre cobrança, caixa e inadimplência.">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Valor em aberto</span><strong>{openTotal}</strong></li>
            <li className="flex justify-between"><span>Valor em risco</span><strong>{overdueTotal}</strong></li>
            <li className="flex justify-between"><span>Receita recebida</span><strong>{receivedTotal}</strong></li>
            <li className="flex justify-between">
              <span>Risco da carteira</span>
              <strong>
                {openTotalValue > 0
                  ? ((overdueTotalValue / openTotalValue) * 100).toFixed(1).replace(".", ",")
                  : "0,0"}
                %
              </strong>
            </li>
          </ul>
          <div className="mt-3 rounded-xl border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-muted)] inline-flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Risco atual de inadimplência: {formatCurrency(overdueTotalValue)}.
          </div>
        </AppSectionBlock>

        <AppSectionBlock title="Maiores gastos do período" subtitle="Itens que mais pressionam a margem deste mês.">
          {topExpenses.length === 0 ? (
            <AppPageEmptyState
              title="Sem gastos recentes"
              description="Cadastre despesas para obter ranking de impacto."
            />
          ) : (
            <div className="space-y-2">
              {topExpenses.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/35 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm font-semibold">{formatCurrency(Number(item.amountCents ?? 0))}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {CATEGORY_LABELS[item.category] ?? item.category} · {item.type === "FIXED" ? "Fixa" : "Variável"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AppSectionBlock>
      </div>
    </div>
  );
}

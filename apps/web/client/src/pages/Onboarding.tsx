import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Coins,
  AlertTriangle,
  Loader2,
  Sparkles,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useDemoEnvironment } from "@/hooks/useDemoEnvironment";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

type StepKey =
  | "customer"
  | "appointment"
  | "serviceOrder"
  | "charge";

type Progress = Record<StepKey, boolean>;

type JourneyIds = {
  customerId: string | null;
  appointmentId: string | null;
  serviceOrderId: string | null;
  chargeId: string | null;
};

const BASE_PROGRESS: Progress = {
  customer: false,
  appointment: false,
  serviceOrder: false,
  charge: false,
};

const BASE_IDS: JourneyIds = {
  customerId: null,
  appointmentId: null,
  serviceOrderId: null,
  chargeId: null,
};

const STEP_META: Array<{
  key: StepKey;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "customer",
    title: "Criar cliente",
    description: "Abra uma oportunidade real de receita dentro do seu funil.",
    cta: "Criar cliente",
    icon: UserRound,
  },
  {
    key: "appointment",
    title: "Criar agendamento",
    description: "Agende o atendimento e transforme lead em execução.",
    cta: "Criar agendamento",
    icon: Calendar,
  },
  {
    key: "serviceOrder",
    title: "Concluir serviço",
    description: "Registre e conclua a execução para liberar a cobrança.",
    cta: "Concluir serviço",
    icon: ClipboardList,
  },
  {
    key: "charge",
    title: "Gerar cobrança",
    description: "Converta a execução em valor financeiro rastreável.",
    cta: "Gerar cobrança",
    icon: Coins,
  },
];

function getStepStatusLabel(done: boolean, enabled: boolean) {
  if (done) return "Concluído";
  if (enabled) return "Pronto para executar";
  return "Aguardando etapa anterior";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }

  return null;
}

function extractEntityId(payload: unknown, keys: string[] = ["id"]): string | null {
  if (!payload || Array.isArray(payload)) return null;

  if (isRecord(payload)) {
    for (const key of keys) {
      const direct = extractId(payload[key]);
      if (direct) return direct;
    }

    const nestedCandidates = [payload.data, payload.result, payload.item];
    for (const nested of nestedCandidates) {
      const nestedId = extractEntityId(nested, keys);
      if (nestedId) return nestedId;
    }
  }

  return null;
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { track } = useProductAnalytics();
  const { user, isAuthenticated, isInitializing } = useAuth();
  const utils = trpc.useUtils();
  const { isGenerating, generateDemoEnvironment } = useDemoEnvironment();

  const canQuery = isAuthenticated && !isInitializing;

  const [progress, setProgress] = useState<Progress>(BASE_PROGRESS);
  const [journeyIds, setJourneyIds] = useState<JourneyIds>(BASE_IDS);
  const [error, setError] = useState<string | null>(null);
  const [flowMessage, setFlowMessage] = useState<string | null>(null);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [seedFallback, setSeedFallback] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("Cliente Demo NexoGestão");
  const [customerPhone, setCustomerPhone] = useState("11999990000");
  const [appointmentNotes, setAppointmentNotes] = useState(
    "Atendimento de diagnóstico com foco em faturamento"
  );
  const [serviceOrderTitle, setServiceOrderTitle] = useState(
    "Execução inicial pronta para faturar"
  );
  const [chargeAmount, setChargeAmount] = useState("150");

  const storageKey = useMemo(
    () => `pilot-onboarding:${user?.id ?? "anon"}`,
    [user?.id]
  );

  const customersQuery = trpc.customers.list.useQuery(undefined, {
    enabled: canQuery,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const appointmentsQuery = trpc.appointments.list.useQuery(
    { page: 1, limit: 20 },
    { enabled: canQuery, retry: false, refetchOnWindowFocus: false }
  );

  const serviceOrdersQuery = trpc.serviceOrders.list.useQuery(
    { page: 1, limit: 20 },
    { enabled: canQuery, retry: false, refetchOnWindowFocus: false }
  );

  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 20 },
    { enabled: canQuery, retry: false, refetchOnWindowFocus: false }
  );

  const customerMutation = trpc.customers.create.useMutation();
  const appointmentMutation = trpc.appointments.create.useMutation();
  const serviceOrderMutation = trpc.serviceOrders.create.useMutation();
  const serviceOrderUpdateMutation = trpc.serviceOrders.update.useMutation();
  const chargeMutation = trpc.finance.charges.create.useMutation();
  const completeOnboardingMutation = trpc.onboarding.complete.useMutation();

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      setProgress({ ...BASE_PROGRESS, ...JSON.parse(raw) });
    } catch {
      setProgress(BASE_PROGRESS);
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  useEffect(() => {
    if (!canQuery) return;

    const customersPayload =
      (customersQuery.data as any)?.data ?? customersQuery.data ?? [];
    const appointmentsPayload =
      (appointmentsQuery.data as any)?.data ??
      (appointmentsQuery.data as any)?.items ??
      appointmentsQuery.data ??
      [];
    const serviceOrdersPayload =
      (serviceOrdersQuery.data as any)?.data ??
      (serviceOrdersQuery.data as any)?.items ??
      serviceOrdersQuery.data ??
      [];
    const chargesPayload =
      (chargesQuery.data as any)?.data ?? (chargesQuery.data as any)?.items ?? chargesQuery.data ?? [];

    const hasCustomer = Array.isArray(customersPayload) && customersPayload.length > 0;
    const hasAppointment = Array.isArray(appointmentsPayload) && appointmentsPayload.length > 0;
    const hasServiceOrder = Array.isArray(serviceOrdersPayload) && serviceOrdersPayload.length > 0;
    const hasCharge = Array.isArray(chargesPayload) && chargesPayload.length > 0;
    setProgress((prev) => ({
      ...prev,
      customer: prev.customer || hasCustomer,
      appointment: prev.appointment || hasAppointment,
      serviceOrder: prev.serviceOrder || hasServiceOrder,
      charge: prev.charge || hasCharge,
    }));
  }, [
    canQuery,
    customersQuery.data,
    appointmentsQuery.data,
    serviceOrdersQuery.data,
    chargesQuery.data,
  ]);

  const firstCustomer = ((customersQuery.data as any)?.data ?? customersQuery.data ?? [])[0];
  const activeCustomerId = journeyIds.customerId ?? firstCustomer?.id ?? null;

  const canRun = {
    customer: true,
    appointment: progress.customer,
    serviceOrder: progress.appointment,
    charge: progress.serviceOrder,
  } as const;

  const completedCount = useMemo(
    () => Object.values(progress).filter(Boolean).length,
    [progress]
  );

  const percent = Math.round((completedCount / STEP_META.length) * 100);

  const completeStep = (key: StepKey) =>
    setProgress((prev) => ({ ...prev, [key]: true }));

  const finish = async () => {
    setError(null);

    try {
      await completeOnboardingMutation.mutateAsync({});
      localStorage.removeItem(storageKey);
      navigate("/executive-dashboard");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-xl border p-4 text-sm text-[var(--text-muted)] dark:border-zinc-800">
          Faça login para continuar o onboarding.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <section className="relative overflow-hidden rounded-[1.8rem] border border-[var(--border-subtle)] bg-white/90 px-6 py-6 shadow-sm dark:border-white/8 dark:bg-[linear-gradient(135deg,rgba(19,22,30,0.98),rgba(12,14,20,0.96))] dark:shadow-[0_24px_60px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_24%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.08),transparent_24%)]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/12 dark:text-orange-300">
              <Sparkles className="h-3.5 w-3.5" />
              Demo guiada
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white md:text-4xl">
              Entregue o primeiro valor em 4 passos guiados
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)] dark:text-[var(--text-muted)]">
              O produto conduz automaticamente o caminho oficial: cliente → agendamento
              → serviço concluído → cobrança gerada.
            </p>
          </div>

          <div className="min-w-[220px] rounded-2xl border border-[var(--border-subtle)] bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Progresso</span>
              <span className="font-semibold text-zinc-950 dark:text-white">{percent}%</span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
            </div>

            <p className="mt-3 text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">
              {completedCount} de {STEP_META.length} etapas concluídas
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {flowMessage ? (
        <div className="nexo-info-banner rounded-xl px-4 py-3 text-sm">
          {flowMessage}
        </div>
      ) : null}

      {seedFallback ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          {seedFallback}
        </div>
      ) : null}

      {degradedMessage ? (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700 dark:border-yellow-900/60 dark:bg-yellow-950/40 dark:text-yellow-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{degradedMessage}</span>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
          Quer impressionar em 30 segundos?
        </p>
        <p className="mt-2 text-sm text-orange-900 dark:text-orange-200">
          Preencha dados reais de demo instantaneamente (clientes, agenda, O.S., cobrança, pagamento, timeline e governança).
        </p>
        <Button className="mt-3" variant="secondary" disabled={isGenerating} onClick={async () => {
          track("cta_click", { screen: "onboarding", ctaId: "generate_demo_data" });
          setError(null);
          setFlowMessage("Preparando dados da demonstração...");
          setDegradedMessage(null);
          setSeedFallback(null);
          try {
            const payload = await generateDemoEnvironment();
            if (payload?.customerId) {
              setJourneyIds((prev) => ({ ...prev, customerId: String(payload.customerId) }));
            }
            await Promise.all([
              customersQuery.refetch(),
              appointmentsQuery.refetch(),
              serviceOrdersQuery.refetch(),
              chargesQuery.refetch(),
            ]);
            setFlowMessage("Ambiente de demonstração pronto. Você já pode avançar pelas etapas sem bloqueios.");
            setDegradedMessage("Se o WhatsApp estiver em fila, continue o onboarding normalmente: o envio será processado em background.");
          } catch (e) {
            setError((e as Error).message);
            setSeedFallback("A geração automática de dados falhou. Continue pela jornada manual abaixo: ela possui fallback completo e não quebra o fluxo da demo.");
            setFlowMessage(null);
          }
        }}>
          {isGenerating ? "Preparando ambiente demo..." : "Gerar dados de demo agora"}
        </Button>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {STEP_META.map((step, index) => {
            const Icon = step.icon;
            const done = progress[step.key];
            const enabled = canRun[step.key];

            return (
              <div key={step.key} className={`rounded-2xl border p-4 transition-colors ${done ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" : enabled ? "border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20" : "border-slate-200 bg-white dark:border-white/8 dark:bg-white/[0.02]"}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : enabled ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "bg-[var(--surface-base)] text-[var(--text-muted)] dark:bg-[var(--surface-base)] dark:text-[var(--text-muted)]"}`}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                      Etapa {index + 1}
                    </span>
                    <h3 className="mt-1 font-semibold text-zinc-950 dark:text-white">{step.title}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)]">{step.description}</p>
                    <p className="mt-2 text-xs font-medium text-[var(--text-muted)] dark:text-[var(--text-muted)]">{getStepStatusLabel(done, enabled)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6 shadow-sm dark:border-zinc-800">
            <h2 className="text-lg font-semibold">1. Criar cliente</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cadastre um cliente e mostre onde a receita começa.</p>
            <div className="mt-4 grid gap-4">
              <input className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-800" placeholder="Nome do cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <input className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-800" placeholder="Telefone / WhatsApp" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <Button className="mt-4" disabled={!canRun.customer || progress.customer || customerMutation.isPending} onClick={async () => {
              track("cta_click", { screen: "onboarding", ctaId: "step_create_customer" });
              setError(null);
              setFlowMessage("Criando cliente e preparando o próximo passo...");
              try {
                if (!customerName.trim()) throw new Error("Informe o nome do cliente.");
                if (!customerPhone.trim()) throw new Error("Informe o telefone do cliente.");
                const customerResult = await customerMutation.mutateAsync({ name: customerName.trim(), phone: customerPhone.trim() });
                setJourneyIds((prev) => ({ ...prev, customerId: extractEntityId(customerResult, ["customerId", "id"]) ?? prev.customerId }));
                await utils.customers.list.invalidate();
                completeStep("customer");
                setFlowMessage("Cliente criado. Agora avance para o agendamento para mostrar previsibilidade operacional.");
              } catch (e) {
                setError((e as Error).message);
                setFlowMessage(null);
              }
            }}>{customerMutation.isPending ? "Criando..." : progress.customer ? "Concluído" : STEP_META[0].cta}</Button>
          </section>

          <section className="rounded-2xl border bg-card p-6 shadow-sm dark:border-zinc-800">
            <h2 className="text-lg font-semibold">2. Criar agendamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Marque o atendimento e mostre previsibilidade de operação.</p>
            <input className="mt-4 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-800" value={appointmentNotes} onChange={(e) => setAppointmentNotes(e.target.value)} placeholder="Observação do agendamento" />
            <Button className="mt-4" disabled={!canRun.appointment || progress.appointment || appointmentMutation.isPending} onClick={async () => {
              setError(null);
              setFlowMessage("Registrando agendamento...");
              try {
                if (!activeCustomerId) throw new Error("Crie um cliente primeiro.");
                const startsAt = new Date();
                const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
                const result = await appointmentMutation.mutateAsync({
                  customerId: String(activeCustomerId),
                  startsAt: startsAt.toISOString(),
                  endsAt: endsAt.toISOString(),
                  notes: appointmentNotes.trim() || "Atendimento de demo",
                  status: "SCHEDULED",
                });
                setJourneyIds((prev) => ({ ...prev, appointmentId: extractEntityId(result, ["appointmentId", "id"]) ?? prev.appointmentId }));
                await utils.appointments.list.invalidate();
                completeStep("appointment");
                setFlowMessage("Agendamento criado. Agora formalize a entrega na O.S.");
              } catch (e) {
                setError((e as Error).message);
                setFlowMessage(null);
              }
            }}>{appointmentMutation.isPending ? "Criando..." : progress.appointment ? "Concluído" : STEP_META[1].cta}</Button>
          </section>

          <section className="rounded-2xl border bg-card p-6 shadow-sm dark:border-zinc-800">
            <h2 className="text-lg font-semibold">3. Concluir serviço</h2>
            <p className="mt-1 text-sm text-muted-foreground">Crie a O.S. e já conclua a execução para liberar cobrança sem etapas extras.</p>
            <input className="mt-4 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-800" value={serviceOrderTitle} onChange={(e) => setServiceOrderTitle(e.target.value)} placeholder="Título da ordem de serviço" />
            <Button className="mt-4" disabled={!canRun.serviceOrder || progress.serviceOrder || serviceOrderMutation.isPending || serviceOrderUpdateMutation.isPending} onClick={async () => {
              track("cta_click", { screen: "onboarding", ctaId: "step_create_service_order" });
              setError(null);
              setFlowMessage("Registrando e concluindo serviço...");
              try {
                if (!activeCustomerId) throw new Error("Crie um cliente primeiro.");
                if (!serviceOrderTitle.trim()) throw new Error("Informe o título da ordem de serviço.");
                const result = await serviceOrderMutation.mutateAsync({ customerId: String(activeCustomerId), title: serviceOrderTitle.trim(), priority: 2 });
                const createdServiceOrderId = extractEntityId(result, ["serviceOrderId", "id"]);
                if (!createdServiceOrderId) {
                  throw new Error("Não foi possível identificar a O.S. criada.");
                }
                await serviceOrderUpdateMutation.mutateAsync({
                  id: createdServiceOrderId,
                  status: "DONE",
                  outcomeSummary: "Serviço concluído durante onboarding guiado.",
                  expectedUpdatedAt:
                    typeof (result as any)?.updatedAt === "string"
                      ? (result as any).updatedAt
                      : typeof (result as any)?.data?.updatedAt === "string"
                        ? (result as any).data.updatedAt
                        : undefined,
                });
                setJourneyIds((prev) => ({ ...prev, serviceOrderId: createdServiceOrderId }));
                await utils.serviceOrders.list.invalidate();
                completeStep("serviceOrder");
                setFlowMessage("Execução registrada. Próximo passo: gerar cobrança para evidenciar valor financeiro.");
              } catch (e) {
                setError((e as Error).message);
                setFlowMessage(null);
              }
            }}>{serviceOrderMutation.isPending || serviceOrderUpdateMutation.isPending ? "Concluindo..." : progress.serviceOrder ? "Concluído" : STEP_META[2].cta}</Button>
          </section>

          <section className="rounded-2xl border bg-card p-6 shadow-sm dark:border-zinc-800">
            <h2 className="text-lg font-semibold">4. Gerar cobrança</h2>
            <p className="mt-1 text-sm text-muted-foreground">Mostre dinheiro em potencial pronto para entrar no caixa.</p>
            <input className="mt-4 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-800" type="number" min="1" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="Valor da cobrança" />
            <Button className="mt-4" disabled={!canRun.charge || progress.charge || chargeMutation.isPending} onClick={async () => {
              track("cta_click", { screen: "onboarding", ctaId: "step_generate_charge" });
              setError(null);
              setFlowMessage("Gerando cobrança e conectando operação ao caixa...");
              try {
                if (!activeCustomerId) throw new Error("Crie um cliente primeiro.");
                const amount = Number(chargeAmount);
                if (!amount || amount <= 0) throw new Error("Informe um valor válido.");
                const result = await chargeMutation.mutateAsync({ customerId: String(activeCustomerId), amount, dueDate: new Date(), notes: "Cobrança demo pronta para receber" });
                setJourneyIds((prev) => ({ ...prev, chargeId: extractEntityId(result, ["chargeId", "id"]) ?? prev.chargeId }));
                await utils.finance.charges.list.invalidate();
                completeStep("charge");
                setFlowMessage("Cobrança criada. Você já comprovou o primeiro valor gerado para o cliente.");
                setDegradedMessage("Se houver envio WhatsApp em fila, o status é processado em segundo plano sem bloquear o fluxo.");
              } catch (e) {
                setError((e as Error).message);
                setFlowMessage(null);
              }
            }}>{chargeMutation.isPending ? "Gerando..." : progress.charge ? "Concluído" : STEP_META[3].cta}</Button>
          </section>

          <section className="rounded-2xl border bg-card p-6 shadow-sm dark:border-zinc-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Primeiro valor entregue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Finalize e siga para o Dashboard Executivo com o fluxo operacional completo.
                </p>
              </div>

              <Button disabled={!progress.charge || completeOnboardingMutation.isPending} onClick={() => void finish()} className="gap-2">
                {completeOnboardingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finalizando...
                  </>
                ) : (
                  <>
                    Ir para Dashboard Executivo
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import { Check } from "lucide-react";
import { Link } from "wouter";

import { MarketingLayout } from "@/components/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { trpc } from "@/lib/trpc";
import {
  formatCurrencyCents,
  isUnlimitedQuota,
  normalizePlanCatalog,
  type PlanName,
} from "@/lib/billing/plan-catalog";

import "./landing.css";

const PLAN_PRESENTATION: Record<
  PlanName,
  {
    subtitle: string;
    cta: string;
    href: string;
    featured: boolean;
  }
> = {
  FREE: {
    subtitle: "Para testar o fluxo inicial",
    cta: "Criar conta grátis",
    href: "/register",
    featured: false,
  },
  STARTER: {
    subtitle: "Para operação em crescimento",
    cta: "Começar agora",
    href: "/register",
    featured: false,
  },
  PRO: {
    subtitle: "Mais controle e governança",
    cta: "Escolher plano",
    href: "/register",
    featured: true,
  },
  BUSINESS: {
    subtitle: "Escala operacional multiunidade",
    cta: "Falar com time comercial",
    href: "/contato",
    featured: false,
  },
};

function quotaLine(
  value: number,
  singular: string,
  plural: string,
  unlimitedLabel: string
) {
  if (isUnlimitedQuota(value)) return unlimitedLabel;
  return `Até ${value.toLocaleString("pt-BR")} ${
    value === 1 ? singular : plural
  }`;
}

const faqs = [
  [
    "Posso trocar de plano depois?",
    "Sim. Você pode fazer upgrade conforme o volume operacional crescer, sem migrar dados.",
  ],
  [
    "Existe fidelidade?",
    "Não há fidelidade para planos mensais. Você evolui no ritmo da sua operação.",
  ],
  [
    "O que muda no Business?",
    "No Business, ajustamos limites, onboarding e suporte conforme a complexidade da sua empresa.",
  ],
];

const billingNotes = [
  "Todos os planos incluem atualizações de produto e melhorias contínuas.",
  "Volumes servem como referência comercial e podem ser ajustados por contrato.",
  "Ambientes com necessidade de compliance específico são avaliados no plano Business.",
];

export default function PricingPage() {
  usePageMeta({
    title: "NexoGestão | Preços",
    description:
      "Compare os planos do NexoGestão e escolha a melhor opção para o estágio operacional da sua empresa.",
  });

  const plansQuery = trpc.billing.plans.useQuery(undefined, { retry: false });
  const plans = normalizePlanCatalog(plansQuery.data);

  return (
    <MarketingLayout>
      <section className="container py-14 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold tracking-[0.14em] text-orange-600">
            PREÇOS
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-slate-900 md:text-5xl">
            Planos para cada estágio da sua operação
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Escolha um plano simples para começar e faça upgrade quando precisar
            de mais volume e governança.
          </p>
        </div>
      </section>

      <section className="container pb-16 md:pb-20">
        {plansQuery.isLoading ? (
          <article className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <h2 className="text-xl font-semibold text-slate-900">
              Carregando catálogo comercial
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Consultando preços e limites na fonte oficial do NexoGestão.
            </p>
          </article>
        ) : plansQuery.isError || plans.length === 0 ? (
          <article className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <h2 className="text-xl font-semibold text-slate-900">
              Catálogo comercial indisponível
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Não exibimos preços ou limites alternativos quando a fonte oficial
              está indisponível.
            </p>
          </article>
        ) : (
          <div className="grid gap-5 lg:grid-cols-4">
            {plans.map(plan => {
              const presentation = PLAN_PRESENTATION[plan.name];
              const limits = [
                quotaLine(
                  plan.quotas.customers,
                  "cliente",
                  "clientes",
                  "Clientes ilimitados"
                ),
                quotaLine(
                  plan.quotas.appointments,
                  "agendamento/mês",
                  "agendamentos/mês",
                  "Agendamentos ilimitados"
                ),
                quotaLine(
                  plan.quotas.messages,
                  "mensagem/mês",
                  "mensagens/mês",
                  "Mensagens ilimitadas"
                ),
                quotaLine(
                  plan.quotas.users,
                  "usuário",
                  "usuários",
                  "Usuários ilimitados"
                ),
              ];

              return (
                <article
                  key={plan.name}
                  className={`rounded-3xl border p-6 ${
                    presentation.featured
                      ? "border-orange-300 bg-orange-50/50 shadow-[0_20px_40px_rgba(249,115,22,0.2)]"
                      : "border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
                  }`}
                >
                  {presentation.featured ? (
                    <p className="mb-3 inline-flex rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">
                      Recomendado
                    </p>
                  ) : null}

                  <h2 className="text-2xl font-semibold text-slate-900">
                    {plan.displayName}
                  </h2>

                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {formatCurrencyCents(plan.priceCents)}
                    <span className="text-base font-medium text-slate-500">
                      /mês
                    </span>
                  </p>

                  <p className="mt-2 text-sm text-slate-600">
                    {presentation.subtitle}
                  </p>

                  <ul className="mt-6 space-y-3 text-sm text-slate-700">
                    {limits.map(limit => (
                      <li key={limit} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 text-emerald-500" />
                        {limit}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={presentation.href}
                    className={`mt-6 inline-flex w-full justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      presentation.featured
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-[var(--surface-base)]"
                    }`}
                  >
                    {presentation.cta}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="container pb-16 md:pb-20">
        <article className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_45px_rgba(15,23,42,0.08)] md:p-10">
          <h2 className="text-2xl font-semibold text-slate-900">
            Perguntas frequentes
          </h2>
          <div className="mt-6 space-y-5">
            {faqs.map(([question, answer]) => (
              <div
                key={question}
                className="border-b border-slate-100 pb-4 last:border-none last:pb-0"
              >
                <h3 className="font-semibold text-slate-900">{question}</h3>
                <p className="mt-1 text-sm text-slate-600">{answer}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="container pb-16 md:pb-20">
        <article className="rounded-3xl border border-slate-200 bg-[var(--surface-base)] p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-slate-900">
            Transparência comercial
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {billingNotes.map(note => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contato"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-black"
            >
              Falar com comercial
            </Link>
            <Link
              href="/termos"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Ver termos de uso
            </Link>
          </div>
        </article>
      </section>
    </MarketingLayout>
  );
}

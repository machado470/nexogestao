export type BillingPlanName = "FREE" | "STARTER" | "PRO" | "BUSINESS";

export type BillingPlanCatalogEntry = {
  name: BillingPlanName;
  displayName: string;
  priceCents: number;
  quotas: Record<string, number>;
  commercialLimits: Record<string, unknown>;
  features: Record<string, unknown>;
};

const PLAN_ORDER: Record<BillingPlanName, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  BUSINESS: 3,
};

const FEATURE_LABELS: Record<string, string> = {
  advanced_automation: "Automação avançada",
  premium_integrations: "Integrações premium",
  high_limits: "Limites avançados",
  priority_support: "Suporte prioritário",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePlanName(value: unknown): BillingPlanName | null {
  const raw = String(value ?? "").trim().toUpperCase();
  const normalized = raw === "SCALE" ? "BUSINESS" : raw;

  return ["FREE", "STARTER", "PRO", "BUSINESS"].includes(normalized)
    ? (normalized as BillingPlanName)
    : null;
}

function normalizeQuotas(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(asObject(value))
      .map(([key, raw]) => [key, Number(raw)] as const)
      .filter(([, numeric]) => Number.isFinite(numeric) && numeric >= 0)
  );
}

export function normalizeBillingPlanCatalog(
  value: unknown
): BillingPlanCatalogEntry[] {
  if (!Array.isArray(value)) return [];

  const plans = value.flatMap(raw => {
    const item = asObject(raw);
    const name = normalizePlanName(item.name);
    const priceCents = Number(item.priceCents);

    if (!name || !Number.isFinite(priceCents) || priceCents < 0) {
      return [];
    }

    return [
      {
        name,
        displayName:
          String(item.displayName ?? "").trim() || name,
        priceCents,
        quotas: normalizeQuotas(item.quotas),
        commercialLimits: asObject(item.commercialLimits),
        features: asObject(item.features),
      },
    ];
  });

  return plans.sort(
    (left, right) => PLAN_ORDER[left.name] - PLAN_ORDER[right.name]
  );
}

export function formatPlanQuota(value: unknown): string {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) return "Não informado";
  if (numeric >= 999999) return "Ilimitado";

  return new Intl.NumberFormat("pt-BR").format(numeric);
}

export function formatPlanPrice(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

export function listEnabledPlanFeatures(
  features: Record<string, unknown>
): string[] {
  return Object.entries(features)
    .filter(([, enabled]) => enabled === true)
    .map(
      ([key]) =>
        FEATURE_LABELS[key] ??
        key
          .replace(/_/g, " ")
          .replace(/\b\w/g, character => character.toUpperCase())
    );
}

export type PlanName = "FREE" | "STARTER" | "PRO" | "BUSINESS";

export type PlanQuotas = {
  customers: number;
  appointments: number;
  messages: number;
  serviceOrders: number;
  users: number;
  storage: number;
};

export type PlanCatalogItem = {
  name: PlanName;
  displayName: string;
  priceCents: number;
  quotas: PlanQuotas;
  commercialLimits: Record<string, number>;
  features: Record<string, boolean>;
};

const PLAN_ORDER: Record<PlanName, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  BUSINESS: 3,
};

const FEATURE_LABELS: Record<string, string> = {
  advanced_automation: "Autoexecução operacional",
  premium_integrations: "Integrações premium",
  high_limits: "Limites avançados",
  priority_support: "Suporte prioritário",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = Number(record[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function numericRecord(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(asRecord(value))) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) result[key] = parsed;
  }

  return result;
}

function booleanRecord(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  for (const [key, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === "boolean") result[key] = raw;
  }

  return result;
}

export function normalizePlanCatalog(value: unknown): PlanCatalogItem[] {
  if (!Array.isArray(value)) return [];

  const plans: PlanCatalogItem[] = [];

  for (const raw of value) {
    const item = asRecord(raw);
    const name = String(item.name ?? "").toUpperCase();

    if (!["FREE", "STARTER", "PRO", "BUSINESS"].includes(name)) continue;

    const quotas = asRecord(item.quotas);
    const priceCents = Number(item.priceCents);

    const customers = finiteNumber(quotas, "customers");
    const appointments = finiteNumber(quotas, "appointments");
    const messages = finiteNumber(quotas, "messages");
    const serviceOrders = finiteNumber(quotas, "serviceOrders");
    const users = finiteNumber(quotas, "users");
    const storage = finiteNumber(quotas, "storage");

    if (
      !Number.isFinite(priceCents) ||
      priceCents < 0 ||
      customers === null ||
      appointments === null ||
      messages === null ||
      serviceOrders === null ||
      users === null ||
      storage === null
    ) {
      continue;
    }

    const planName = name as PlanName;

    plans.push({
      name: planName,
      displayName: String(item.displayName ?? planName).trim() || planName,
      priceCents,
      quotas: {
        customers,
        appointments,
        messages,
        serviceOrders,
        users,
        storage,
      },
      commercialLimits: numericRecord(item.commercialLimits),
      features: booleanRecord(item.features),
    });
  }

  return plans.sort((a, b) => PLAN_ORDER[a.name] - PLAN_ORDER[b.name]);
}

export function formatCurrencyCents(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount / 100);
}

export function isUnlimitedQuota(value: number): boolean {
  return value >= 999999;
}

export function formatQuotaCount(value: number): string {
  return isUnlimitedQuota(value)
    ? "Ilimitados"
    : value.toLocaleString("pt-BR");
}

export function humanizePlanFeatures(
  features: Record<string, boolean>
): string[] {
  return Object.entries(features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_LABELS[key] ?? key);
}

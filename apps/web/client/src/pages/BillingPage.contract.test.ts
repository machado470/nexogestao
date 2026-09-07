import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./BillingPage.tsx", import.meta.url), "utf8");

describe("BillingPage golden-standard contract", () => {
  it("uses the canonical internal-page composition", () => {
    expect(source).toContain("<AppPageShell");
    expect(source).toContain("<AppOperationalHeader");
    expect(source).toContain("<AppSectionBlock");
    expect(source).toContain("<AppStatusBadge");
    expect(source).toContain("<AppAlert");
    expect(source).toContain("<ConfirmModal");
    expect(source).not.toContain("OperationalPanel");
    expect(source).not.toContain("PageWrapper");
  });

  it("keeps Billing explicitly separate from operational Finance", () => {
    expect(source).toContain("Plano e assinatura da organização");
    expect(source).not.toMatch(/\bCharge\b|\bPayment\b|trpc\.finance|financeiro operacional/i);
  });

  it("uses only the canonical catalog for commercial data", () => {
    expect(source).toContain("trpc.billing.plans.useQuery");
    expect(source).toContain("normalizeBillingPlanCatalog");
    expect(source).toContain("formatPlanPrice(currentPlan.priceCents)");
    expect(source).not.toMatch(/\b9900\b|\b19900\b|\b39900\b/);
    expect(source).not.toContain("PLAN_META");
  });

  it("preserves official statuses without an ACTIVE fallback", () => {
    expect(source).toContain('const status = String(value ?? "").toUpperCase()');
    expect(source).toContain("Status não reconhecido");
    expect(source).not.toContain('value ?? "ACTIVE"');
    expect(source).not.toContain(': "ACTIVE"');
  });

  it("distinguishes loading, error, empty, and partial catalog failure", () => {
    expect(source).toContain("<AppPageLoadingState");
    expect(source).toContain("<AppPageErrorState");
    expect(source).toContain("<AppPageEmptyState");
    expect(source).toContain("Preço do catálogo indisponível");
    expect(source).toContain('status === "NO_SUBSCRIPTION"');
  });

  it("uses backend-authoritative usage instead of browser-side counting", () => {
    expect(source).toContain("trpc.billing.limits.useQuery");
    expect(source).toContain("limitsQuery.data?.usage");
    expect(source).not.toContain("trpc.customers");
    expect(source).not.toContain("trpc.people");
  });

  it("sends only a catalog plan and authenticated redirects to checkout", () => {
    expect(source).toContain("planName: checkoutPlan");
    expect(source).toContain("payload?.url");
    expect(source).toContain("window.location.assign(destination)");
    expect(source).not.toContain("priceId");
    expect(source).not.toMatch(/https?:\/\/[^\s"']*stripe/i);
    expect(source).not.toContain("orgId:");
  });

  it("does not invent invoices, payment methods, portals, or persistence", () => {
    expect(source).not.toMatch(/invoice|fatura|paymentMethod|cartão|boleto|pix|portal/i);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("confirms the supported immediate cancellation and refetches afterward", () => {
    expect(source).toContain("trpc.billing.cancel.useMutation");
    expect(source).toContain("Cancelar assinatura agora?");
    expect(source).toContain("cancelamento imediato");
    expect(source).toContain("utils.billing.status.invalidate()");
  });

  it("keeps responsive structure and accessible named controls", () => {
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('type="button"');
  });
});

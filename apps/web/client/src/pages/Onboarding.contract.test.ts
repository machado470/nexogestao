import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./Onboarding.tsx", import.meta.url),
  "utf8"
);

const appSource = readFileSync(
  new URL("../App.tsx", import.meta.url),
  "utf8"
);

describe("Onboarding special-flow contract", () => {
  it("remains a guided activation journey instead of an operational workspace", () => {
    expect(source).toContain("STEP_META");
    expect(source).toContain("Demo guiada");
    expect(source).toContain(
      "Entregue o primeiro valor em 4 passos guiados"
    );
    expect(source).toContain("trpc.onboarding.complete.useMutation");
    expect(source).not.toContain("<AppOperationalHeader");
  });

  it("keeps the four real execution steps and mutations", () => {
    expect(source).toContain("trpc.customers.create.useMutation");
    expect(source).toContain("trpc.appointments.create.useMutation");
    expect(source).toContain("trpc.serviceOrders.create.useMutation");
    expect(source).toContain("trpc.serviceOrders.update.useMutation");
    expect(source).toContain("trpc.finance.charges.create.useMutation");

    [
      "customer",
      "appointment",
      "serviceOrder",
      "charge",
    ].forEach(step => expect(source).toContain(step));
  });

  it("scopes presentation progress strictly by organization and user", () => {
    expect(source).toContain(
      "const organizationId = user?.organizationId?.trim()"
    );
    expect(source).toContain(
      "const userId = user?.id?.trim()"
    );
    expect(source).toContain(
      "if (!organizationId || !userId) return null"
    );
    expect(source).toContain(
      "`pilot-onboarding:${organizationId}:${userId}`"
    );
    expect(source).toContain("if (!storageKey) return");
    expect(source).not.toContain('"no-org"');
    expect(source).not.toContain('"anon"');
  });

  it("uses canonical Nexo primitives without a local theme", () => {
    expect(source).toContain("<AppInput");
    expect(source).toContain("<AppSectionCard");
    expect(source).toContain("<AppInfoCard");
    expect(source).toContain("<AppStatusBadge");

    expect(source).not.toContain("<input");
    expect(source).toContain('aria-label="Nome do cliente"');
    expect(source).toContain(
      'aria-label="Telefone ou WhatsApp do cliente"'
    );
    expect(source).toContain(
      'aria-label="Observação do agendamento"'
    );
    expect(source).toContain(
      'aria-label="Título da ordem de serviço"'
    );
    expect(source).toContain(
      'aria-label="Valor da cobrança"'
    );
    expect(source).not.toContain("dark:");
    expect(source).not.toMatch(
      /(?:bg|border|text)-(?:orange|emerald|zinc|slate|red|amber|yellow)/
    );
  });

  it("keeps backend onboarding state authoritative for routing", () => {
    expect(appSource).toContain("getRequiresOnboarding");
    expect(appSource).toContain("requireCompletedOnboarding");
    expect(appSource).toContain("onboardingOnly");
    expect(appSource).toContain('navigate("/onboarding"');
  });

  it("keeps completion explicit before entering the dashboard", () => {
    expect(source).toContain(
      "completeOnboardingMutation.mutateAsync({})"
    );
    expect(source).toContain(
      'navigate("/executive-dashboard")'
    );
  });
});

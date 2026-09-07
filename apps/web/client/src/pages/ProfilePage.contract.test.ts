import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ProfilePage.tsx", import.meta.url),
  "utf8"
);

describe("ProfilePage golden-standard contract", () => {
  it("uses the canonical page, feedback and read-only field primitives", () => {
    for (const primitive of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppStatusBadge",
      "AppAlert",
      "AppField",
      "AppFieldGroup",
      "AppInput",
      "AppPageLoadingState",
      "AppPageErrorState",
    ]) {
      expect(source).toContain(primitive);
    }

    expect(source).not.toContain("OperationalPanel");
    expect(source).not.toContain("OperationalInnerCard");
    expect(source).not.toContain("<input");
    expect(source).not.toContain("<select");
  });

  it("keeps factual identity separate and read-only", () => {
    expect(source).toContain("trpc.auth.me.useQuery");
    expect(source).toContain('htmlFor="profile-name"');
    expect(source).toContain('id="profile-name"');
    expect(source).toContain('htmlFor="profile-email"');
    expect(source).toContain('id="profile-email"');
    expect(source).toContain('htmlFor="profile-role"');
    expect(source).toContain('id="profile-role"');
    expect(source).toContain("readOnly");
    expect(source).toContain('aria-readonly="true"');
    expect(source).not.toContain("useMutation");
    expect(source).not.toContain("AppSelect");
  });

  it("reads the official individual context without creating a parallel decision", () => {
    expect(source).toContain("trpc.people.operationalSummary.useQuery");
    expect(source).toContain("person.personId === personId");
    expect(source).toContain("operationalProfile.recommendedActionLabel");
    expect(source).toContain("operationalProfile.interventionReason");
    expect(source).toContain("operationalProfile.recommendedActionTarget");
    expect(source).toContain("Destino oficial:");
    expect(source).toContain("Recomendação não fornecida");
    expect(source).not.toContain("actionPaths");
    expect(source).not.toContain("navigate(");
  });

  it("does not fabricate People, Timeline, performance, finance or preferences features", () => {
    for (const unsupported of [
      "Minhas O.S.",
      "Meus agendamentos",
      "Minha atividade recente",
      "Minha performance",
      "Impacto financeiro",
      "OperationalTimelineItem",
      "completionRatePct",
      "averageCompletionMinutes",
      "receivedAmountFromAssignedServiceOrders",
    ]) {
      expect(source).not.toContain(unsupported);
    }
  });

  it("has independent loading, error and empty-result degradation", () => {
    expect(source).toContain("meQuery.isLoading");
    expect(source).toContain("meQuery.isError");
    expect(source).toContain("operationalQuery.isLoading");
    expect(source).toContain("operationalQuery.isError");
    expect(source).toContain("Identidade não retornada");
    expect(source).toContain("Contexto individual não retornado");
    expect(source).toContain("Nenhuma condição saudável foi presumida");
  });

  it("contains no client-side operational engine, storage or mutable tenant identity", () => {
    for (const forbidden of [
      "Date.now",
      ".sort(",
      "localStorage",
      "sessionStorage",
      "threshold",
      "nextAction",
      "useOperationalMemoryState",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/orgId\s*:/);
    expect(source).not.toMatch(/role\s*:/);
  });

  it("uses responsive wrapping and grids for long identity and contract values", () => {
    expect(source).toContain("flex flex-wrap gap-2");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("break-words");
    expect(source).not.toContain("min-w-[720px]");
  });
});

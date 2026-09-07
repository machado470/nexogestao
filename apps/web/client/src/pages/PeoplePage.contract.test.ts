import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PeoplePage.tsx", import.meta.url),
  "utf8"
);
const createModal = readFileSync(
  new URL("../components/CreatePersonModal.tsx", import.meta.url),
  "utf8"
);
const editModal = readFileSync(
  new URL("../components/EditPersonModal.tsx", import.meta.url),
  "utf8"
);

describe("PeoplePage golden-standard contract", () => {
  it("uses the canonical page hierarchy and legitimate global CTA", () => {
    [
      "AppPageShell",
      "AppOperationalHeader",
      "AppFiltersBar",
      "AppSectionBlock",
      "AppContextWorkspace",
    ].forEach(marker => expect(source).toContain(marker));
    expect(source).toContain('title="Equipe"');
    expect(source).toContain("Nova pessoa");
    expect(source).toContain('title="Equipe operacional"');
  });

  it("uses people.operationalSummary as the only operational authority", () => {
    expect(source).toContain("trpc.people.operationalSummary.useQuery");
    [
      "person.operationalStatus",
      "person.priority",
      "person.availabilityStatus",
      "person.capacityStatus",
      "person.recommendedActionLabel",
      "person.recommendedActionTarget",
      "person.interventionReason",
    ].forEach(field => expect(source).toContain(field));
    expect(source).not.toContain("deriveTeamHealth");
    expect(source).not.toContain("sortByOperationalIntervention");
    expect(source).not.toContain("pickOperationalPerson");
    expect(source).not.toContain("OperationalHealthRing");
  });

  it("preserves API order and has no local ranking or thresholds", () => {
    expect(source).toContain("return people.filter(person =>");
    expect(source).not.toMatch(/people\.sort|\[\.\.\.people\]\.sort/);
    expect(source).not.toContain("priorityRank");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("formatDifference");
    expect(source).not.toContain("capacity - current");
    expect(source).not.toContain("trpc.nexo.");
  });

  it("offers factual and official filters with accessible labels", () => {
    expect(source).toContain('htmlFor="people-search"');
    expect(source).toContain('id="people-search"');
    expect(source).toContain('ariaLabel="Filtrar por função"');
    expect(source).toContain('ariaLabel="Filtrar por situação cadastral"');
    expect(source).toContain(
      'ariaLabel="Filtrar por disponibilidade oficial"'
    );
    expect(source).toContain('ariaLabel="Filtrar por prioridade oficial"');
    expect(source).toContain("person.status !== registrationFilter");
    expect(source).toContain(
      "person.availabilityStatus !== availabilityFilter"
    );
    expect(source).toContain("person.priority !== priorityFilter");
  });

  it("keeps official recommendation visible and only routes its target", () => {
    expect(source).toContain('data-testid="people-official-recommendation"');
    expect(source).toContain("runOfficialRecommendation");
    expect(source).toContain('case "SERVICE_ORDERS"');
    expect(source).toContain('case "APPOINTMENTS"');
    expect(source).toContain('case "TIMELINE"');
    expect(source).toContain('"Recomendação indisponível"');
    expect(source).toContain('"Justificativa operacional indisponível"');
    expect(source).not.toContain('"Tudo certo"');
    expect(source).not.toContain('"Sem ação necessária"');
  });

  it("renders official capacity and preserves legitimate zero", () => {
    expect(source).toContain("dailyServiceOrderCapacity: number | null;");
    expect(source).toContain("dailyAppointmentCapacity: number | null;");
    expect(source).toContain("serviceOrderCapacityUsagePct: number | null;");
    expect(source).toContain("appointmentCapacityUsagePct: number | null;");
    expect(source).toContain("value === null || value === undefined");
    expect(source).not.toMatch(/value\s*\|\|\s*0/);
  });

  it("keeps auxiliary availability failures local", () => {
    expect(source).toContain("exceptionsQuery.error");
    expect(source).toContain(
      "Indisponibilidades indisponíveis; o estado oficial da pessoa permanece visível."
    );
    expect(source).toContain("exceptionsQuery.refetch()");
  });

  it("isolates Timeline loading, error and empty states", () => {
    expect(source).toContain("trpc.timeline.listByOrg.useQuery");
    expect(source).toContain("timelineQuery.isLoading");
    expect(source).toContain("timelineQuery.error");
    expect(source).toContain("Tentar Timeline novamente");
    expect(source).toContain(
      "Equipe, detalhe e recomendações oficiais permanecem acessíveis."
    );
    expect(source).toContain("Timeline sem eventos");
  });

  it("uses canonical page states", () => {
    expect(source).toContain("AppPageLoadingState");
    expect(source).toContain("AppPageErrorState");
    expect(source).toContain("AppPageEmptyState");
    expect(source).toContain("nenhuma normalidade foi inferida");
  });

  it("keeps creation, editing and availability contracts unchanged", () => {
    expect(source).toContain("<CreatePersonModal");
    expect(source).toContain("<EditPersonModal");
    expect(source).toContain(
      "trpc.people.createAvailabilityException.useMutation"
    );
    expect(source).toContain(
      "trpc.people.deleteAvailabilityException.useMutation"
    );
    expect(editModal).toContain("dailyServiceOrderCapacity,");
    expect(editModal).toContain("dailyAppointmentCapacity,");
    expect(source).not.toContain("trpc.people.redistribute");
  });

  it("is structurally responsive and keeps semantic interaction", () => {
    expect(source).toContain("min-w-0 flex-col items-stretch");
    expect(source).toContain("md:flex-row");
    expect(source).toContain("grid min-w-0 grid-cols-1");
    expect(source).toContain("xl:grid-cols-12");
    expect(source).toMatch(/<button\s+type="button"/);
    expect(source).toContain(
      "aria-label={`Remover indisponibilidade de ${selectedPerson.name}`}"
    );
  });

  it("uses canonical modals and fields for people maintenance", () => {
    expect(createModal).toContain("<FormModal");
    expect(editModal).toContain("<FormModal");
    expect(createModal).toContain("<AppField");
    expect(editModal).toContain("<AppField");
    expect(editModal).toContain("<AppTextarea");
    expect(editModal).toContain("<AppCheckbox");
    expect(createModal).not.toContain("@/components/ui/dialog");
    expect(editModal).not.toContain("@/components/ui/dialog");
    expect(editModal).not.toContain("border-zinc");
    expect(editModal).not.toContain("bg-red-950");
    expect(source).toContain("<AppInput");
    expect(source).toContain("<AppSelect");
  });

});

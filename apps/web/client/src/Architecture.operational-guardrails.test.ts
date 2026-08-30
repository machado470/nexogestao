import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const criticalPages = [
  "client/src/pages/FinancesPage.tsx",
  "client/src/pages/GovernancePage.tsx",
  "client/src/pages/TimelinePage.tsx",
  "client/src/pages/AppointmentsPage.tsx",
  "client/src/pages/ServiceOrdersPage.tsx",
  "client/src/pages/WhatsAppPage.tsx",
  "client/src/pages/ExecutiveDashboard.tsx",
  "client/src/pages/CustomersPage.tsx",
  "client/src/pages/BillingPage.tsx",
  "client/src/pages/PeoplePage.tsx",
  "client/src/pages/ProfilePage.tsx",
  "client/src/pages/SettingsPage.tsx",
  "client/src/pages/CalendarPage.tsx",
];

describe("Operational page guardrails", () => {
  it("proíbe a reintrodução do motor financeiro paralelo", () => {
    const finance = readFileSync("client/src/pages/FinancesPage.tsx", "utf8");
    for (const forbidden of [
      "computeDaysOverdue",
      "computeDaysUntilDue",
      "getFinanceOperationalStatus",
      "getChargePriority",
      "getChargeRisk",
      "getChargePrimaryAction",
      "aggregateOperationalHealth",
      "compareOperationalPriority",
      "Date.now()",
      "new Date()",
    ])
      expect(finance).not.toContain(forbidden);
    expect(finance).toContain("finance.charges.stats.useQuery");
    expect(finance).toContain("finance.operationalQueue.useQuery");
    expect(finance).not.toMatch(/\borgId\s*:/);
    expect(finance).not.toMatch(/\brole\s*:/);
  });
  it("proíbe motor paralelo no inbox e composer do WhatsApp", () => {
    const whatsapp = readFileSync("client/src/pages/WhatsAppPage.tsx", "utf8");
    for (const forbidden of [
      "resolveInboxPriority",
      "priorityRank",
      "getRecommendedWhatsAppComposerActions",
      "buildWhatsAppComposerActionGroups",
      "normalizeContextStatus",
      "hasOverdueCharge",
      "hasAppointmentToConfirm",
      "hasServiceOrderNeedingUpdate",
      "fallbackPrimaryAction",
      "Date.now()",
      "whatsapp-ui:",
    ])
      expect(whatsapp).not.toContain(forbidden);
    expect(whatsapp).toContain("presentOfficialWhatsAppActions");
    expect(whatsapp).toContain("Sem recomendação oficial");
    expect(whatsapp).not.toMatch(/\borgId\s*:/);
    expect(whatsapp).not.toMatch(/\brole\s*:/);
  });

  it("evita placeholders rasos nas páginas críticas", () => {
    for (const file of criticalPages) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("PAGE OK")).toBe(false);
      expect(source.includes("Lorem ipsum")).toBe(false);
    }
  });

  it("mantém timeline limitada sem auto-fetch infinito ou filtros decisórios", () => {
    const timeline = readFileSync("client/src/pages/TimelinePage.tsx", "utf8");
    expect(timeline).toContain("const PAGE_SIZE = 50");
    expect(timeline).toContain("{ limit: PAGE_SIZE }");
    expect(timeline).not.toContain("fetchNextPage");
    expect(timeline).not.toContain("eventSeverity");
    expect(timeline).not.toContain("Date.now()");
    expect(timeline).not.toContain("setLimit(limit + 120)");
  });

  it("mantém AppNextActionCard nas páginas operacionais", () => {
    const nextActionPages = [
      "client/src/pages/FinancesPage.tsx",
      "client/src/pages/GovernancePage.tsx",
      "client/src/pages/TimelinePage.tsx",
      "client/src/pages/AppointmentsPage.tsx",
      "client/src/pages/ServiceOrdersPage.tsx",
      "client/src/pages/WhatsAppPage.tsx",
      "client/src/pages/ExecutiveDashboard.tsx",
      "client/src/pages/ProfilePage.tsx",
      "client/src/pages/SettingsPage.tsx",
    ];
    const filesWithContract = nextActionPages.filter(file => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("AppNextActionCard") ||
        source.includes("AppOperationalHeader") ||
        source.includes("Próxima melhor ação") ||
        source.includes("nextBestAction")
      );
    });
    expect(filesWithContract.length).toBeGreaterThanOrEqual(1);
  });

  it("mantém botão primário padronizado no contrato de próxima ação", () => {
    const operationalComponent = readFileSync(
      "client/src/components/internal-page-system.tsx",
      "utf8"
    );
    expect(operationalComponent).toContain('variant="default"');
    expect(operationalComponent).toContain("severity: AppNextActionSeverity");
    expect(operationalComponent).toContain(
      "action: { label: string; onClick: () => void }"
    );
  });

  it("evita bg-white nas superfícies operacionais e inputs críticos", () => {
    const operationalFiles = [
      ...criticalPages,
      "client/src/components/CreateChargeModal.tsx",
      "client/src/components/EditChargeModal.tsx",
      "client/src/components/CreateServiceOrderModal.tsx",
      "client/src/components/EditServiceOrderModal.tsx",
      "client/src/pages/CalendarPage.tsx",
    ];

    for (const file of operationalFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("bg-white ");
    }
  });

  it("garante shell modal unificado nos modais operacionais críticos", () => {
    const modalFiles = [
      "client/src/components/CreateAppointmentModal.tsx",
      "client/src/components/CustomerWorkspaceModal.tsx",
      "client/src/components/CreateCustomerModal.tsx",
      "client/src/components/CreateServiceOrderModal.tsx",
    ];

    for (const file of modalFiles) {
      const source = readFileSync(file, "utf8");
      expect(
        source.includes("FormModal") ||
          source.includes("BaseOperationalModal") ||
          source.includes("ModalFlowShell")
      ).toBe(true);
    }
  });

  it("evita select nativo no modal crítico do calendário (dark/light consistente)", () => {
    const calendar = readFileSync("client/src/pages/CalendarPage.tsx", "utf8");
    expect(calendar).toContain("AppFiltersBar");
    expect(calendar).toContain("<select");
  });

  it("mantém linguagem de O.S. sem labels técnicas de status interno", () => {
    const serviceOrders = readFileSync(
      "client/src/pages/ServiceOrdersPage.tsx",
      "utf8"
    );
    expect(serviceOrders).not.toContain("status IN_PROGRESS");
    expect(serviceOrders).not.toContain("status DONE");
  });

  it("roteia início e conclusão de O.S. pelo domínio de execução", () => {
    const serviceOrders = readFileSync(
      "client/src/pages/ServiceOrdersPage.tsx",
      "utf8"
    );
    expect(serviceOrders).toContain("trpc.nexo.executions.start.useMutation()");
    expect(serviceOrders).toContain(
      "trpc.nexo.executions.complete.useMutation()"
    );
    expect(serviceOrders).toContain(
      "startExecutionMutation.mutateAsync({ serviceOrderId: orderId })"
    );
    expect(serviceOrders).toContain("completeExecutionMutation.mutateAsync({");
    expect(serviceOrders).toContain(
      "...(outcomeSummary ? { notes: outcomeSummary } : {})"
    );
    expect(serviceOrders).toContain(
      "utils.nexo.serviceOrders.getById.invalidate({ id: orderId })"
    );
    expect(serviceOrders).toContain(
      "utils.nexo.executions.listByServiceOrder.invalidate({ serviceOrderId: orderId })"
    );
    expect(serviceOrders).toContain(
      "utils.nexo.timeline.listByServiceOrder.invalidate({ serviceOrderId: orderId })"
    );
    expect(serviceOrders).toContain("utils.finance.charges.list.invalidate()");
    expect(serviceOrders).not.toContain("serviceOrders.update.useMutation()");
    expect(serviceOrders).not.toContain('status: "IN_PROGRESS"');
    expect(serviceOrders).not.toContain('status: "DONE"');
  });
  it("evita Button legado do design-system em páginas", () => {
    const pageFiles = readdirSync("client/src/pages").filter(file =>
      file.endsWith(".tsx")
    );

    const legacyButtonImport =
      /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/design-system["']/s;

    for (const file of pageFiles) {
      const source = readFileSync(`client/src/pages/${file}`, "utf8");

      expect(source).not.toMatch(legacyButtonImport);
    }

    const settings = readFileSync("client/src/pages/SettingsPage.tsx", "utf8");

    expect(settings).not.toContain("OperationalTopCard lint contract");
  });

  it("evita NexoStatusBadge legado", () => {
    const sourceFiles = readdirSync("client/src", {
      recursive: true,
    }) as string[];

    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;

      const source = readFileSync(`client/src/${file}`, "utf8");

      expect(source).not.toContain("NexoStatusBadge");
    }
  });

  it("evita wrappers legados de botão nos componentes ativos", () => {
    const componentFiles = readdirSync("client/src/components", {
      recursive: true,
    }) as string[];

    const legacyButtonImport =
      /import\s*\{[^}]*(?:\bButton\b|\bSecondaryButton\b|\bGhostButton\b|\bPrimaryButton\b)[^}]*\}\s*from\s*["']@\/components\/design-system["']/s;

    for (const file of componentFiles) {
      if (!file.endsWith(".tsx")) continue;

      const source = readFileSync(`client/src/components/${file}`, "utf8");

      expect(source).not.toMatch(legacyButtonImport);
    }
  });

  it("proíbe retorno do design-system legado", () => {
    const sourceFiles = readdirSync("client/src", {
      recursive: true,
    }) as string[];

    expect(sourceFiles).not.toContain("components/design-system.tsx");

    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;

      const source = readFileSync(`client/src/${file}`, "utf8");

      expect(source).not.toContain("@/components/design-system");
    }
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pages = [
  "client/src/pages/CustomersPage.tsx",
  "client/src/pages/AppointmentsPage.tsx",
  "client/src/pages/ServiceOrdersPage.tsx",
  "client/src/pages/FinancesPage.tsx",
  "client/src/pages/SettingsPage.tsx",
  "client/src/pages/GovernancePage.tsx",
  "client/src/pages/PeoplePage.tsx",
  "client/src/pages/TimelinePage.tsx",
  "client/src/pages/BillingPage.tsx",
];

const errors = [];
const warnings = [];

const modalContrastForbiddenPatterns = [
  /(?:^|\s)bg-slate-9\S*/,
  /(?:^|\s)bg-zinc-9\S*/,
  /(?:^|\s)bg-neutral-9\S*/,
  /(?:^|\s)bg-black\S*/,
  /(?:^|\s)bg-white\/\S*/,
  /(?:^|\s)bg-\[#0B1220\]/,
  /(?:^|\s)bg-\[#071224\]/,
  /(?:^|\s)bg-\[#0D1B34\]/,
  /(?:^|\s)text-white(?:\/\S*)?(?=\s|"|'|`|$)/,
  /(?:^|\s)border-white(?:\/\S*)?(?=\s|"|'|`|$)/,
];
const modalContrastScopeFiles = [
  "client/src/components/app-modal-system.tsx",
  "client/src/components/ModalFlowShell.tsx",
  "client/src/components/CreateCustomerModal.tsx",
  "client/src/components/EditCustomerModal.tsx",
  "client/src/components/CreateAppointmentModal.tsx",
  "client/src/components/CreateServiceOrderModal.tsx",
  "client/src/components/EditServiceOrderModal.tsx",
  "client/src/components/CreateChargeModal.tsx",
  "client/src/components/EditChargeModal.tsx",
  "client/src/components/CreateExpenseModal.tsx",
  "client/src/components/ui/dialog.tsx",
  "client/src/components/ui/input.tsx",
  "client/src/components/ui/textarea.tsx",
  "client/src/components/ui/select.tsx",
  "client/src/components/ui/dropdown-menu.tsx",
  "client/src/components/ui/popover.tsx",
  "client/src/pages/AppointmentsPage.tsx",
  "client/src/pages/CalendarPage.tsx",
];

function stripDarkScopedClassTokens(line) {
  return line
    .split(/\s+/)
    .filter(token => !token.includes("dark:"))
    .join(" ");
}

const forbiddenClasses = [
  "bg-zinc-900",
  "bg-slate-950",
  "bg-slate-900",
  "bg-black",
  "dark:bg-black",
  "dark:bg-zinc-900",
  "dark:bg-slate-950",
  "dark:bg-slate-900",
];

const operatingSystemVisualWarnings = [
  "text-white",
  "border-white",
  "bg-zinc-900",
  "bg-slate-950",
  "bg-black",
  "dark:bg",
  "dark:border",
];

const suspiciousVisualTokens = [
  "bg-gray-950",
  "border-white",
  "border-zinc",
  "border-slate",
  "text-white",
  "dark:bg",
  "dark:text",
  "dark:border",
  "rounded-2xl",
  "p-6",
  "p-8",
];

const foundationScopeFiles = [
  "client/src/components/app-system.tsx",
  "client/src/components/app-modal-system.tsx",
  "client/src/components/internal-page-system.tsx",
  "client/src/index.css",
];

const temporaryLegacyVisualAllowlist = new Set([
  "client/src/index.css",
]);

const styleScopeFiles = [
  ...pages,
  "client/src/pages/ExecutiveDashboard.tsx",
  "client/src/pages/WhatsAppPage.tsx",
  "client/src/components/ModalFlowShell.tsx",
  "client/src/components/CreateCustomerModal.tsx",
  "client/src/components/CreateAppointmentModal.tsx",
  "client/src/components/CreateServiceOrderModal.tsx",
];
const designSystemScope = [
  "client/src/components/app-system.tsx",
  "client/src/components/app-modal-system.tsx",
  "client/src/components/internal-page-system.tsx",
  "client/src/components/CreateCustomerModal.tsx",
  "client/src/components/CreateAppointmentModal.tsx",
  "client/src/components/CreateServiceOrderModal.tsx",
  "client/src/components/CreateExpenseModal.tsx",
  "client/src/components/CreateLaunchModal.tsx",
  "client/src/components/CreateChargeModal.tsx",
  "client/src/components/ConfirmDialog.tsx",
  "client/src/components/ConfirmDeleteModal.tsx",
];
const statusScopePages = [
  "client/src/pages/AppointmentsPage.tsx",
  "client/src/pages/ServiceOrdersPage.tsx",
  "client/src/pages/FinancesPage.tsx",
];
const forbiddenOperationalVisualPatterns = [
  "shadow-",
  "ring-",
  "backdrop-",
  "blur-",
];
function hasDirectCardClass(source) {
  const classNamePattern =
    /className=[{]?["'`]([^"'`]*)["'`]/g;

  return Array.from(source.matchAll(classNamePattern)).some(
    ([, className]) =>
      className
        .split(/\s+/)
        .filter(Boolean)
        .some(token => {
          const baseToken =
            token.split(":").at(-1) ?? token;

          return /^(?:rounded-(?:xl|2xl)|p-[468])$/.test(
            baseToken
          );
        })
  );
}

const operationalVisualScopeFiles = [
  "client/src/pages/ExecutiveDashboard.tsx",
  "client/src/pages/CustomersPage.tsx",
  "client/src/pages/AppointmentsPage.tsx",
  "client/src/pages/ServiceOrdersPage.tsx",
  "client/src/pages/FinancesPage.tsx",
  "client/src/pages/WhatsAppPage.tsx",
  "client/src/pages/TimelinePage.tsx",
];

for (const page of pages) {
  const source = readFileSync(join(root, page), "utf8");

  if (/\bPageHero\b/.test(source)) {
    errors.push(`${page}: uso legado de PageHero detectado.`);
  }

  const hasPageShellContract =
    /\bPageWrapper\b/.test(source) || /\bAppPageShell\b/.test(source);
  if (!hasPageShellContract) {
    errors.push(
      `${page}: shell de página obrigatório não encontrado (PageWrapper legado ou AppPageShell Nexo).`
    );
  }

  const hasLegacyActionBar = /\bActionBarWrapper\b/.test(source);
  const hasOperationalHeaderActions =
    /<AppOperationalHeader\b[\s\S]*?\b(?:primaryAction|secondaryActions)=\{/.test(
      source
    );
  const hasNexoActionContract =
    /\bOperationalTopCard\b/.test(source) ||
    /\bNexoActionGroup\b/.test(source) ||
    hasOperationalHeaderActions ||
    (/\bAppSectionCard\b/.test(source) &&
      /Próxima decisão financeira|Próxima decisão da carteira|Próxima melhor ação/.test(
        source
      ));
  if (!hasLegacyActionBar && !hasNexoActionContract) {
    errors.push(
      `${page}: contrato de ações ausente (esperado ActionBarWrapper legado, OperationalTopCard/NexoActionGroup, AppOperationalHeader com ações ou bloco oficial AppSectionCard do Nexo).`
    );
  }

  if (/from\s+["']@\/components\/ui\/table["']/.test(source)) {
    errors.push(
      `${page}: import direto de tabela legado detectado (@/components/ui/table).`
    );
  }

  if (/\bDataTable\b/.test(source) && !/\bDataTableWrapper\b/.test(source)) {
    errors.push(
      `${page}: DataTableWrapper obrigatório para renderização tabular.`
    );
  }

  if (statusScopePages.includes(page)) {
    if (/severity:\s*["']attention["']/.test(source)) {
      errors.push(
        `${page}: severidade "attention" é proibida; use pending/overdue/critical/healthy.`
      );
    }

    const hasOperationalSeverityReference =
      /OperationalSeverity/.test(source) ||
      /getOperationalSeverity/.test(source);
    if (!hasOperationalSeverityReference) {
      errors.push(
        `${page}: severidade operacional padronizada não encontrada.`
      );
    }

    const hasPrimaryButtonInActionBar = /primaryAction=\{\(\s*<Button\b/.test(
      source
    );
    if (hasPrimaryButtonInActionBar) {
      errors.push(
        `${page}: botão primário em ActionBar deve usar ActionFeedbackButton.`
      );
    }
  }
}

for (const file of styleScopeFiles) {
  const source = readFileSync(join(root, file), "utf8");
  for (const token of operatingSystemVisualWarnings) {
    if (source.includes(token)) {
      warnings.push(
        `${file}: revisar hardcode visual (${token}); prefira tokens --app-* ou componentes AppSectionCard/AppActionCard.`
      );
    }
  }

  if (
    hasDirectCardClass(source) &&
    !/AppSectionCard|AppActionCard|OperationalInnerCard|NexoOperationalState/.test(source)
  ) {
    warnings.push(
      `${file}: possível card direto em página sem componente operacional oficial.`
    );
  }

  for (const forbidden of forbiddenClasses) {
    if (source.includes(forbidden)) {
      errors.push(
        `${file}: classe proibida detectada (${forbidden}). Use tokens do app.`
      );
    }
  }

  if (operationalVisualScopeFiles.includes(file)) {
    for (const pattern of forbiddenOperationalVisualPatterns) {
      if (source.includes(pattern)) {
        errors.push(
          `${file}: padrão visual proibido detectado (${pattern}) para elementos operacionais.`
        );
      }
    }
  }
}

for (const file of designSystemScope) {
  const source = readFileSync(join(root, file), "utf8");
  for (const forbidden of forbiddenClasses) {
    if (source.includes(forbidden)) {
      errors.push(
        `${file}: hardcode escuro proibido detectado no design system (${forbidden}).`
      );
    }
  }
}

for (const file of foundationScopeFiles) {
  const source = readFileSync(join(root, file), "utf8");
  for (const token of suspiciousVisualTokens) {
    if (source.includes(token)) {
      const disposition = temporaryLegacyVisualAllowlist.has(file)
        ? "legado permitido temporariamente"
        : "revisar antes de novas telas";
      warnings.push(
        `${file}: token visual suspeito (${token}) detectado — ${disposition}.`
      );
    }
  }
}

for (const file of modalContrastScopeFiles) {
  const source = readFileSync(join(root, file), "utf8");
  source.split(/\r?\n/).forEach((line, index) => {
    const lightModeLine = stripDarkScopedClassTokens(line);
    for (const pattern of modalContrastForbiddenPatterns) {
      const match = lightModeLine.match(pattern);
      if (match) {
        errors.push(
          `${file}:${index + 1}: contrato light de modais/forms violado (${match[0].trim()}). Use tokens semânticos --modal/--field/--summary ou classes nexo-*; exceções só com dark:.`
        );
      }
    }
  });
}

const serviceOrdersSource = readFileSync(
  join(root, "client/src/pages/ServiceOrdersPage.tsx"),
  "utf8"
);
const serviceOrdersExecutionContract = [
  "Centro real de execução operacional",
  "Alertas compactos: atraso, parada, responsável e cobrança.",
  "Número, cliente, serviço, status, responsável, prazo, atraso, valor",
  "Sem prazo",
  "Cobrar / Gerar cobrança",
  "Enviar WhatsApp",
  "Fallback contextual com datas reais da O.S.; não substitui a Timeline oficial.",
];
for (const expected of serviceOrdersExecutionContract) {
  if (!serviceOrdersSource.includes(expected)) {
    errors.push(
      `client/src/pages/ServiceOrdersPage.tsx: contrato de execução operacional de O.S. ausente (${expected}).`
    );
  }
}

if (warnings.length > 0) {
  console.warn("\n⚠️ Avisos de padronização visual (não bloqueantes):\n");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("\n❌ Validação Operating System falhou:\n");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(
  "✅ Validação Operating System concluída sem inconsistências bloqueantes."
);

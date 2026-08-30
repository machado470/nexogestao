import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("official internal visual foundation", () => {
  const system = readFileSync("client/src/components/app-system.tsx", "utf8");
  const modal = readFileSync(
    "client/src/components/app-modal-system.tsx",
    "utf8"
  );
  const dialog = readFileSync("client/src/components/ui/dialog.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");

  it("exports the primitives actually used by internal decision pages", () => {
    [
      "AppPageShell",
      "AppPageHeader",
      "AppPageSection",
      "AppToolbar",
      "AppFiltersBar",
      "AppSectionCard",
      "AppStatCard",
      "AppInfoCard",
      "AppEmptyState",
      "AppLoadingState",
      "AppSkeleton",
      "AppErrorState",
      "AppStatusBadge",
      "AppDataTable",
      "AppTabs",
      "AppBreadcrumbs",
      "AppDropdown",
      "AppRowActionsDropdown",
      "AppAlert",
    ].forEach(name => expect(system).toContain(name));
  });

  it("keeps the modal composition accessible, scroll-contained and responsive", () => {
    [
      "BaseModal",
      "ModalHeader",
      "ModalBody",
      "ModalFooter",
      "FormModal",
      "ConfirmModal",
    ].forEach(name => expect(modal).toContain(`function ${name}`));
    ["sm", "md", "lg", "xl", "full"].forEach(size =>
      expect(modal).toMatch(new RegExp(`\\b${size}:`))
    );
    expect(modal).toContain("max-h-[90vh]");
    expect(modal).toContain("overflow-y-auto");
    expect(modal).toContain("onEscapeKeyDown");
    expect(modal).toContain("onOpenAutoFocus");
    expect(dialog).toContain("bg-[var(--app-overlay-scrim)]");
  });

  it("defines one theme-aware semantic scale without decorative gradients", () => {
    [
      "--app-space-1",
      "--app-radius-control",
      "--app-control-height",
      "--app-page-max",
      "--app-overlay-scrim",
    ].forEach(token => expect(css).toContain(token));
    expect(system).not.toContain("linear-gradient");
    expect(dialog).not.toContain("backdrop-blur");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(
  new URL("./SettingsPage.tsx", import.meta.url),
  "utf8"
);

describe("SettingsPage golden-standard contract", () => {
  it("uses the canonical page and form primitives", () => {
    for (const primitive of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppSectionBlock",
      "AppForm",
      "AppField",
      "AppInput",
      "AppSelect",
      "AppFormActions",
      "AppPageLoadingState",
      "AppPageErrorState",
    ]) {
      expect(settingsPageSource).toContain(primitive);
    }

    expect(settingsPageSource).not.toContain("OperationalPanel");
    expect(settingsPageSource).not.toContain("<input");
    expect(settingsPageSource).not.toContain("<select");
  });

  it("edits only fields supported by the organization settings contract", () => {
    expect(settingsPageSource).toContain(
      "updateMutation.mutate({ name, timezone, currency })"
    );
    expect(settingsPageSource).toContain("value={settings.slug}");
    expect(settingsPageSource).toContain("readOnly");

    for (const unsupported of [
      "CNPJ",
      "logo",
      "juros",
      "multa",
      "webhook",
      "threshold",
      "risk",
      "score",
      "policy",
    ]) {
      expect(settingsPageSource.toLowerCase()).not.toContain(
        unsupported.toLowerCase()
      );
    }
  });

  it("does not turn client storage or administrative diagnostics into settings", () => {
    expect(settingsPageSource).not.toContain("localStorage");
    expect(settingsPageSource).not.toContain("sessionStorage");
    expect(settingsPageSource).not.toContain("administrativeSummary");
    expect(settingsPageSource).not.toContain("activeMembers");
    expect(settingsPageSource).not.toContain("pendingInvite");
    expect(settingsPageSource).not.toContain("Date.now");
    expect(settingsPageSource).not.toContain("new Date");
  });

  it("keeps loading, unavailable, saving, failure and confirmed-success states explicit", () => {
    expect(settingsPageSource).toContain("settingsQuery.isLoading");
    expect(settingsPageSource).toContain("settingsQuery.isError");
    expect(settingsPageSource).toContain("updateMutation.isPending");
    expect(settingsPageSource).toContain("updateMutation.isError");
    expect(settingsPageSource).toContain("updateMutation.isSuccess");
    expect(settingsPageSource).toContain(
      "await utils.settings.get.invalidate()"
    );
    expect(settingsPageSource).toContain('role="alert"');
    expect(settingsPageSource).toContain('role="status"');
  });

  it("associates text controls with visible labels and preserves responsive stacking", () => {
    expect(settingsPageSource).toContain('htmlFor="settings-name"');
    expect(settingsPageSource).toContain('id="settings-name"');
    expect(settingsPageSource).toContain('htmlFor="settings-timezone"');
    expect(settingsPageSource).toContain('id="settings-timezone"');
    expect(settingsPageSource).toContain('ariaLabel="Moeda operacional"');
    expect(settingsPageSource).toContain("<AppFieldGroup>");
    expect(settingsPageSource).toContain("flex flex-wrap justify-end");
  });
});

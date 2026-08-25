import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(
  new URL("./SettingsPage.tsx", import.meta.url),
  "utf8"
);

describe("SettingsPage organization settings contract", () => {
  it("envia name e timezone no payload canônico", () => {
    expect(settingsPageSource).toContain(
      "updateMutation.mutate({ name, timezone })"
    );
  });

  it("carrega name após reload sem fallback ambíguo para organizationName", () => {
    expect(settingsPageSource).toContain(
      'setName(String(settings.name ?? ""))'
    );
    expect(settingsPageSource).not.toContain("organizationName");
  });
});

describe("SettingsPage internal page architecture contract", () => {
  it("usa o shell canônico sem PageWrapper legado", () => {
    expect(settingsPageSource).toContain("<AppPageShell>");
    expect(settingsPageSource).toContain("<AppOperationalHeader");
    expect(settingsPageSource).not.toContain("PageWrapper");
  });
});

describe("SettingsPage operational control center contract", () => {
  it("usa componentes operacionais para o centro de controle", () => {
    expect(settingsPageSource).toContain("Centro de controle do sistema");
    expect(settingsPageSource).toContain("<OperationalPanel");
    expect(settingsPageSource).toContain("<OperationalSectionGrid");
    expect(settingsPageSource).toContain("<OperationalActionPanel");
    expect(settingsPageSource).toContain("<OperationalPriorityItem");
  });
});

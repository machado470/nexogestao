import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("./WhatsAppWebhookRecoveryPage.tsx", import.meta.url),
  "utf8"
);

describe("WhatsAppWebhookRecoveryPage golden-standard contract", () => {
  it("uses the canonical page hierarchy", () => {
    expect(page).toContain("<AppPageShell");
    expect(page).toContain("<AppOperationalHeader");
    expect(page).toContain("<AppFiltersBar");
    expect(page).toContain("<AppSectionBlock");
  });

  it("uses canonical filter and selection controls", () => {
    expect(page).toContain("<AppInput");
    expect(page).toContain("<AppSelect");
    expect(page).toContain("<AppCheckbox");

    expect(page).not.toContain("@/components/ui/input");
    expect(page).not.toContain("<select");
    expect(page).not.toContain("<input");
  });

  it("uses canonical confirmation for webhook replay", () => {
    expect(page).toContain("<ConfirmModal");
    expect(page).not.toContain("@/components/ConfirmDialog");
    expect(page).not.toContain("<ConfirmDialog");
    expect(page).not.toContain("window.confirm");
    expect(page).not.toContain("window.prompt");
  });

  it("preserves official replay contracts and explicit force confirmation", () => {
    expect(page).toContain(
      "trpc.whatsapp.replayWebhookEvent.useMutation"
    );
    expect(page).toContain(
      "trpc.whatsapp.replayWebhookEvents.useMutation"
    );
    expect(page).toContain("canReplayEvent");
    expect(page).toContain("forceReplayRequiresConfirmation");
    expect(page).toContain("Confirmar force replay");
    expect(page).toContain("confirmReplay");
  });

  it("keeps the diagnostic disclosure semantic and protects raw payload", () => {
    expect(page).toContain(
      "Diagnóstico seguro (sem payload bruto)"
    );
    expect(page).toContain(
      "Payload bruto completo permanece protegido no backend"
    );
  });
});

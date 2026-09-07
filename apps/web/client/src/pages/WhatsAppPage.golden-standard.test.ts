import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("client/src/pages/WhatsAppPage.tsx", "utf8");

describe("WhatsApp golden-standard workspace", () => {
  it("uses the canonical page composition and locally scoped states", () => {
    for (const contract of [
      "AppPageShell",
      "AppOperationalHeader",
      "AppFiltersBar",
      "AppSectionBlock",
      "AppPageLoadingState",
      "AppPageErrorState",
      "AppPageEmptyState",
    ]) {
      expect(source).toContain(contract);
    }
    expect(source).toContain('title="Workspace de comunicação"');
    expect(source).toContain('title="Histórico indisponível"');
    expect(source).toContain('title="Contexto indisponível"');
    expect(source).toContain("conversationsQuery.error");
  });

  it("keeps API inbox order and official operational authority", () => {
    expect(source).toContain("() => conversations");
    expect(source).toContain("return allInboxRows.filter");
    expect(source).not.toMatch(/allInboxRows[\s\S]{0,120}\.sort\(/);
    expect(source).toContain("inboxPosition");
    expect(source).toContain("priorityReason");
    expect(source).toContain("governanceSignal?.communicationFailure");
    expect(source).toContain("presentOfficialWhatsAppActions");
    expect(source).toContain("Sem recomendação oficial");
    expect(source).not.toContain('item?.priority === "NORMAL"');
  });

  it("keeps virtual contacts outside the inbox without invented signals", () => {
    expect(source).toContain(
      "Contacts without a server conversation stay outside"
    );
    expect(source).toContain("priority: null");
    expect(source).toContain("unreadCount: null");
    expect(source).toContain("governanceSignal: null");
    expect(source).toContain('title: "Novo contato"');
  });

  it("preserves honest delivery states, composer and responsive structure", () => {
    expect(source).toContain('FAILED: "Falha no envio"');
    expect(source).toContain('UNCERTAIN: "Entrega incerta"');
    expect(source).toContain('aria-label="Enviar mensagem"');
    expect(source).toContain('aria-label="Voltar para o inbox"');
    expect(source).toContain("min-h-0 min-w-0");
    expect(source).toContain("md:grid-cols-");
    expect(source).toContain("xl:grid-cols-");
    expect(source).not.toContain("h-screen");
    expect(source).not.toContain("h-[calc(100vh-4.25rem)]");
    expect(source).not.toContain("trpc.nexo.");
    expect(source).not.toContain("Date.now()");
  });
});

describe("WhatsApp overlay consolidation guardrails", () => {
  it("uses canonical dropdowns without cascade or local stacking", () => {
    expect(source).toContain("<AppDropdown>");
    expect(source).toContain("<AppDropdownContent");
    expect(source).toContain("<AppDropdownItem");
    expect(source).not.toContain("DropdownMenuSub");
    expect(source).not.toContain("@/components/ui/dropdown-menu");
    expect(source).not.toMatch(
      /\bz-\[(?:\d+|[^\]]+)\]|\bz-(?:10|20|30|40|50|60|70)\b/
    );
    expect(source).not.toContain("nexo-cascade");
  });

  it("uses accessible modal primitives for workflow decisions", () => {
    expect(source).toContain("<ConfirmModal");
    expect(source).toContain("<FormModal");
    expect(source).toContain('htmlFor="whatsapp-cancel-reason"');
    expect(source).not.toContain("window.confirm");
    expect(source).not.toContain("window.prompt");
    expect(source).not.toContain("document.addEventListener");
    expect(source).not.toContain("<details");
  });
});

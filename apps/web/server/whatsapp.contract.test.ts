import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

function caller() {
  return appRouter.createCaller({
    req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: { token: "trusted", validated: true, organizationId: "org-trusted" },
  } as any);
}

describe("WhatsApp BFF input contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("accepts canonical manual and template actions through the canonical and nexo aliases", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ data: { id: "message-1", status: "QUEUED" } }), { status: 200 }),
    );
    const api = caller();

    await api.whatsapp.sendMessage({ conversationId: "conversation-1", content: "Olá", messageType: "MANUAL" });
    await api.nexo.whatsapp.sendTemplate({
      conversationId: "conversation-1",
      templateKey: "payment_reminder",
      context: { customerName: "Cliente", chargeAmount: "100,00", chargeDueDate: "2026-09-10" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      content: "Olá",
      messageType: "MANUAL",
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      conversationId: "conversation-1",
      templateKey: "payment_reminder",
      context: { customerName: "Cliente", chargeAmount: "100,00", chargeDueDate: "2026-09-10" },
    });
  });

  it.each(["orgId", "tenantId", "organizationId", "provider", "phoneId"]) (
    "rejects the unauthorized %s field before transport",
    async field => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      await expect(caller().whatsapp.sendTemplate({
        conversationId: "conversation-1",
        templateKey: "payment_reminder",
        [field]: "forged",
      } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { conversationId: "conversation-1", templateKey: "not_a_template" },
    { conversationId: "conversation-1", templateKey: "payment_reminder", context: { arbitrary: "value" } },
    { conversationId: "conversation-1", templateKey: "payment_reminder", context: { chargeAmount: { value: 100 } } },
  ])("rejects invalid template payload %#", async input => {
    await expect(caller().whatsapp.sendTemplate(input as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid manual ids, enums and extra fields", async () => {
    await expect(caller().whatsapp.sendMessage({ conversationId: "", content: "Olá" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().whatsapp.sendMessage({ customerId: "customer-1", content: "Olá", messageType: "provider_text" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().whatsapp.sendMessage({ customerId: "customer-1", content: "Olá", orgId: "forged" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

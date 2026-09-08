import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const messageId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const now = "2026-09-08T12:00:00.000Z";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: messageId, conversationId, customerId, direction: "OUTBOUND", entityType: "CUSTOMER", entityId: customerId,
    messageType: "MANUAL", status: "QUEUED", toPhone: "+5511999999999", fromPhone: null, renderedText: "Olá",
    content: "Olá", providerMessageId: null, errorCode: null, errorMessage: null, sentAt: null, deliveredAt: null,
    readAt: null, failedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

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
      new Response(JSON.stringify({ data: { created: true, message: message() } }), { status: 200 }),
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

  it("rejects HTTP 200 responses with an invalid message status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { created: true, message: message({ status: "invented" }) },
    }), { status: 200 }));

    await expect(caller().whatsapp.send({ customerId, content: "Olá" })).rejects.toThrow();
  });

  it("validates and sanitizes conversation and message history outputs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [{
      id: conversationId, orgId: "forbidden", customerId, phone: "+5511999999999", title: null, status: "OPEN",
      priority: "HIGH", priorityReason: null, assignedUserId: null, contextType: "CUSTOMER", contextId: customerId,
      lastMessageAt: null, lastInboundAt: null, lastOutboundAt: null, waitingSince: null, responseDueAt: null,
      unreadCount: 0, createdAt: now, updatedAt: now, customer: { id: customerId, name: "Cliente", phone: null },
      inboxPosition: 1, evaluatedAt: now, ownership: null, lastMessage: null, noResponseSince: null,
      noResponseMinutes: null, noResponseHours: null, failedMessageCount: 0, operationalStatus: "Em atendimento",
      flags: { hasPendingCharge: false, hasNoResponse: false, hasFailure: false },
      provider: "internal", intelligence: { raw: true },
    }], nextCursor: null } }), { status: 200 }));
    const conversations = await caller().whatsapp.listConversations();
    expect(conversations.items[0]).not.toHaveProperty("orgId");
    expect(conversations.items[0]).not.toHaveProperty("provider");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [message({ metadata: { raw: true }, lockedBy: "worker" })] }), { status: 200 }));
    expect(await caller().nexo.whatsapp.getMessages({ conversationId })).toEqual([message()]);
  });

  it("rejects an unexpected public field after internal projection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { created: true, message: message(), inventedPublicState: true },
    }), { status: 200 }));
    await expect(caller().whatsapp.send({ customerId, content: "Olá" })).rejects.toThrow();
  });

  it("rejects missing required fields and malformed envelopes instead of applying defaults", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { created: true, message: message({ createdAt: undefined }) } }), { status: 200 }));
    await expect(caller().whatsapp.sendMessage({ customerId, content: "Olá" })).rejects.toThrow();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await expect(caller().whatsapp.sendTemplate({ customerId, templateKey: "manual_followup" })).rejects.toThrow();
  });

  it("sanitizes tenant, provider payload and queue internals from send and replay outputs through the alias", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      created: true,
      message: { ...message(), orgId: "forbidden", metadata: { raw: true }, lockedBy: "worker", lockedAt: now, provider: "secret" },
      diagnostics: { token: "secret" },
    } }), { status: 200 }));
    const sent = await caller().nexo.whatsapp.send({ customerId, content: "Olá" });
    expect(sent).toEqual({ created: true, message: message() });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      ok: true, requested: 1, replayed: [{ webhookEventId: messageId, status: "FAILED", replayAttemptId: "attempt-1", jobId: "bull-1" }],
      orgId: "forbidden",
    } }), { status: 200 }));
    expect(await caller().nexo.whatsapp.replayWebhookEvent({ id: messageId })).toEqual({
      ok: true, requested: 1, replayed: [{ webhookEventId: messageId, status: "FAILED", replayAttemptId: "attempt-1" }],
    });
  });

  it.each([
    ["invalid UUID", { id: "not-a-uuid" }],
    ["invalid timestamp", { createdAt: "yesterday" }],
    ["invalid boolean", { created: "yes" }],
    ["null payload", null],
  ])("rejects %s in a successful HTTP response", async (_label, payload) => {
    const body = payload === null
      ? null
      : "created" in payload
        ? payload
        : { created: true, message: message(payload) };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: body }), { status: 200 }));
    await expect(caller().whatsapp.send({ customerId, content: "Olá" })).rejects.toThrow();
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

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./context", () => ({
  getNexoTokenFromReq: (req: { headers: Record<string, string> }) => req.headers.authorization?.replace(/^Bearer /, "") ?? null,
  fetchNexoMe: vi.fn(async () => ({ organizationId: "org-a" })),
}));
vi.mock("./nexoApiUrl", () => ({ resolveNexoApiUrl: () => "http://api.test/v1" }));

import { fetchNexoMe } from "./context";
import { registerNotificationStreamRoute } from "./notificationStream";

describe("notification SSE BFF proxy", () => {
  const nativeFetch = globalThis.fetch;
  const upstreamFetch = vi.fn(); let server: ReturnType<ReturnType<typeof express>["listen"]>; let baseUrl: string;
  beforeEach(async () => {
    vi.clearAllMocks(); vi.stubGlobal("fetch", upstreamFetch);
    const app = express(); registerNotificationStreamRoute(app);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => { vi.unstubAllGlobals(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it("autentica no BFF, encaminha Last-Event-ID por header e transmite frames", async () => {
    upstreamFetch.mockResolvedValue(new Response("id: event_2\nevent: notification.created\ndata: {}\n\n", {
      status: 200, headers: { "content-type": "text/event-stream" },
    }));
    const response = await nativeFetch(`${baseUrl}/api/notifications/stream`, {
      headers: { Authorization: "Bearer cookie-token", "Last-Event-ID": "event_1" },
    });
    expect(response.status).toBe(200); expect(await response.text()).toContain("id: event_2");
    expect(upstreamFetch).toHaveBeenCalledWith("http://api.test/v1/notifications/stream", expect.objectContaining({
      headers: { Authorization: "Bearer cookie-token", "Last-Event-ID": "event_1" },
    }));
  });

  it("mantém o upstream aberto depois de ready até o navegador desconectar", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
      cancel() { cancelled(); },
    });
    upstreamFetch.mockResolvedValue(new Response(body, {
      status: 200, headers: { "content-type": "text/event-stream" },
    }));

    const response = await nativeFetch(`${baseUrl}/api/notifications/stream?token=ignored&orgId=ignored&userId=ignored`, {
      headers: { Authorization: "Bearer cookie-token" },
    });
    const reader = response.body!.getReader(); const decoder = new TextDecoder();
    const upstreamSignal = upstreamFetch.mock.calls[0][1].signal as AbortSignal;
    expect(upstreamSignal.aborted).toBe(false);
    controller.enqueue(new TextEncoder().encode("event: ready\ndata: {}\n\n"));
    expect(decoder.decode((await reader.read()).value)).toContain("event: ready");
    expect(upstreamSignal.aborted).toBe(false);
    controller.enqueue(new TextEncoder().encode("id: recipient_1\nevent: notification.created\ndata: {}\n\n"));
    expect(decoder.decode((await reader.read()).value)).toContain("event: notification.created");
    expect(upstreamFetch.mock.calls[0][0]).toBe("http://api.test/v1/notifications/stream");

    await reader.cancel();
    await vi.waitFor(() => { expect(upstreamSignal.aborted).toBe(true); expect(cancelled).toHaveBeenCalledOnce(); });
  });

  it("não abre upstream sem sessão válida e rejeita cursor inseguro", async () => {
    vi.mocked(fetchNexoMe).mockResolvedValueOnce(null);
    expect((await nativeFetch(`${baseUrl}/api/notifications/stream`, { headers: { Authorization: "Bearer token" } })).status).toBe(401);
    expect((await nativeFetch(`${baseUrl}/api/notifications/stream`, {
      headers: { Authorization: "Bearer token", "Last-Event-ID": "bad cursor" },
    })).status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("preserva status de autenticação do upstream", async () => {
    for (const status of [401, 403, 503]) {
      upstreamFetch.mockResolvedValueOnce(new Response("denied", { status }));
      expect((await nativeFetch(`${baseUrl}/api/notifications/stream`, { headers: { Authorization: "Bearer token" } })).status).toBe(status);
    }
  });
});

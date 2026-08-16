import type { Express, Request, Response } from "express";
import { fetchNexoMe, getNexoTokenFromReq } from "./context";
import { resolveNexoApiUrl } from "./nexoApiUrl";

const SAFE_EVENT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function registerNotificationStreamRoute(app: Express) {
  app.get("/api/notifications/stream", async (req: Request, res: Response) => {
    const token = getNexoTokenFromReq(req);
    if (!token) { res.status(401).json({ error: "Não autenticado" }); return; }
    let session;
    try { session = await fetchNexoMe(req); }
    catch { res.status(503).json({ error: "Sessão temporariamente indisponível" }); return; }
    if (!session) { res.status(401).json({ error: "Não autenticado" }); return; }
    if (!session.organizationId) { res.status(403).json({ error: "Sessão sem organização" }); return; }

    const lastEventId = req.header("last-event-id");
    if (lastEventId !== undefined && !SAFE_EVENT_ID.test(lastEventId)) {
      res.status(400).json({ error: "Last-Event-ID inválido" }); return;
    }
    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.once("close", onClose);
    try {
      const upstream = await fetch(`${resolveNexoApiUrl()}/notifications/stream`, {
        headers: { Authorization: `Bearer ${token}`, ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}) },
        signal: abort.signal,
      });
      if (!upstream.ok || !upstream.body) {
        res.status([401, 403, 503].includes(upstream.status) ? upstream.status : 503)
          .json({ error: "Stream indisponível" }); return;
      }
      res.status(200).set({
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive", "X-Accel-Buffering": "no", "Content-Encoding": "identity",
      });
      res.flushHeaders();
      const reader = upstream.body.getReader();
      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise<void>(resolve => res.once("drain", resolve));
      }
    } catch (error) {
      if (!res.headersSent) res.status(503).json({ error: "Stream indisponível" });
    } finally {
      req.removeListener("close", onClose);
      if (!res.writableEnded) res.end();
    }
  });
}

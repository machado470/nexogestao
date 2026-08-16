import type { Express, Request, Response } from "express";
import { fetchNexoMe, getNexoTokenFromReq } from "./context";
import { resolveNexoApiUrl } from "./nexoApiUrl";

const SAFE_EVENT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_UPSTREAM_CHUNK_BYTES = 1024 * 1024;

function waitForDrain(res: Response, signal: AbortSignal) {
  return new Promise<boolean>(resolve => {
    const finish = (drained: boolean) => {
      res.removeListener("drain", onDrain); res.removeListener("close", onClose);
      res.removeListener("error", onClose); signal.removeEventListener("abort", onClose);
      resolve(drained);
    };
    const onDrain = () => finish(true); const onClose = () => finish(false);
    res.once("drain", onDrain); res.once("close", onClose); res.once("error", onClose);
    signal.addEventListener("abort", onClose, { once: true });
  });
}

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
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const onDisconnect = () => { abort.abort(); void reader?.cancel().catch(() => undefined); };
    // `req.close` also fires when a perfectly healthy GET request has finished
    // being read. The lifetime of SSE is owned by the response instead.
    req.once("aborted", onDisconnect); res.once("close", onDisconnect); res.once("error", onDisconnect);
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
      reader = upstream.body.getReader();
      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > MAX_UPSTREAM_CHUNK_BYTES) throw new Error("upstream chunk exceeds stream limit");
        if (!res.write(Buffer.from(value)) && !await waitForDrain(res, abort.signal)) break;
      }
    } catch (error) {
      if (!abort.signal.aborted && !res.headersSent) res.status(503).json({ error: "Stream indisponível" });
    } finally {
      req.removeListener("aborted", onDisconnect);
      res.removeListener("close", onDisconnect);
      res.removeListener("error", onDisconnect);
      if (reader) await reader.cancel().catch(() => undefined);
      if (!res.writableEnded) res.end();
    }
  });
}

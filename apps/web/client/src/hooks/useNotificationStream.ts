import { useEffect, useRef, useState } from "react";

export type NotificationStreamStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "unauthorized" | "forbidden" | "degraded";
export type ParsedSseEvent = { id?: string; event: string; data: string };

export function parseSseBuffer(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ParsedSseEvent[] = [];
  for (const block of blocks) {
    let id: string | undefined; let event = "message"; const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "id") id = value;
      else if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length || event !== "message") events.push({ id, event, data: data.join("\n") });
  }
  return { events, rest };
}

export function useNotificationStream(enabled: boolean, onSynchronize: () => void) {
  const [status, setStatus] = useState<NotificationStreamStatus>("disconnected");
  const synchronize = useRef(onSynchronize); synchronize.current = onSynchronize;
  useEffect(() => {
    if (!enabled) { setStatus("disconnected"); return; }
    const lifecycle = new AbortController(); let active: AbortController | null = null;
    let lastEventId: string | undefined; let attempt = 0; let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    const coalescedSync = () => { if (!syncTimer) syncTimer = setTimeout(() => { syncTimer = undefined; synchronize.current(); }, 150); };
    const wait = (ms: number) => new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms); lifecycle.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const online = () => new Promise<void>(resolve => {
      if (navigator.onLine) return resolve();
      window.addEventListener("online", () => resolve(), { once: true });
    });
    const run = async () => {
      while (!lifecycle.signal.aborted) {
        await online(); if (lifecycle.signal.aborted) break;
        setStatus(attempt ? "reconnecting" : "connecting"); active = new AbortController();
        const abortActive = () => active?.abort(); lifecycle.signal.addEventListener("abort", abortActive, { once: true });
        try {
          const response = await fetch("/api/notifications/stream", { credentials: "same-origin", signal: active.signal,
            headers: lastEventId ? { "Last-Event-ID": lastEventId } : undefined });
          if (response.status === 401) { setStatus("unauthorized"); return; }
          if (response.status === 403) { setStatus("forbidden"); return; }
          if (!response.ok || !response.body) throw new Error("stream unavailable");
          setStatus("connected"); attempt = 0; let buffer = ""; const reader = response.body.getReader(); const decoder = new TextDecoder();
          while (!lifecycle.signal.aborted) {
            const chunk = await reader.read(); if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true }); const parsed = parseSseBuffer(buffer); buffer = parsed.rest;
            for (const event of parsed.events) {
              if (event.id) lastEventId = event.id;
              if (event.event === "ready") continue;
              if (event.event === "notification.created") {
                if (event.id && seen.has(event.id)) continue;
                if (event.id) { seen.add(event.id); if (seen.size > 500) seen.delete(seen.values().next().value!); }
                coalescedSync();
              } else if (event.event === "resync") coalescedSync();
            }
          }
        } catch { if (!lifecycle.signal.aborted) setStatus("degraded"); }
        finally { lifecycle.signal.removeEventListener("abort", abortActive); active = null; }
        if (lifecycle.signal.aborted) break;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5));
        await wait(Math.round(delay * (0.8 + Math.random() * 0.4)));
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") coalescedSync(); };
    document.addEventListener("visibilitychange", onVisible); void run();
    return () => { lifecycle.abort(); active?.abort(); if (syncTimer) clearTimeout(syncTimer); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled]);
  return status;
}

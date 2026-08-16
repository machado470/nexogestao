import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./useNotificationStream";

describe("parseSseBuffer", () => {
  it("preserva evento fragmentado e suporta múltiplas linhas data", () => {
    const first = parseSseBuffer("id: one\nevent: notification.created\ndata: {\"a\":")
    expect(first.events).toEqual([])
    const second = parseSseBuffer(first.rest + "1}\ndata: tail\n\n")
    expect(second.events).toEqual([{ id: "one", event: "notification.created", data: '{"a":1}\ntail' }])
  })
  it("lê múltiplos eventos e ignora comentários heartbeat", () => {
    const parsed = parseSseBuffer(": heartbeat\n\nevent: ready\ndata: {}\n\nevent: resync\ndata: {}\n\n")
    expect(parsed.events.map(event => event.event)).toEqual(["ready", "resync"])
  })
  it("ignora ids e nomes de evento inseguros e limita memória", () => {
    expect(parseSseBuffer("id: bad id\nevent: bad event\ndata: x\n\n").events)
      .toEqual([{ event: "message", data: "x" }])
    expect(() => parseSseBuffer("x".repeat(256 * 1024 + 1))).toThrow("buffer limit")
  })
})

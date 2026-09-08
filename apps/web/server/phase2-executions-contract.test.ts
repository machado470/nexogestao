import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const context = {
  req: { headers: { cookie: "nexo_token=trusted" }, cookies: { nexo_token: "trusted" } },
  res: { cookie: vi.fn(), clearCookie: vi.fn() },
  user: { token: "trusted", validated: true, organizationId: "20000000-0000-4000-8000-000000000001" },
} as any;

const execution = {
  id: "10000000-0000-4000-8000-000000000001",
  orgId: "20000000-0000-4000-8000-000000000001",
  serviceOrderId: "30000000-0000-4000-8000-000000000001",
  customerId: "40000000-0000-4000-8000-000000000001",
  executorPersonId: null,
  startedAt: "2026-09-07T10:00:00.000Z",
  endedAt: null,
  notes: "nota histórica",
  checklist: [{ key: "safety", done: true }, "item legado"],
  attachments: [{ name: "foto.jpg", url: "https://example.test/foto.jpg" }],
  status: "IN_PROGRESS",
  amountCents: null,
  dueDate: null,
  mode: "service-order-fallback",
  createdAt: "2026-09-07T09:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};
const publicExecution = Object.fromEntries(
  Object.entries(execution).filter(([key]) => key !== "orgId")
);

describe("Phase 2 execution start/complete contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("encaminha o payload histórico de start sem autoridade tenant do browser", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(execution), { status: 200 })
    );
    const caller = appRouter.createCaller(context);

    await expect(caller.executions.start({
      serviceOrderId: "30000000-0000-4000-8000-000000000001",
      notes: "nota histórica",
      checklist: [{ key: "safety", done: true }, "item legado"],
      attachments: [{ name: "foto.jpg", url: "https://example.test/foto.jpg" }],
    })).resolves.toEqual(publicExecution);

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      serviceOrderId: "30000000-0000-4000-8000-000000000001",
      notes: "nota histórica",
      checklist: [{ key: "safety", done: true }, "item legado"],
      attachments: [{ name: "foto.jpg", url: "https://example.test/foto.jpg" }],
    });
  });

  it.each(["start", "complete"] as const)("rejeita orgId e extra keys em %s antes do upstream", async (operation) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(context);
    const input = operation === "start"
      ? { serviceOrderId: "30000000-0000-4000-8000-000000000001", orgId: "20000000-0000-4000-8000-000000000002", extra: true }
      : { executionId: "10000000-0000-4000-8000-000000000001", orgId: "20000000-0000-4000-8000-000000000002", extra: true };

    await expect(caller.executions[operation](input as any)).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remove executionId do body de complete e valida explicitamente a resposta", async () => {
    const completed = { ...execution, endedAt: "2026-09-07T11:00:00.000Z", status: "DONE" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(completed), { status: 200 })
    );
    const caller = appRouter.createCaller(context);

    await expect(caller.executions.complete({
      executionId: "10000000-0000-4000-8000-000000000001",
      notes: "concluída",
      checklist: [{ key: "final-review", done: true }],
    })).resolves.toEqual(Object.fromEntries(Object.entries(completed).filter(([key]) => key !== "orgId")));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/executions/10000000-0000-4000-8000-000000000001/complete");
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      notes: "concluída",
      checklist: [{ key: "final-review", done: true }],
    });
  });

  it.each(["start", "complete"] as const)("falha %s quando o payload upstream viola o output", async (operation) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...execution, unexpected: "drift" }), { status: 200 })
    );
    const caller = appRouter.createCaller(context);
    const input = operation === "start"
      ? { serviceOrderId: "30000000-0000-4000-8000-000000000001" }
      : { executionId: "10000000-0000-4000-8000-000000000001" };

    await expect(caller.executions[operation](input as any)).rejects.toBeTruthy();
  });

  it.each([
    ["campo obrigatório ausente", ({ customerId: _value, ...rest }) => rest],
    ["UUID inválido", (value) => ({ ...value, serviceOrderId: "not-a-uuid" })],
    ["timestamp inválido", (value) => ({ ...value, startedAt: "ontem" })],
    ["status inválido", (value) => ({ ...value, status: "STARTED" })],
    ["boolean idempotente inválido", (value) => ({ ...value, idempotent: "false" })],
  ] as const)("HTTP 200 inválido falha o contrato: %s", async (_label, mutate) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mutate(execution as any)), { status: 200 })
    );
    await expect(appRouter.createCaller(context).executions.start({
      serviceOrderId: execution.serviceOrderId,
    })).rejects.toBeTruthy();
  });

  it("preserva o fato oficial de replay idempotente sem expor orgId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ...execution, idempotent: true } }), { status: 200 })
    );
    await expect(appRouter.createCaller(context).executions.start({
      serviceOrderId: execution.serviceOrderId,
    })).resolves.toEqual({ ...publicExecution, idempotent: true });
  });

  it("aplica o mesmo contrato pelo alias nexo.executions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: execution }), { status: 200 })
    );
    await expect(appRouter.createCaller(context).nexo.executions.start({
      serviceOrderId: execution.serviceOrderId,
    })).resolves.toEqual(publicExecution);
  });

  it.each([null, {}, { data: null }, { ok: true, data: null }])("rejeita payload/envelope malformado %#", async (payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(appRouter.createCaller(context).executions.start({
      serviceOrderId: execution.serviceOrderId,
    })).rejects.toBeTruthy();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createContext,
  resetNexoMeValidationStateForTests,
} from "./_core/context";
import { appRouter } from "./routers";

function makeReq(token = "token-1") {
  return {
    headers: { cookie: `nexo_token=${token}` },
    cookies: { nexo_token: token },
  } as any;
}

function makeRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as any;
}

describe("BFF validated session", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetNexoMeValidationStateForTests();
  });

  it("login/session bootstrap válido mantém usuário validado", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "u1", email: "admin@nexo.local", role: "ADMIN", organizationId: "org1" } }), { status: 200 }),
    );

    const ctx = await createContext({ req: makeReq(), res: makeRes() } as any);

    expect(ctx.user).toEqual(expect.objectContaining({
      token: "token-1",
      validated: true,
      id: "u1",
      organizationId: "org1",
    }));
  });

  it("/me com 401 não cria sessão token-only", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 }),
    );

    const ctx = await createContext({ req: makeReq(), res: makeRes() } as any);

    expect(ctx.user).toBeNull();
  });

  it("/me indisponível não marca authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }));

    const ctx = await createContext({ req: makeReq(), res: makeRes() } as any);

    expect(ctx.user).toBeNull();
  });

  it("protectedProcedure bloqueia token presente sem sessão validada", async () => {
    const caller = appRouter.createCaller({
      req: makeReq(),
      res: makeRes(),
      user: null,
    } as any);

    await expect(caller.nexo.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("reutiliza sessão /me validada em rajada curta do mesmo token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "u-cache",
            email: "cache@nexo.local",
            role: "ADMIN",
            organizationId: "org-cache",
          },
        }),
        { status: 200 },
      ),
    );

    const first = await createContext({
      req: makeReq("token-cache"),
      res: makeRes(),
    } as any);

    const second = await createContext({
      req: makeReq("token-cache"),
      res: makeRes(),
    } as any);

    expect(first.user?.validated).toBe(true);
    expect(second.user?.validated).toBe(true);
    expect(second.user?.organizationId).toBe("org-cache");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("deduplica uma rajada concorrente de validações do mesmo token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            user: {
              id: "u-burst",
              email: "burst@nexo.local",
              role: "ADMIN",
              organizationId: "org-burst",
            },
          }),
          { status: 200 },
        );
      },
    );

    const contexts = await Promise.all(
      Array.from({ length: 20 }, () =>
        createContext({
          req: makeReq("token-burst"),
          res: makeRes(),
        } as any),
      ),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      contexts.every(
        ctx =>
          ctx.user?.validated === true &&
          ctx.user.organizationId === "org-burst",
      ),
    ).toBe(true);
  });

  it("não compartilha sessão validada entre tokens diferentes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            user: {
              id: "u1",
              email: "admin@nexo.local",
              role: "ADMIN",
              organizationId: "org1",
            },
          }),
          { status: 200 },
        ),
    );

    const first = await createContext({
      req: makeReq("token-a"),
      res: makeRes(),
    } as any);

    const second = await createContext({
      req: makeReq("token-b"),
      res: makeRes(),
    } as any);

    expect(first.user?.validated).toBe(true);
    expect(second.user?.validated).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("logout limpa cookies de sessão", async () => {
    const res = makeRes();
    const caller = appRouter.createCaller({
      req: makeReq(),
      res,
      user: null,
    } as any);

    await expect(caller.session.logout()).resolves.toEqual({ success: true });
    expect(res.clearCookie).toHaveBeenCalledWith("nexo_token", expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith("token", expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith("auth_token", expect.any(Object));
  });

  it("establishSession retorna falha explícita e remove cookie quando /me falha", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "backend unavailable" }), { status: 503 }),
    );
    const res = makeRes();
    const caller = appRouter.createCaller({
      req: makeReq(),
      res,
      user: null,
    } as any);

    await expect(caller.nexo.auth.establishSession({ token: "token-1" })).resolves.toEqual({
      success: false,
      validated: false,
      validationStatus: "failed",
      me: null,
    });
    expect(res.clearCookie).toHaveBeenCalledWith("nexo_token", expect.any(Object));
  });
});

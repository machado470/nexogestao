import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "../_core/cookies";
import { nexoPublicFetch } from "../_core/nexoClient";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { authedGet, type NexoContext } from "../_core/nexoTransport";

const NEXO_TOKEN_COOKIE = "nexo_token";
type AuthContext = NexoContext & { res: any };

function setTokenCookie(ctx: AuthContext, token: string) {
  ctx.res.cookie(NEXO_TOKEN_COOKIE, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function extractToken(result: any): string | null {
  return result?.data?.data?.token || result?.data?.token || result?.token ||
    result?.accessToken || result?.data?.accessToken || null;
}

function normalizeMeForProfile(raw: any) {
  const user = raw && typeof raw === "object" && raw.user && typeof raw.user === "object" ? raw.user : null;
  if (!user) return raw;
  const person = user.person && typeof user.person === "object" ? user.person : null;
  return {
    ...raw,
    ...user,
    name: user.name ?? person?.name ?? user.email ?? null,
    personId: user.personId ?? person?.id ?? null,
    person: person ?? null,
    organization: raw.organization ?? null,
    operational: raw.operational ?? null,
    pending: raw.pending ?? null,
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    requiresOnboarding: raw.requiresOnboarding ?? raw.organization?.requiresOnboarding ?? false,
    redirect: raw.redirect ?? null,
  };
}

export const meProcedure = protectedProcedure.query(async ({ ctx }) => {
  const raw = await authedGet(ctx as NexoContext, "/me");
  return normalizeMeForProfile(raw);
});

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(async ({ input, ctx }) => {
      const result = await nexoPublicFetch<any>(ctx.req, "/auth/login", { method: "POST", body: JSON.stringify(input) });
      const token = extractToken(result);
      if (!token) throw new Error("Login não retornou token.");
      console.info("[auth.login] session established");
      setTokenCookie(ctx as AuthContext, token);
      return result;
    }),
  register: publicProcedure
    .input(z.object({ orgName: z.string(), adminName: z.string(), email: z.string().email(), password: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      const result = await nexoPublicFetch<any>(ctx.req, "/auth/register", { method: "POST", body: JSON.stringify(input) });
      const token = extractToken(result);
      if (token) setTokenCookie(ctx as AuthContext, token);
      return result;
    }),
  forgotPassword: publicProcedure.input(z.object({ email: z.string().email() })).mutation(({ input, ctx }) =>
    nexoPublicFetch(ctx.req, "/auth/forgot-password", { method: "POST", body: JSON.stringify(input) })),
  resetPassword: publicProcedure.input(z.object({ token: z.string(), password: z.string().min(8) })).mutation(({ input, ctx }) =>
    nexoPublicFetch(ctx.req, "/auth/reset-password", { method: "POST", body: JSON.stringify(input) })),
  acceptInvite: publicProcedure
    .input(z.object({ email: z.string().email(), token: z.string().min(1), name: z.string().trim().min(2), password: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      const result = await nexoPublicFetch<any>(ctx.req, "/auth/accept-invite", { method: "POST", body: JSON.stringify(input) });
      const token = extractToken(result);
      if (token) setTokenCookie(ctx as AuthContext, token);
      return result;
    }),
  establishSession: publicProcedure.input(z.object({ token: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const rawToken = input.token.trim();
    setTokenCookie(ctx as AuthContext, rawToken);
    try {
      const result = await nexoPublicFetch<any>(ctx.req, "/me", { headers: { Authorization: `Bearer ${rawToken}` } });
      return { success: true, validated: true, token: rawToken, me: result };
    } catch (error) {
      console.warn("[auth.establishSession] sessão não validada por /me", { reason: error instanceof Error ? error.message : String(error) });
      ctx.res.clearCookie(NEXO_TOKEN_COOKIE, getSessionCookieOptions(ctx.req));
      return { success: false, validated: false, validationStatus: "failed" as const, me: null };
    }
  }),
  verifyEmail: publicProcedure.input(z.object({ token: z.string().min(1) })).mutation(({ input, ctx }) =>
    nexoPublicFetch(ctx.req, "/auth/verify-email", { method: "POST", body: JSON.stringify(input) })),
  resendEmailVerification: publicProcedure.input(z.object({ email: z.string().email() })).mutation(({ input, ctx }) =>
    nexoPublicFetch(ctx.req, "/auth/resend-email-verification", { method: "POST", body: JSON.stringify(input) })),
  me: meProcedure,
});

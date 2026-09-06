import { TRPCError } from "@trpc/server";
import cookie from "cookie";
import { resolveNexoApiUrl } from "./nexoApiUrl";

const NEXO_API_URL = resolveNexoApiUrl();
const NEXO_TOKEN_COOKIE = "nexo_token";
const NEXO_FETCH_TIMEOUT_MS = Number(process.env.NEXO_FETCH_TIMEOUT_MS || 12000);

type CtxLike = {
  req?: any;
  user?: {
    token?: string;
  } | null;
};

function getBearerTokenFromHeader(authHeader: unknown): string | null {
  if (typeof authHeader !== "string") return null;

  const normalized = authHeader.trim();
  if (!normalized) return null;

  if (normalized.toLowerCase().startsWith("bearer ")) {
    const token = normalized.slice(7).trim();
    return token || null;
  }

  return normalized;
}

function getNexoTokenFromReq(req: any): string | null {
  const reqCookies = req?.cookies;
  if (reqCookies && typeof reqCookies?.[NEXO_TOKEN_COOKIE] === "string") {
    const token = reqCookies[NEXO_TOKEN_COOKIE].trim();
    if (token) return token;
  }

  const raw = req?.headers?.cookie;
  if (!raw || typeof raw !== "string") return null;

  const parsed = cookie.parse(raw);
  const token = parsed?.[NEXO_TOKEN_COOKIE];
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

function resolveAuthToken(source: any): string | null {
  if (source?.user?.token && typeof source.user.token === "string") {
    const token = source.user.token.trim();
    if (token) return token;
  }

  const directHeader = getBearerTokenFromHeader(source?.headers?.authorization);
  if (directHeader) return directHeader;

  const reqHeader = getBearerTokenFromHeader(source?.req?.headers?.authorization);
  if (reqHeader) return reqHeader;

  const reqCookieToken = getNexoTokenFromReq(source?.req ?? source);
  if (reqCookieToken) return reqCookieToken;

  return null;
}

function extractErrorMessage(body: any, status: number): string {
  if (!body) return `Nexo API error ${status}`;

  if (typeof body === "string" && body.trim()) return body;

  if (Array.isArray(body?.message)) return body.message.join(", ");

  if (typeof body?.message === "string") return body.message;

  if (typeof body?.error === "string") return body.error;

  if (typeof body?.data?.message === "string") return body.data.message;

  return `Nexo API error ${status}`;
}

function extractErrorCode(body: any): string | null {
  const code = body?.code ?? body?.data?.code ?? body?.errorCode;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export class NexoHttpError extends Error {
  status: number;
  body: any;

  constructor(status: number, body: any) {
    const message = extractErrorMessage(body, status);
    const code = extractErrorCode(body);
    super(code ? `${message} [${code}]` : message);
    this.name = "NexoHttpError";
    this.status = status;
    this.body = body;
  }
}

function mapNexoHttpErrorToTrpcError(error: NexoHttpError): TRPCError {
  if (error.status === 401) {
    return new TRPCError({ code: "UNAUTHORIZED", message: error.message, cause: error });
  }

  if (error.status === 403) {
    return new TRPCError({ code: "FORBIDDEN", message: error.message, cause: error });
  }

  if (error.status === 404) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message, cause: error });
  }

  if (error.status === 409) {
    return new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
  }

  if (error.status === 400) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
  }

  if (error.status === 429) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message, cause: error });
  }

  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message, cause: error });
}

async function requestNexo<T>(
  source: CtxLike | any,
  path: string,
  init: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const startedAt = Date.now();
  const token = resolveAuthToken(source);

  if (!token && requireAuth) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  }
  const timeoutMs =
    Number.isFinite(NEXO_FETCH_TIMEOUT_MS) && NEXO_FETCH_TIMEOUT_MS > 0
      ? NEXO_FETCH_TIMEOUT_MS
      : 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const upstreamSignal = init?.signal;

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason ?? "aborted");
    } else {
      upstreamSignal.addEventListener(
        "abort",
        () => controller.abort(upstreamSignal.reason ?? "aborted"),
        { once: true }
      );
    }
  }

  let res: Response;
  try {
    const requestId =
      source?.req?.headers?.["x-request-id"] ??
      source?.headers?.["x-request-id"] ??
      undefined;
    const correlationId =
      source?.req?.headers?.["x-correlation-id"] ??
      source?.headers?.["x-correlation-id"] ??
      requestId ??
      undefined;
    res = await fetch(`${NEXO_API_URL}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        ...(requestId ? { "x-request-id": String(requestId) } : {}),
        ...(correlationId ? { "x-correlation-id": String(correlationId) } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new TRPCError({
        code: "TIMEOUT",
        message: `Timeout ao chamar Nexo API (${timeoutMs}ms) em ${path}`,
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Falha ao conectar no backend Nexo API (${NEXO_API_URL}) em ${path}: ${error?.message || "erro desconhecido"}`,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  const durationMs = Date.now() - startedAt;

  if (process.env.NODE_ENV === "development") {
    console.log("[NEXO_FETCH]", {
      path,
      status: res.status,
      durationMs,
      ok: res.ok,
    });
  }

  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw mapNexoHttpErrorToTrpcError(new NexoHttpError(res.status, body));
  }

  return body as T;
}

export async function nexoFetch<T>(
  source: CtxLike | any,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestNexo<T>(source, path, init, true);
}

/** Shared transport for the API's intentionally anonymous auth endpoints. */
export async function nexoPublicFetch<T>(
  source: CtxLike | any,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestNexo<T>(source, path, init, false);
}

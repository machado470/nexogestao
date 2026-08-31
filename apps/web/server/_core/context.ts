import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import cookie from "cookie";
import { resolveNexoApiUrl } from "./nexoApiUrl";

const NEXO_TOKEN_COOKIE = "nexo_token";

export type TrpcUser = {
  token: string;
  validated: true;
  id?: string;
  organizationId?: string;
  role?: string;
  email?: string;
  name?: string;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: TrpcUser | null;
};

export type Context = TrpcContext;

class NexoBootstrapError extends Error {
  public readonly kind: "unavailable" | "upstream" | "malformed";

  constructor(message: string, kind: "unavailable" | "upstream" | "malformed") {
    super(message);
    this.name = "NexoBootstrapError";
    this.kind = kind;
  }
}

const LOG_SUPPRESSION_WINDOW_MS = Number(
  process.env.NEXO_ME_LOG_SUPPRESSION_MS || 10_000
);
const UNAVAILABLE_COOLDOWN_MS = Number(
  process.env.NEXO_ME_UNAVAILABLE_COOLDOWN_MS || 4_000
);
const pendingFetchByToken = new Map<string, Promise<TrpcUser | null>>();
const unavailableUntilByToken = new Map<string, number>();
const lastLogByKey = new Map<string, number>();

const validatedSessionCacheMsRaw = Number(
  process.env.NEXO_ME_VALIDATED_CACHE_MS || 10_000
);
const VALIDATED_SESSION_CACHE_MS =
  Number.isFinite(validatedSessionCacheMsRaw) &&
  validatedSessionCacheMsRaw >= 0
    ? validatedSessionCacheMsRaw
    : 10_000;

const validatedSessionByToken = new Map<
  string,
  { user: TrpcUser; expiresAt: number }
>();

export function resetNexoMeValidationStateForTests() {
  pendingFetchByToken.clear();
  unavailableUntilByToken.clear();
  validatedSessionByToken.clear();
  lastLogByKey.clear();
}

function logWithSuppression(
  key: string,
  level: "warn" | "error",
  message: string,
  payload: Record<string, unknown>
) {
  const now = Date.now();
  const previous = lastLogByKey.get(key) ?? 0;
  const suppressedCount = payload.suppressedCount;
  const basePayload = {
    ...payload,
    suppressedCount,
  };

  if (now - previous < LOG_SUPPRESSION_WINDOW_MS) {
    return;
  }

  lastLogByKey.set(key, now);
  if (level === "warn") {
    console.warn(message, basePayload);
    return;
  }
  console.error(message, basePayload);
}

function isConnectionUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as {
    name?: unknown;
    code?: unknown;
    cause?: { code?: unknown; name?: unknown; message?: unknown };
    message?: unknown;
  };
  const code =
    typeof maybe.code === "string"
      ? maybe.code
      : typeof maybe.cause?.code === "string"
        ? maybe.cause.code
        : "";
  const name =
    typeof maybe.name === "string"
      ? maybe.name
      : typeof maybe.cause?.name === "string"
        ? maybe.cause.name
        : "";
  const message =
    typeof maybe.message === "string"
      ? maybe.message
      : typeof maybe.cause?.message === "string"
        ? maybe.cause.message
        : "";

  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    name === "AbortError" ||
    message.toLowerCase().includes("fetch failed")
  );
}

export function getNexoTokenFromReq(req: any): string | null {
  const reqCookies = req?.cookies;
  if (reqCookies && typeof reqCookies?.[NEXO_TOKEN_COOKIE] === "string") {
    const token = reqCookies[NEXO_TOKEN_COOKIE].trim();
    if (token) return token;
  }

  const authHeader = req?.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.trim()) {
    const normalized = authHeader.trim();
    if (normalized.toLowerCase().startsWith("bearer ")) {
      const token = normalized.slice(7).trim();
      if (token) return token;
    } else {
      return normalized;
    }
  }

  const raw = req?.headers?.cookie;
  if (!raw || typeof raw !== "string") return null;

  const parsed = cookie.parse(raw);
  const token = parsed?.[NEXO_TOKEN_COOKIE];

  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function unwrapMePayload(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null;

  const level1 = payload;
  const level2 = isObject(level1.data) ? level1.data : null;
  const level3 = level2 && isObject(level2.data) ? level2.data : null;

  if (level3 && isObject(level3.user)) {
    return level3;
  }

  if (level2 && isObject(level2.user)) {
    return level2;
  }

  if (isObject(level1.user)) {
    return level1;
  }

  return level3 ?? level2 ?? level1;
}

function normalizeMePayload(payload: unknown): Omit<TrpcUser, "token" | "validated"> | null {
  const root = unwrapMePayload(payload);
  if (!root) {
    return null;
  }

  const rawUser = isObject(root.user) ? root.user : root;
  const rawPerson = isObject(rawUser.person) ? rawUser.person : null;
  const rawOrganization = isObject(root.organization)
    ? root.organization
    : null;

  const id = toOptionalString(rawUser.id);
  const organizationId =
    toOptionalString(rawUser.organizationId) ||
    toOptionalString(rawUser.orgId) ||
    toOptionalString(rawOrganization?.id);

  const role =
    toOptionalString(rawUser.role) || toOptionalString(rawPerson?.role);

  const email =
    toOptionalString(rawUser.email) || toOptionalString(rawPerson?.email);

  const name =
    toOptionalString(rawUser.name) || toOptionalString(rawPerson?.name);

  if (!id && !organizationId && !role && !email && !name) {
    return null;
  }

  return {
    id,
    organizationId,
    role,
    email,
    name,
  };
}

export { NexoBootstrapError };

export async function fetchNexoMe(req: any) {
  const token = getNexoTokenFromReq(req);
  if (!token) return null;

  const now = Date.now();

  const cached = validatedSessionByToken.get(token);
  if (cached) {
    if (now < cached.expiresAt) {
      return cached.user;
    }
    validatedSessionByToken.delete(token);
  }

  const unavailableUntil = unavailableUntilByToken.get(token) ?? 0;
  if (now < unavailableUntil) {
    logWithSuppression(
      `cooldown:${token}`,
      "warn",
      "[trpc/context] fetchNexoMe temporarily skipped after upstream connection failure",
      {
        remainingMs: unavailableUntil - now,
      }
    );
    throw new NexoBootstrapError(
      "Skipped /me during cooldown window",
      "unavailable"
    );
  }

  const pending = pendingFetchByToken.get(token);
  if (pending) return pending;

  const runner = (async () => {
    const NEXO_API_URL = resolveNexoApiUrl();
    const timeoutMs = Number(process.env.NEXO_ME_TIMEOUT_MS || 3500);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${NEXO_API_URL}/me`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await response.text();

      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }

      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }

        const errorKind = response.status >= 500 ? "upstream" : "malformed";
        logWithSuppression(
          `status:${response.status}`,
          "error",
          "[trpc/context] fetchNexoMe failed",
          {
            url: `${NEXO_API_URL}/me`,
            status: response.status,
            body,
            errorKind,
          }
        );
        throw new NexoBootstrapError(
          `Unexpected /me response status: ${response.status}`,
          errorKind
        );
      }

      const normalized = normalizeMePayload(body);
      if (!normalized) {
        logWithSuppression(
          "normalize",
          "error",
          "[trpc/context] fetchNexoMe normalize failed",
          {
            body,
          }
        );
        throw new NexoBootstrapError("Malformed /me payload", "malformed");
      }

      return {
        token,
        ...normalized,
        validated: true,
      } satisfies TrpcUser;
    } catch (error) {
      if (error instanceof NexoBootstrapError) {
        throw error;
      }

      if (isConnectionUnavailableError(error)) {
        unavailableUntilByToken.set(
          token,
          Date.now() + UNAVAILABLE_COOLDOWN_MS
        );
        logWithSuppression(
          "connection",
          "warn",
          "[trpc/context] fetchNexoMe upstream unavailable; refusing token-only auth context",
          {
            url: `${NEXO_API_URL}/me`,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    cause: (error as Error & { cause?: unknown }).cause,
                  }
                : String(error),
            cooldownMs: UNAVAILABLE_COOLDOWN_MS,
          }
        );
        throw new NexoBootstrapError(
          "Unable to reach /me upstream",
          "unavailable"
        );
      }

      logWithSuppression(
        "unexpected_exception",
        "error",
        "[trpc/context] fetchNexoMe unexpected exception",
        {
          url: `${NEXO_API_URL}/me`,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  cause: (error as Error & { cause?: unknown }).cause,
                }
              : String(error),
        }
      );
      throw new NexoBootstrapError(
        "Unable to bootstrap session from /me",
        "upstream"
      );
    } finally {
      clearTimeout(timeout);
    }
  })();

  pendingFetchByToken.set(token, runner);
  try {
    const result = await runner;

    if (result && VALIDATED_SESSION_CACHE_MS > 0) {
      validatedSessionByToken.set(token, {
        user: result,
        expiresAt: Date.now() + VALIDATED_SESSION_CACHE_MS,
      });
    }

    return result;
  } finally {
    pendingFetchByToken.delete(token);
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const token = getNexoTokenFromReq(opts.req);

  if (!token) {
    return {
      req: opts.req,
      res: opts.res,
      user: null,
    };
  }

  try {
    const me = await fetchNexoMe(opts.req);

    return {
      req: opts.req,
      res: opts.res,
      user: me,
    };
  } catch (error) {
    logWithSuppression(
      "context_validation_failed",
      error instanceof NexoBootstrapError && error.kind === "unavailable"
        ? "warn"
        : "error",
      "[trpc/context] createContext refused token-only auth context",
      {
        reason:
          error instanceof NexoBootstrapError ? error.kind : "unexpected_error",
      }
    );

    return {
      req: opts.req,
      res: opts.res,
      user: null,
    };
  }
}

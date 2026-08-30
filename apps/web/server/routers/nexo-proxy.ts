import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import cookie from "cookie";
import { getSessionCookieOptions } from "../_core/cookies";
import { resolveNexoApiUrl } from "../_core/nexoApiUrl";
import { unwrapNexoApiResponse } from "../_core/nexoEnvelope";

const NEXO_API_URL = resolveNexoApiUrl();
const NEXO_TOKEN_COOKIE = "nexo_token";
const NEXO_FETCH_TIMEOUT_MS = Number(process.env.NEXO_FETCH_TIMEOUT_MS || 12000);

type CtxLike = {
  req: any;
  res: any;
};

function getTokenFromCookie(ctx: CtxLike): string | null {
  const raw = ctx?.req?.headers?.cookie;
  if (!raw || typeof raw !== "string") return null;

  const parsed = cookie.parse(raw);
  const token = parsed?.[NEXO_TOKEN_COOKIE];
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

function getAuthHeader(ctx: CtxLike & { user?: { token?: string } | null }): string {
  const userToken = ctx?.user?.token;
  if (typeof userToken === "string" && userToken.trim()) {
    return `Bearer ${userToken.trim()}`;
  }

  const header = ctx?.req?.headers?.authorization;

  if (typeof header === "string" && header.trim().length > 0) {
    return header;
  }

  const cookieToken =
    typeof ctx?.req?.cookies?.[NEXO_TOKEN_COOKIE] === "string"
      ? ctx.req.cookies[NEXO_TOKEN_COOKIE].trim()
      : "";

  const token = cookieToken || getTokenFromCookie(ctx);

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  }

  return `Bearer ${token}`;
}

function setTokenCookie(ctx: CtxLike, token: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req);

  ctx.res.cookie(NEXO_TOKEN_COOKIE, token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function extractToken(result: any): string | null {
  return (
    result?.data?.data?.token ||
    result?.data?.token ||
    result?.token ||
    result?.accessToken ||
    result?.data?.accessToken ||
    null
  );
}

function toQueryString(input?: Record<string, unknown> | null): string {
  if (!input || typeof input !== "object") return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      Number.isNaN(value)
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      }
      continue;
    }

    params.append(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function nexoFetch(path: string, options: RequestInit = {}) {
  const url = `${NEXO_API_URL}${path}`;
  const timeoutMs = Number.isFinite(NEXO_FETCH_TIMEOUT_MS) && NEXO_FETCH_TIMEOUT_MS > 0
    ? NEXO_FETCH_TIMEOUT_MS
    : 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const upstreamSignal = options.signal;

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(
        upstreamSignal.reason ?? "aborted",
      );
    } else {
      upstreamSignal.addEventListener(
        "abort",
        () => controller.abort(upstreamSignal.reason ?? "aborted"),
        { once: true },
      );
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new TRPCError({
        code: "TIMEOUT",
        message: `Timeout ao chamar Nexo API (${timeoutMs}ms) em ${path}`,
      });
    }

    const reason = error?.message || "Falha de conexão";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Falha ao conectar no backend Nexo API (${NEXO_API_URL}) para ${path}. Verifique NEXO_API_URL e disponibilidade da API. Motivo: ${reason}`,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      body?.data?.message ||
      text ||
      `API error: ${response.status}`;

    const normalizedMessage = String(message);
    const errorCode =
      typeof body?.code === "string" && body.code.trim().length > 0
        ? body.code.trim()
        : typeof body?.data?.code === "string" && body.data.code.trim().length > 0
          ? body.data.code.trim()
        : null;
    const contextualMessage = errorCode
      ? `${normalizedMessage} [${errorCode}]`
      : normalizedMessage;

    console.error("[nexo-proxy] upstream request failed", {
      path,
      method: options.method || "GET",
      status: response.status,
      statusText: response.statusText,
      message: contextualMessage,
      body,
    });

    if (response.status === 401) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: contextualMessage });
    }

    if (response.status === 403) {
      throw new TRPCError({ code: "FORBIDDEN", message: contextualMessage });
    }

    if (response.status === 404) {
      throw new TRPCError({ code: "NOT_FOUND", message: contextualMessage });
    }

    if (response.status === 409) {
      throw new TRPCError({ code: "CONFLICT", message: contextualMessage });
    }

    if (response.status === 400) {
      throw new TRPCError({ code: "BAD_REQUEST", message: contextualMessage });
    }

    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: contextualMessage });
  }

  return body;
}

async function authedFetch(
  ctx: CtxLike,
  path: string,
  options: RequestInit = {}
) {
  const authHeader = getAuthHeader(ctx);

  const raw = await nexoFetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: authHeader,
    },
  });

  return unwrapNexoApiResponse<any>(raw);
}

async function authedGet(
  ctx: CtxLike,
  path: string,
  query?: Record<string, unknown>
) {
  return authedFetch(ctx, `${path}${toQueryString(query)}`);
}

async function authedPost(
  ctx: CtxLike,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  return authedFetch(ctx, path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

async function authedPatch(ctx: CtxLike, path: string, body?: unknown) {
  return authedFetch(ctx, path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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

const anyInput = z.any().optional();
const serviceOrderListInput = z.object({
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
  customerId: z.string().optional(), assignedToPersonId: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(),
  page: z.number().int().positive().optional(), limit: z.number().int().positive().optional(), search: z.string().optional(),
}).optional();

const operationalActionType = z.enum(["RETRY_WHATSAPP_MESSAGE", "SEND_PAYMENT_REMINDER", "RECALCULATE_RISK", "RUN_GOVERNANCE_CHECK"]);
const operationalActionInput = z.object({
  actionType: operationalActionType,
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  sourceSignalId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
const operationalResult = z.object({ actionType: operationalActionType, status: z.enum(["REQUESTED", "EXECUTING", "EXECUTED", "FAILED", "CANCELED"]) }).passthrough();
const queueStatus = z.object({ queue: z.string(), waiting: z.number(), active: z.number(), completed: z.number(), failed: z.number(), delayed: z.number(), degraded: z.boolean(), degradedReasons: z.array(z.string()) });
const dlqStatus = z.object({ queue: z.string(), backlog: z.number(), failed: z.number(), lastFailureAt: z.string().nullable() });
const incident = z.object({ id: z.string(), severity: z.enum(["INFO", "WARNING", "CRITICAL"]), code: z.string(), title: z.string(), description: z.string(), source: z.string(), createdAt: z.string() });
const operationsSummary = z.object({
  status: z.enum(["ok", "degraded"]), degradedReasons: z.array(z.string()),
  metrics: z.object({ retries: z.number(), failedJobs: z.number(), failedWebhooks: z.number() }),
  queues: z.array(queueStatus), dlq: z.array(dlqStatus),
  recoveryActions: z.array(z.object({ id: z.string(), label: z.string(), method: z.literal("POST"), available: z.boolean() }).passthrough()),
}).passthrough();

const customerCreateInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
});

const customerUpdateInput = customerCreateInput
  .partial()
  .extend({
    id: z.string().min(1),
    active: z.boolean().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  });

const appointmentCreateInput = z.object({
  customerId: z.string().min(1),
  assignedToPersonId: z.string().min(1).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
});

const appointmentUpdateInput = z.object({
  id: z.string().min(1),
  assignedToPersonId: z.string().nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

const serviceOrderCreateInput = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: z.string().optional(),
  appointmentId: z.string().optional(),
  assignedToPersonId: z.string().optional(),
  amountCents: z.number().int().min(1).optional(),
  dueDate: z.string().optional(),
});

const serviceOrderUpdateInput = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  scheduledFor: z.string().optional(),
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]).optional(),
  assignedToPersonId: z.string().nullable().optional(),
  amountCents: z.number().int().min(1).optional(),
  dueDate: z.string().optional(),
  cancellationReason: z.string().optional(),
  outcomeSummary: z.string().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});


const whatsappWebhookEventListInput = z.object({
  orgId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED']).optional(),
  traceId: z.string().min(1).optional(),
  providerMessageId: z.string().min(1).optional(),
  createdAtFrom: z.string().min(1).optional(),
  createdAtTo: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const whatsappWebhookReplayInput = z.object({
  ids: z.array(z.string().min(1)).optional(),
  force: z.boolean().optional(),
});

function normalizeWebhookEventResponse(payload: any) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload.items)) {
    return {
      items: payload.items.map((item: any) => ({ ...item, payloadMetadata: item.payloadMetadata ?? item.rawPayloadMetadata ?? null })),
      nextCursor: payload.nextCursor ?? null,
    };
  }
  return { ...payload, payloadMetadata: payload.payloadMetadata ?? payload.rawPayloadMetadata ?? null };
}

const whatsappSendInput = z.object({
  customerId: z.string().min(1),
  content: z.string().min(1),
  toPhone: z.string().optional(),
  receiverNumber: z.string().optional(),
  entityType: z.enum(["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT", "GENERAL"]).optional(),
  entityId: z.string().optional(),
  messageType: z
    .enum([
      "APPOINTMENT_CONFIRMATION",
      "SERVICE_UPDATE",
      "PAYMENT_REMINDER",
      "PAYMENT_CONFIRMATION",
      "CUSTOMER_NOTIFICATION",
      "MANUAL",
      "PAYMENT_LINK",
      "APPOINTMENT_REMINDER",
      "PAYMENT_CONFIRMATION",
      "EXECUTION_CONFIRMATION",
    ])
    .optional(),
  idempotencyKey: z.string().min(8).optional(),
  chargeId: z.string().optional(),
  serviceOrderId: z.string().optional(),
});

export const nexoProxyRouter = router({
  operations: router({
    summary: protectedProcedure.output(operationsSummary).query(({ ctx }) => authedGet(ctx as CtxLike, "/internal/operations/summary")),
    incidents: protectedProcedure.output(z.array(incident)).query(({ ctx }) => authedGet(ctx as CtxLike, "/internal/operations/incidents")),
    queues: protectedProcedure.output(z.array(queueStatus)).query(({ ctx }) => authedGet(ctx as CtxLike, "/internal/operations/queues")),
    dlq: protectedProcedure.output(z.array(dlqStatus)).query(({ ctx }) => authedGet(ctx as CtxLike, "/internal/operations/dlq")),
    diagnostics: protectedProcedure.query(({ ctx }) => authedGet(ctx as CtxLike, "/internal/operational-actions/diagnostics")),
    requestAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as CtxLike, "/internal/operational-actions/request", input)),
    executeAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as CtxLike, "/internal/operational-actions/execute", input)),
    cancelAction: protectedProcedure.input(operationalActionInput).output(operationalResult).mutation(({ ctx, input }) => authedPost(ctx as CtxLike, "/internal/operational-actions/cancel", input)),
    recoverAction: protectedProcedure.input(z.object({ executionId: z.string().min(1), recoveryReason: z.string().optional() }).strict()).mutation(({ ctx, input }) => authedPost(ctx as CtxLike, "/internal/operational-actions/recover-stuck", input)),
    webhookDeliveries: protectedProcedure.input(z.object({ status: z.enum(["PENDING", "PROCESSING", "SUCCESS", "FAILED"]).optional(), limit: z.number().int().min(1).max(100).optional() }).strict().optional()).query(({ ctx, input }) => authedGet(ctx as CtxLike, "/webhooks/deliveries", input ?? {})),
    replayWebhook: protectedProcedure.input(z.object({ deliveryId: z.string().min(1) }).strict()).mutation(({ ctx, input }) => authedPost(ctx as CtxLike, `/webhooks/deliveries/${input.deliveryId}/replay`)),
  }),
  auth: router({
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(6),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await nexoFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify(input),
        });

        const token = extractToken(result);

        if (!token) {
          throw new Error("Login não retornou token.");
        }

        console.info("[auth.login] session established");
        setTokenCookie(ctx as CtxLike, token);

        return result;
      }),

    register: publicProcedure
      .input(
        z.object({
          orgName: z.string(),
          adminName: z.string(),
          email: z.string().email(),
          password: z.string().min(8),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await nexoFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
        });

        const token = extractToken(result);

        if (token) {
          setTokenCookie(ctx as CtxLike, token);
        }

        return result;
      }),

    forgotPassword: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
        })
      )
      .mutation(async ({ input }) => {
        return nexoFetch("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify(input),
        });
      }),

    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string(),
          password: z.string().min(8),
        })
      )
      .mutation(async ({ input }) => {
        return nexoFetch("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify(input),
        });
      }),

    acceptInvite: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          token: z.string().min(1),
          name: z.string().trim().min(2),
          password: z.string().min(8),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await nexoFetch("/auth/accept-invite", {
          method: "POST",
          body: JSON.stringify(input),
        });

        const token = extractToken(result);
        if (token) {
          setTokenCookie(ctx as CtxLike, token);
        }

        return result;
      }),

    establishSession: publicProcedure
      .input(
        z.object({
          token: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const rawToken = input.token.trim();
        setTokenCookie(ctx as CtxLike, rawToken);

        try {
          const result = await nexoFetch("/me", {
            headers: {
              Authorization: `Bearer ${rawToken}`,
            },
          });

          return {
            success: true,
            validated: true,
            token: rawToken,
            me: result,
          };
        } catch (error) {
          console.warn("[auth.establishSession] sessão não validada por /me", {
            reason: error instanceof Error ? error.message : String(error),
          });

          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.clearCookie("nexo_token", cookieOptions);

          return {
            success: false,
            validated: false,
            validationStatus: "failed" as const,
            me: null,
          };
        }
      }),

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input }) => {
        return nexoFetch("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify(input),
        });
      }),

    resendEmailVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        return nexoFetch("/auth/resend-email-verification", {
          method: "POST",
          body: JSON.stringify(input),
        });
      }),
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const raw = await authedGet(ctx as CtxLike, "/me");
    return normalizeMeForProfile(raw);
  }),

  customers: router({
    list: protectedProcedure.input(anyInput).query(async ({ ctx, input }) => {
      return authedGet(ctx as CtxLike, "/customers", input);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/customers/${input.id}`);
      }),

    workspace: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/customers/${input.id}/workspace`);
      }),

    create: protectedProcedure.input(customerCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as CtxLike, "/customers", input);
    }),

    update: protectedProcedure.input(customerUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID do cliente é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      return authedPatch(ctx as CtxLike, `/customers/${id}`, payload);
    }),
  }),

  appointments: router({
    list: protectedProcedure.input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELED", "DONE", "NO_SHOW"]).optional(),
      customerId: z.string().optional(),
      assignedToPersonId: z.string().optional(),
      page: z.number().int().positive().optional(),
      limit: z.number().int().positive().optional(),
      search: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return authedGet(ctx as CtxLike, "/appointments", input);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/appointments/${input.id}`);
      }),

    create: protectedProcedure.input(appointmentCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as CtxLike, "/appointments", input);
    }),

    update: protectedProcedure.input(appointmentUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID do agendamento é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      const updatePayload = { ...payload };

      if (!updatePayload.expectedUpdatedAt) {
        const current = await authedGet(ctx as CtxLike, `/appointments/${id}`) as { updatedAt?: string | null };
        if (!current?.updatedAt) {
          throw new Error("Não foi possível obter a versão atual do agendamento.");
        }
        updatePayload.expectedUpdatedAt = current.updatedAt;
      }

      return authedPatch(ctx as CtxLike, `/appointments/${id}`, updatePayload);
    }),
  }),

  serviceOrders: router({
    list: protectedProcedure.input(serviceOrderListInput).query(async ({ ctx, input }) => {
      return authedGet(ctx as CtxLike, "/service-orders", input);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/service-orders/${input.id}`);
      }),

    create: protectedProcedure.input(serviceOrderCreateInput).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as CtxLike, "/service-orders", input);
    }),

    update: protectedProcedure.input(serviceOrderUpdateInput).mutation(async ({ ctx, input }) => {
      const id = input?.id;
      if (!id || typeof id !== "string") {
        throw new Error("ID da ordem de serviço é obrigatório.");
      }

      const { id: _id, ...payload } = input ?? {};
      return authedPatch(ctx as CtxLike, `/service-orders/${id}`, payload);
    }),

    generateCharge: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return authedPost(
          ctx as CtxLike,
          `/service-orders/${input.id}/generate-charge`
        );
      }),
  }),

  timeline: router({
    listByOrg: protectedProcedure
      .input(z.object({ limit: z.number().optional(), action: z.string().optional(), cursor: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/timeline`, input ?? {});
      }),

    listByCustomer: protectedProcedure
      .input(z.object({ customerId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { customerId, ...query } = input;
        return authedGet(
          ctx as CtxLike,
          `/timeline/customers/${customerId}`,
          query
        );
      }),

    listByServiceOrder: protectedProcedure
      .input(z.object({ serviceOrderId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { serviceOrderId, ...query } = input;
        return authedGet(
          ctx as CtxLike,
          `/timeline/service-orders/${serviceOrderId}`,
          query
        );
      }),
  }),

  executions: router({
    listByServiceOrder: protectedProcedure
      .input(z.object({ serviceOrderId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { serviceOrderId, ...query } = input;
        return authedGet(
          ctx as CtxLike,
          `/executions/service-order/${serviceOrderId}`,
          query
        );
      }),

    start: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as CtxLike, "/executions/start", input);
    }),

    complete: protectedProcedure
      .input(
        z.object({
          executionId: z.string().min(1),
          notes: z.string().optional(),
          checklist: z.array(z.any()).optional(),
          attachments: z.array(z.any()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = input.executionId;
        if (!id || typeof id !== "string") {
          throw new Error("ID da execução é obrigatório.");
        }

        const { executionId: _executionId, ...payload } = input ?? {};
        return authedPost(ctx as CtxLike, `/executions/${id}/complete`, payload);
      }),

    mode: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as CtxLike, "/executions/mode");
    }),

    updateMode: protectedProcedure
      .input(
        z.object({
          mode: z.enum(["manual", "semi_automatic", "automatic"]).optional(),
          resetToDefault: z.boolean().optional(),
          policy: z
            .object({
              allowAutomaticCharge: z.boolean().optional(),
              allowWhatsAppAuto: z.boolean().optional(),
              allowOverdueReminderAuto: z.boolean().optional(),
              allowFinanceTeamNotifications: z.boolean().optional(),
              allowGovernanceFollowup: z.boolean().optional(),
              allowChargeFollowupCreation: z.boolean().optional(),
              allowRiskReviewEscalation: z.boolean().optional(),
              maxRetries: z.number().int().min(0).optional(),
              throttleWindowMs: z.number().int().min(5000).optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return authedPost(ctx as CtxLike, "/executions/mode", input);
      }),

    stateSummary: protectedProcedure
      .input(z.object({ sinceMs: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/executions/state-summary", input ?? {});
      }),

    events: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            status: z.string().optional(),
            actionId: z.string().optional(),
            entityType: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/executions/events", input ?? {});
      }),

    recent: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/executions/recent", input ?? {});
      }),

    modeHistory: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/executions/mode-history", input ?? {});
      }),

    runOnce: protectedProcedure.mutation(async ({ ctx }) => {
      return authedPost(ctx as CtxLike, "/executions/runner/run-once");
    }),
  }),

  whatsapp: router({
    listConversations: protectedProcedure.input(anyInput).query(async ({ ctx, input }) => {
      return authedGet(ctx as CtxLike, '/whatsapp/conversations', input ?? {});
    }),

    getConversation: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/conversations/${input.id}`)),

    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/conversations/${input.conversationId}/messages`)),

    getContext: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/conversations/${input.conversationId}/context`)),

    getIntelligence: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/conversations/${input.conversationId}/intelligence`)),

    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
        content: z.string().min(1),
        toPhone: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        messageType: z.string().optional(),
      }).refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.conversationId) {
          return authedPost(ctx as CtxLike, `/whatsapp/conversations/${input.conversationId}/messages`, input)
        }
        return authedPost(ctx as CtxLike, '/whatsapp/messages', input)
      }),

    sendTemplate: protectedProcedure
      .input(z.object({ templateKey: z.string().min(1), customerId: z.string().optional(), conversationId: z.string().optional(), context: z.record(z.string(), z.any()).optional(), toPhone: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(), messageType: z.string().optional() }).refine((value) => Boolean(value.conversationId || value.customerId), {
        message: 'conversationId ou customerId é obrigatório',
      }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, '/whatsapp/messages/template', input)),

    retryMessage: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/messages/${input.id}/retry`)),

    updateConversationStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1), status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'FAILED']) }))
      .mutation(async ({ ctx, input }) => authedPatch(ctx as CtxLike, `/whatsapp/conversations/${input.id}/status`, { status: input.status })),

    health: protectedProcedure.query(async ({ ctx }) => authedGet(ctx as CtxLike, '/whatsapp/health')),

    listPendingApprovals: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, '/whatsapp/action-executions/pending', input ?? {})),

    listExecutionHistory: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1).optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, '/whatsapp/action-executions/history', input ?? {})),

    getExecutionStatus: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/action-executions/${input.id}`)),

    requestExecution: protectedProcedure
      .input(z.object({ conversationId: z.string().min(1), suggestedAction: z.enum(['SEND_PAYMENT_LINK', 'CONFIRM_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'SEND_SERVICE_UPDATE', 'ESCALATE_TO_OPERATOR', 'MARK_RESOLVED', 'REPLY_WITH_TEMPLATE']), executionReason: z.string().optional(), actionPayload: z.record(z.string(), z.any()).optional(), idempotencyKey: z.string().optional(), autoExecuteSafe: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/conversations/${input.conversationId}/actions`, input)),

    approveExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/action-executions/${input.id}/approve`, { reason: input.reason })),

    executeExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/action-executions/${input.id}/execute`, { reason: input.reason })),

    cancelExecution: protectedProcedure
      .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/action-executions/${input.id}/cancel`, { reason: input.reason })),


    listWebhookEvents: protectedProcedure
      .input(whatsappWebhookEventListInput.optional())
      .query(async ({ ctx, input }) => normalizeWebhookEventResponse(await authedGet(ctx as CtxLike, '/whatsapp/webhook-events', input ?? {}))),

    getWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1), orgId: z.string().min(1).optional() }))
      .query(async ({ ctx, input }) => normalizeWebhookEventResponse(await authedGet(ctx as CtxLike, `/whatsapp/webhook-events/${input.id}`, input.orgId ? { orgId: input.orgId } : {}))),

    replayWebhookEvent: protectedProcedure
      .input(z.object({ id: z.string().min(1), force: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, `/whatsapp/webhook-events/${input.id}/replay`, { force: input.force })),

    replayWebhookEvents: protectedProcedure
      .input(whatsappWebhookReplayInput)
      .mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, '/whatsapp/webhook-events/replay', input)),

    webhookDlqStats: protectedProcedure
      .input(z.object({ orgId: z.string().min(1).optional() }).optional())
      .query(async ({ ctx, input }) => authedGet(ctx as CtxLike, '/whatsapp/webhook-events/dlq/stats', input ?? {})),


    // backward compatibility
    conversations: protectedProcedure.query(async ({ ctx }) => authedGet(ctx as CtxLike, '/whatsapp/conversations')),
    messagesFeed: protectedProcedure.input(z.object({ customerId: z.string(), cursor: z.string().optional(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => authedGet(ctx as CtxLike, `/whatsapp/messages/${input.customerId}`, { cursor: input.cursor, limit: input.limit })),
    messages: protectedProcedure.input(z.object({ customerId: z.string(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => {
      const payload = await authedGet(ctx as CtxLike, `/whatsapp/messages/${input.customerId}`, { limit: input.limit ?? 50 })
      return Array.isArray(payload) ? payload : (payload as any)?.items ?? []
    }),
    send: protectedProcedure.input(whatsappSendInput).mutation(async ({ ctx, input }) => authedPost(ctx as CtxLike, '/whatsapp/messages', input, input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined)),
  }),

  demo: router({
    bootstrapLive: protectedProcedure
      .input(z.object({}).optional())
      .mutation(async ({ ctx }) => {
        try {
          return await authedPost(ctx as CtxLike, "/demo/bootstrap/live");
        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              error?.message ||
              `Falha ao iniciar bootstrap live. Verifique NEXO_API_URL (${NEXO_API_URL}) e permissões do usuário.`,
          });
        }
      }),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as CtxLike, "/organization-settings");
    }),

    administrativeSummary: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as CtxLike, "/organization-settings/administrative-summary");
    }),

    update: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          timezone: z.string().optional(),
          currency: z.enum(["BRL", "USD", "EUR"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return authedPatch(ctx as CtxLike, "/organization-settings", input);
      }),
  }),

  onboarding: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as CtxLike, "/onboarding/status");
    }),

    completeStep: protectedProcedure
      .input(z.object({ step: z.string().min(1), payload: z.any().optional() }))
      .mutation(async ({ ctx, input }) => {
        return authedPost(ctx as CtxLike, "/onboarding/complete-step", input);
      }),

    complete: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as CtxLike, "/onboarding/complete", input);
    }),
  }),

  invites: router({
    invite: protectedProcedure
      .input(
        z.object({
          email: z.string().email(),
          role: z.enum(["ADMIN", "MANAGER", "STAFF", "VIEWER"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return authedPost(ctx as CtxLike, "/auth/invite", input);
      }),

    members: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as CtxLike, "/auth/organization/members");
    }),
  }),

  globalSearch: router({
    search: protectedProcedure
      .input(
        z.object({
          query: z.string().optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const query = String(input?.query ?? "").trim();

        const [customers, serviceOrders] = await Promise.all([
          authedGet(ctx as CtxLike, "/customers", query ? { search: query } : {}),
          authedGet(
            ctx as CtxLike,
            "/service-orders",
            query ? { search: query } : {}
          ),
        ]);

        return {
          ok: true,
          data: {
            query,
            customers,
            serviceOrders,
          },
        };
      }),
  }),

  audit: router({
    listEvents: protectedProcedure
      .input(
        z.object({
          page: z.number().optional(),
          limit: z.number().optional(),
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          action: z.string().optional(),
          actorPersonId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/audit/events", input);
      }),

    getSummary: protectedProcedure
      .input(
        z.object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, "/audit/summary", input);
      }),
  }),

  risk: router({
    explainPerson: protectedProcedure
      .input(z.object({ personId: z.string() }))
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as CtxLike, `/risk/explain/person/${input.personId}`);
      }),
  }),
});

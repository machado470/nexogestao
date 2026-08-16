import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { nexoFetch } from "../_core/nexoClient";
import {
  countUnreadOperationalNotifications,
  listOperationalNotifications,
  markNotificationAsRead,
} from "../_core/operationalNotifications";

const operationalStateSchema = z.object({
  operationalState: z.enum([
    "NORMAL",
    "WARNING",
    "RESTRICTED",
    "SUSPENDED",
    "UNKNOWN",
  ]),
  source: z.enum([
    "GOVERNANCE_RUN",
    "RISK_ENGINE",
    "PERSISTED_OPERATIONAL_STATE",
    "NO_DATA",
    "UNAVAILABLE",
  ]),
  evidenceAt: z.union([z.string(), z.date()]).nullable(),
  availability: z.enum(["AVAILABLE", "NO_DATA", "UNAVAILABLE"]),
  reason: z.string().nullable(),
  evaluatedRecords: z.number().int().nonnegative(),
});

const operationalSignalSchema = z.object({
  id: z.string(),
  severity: z.enum(["CRITICAL", "WARNING", "INFO"]),
  area: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  impact: z.string().optional(),
  suggestedAction: z.string().optional(),
  serviceOrderId: z.string().nullable().optional(),
  chargeId: z.string().nullable().optional(),
  messageId: z.string().nullable().optional(),
}).passthrough();

const nextBestActionSchema = z.object({
  signalId: z.string(),
  actionType: z.string(),
  title: z.string(),
  reason: z.string(),
  impact: z.string(),
  suggestedAction: z.string(),
  area: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  serviceOrderId: z.string().nullable(),
  chargeId: z.string().nullable(),
  messageId: z.string().nullable(),
  routeHint: z.string().startsWith("/"),
  source: z.string(),
  detectedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const dashboardRouter = router({
  status: protectedProcedure.query(async () => ({
    ok: true,
    message: "Dashboard router ativo",
  })),

  notifications: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).default(20),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.organizationId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sessão sem organização" });
      }
      const result = await listOperationalNotifications(ctx, { limit: input?.limit ?? 20 });
      return result.items;
    }),

  notificationCenter: router({
    list: protectedProcedure
      .input(
        z
          .object({
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(50).default(10),
            category: z
              .enum(["all", "appointments", "finance", "risk"])
              .default("all"),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.organizationId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sessão sem organização" });
        }
        return listOperationalNotifications(ctx, {
          page: input?.page ?? 1,
          limit: input?.limit ?? 10,
          category: input?.category ?? "all",
        });
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.organizationId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sessão sem organização" });
      }
      return countUnreadOperationalNotifications(ctx);
    }),

    markAsRead: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.organizationId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sessão sem organização" });
        }
        return markNotificationAsRead(ctx, input.id);
      }),
  }),

  kpis: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, `/dashboard/metrics`, {
      method: "GET",
    });
    return raw?.data ?? raw ?? {};
  }),

  alerts: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, `/dashboard/alerts`, {
      method: "GET",
    });
    return raw?.data ?? raw ?? {};
  }),

  operationalState: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, "/governance/operational-state", {
      method: "GET",
    });
    return operationalStateSchema.parse(raw?.data ?? raw);
  }),

  operationalSignals: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(8) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 8;
      const raw = await nexoFetch<any>(
        ctx,
        `/internal/operational-signals?limit=${limit}`,
        { method: "GET" }
      );
      return z.object({
        generatedAt: z.string(),
        totalSignals: z.number().int().nonnegative(),
        signals: z.array(operationalSignalSchema),
      }).passthrough().parse(raw?.data ?? raw);
    }),

  nextBestAction: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(
      ctx,
      "/internal/operational-signals/next-best-action",
      { method: "GET" }
    );
    const payload = raw?.data ?? raw;
    return payload === null ? null : nextBestActionSchema.parse(payload);
  }),

  revenueTrend: protectedProcedure.query(async ({ ctx }) => {
    try {
      const raw = await nexoFetch<any>(ctx.req, `/dashboard/revenue`, {
        method: "GET",
      });
      return raw?.data ?? raw ?? [];
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  }),

  customerGrowth: protectedProcedure.query(async ({ ctx }) => {
    try {
      const raw = await nexoFetch<any>(ctx.req, `/dashboard/growth`, {
        method: "GET",
      });
      return raw?.data ?? raw ?? [];
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  }),

  appointmentDistribution: protectedProcedure.query(async () => {
    return [] as Array<Record<string, unknown>>;
  }),

  chargeDistribution: protectedProcedure.query(async ({ ctx }) => {
    try {
      const raw = await nexoFetch<any>(ctx.req, `/dashboard/charges-status`, {
        method: "GET",
      });
      return raw?.data ?? raw ?? [];
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  }),

  serviceOrdersStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const raw = await nexoFetch<any>(
        ctx.req,
        `/dashboard/service-orders-status`,
        {
          method: "GET",
        }
      );
      return raw?.data ?? raw ?? [];
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  }),

  performanceMetrics: protectedProcedure.query(async () => {
    return [] as Array<Record<string, unknown>>;
  }),
});

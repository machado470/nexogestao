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
  dashboardState: z.enum(["EMPTY", "HEALTHY", "ATTENTION", "CRITICAL"]),
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

const operationalSignalSchema = z
  .object({
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
  })
  .passthrough();

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

const nonnegativeInteger = z.number().int().nonnegative();
const nullableDate = z.string().nullable();
const executivePipelineSchema = z
  .object({
    generatedAt: z.string().datetime(),
    stages: z.array(
      z.object({
        key: z.enum(["customers", "appointments", "service-orders", "charges", "payments"]),
        label: z.string(),
        state: z.enum(["done", "active", "warning", "blocked", "idle", "unavailable"]),
        volume: nonnegativeInteger,
        reason: z.string().min(1),
        evidence: z.object({
          source: z.enum(["CUSTOMER", "APPOINTMENT", "SERVICE_ORDER", "CHARGE", "PAYMENT"]),
          description: z.string().min(1),
        }).strict(),
        referenceTimestamp: z.string().datetime().nullable(),
        navigationTarget: z.string().startsWith("/"),
      }).strict()
    ).length(5),
  })
  .strict()
  .superRefine((contract, ctx) => {
    const expected = ["customers", "appointments", "service-orders", "charges", "payments"];
    contract.stages.forEach((stage, index) => {
      if (stage.key !== expected[index]) ctx.addIssue({ code: "custom", path: ["stages", index, "key"], message: "Ordem canônica do pipeline inválida" });
    });
  });
const customerSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

const dashboardMetricsSchema = z
  .object({
    totalCustomers: nonnegativeInteger,
    createdCustomers: nonnegativeInteger,
    totalServiceOrders: nonnegativeInteger,
    openServiceOrders: nonnegativeInteger,
    overdueServiceOrders: nonnegativeInteger,
    weeklyRevenueInCents: nonnegativeInteger,
    paymentsReceivedCount: nonnegativeInteger,
    comparison: z
      .object({
        revenueReceivedPct: z.number().nullable(),
        completedServiceOrdersPct: z.number().nullable(),
        overdueChargesPct: z.number().nullable(),
        failedMessagesPct: z.number().nullable(),
      })
      .strict(),
    pendingPaymentsInCents: nonnegativeInteger,
    inProgressOrders: nonnegativeInteger,
    completedOrders: nonnegativeInteger,
    completedServices: nonnegativeInteger,
    chargesGenerated: nonnegativeInteger,
    delayedOrders: nonnegativeInteger,
    riskTickets: nonnegativeInteger,
    totalRevenueInCents: nonnegativeInteger,
    paidRevenueInCents: nonnegativeInteger,
    pendingRevenueInCents: nonnegativeInteger,
    governance: z
      .object({
        score: z.number().nullable(),
        level: z.enum(["A", "B", "C", "D", "E"]).nullable(),
        lastUpdated: nullableDate,
        source: z.enum(["GOVERNANCE_RUN", "RISK_ENGINE", "NO_DATA"]),
        availability: z.enum(["AVAILABLE", "NO_DATA"]),
        reason: z.string().nullable(),
        factors: z.array(
          z
            .object({
              name: z.string(),
              value: z.number().nullable(),
              reference: z.string(),
            })
            .strict()
        ),
      })
      .strict(),
    whatsappSignals: z
      .object({
        failedMessages: nonnegativeInteger,
        customersNoResponse: nonnegativeInteger,
        ignoredCharges: nonnegativeInteger,
      })
      .strict(),
  })
  .strict();

const dashboardAlertsSchema = z
  .object({
    operationalQueue: z.array(
      z
        .object({
          id: z.string(),
          type: z.enum([
            "OVERDUE_SERVICE_ORDER",
            "OVERDUE_CHARGE",
            "FAILED_MESSAGE",
            "CUSTOMER_AWAITING_RESPONSE",
            "UNCONFIRMED_APPOINTMENT",
          ]),
          title: z.string(),
          context: z.string(),
          serviceOrderId: z.string().optional(),
          chargeId: z.string().optional(),
          amountCents: nonnegativeInteger.optional(),
          messageId: z.string().optional(),
          customerId: z.string().optional(),
          conversationId: z.string().optional(),
          lastMessageAt: nullableDate.optional(),
          appointmentId: z.string().optional(),
          startsAt: z.string().optional(),
        })
        .strict()
    ),
    overdueOrders: z
      .object({
        count: nonnegativeInteger,
        items: z.array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              dueDate: nullableDate,
              status: z.string(),
              customer: customerSummarySchema,
            })
            .strict()
        ),
      })
      .strict(),
    overdueCharges: z
      .object({
        count: nonnegativeInteger,
        totalAmountCents: nonnegativeInteger,
        items: z.array(
          z
            .object({
              id: z.string(),
              amountCents: nonnegativeInteger,
              dueDate: nullableDate,
              status: z.string(),
              customer: customerSummarySchema,
              serviceOrderId: z.string().nullable(),
            })
            .strict()
        ),
      })
      .strict(),
    todayServices: z
      .object({
        count: nonnegativeInteger,
        items: z.array(
          z
            .object({
              id: z.string(),
              startsAt: z.string(),
              endsAt: z.string(),
              status: z.string(),
              notes: z.string().nullable(),
              customer: customerSummarySchema,
              label: z.string(),
            })
            .strict()
        ),
      })
      .strict(),
    customersWithPending: z
      .object({
        count: nonnegativeInteger,
        items: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              phone: z.string(),
              pendingCharges: nonnegativeInteger,
              totalPendingCents: nonnegativeInteger,
            })
            .strict()
        ),
      })
      .strict(),
    doneOrdersWithoutCharge: z
      .object({
        count: nonnegativeInteger,
        totalAmountCents: nonnegativeInteger,
        items: z.array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              amountCents: nonnegativeInteger,
              scheduledFor: nullableDate,
              finishedAt: nullableDate,
              createdAt: z.string(),
              daysWithoutCharge: nonnegativeInteger,
              customer: customerSummarySchema,
            })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();

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
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Sessão sem organização",
        });
      }
      const result = await listOperationalNotifications(ctx, {
        limit: input?.limit ?? 20,
      });
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
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Sessão sem organização",
          });
        }
        return listOperationalNotifications(ctx, {
          page: input?.page ?? 1,
          limit: input?.limit ?? 10,
          category: input?.category ?? "all",
        });
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.organizationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Sessão sem organização",
        });
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
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Sessão sem organização",
          });
        }
        return markNotificationAsRead(ctx, input.id);
      }),
  }),

  kpis: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<unknown>(ctx, `/dashboard/metrics`, {
      method: "GET",
    });
    return dashboardMetricsSchema.parse(raw);
  }),

  alerts: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<unknown>(ctx, `/dashboard/alerts`, {
      method: "GET",
    });
    return dashboardAlertsSchema.parse(raw);
  }),

  executivePipeline: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<unknown>(ctx, `/dashboard/executive-pipeline`, {
      method: "GET",
    });
    return executivePipelineSchema.parse(raw);
  }),

  operationalState: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, "/governance/operational-state", {
      method: "GET",
    });
    return operationalStateSchema.parse(raw?.data ?? raw);
  }),

  operationalSignals: protectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(50).default(8) }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 8;
      const raw = await nexoFetch<any>(
        ctx,
        `/internal/operational-signals?limit=${limit}`,
        { method: "GET" }
      );
      return z
        .object({
        generatedAt: z.string(),
        totalSignals: z.number().int().nonnegative(),
        signals: z.array(operationalSignalSchema),
        })
        .passthrough()
        .parse(raw?.data ?? raw);
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
});

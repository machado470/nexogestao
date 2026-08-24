import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { nexoFetch } from "../_core/nexoClient";

const governanceTrendItemSchema = z.object({
  createdAt: z.string().datetime(),
  institutionalRiskScore: z.number().int().nonnegative(),
  evaluated: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  correctives: z.number().int().nonnegative(),
  restrictedCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  openCorrectivesCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
}).passthrough();

const governanceSummarySchema = z.object({
  lastRunAt: z.string().datetime().nullable(),
  evaluated: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  correctives: z.number().int().nonnegative(),
  institutionalRiskScore: z.number().int().nonnegative(),
  restrictedCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  openCorrectivesCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  trend: z.array(governanceTrendItemSchema),
}).passthrough();

const governanceRunSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  evaluated: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  correctives: z.number().int().nonnegative(),
  institutionalRiskScore: z.number().int().nonnegative(),
  restrictedCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  openCorrectivesCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  bucket: z.string(),
}).passthrough();

export const governanceRouter = router({
  status: protectedProcedure.query(async () => ({
    ok: true,
    message: "Governance router ativo",
  })),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<unknown>(ctx.req, "/governance/summary", {
      method: "GET",
    });

    return governanceSummarySchema.parse(
      (raw as any)?.data ?? raw
    );
  }),

  latestRun: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/governance/runs/latest", {
      method: "GET",
    });

    return raw?.data ?? raw ?? null;
  }),

  runs: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 20;

      const raw = await nexoFetch<unknown>(
        ctx.req,
        `/governance/runs?limit=${limit}`,
        { method: "GET" }
      );

      return z.array(governanceRunSchema).parse(
        (raw as any)?.data ?? raw
      );
    }),

  autoScore: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/governance/auto-score", {
      method: "GET",
    });

    return raw?.data ?? raw ?? {};
  }),

  runEnforcement: protectedProcedure.mutation(async ({ ctx }) => {
    const raw = await nexoFetch<any>(
      ctx.req,
      "/admin/enforcement/run-once",
      { method: "POST" }
    );

    return raw?.data ?? raw;
  }),

  changeRiskLevel: protectedProcedure
    .input(
      z.object({
        entityId: z.union([z.string(), z.number()]).transform(v => String(v)),
        previousLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        newLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      })
    )
    .mutation(() => {
      throw new Error(
        "Alteração de risco indisponível: não há mutação confirmada no backend"
      );
    }),

  executeAction: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        type: z.enum(["charge", "message", "assignment", "schedule"]),
        label: z.string().min(1),
        description: z.string().min(1),
        requiresConfirmation: z.boolean().optional(),
        context: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const raw = await nexoFetch<any>(
        ctx.req,
        "/governance/actions/execute",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );

      return raw?.data ?? raw;
    }),
});

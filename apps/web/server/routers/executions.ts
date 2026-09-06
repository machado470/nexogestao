import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const executionsRouter = router({
    listByServiceOrder: protectedProcedure
      .input(z.object({ serviceOrderId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { serviceOrderId, ...query } = input;
        return authedGet(
          ctx as NexoContext,
          `/executions/service-order/${serviceOrderId}`,
          query
        );
      }),

    start: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
      return authedPost(ctx as NexoContext, "/executions/start", input);
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
        return authedPost(ctx as NexoContext, `/executions/${id}/complete`, payload);
      }),

    mode: protectedProcedure.query(async ({ ctx }) => {
      return authedGet(ctx as NexoContext, "/executions/mode");
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
        return authedPost(ctx as NexoContext, "/executions/mode", input);
      }),

    stateSummary: protectedProcedure
      .input(z.object({ sinceMs: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, "/executions/state-summary", input ?? {});
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
        return authedGet(ctx as NexoContext, "/executions/events", input ?? {});
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
        return authedGet(ctx as NexoContext, "/executions/recent", input ?? {});
      }),

    modeHistory: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, "/executions/mode-history", input ?? {});
      }),

    runOnce: protectedProcedure.mutation(async ({ ctx }) => {
      return authedPost(ctx as NexoContext, "/executions/runner/run-once");
    }),
  })

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { nexoFetch } from "../_core/nexoClient";
import { unwrapNexoApiResponse } from "../_core/nexoEnvelope";

export const billingRouter = router({
  plans: publicProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/billing/plans", {
      method: "GET",
    });

    return unwrapNexoApiResponse(raw) ?? [];
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/billing/status", {
      method: "GET",
    });

    return unwrapNexoApiResponse(raw) ?? null;
  }),

  limits: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/billing/limits", {
      method: "GET",
    });

    return unwrapNexoApiResponse(raw) ?? null;
  }),

  checkout: protectedProcedure
    .input(
      z.object({
        planName: z.enum(["STARTER", "PRO", "BUSINESS"]),
        successUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(ctx.req, "/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify(input),
      });

      return unwrapNexoApiResponse(raw);
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx.req, "/billing/cancel", {
      method: "POST",
    });

    return unwrapNexoApiResponse(raw);
  }),
});

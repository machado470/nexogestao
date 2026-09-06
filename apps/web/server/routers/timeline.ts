import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const timelineRouter = router({
    listByOrg: protectedProcedure
      .input(z.object({ limit: z.number().optional(), action: z.string().optional(), cursor: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return authedGet(ctx as NexoContext, `/timeline`, input ?? {});
      }),

    listByCustomer: protectedProcedure
      .input(z.object({ customerId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { customerId, ...query } = input;
        return authedGet(
          ctx as NexoContext,
          `/timeline/customers/${customerId}`,
          query
        );
      }),

    listByServiceOrder: protectedProcedure
      .input(z.object({ serviceOrderId: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { serviceOrderId, ...query } = input;
        return authedGet(
          ctx as NexoContext,
          `/timeline/service-orders/${serviceOrderId}`,
          query
        );
      }),
  })

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, authedPatch, authedPost, type NexoContext } from "../_core/nexoTransport";

export const globalSearchRouter = router({
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
          authedGet(ctx as NexoContext, "/customers", query ? { search: query } : {}),
          authedGet(
            ctx as NexoContext,
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
  })

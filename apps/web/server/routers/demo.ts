import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveNexoApiUrl } from "../_core/nexoApiUrl";
import { authedPost, type NexoContext } from "../_core/nexoTransport";

const NEXO_API_URL = resolveNexoApiUrl();

export const demoRouter = 
router({
    bootstrapLive: protectedProcedure
      .input(z.object({}).optional())
      .mutation(async ({ ctx }) => {
        try {
          return await authedPost(ctx as NexoContext, "/demo/bootstrap/live");
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
  })

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { nexoFetch } from "../_core/nexoClient";
import { unwrapNexoApiResponse } from "../_core/nexoEnvelope";

const paginationInput = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(20),
});

const listPayloadSchema = z.object({
  items: z.array(z.unknown()),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});

export const financeRouter = router({
  payments: router({
    getById: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]).transform((v) => String(v)),
        })
      )
      .query(async ({ input, ctx }) => {
        const raw = await nexoFetch<unknown>(ctx, `/finance/payments/${input.id}`, {
          method: "GET",
        });

        return unwrapNexoApiResponse(raw);
      }),
  }),

  operationalQueue: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).default(50) }).optional())
    .query(async ({ input, ctx }) => {
      const params = new URLSearchParams();
      params.set("limit", String(input?.limit ?? 50));
      const raw = await nexoFetch<unknown>(ctx, `/finance/operational-queue?${params.toString()}`, { method: "GET" });
      return unwrapNexoApiResponse(raw);
    }),

  charges: router({
    create: protectedProcedure
      .input(
        z.object({
          customerId: z.union([z.string(), z.number()]).transform((v) => String(v)),
          amount: z.number().min(0.01, "Valor deve ser maior que 0").optional(),
          amountCents: z.number().int().min(1).optional(),
          dueDate: z.coerce.date(),
          notes: z.string().optional(),
          serviceOrderId: z.string().optional(),
          idempotencyKey: z.string().min(8).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const amountCents =
          input.amountCents ??
          (input.amount ? Math.round(input.amount * 100) : undefined);

        if (!amountCents || amountCents < 1) {
          throw new Error("Valor da cobrança é obrigatório e deve ser maior que 0");
        }

        const raw = await nexoFetch<unknown>(ctx, `/finance/charges`, {
          method: "POST",
          body: JSON.stringify({
            customerId: input.customerId,
            amountCents,
            dueDate: input.dueDate.toISOString(),
            notes: input.notes,
            serviceOrderId: input.serviceOrderId,
            idempotencyKey: input.idempotencyKey,
          }),
          headers: input.idempotencyKey
            ? { "Idempotency-Key": input.idempotencyKey }
            : undefined,
        });

        return unwrapNexoApiResponse(raw);
      }),

    list: protectedProcedure
      .input(
        paginationInput
          .extend({
            status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELED"]).optional(),
            q: z.string().optional(),
            serviceOrderId: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const page = input?.page ?? 1;
        const limit = input?.limit ?? 20;

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (input?.status) params.set("status", input.status);
        if (input?.q) params.set("q", input.q);
        if (input?.serviceOrderId) params.set("serviceOrderId", input.serviceOrderId);

        const raw = await nexoFetch<unknown>(
          ctx,
          `/finance/charges?${params.toString()}`,
          { method: "GET" }
        );

        const payload = listPayloadSchema.parse(unwrapNexoApiResponse(raw));

        return {
          data: payload.items,
          pagination: payload.meta,
        };
      }),

    getById: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]).transform((v) => String(v)),
        })
      )
      .query(async ({ input, ctx }) => {
        const raw = await nexoFetch<unknown>(ctx, `/finance/charges/${input.id}`, {
          method: "GET",
        });

        return unwrapNexoApiResponse(raw);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]).transform((v) => String(v)),
          amount: z.number().min(0.01).optional(),
          amountCents: z.number().int().min(1).optional(),
          dueDate: z.coerce.date().optional(),
          status: z.enum(["PENDING", "OVERDUE", "CANCELED"]).optional(),
          notes: z.string().optional(),
          expectedUpdatedAt: z.string().datetime().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, amount, amountCents: amountCentsInput, expectedUpdatedAt, ...rest } = input;

        const amountCents =
          amountCentsInput ??
          (amount ? Math.round(amount * 100) : undefined);

        const raw = await nexoFetch<unknown>(ctx, `/finance/charges/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...rest,
            amountCents,
            dueDate: rest.dueDate ? rest.dueDate.toISOString() : undefined,
            expectedUpdatedAt,
          }),
        });

        return unwrapNexoApiResponse(raw);
      }),

    cancel: protectedProcedure
      .input(
        z.object({
          chargeId: z.union([z.string(), z.number()]).transform((v) => String(v)),
          cancellationReason: z.string().trim().min(3, "Motivo do cancelamento é obrigatório").max(1000),
          expectedUpdatedAt: z.string().datetime().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const raw = await nexoFetch<unknown>(ctx, `/finance/charges/${input.chargeId}/cancel`, {
          method: "POST",
          body: JSON.stringify({
            cancellationReason: input.cancellationReason,
            expectedUpdatedAt: input.expectedUpdatedAt,
          }),
        });

        return unwrapNexoApiResponse(raw);
      }),

    stats: protectedProcedure
      .input(z.object({}).optional())
      .query(async ({ ctx }) => {
        const raw = await nexoFetch<unknown>(ctx, `/finance/charges/stats`, {
          method: "GET",
        });

        return unwrapNexoApiResponse(raw);
      }),

    pay: protectedProcedure
      .input(
        z.object({
          chargeId: z.union([z.string(), z.number()]).transform((v) => String(v)),
          method: z.enum(["PIX", "CASH", "CARD", "TRANSFER", "OTHER"]).default("PIX"),
          amountCents: z.number().int().min(1),
          paidAt: z.string().datetime().refine(
            value => new Date(value).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
            "Data de pagamento não pode estar no futuro",
          ).optional(),
          notes: z.string().max(2000).optional(),
          idempotencyKey: z.string().min(8).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const raw = await nexoFetch<unknown>(
          ctx,
          `/finance/charges/${input.chargeId}/pay`,
          {
            method: "POST",
            body: JSON.stringify({
              method: input.method,
              amountCents: input.amountCents,
              paidAt: input.paidAt,
              notes: input.notes,
              idempotencyKey: input.idempotencyKey,
            }),
            headers: input.idempotencyKey
              ? { "Idempotency-Key": input.idempotencyKey }
              : undefined,
          }
        );

        return unwrapNexoApiResponse(raw);
      }),
  }),
});

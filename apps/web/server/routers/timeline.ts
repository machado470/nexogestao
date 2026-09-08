import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { authedGet, type NexoContext } from "../_core/nexoTransport";

// The API intentionally preserves new domain events without requiring a BFF
// release. It does, however, canonicalize every public event to this format.
const timelineEventTypeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

const timelineMetadataSchema = z
  .object({
    amountCents: z.number().int().nonnegative().optional(),
    currency: z.string().optional(),
    previousState: z.string().optional(),
    nextState: z.string().optional(),
    riskLevel: z.string().optional(),
    score: z.number().optional(),
    result: z.string().optional(),
    status: z.string().optional(),
    reasonCode: z.string().optional(),
    origin: z.string().optional(),
  })
  .strict();

export const timelineEventOutputSchema = z
  .object({
    id: z.string().uuid(),
    eventType: timelineEventTypeSchema,
    occurredAt: z.string().datetime(),
    actor: z.object({ name: z.string().min(1) }).strict().nullable(),
    entity: z
      .object({
        type: z.enum(["customer", "service_order", "appointment", "charge"]),
        id: z.string().uuid(),
        href: z.string().min(1),
      })
      .strict()
      .nullable(),
    module: z.string().nullable(),
    severity: z.string().nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    consequence: z.string().nullable(),
    recommendedAction: z.string().nullable(),
    origin: z.string().nullable(),
    metadata: timelineMetadataSchema,
  })
  .strict();

export const timelineListOutputSchema = z.array(timelineEventOutputSchema);

function parseTimelineList(payload: unknown) {
  return z.array(z.unknown()).parse(payload).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return timelineEventOutputSchema.parse(item);
    }
    const publicEvent = { ...(item as Record<string, unknown>) };
    delete publicEvent[["org", "Id"].join("")];
    return timelineEventOutputSchema.parse(publicEvent);
  });
}

const timelineLimit = z.number().int().min(1).max(300).optional();

export const timelineRouter = router({
  listByOrg: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          action: timelineEventTypeSchema.optional(),
          cursor: z.string().min(1).optional(),
        })
        .strict()
        .optional()
    )
    .output(timelineListOutputSchema)
    .query(async ({ ctx, input }) => {
      return parseTimelineList(
        await authedGet(ctx as NexoContext, "/timeline", input ?? {})
      );
    }),

  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), limit: timelineLimit }).strict())
    .output(timelineListOutputSchema)
    .query(async ({ ctx, input }) => {
      const { customerId, ...query } = input;
      return parseTimelineList(
        await authedGet(ctx as NexoContext, `/timeline/customers/${customerId}`, query)
      );
    }),

  listByServiceOrder: protectedProcedure
    .input(z.object({ serviceOrderId: z.string().uuid(), limit: timelineLimit }).strict())
    .output(timelineListOutputSchema)
    .query(async ({ ctx, input }) => {
      const { serviceOrderId, ...query } = input;
      return parseTimelineList(
        await authedGet(ctx as NexoContext, `/timeline/service-orders/${serviceOrderId}`, query)
      );
    }),
});

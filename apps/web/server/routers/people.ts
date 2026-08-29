import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { nexoFetch } from "../_core/nexoClient";
import { unwrapNexoApiResponse } from "../_core/nexoEnvelope";

const nullableNumber = z.number().nullable().optional();
const peopleCustomersSchema = z
  .object({
    activeCustomersCount: z.number().default(0),
    attendedCustomersCount: z.number().default(0),
    customersWithOpenServiceOrdersCount: z.number().default(0),
    customersWithOverdueServiceOrdersCount: z.number().default(0),
  })
  .default({
    activeCustomersCount: 0,
    attendedCustomersCount: 0,
    customersWithOpenServiceOrdersCount: 0,
    customersWithOverdueServiceOrdersCount: 0,
  });
const peopleAppointmentsSchema = z
  .object({
    nextAppointments: z
      .array(
        z
          .object({
            id: z.string(),
            customerName: z.string().nullable().optional(),
            startsAt: z.string(),
            status: z.string(),
          })
          .passthrough()
      )
      .default([]),
    delayedAppointmentsCount: nullableNumber,
    conflictsCount: nullableNumber,
  })
  .default({ nextAppointments: [] });
const peopleServiceOrdersSchema = z
  .object({
    completedServiceOrdersCount: z.number().default(0),
    averageCompletionMinutes: nullableNumber,
    completionRatePct: nullableNumber,
    recentServiceOrders: z
      .array(
        z
          .object({
            id: z.string(),
            number: z.string().nullable().optional(),
            customerName: z.string().nullable().optional(),
            status: z.string(),
            dueAt: z.string().nullable().optional(),
            completedAt: z.string().nullable().optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .default({ completedServiceOrdersCount: 0, recentServiceOrders: [] });
const peopleTimelineSchema = z
  .object({
    lastEvents: z
      .array(
        z
          .object({
            id: z.string(),
            eventType: z.string().nullable().optional(),
            entityType: z.string().nullable().optional(),
            entityId: z.string().nullable().optional(),
            title: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            createdAt: z.string(),
          })
          .passthrough()
      )
      .default([]),
  })
  .default({ lastEvents: [] });
const peopleRiskSchema = z
  .object({
    riskScore: nullableNumber,
    operationalRiskScore: nullableNumber,
    operationalState: z.string().nullable().optional(),
    riskTrend: z.string().nullable().optional(),
    riskReasons: z.array(z.string()).default([]),
  })
  .default({ riskReasons: [] });

const peopleFinanceSchema = z
  .object({
    receivedAmountFromAssignedServiceOrders: z.number().default(0),
    pendingAmountFromAssignedServiceOrders: z.number().default(0),
    overdueAmountFromAssignedServiceOrders: z.number().default(0),
    paidChargesCountFromAssignedServiceOrders: z.number().default(0),
    pendingChargesCountFromAssignedServiceOrders: z.number().default(0),
    overdueChargesCountFromAssignedServiceOrders: z.number().default(0),
    financeAttributionNote: z.string().nullable().optional(),
  })
  .nullable()
  .optional();
const peopleWhatsappSchema = z
  .object({
    assignedConversationsCount: z.number().default(0),
    waitingOperatorConversationsCount: z.number().nullable().optional(),
    failedMessagesCount: z.number().default(0),
    sentMessagesCount: z.number().default(0),
    lastConversationAt: z.string().nullable().optional(),
    whatsappAttributionNote: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const peopleOperationalSummaryPersonSchema = z
  .object({
    personId: z.string(),
    name: z.string(),
    role: z.string().nullable().optional(),
    status: z.string(),
    lastActivityAt: z.string().nullable().optional(),
    openServiceOrdersCount: z.number().default(0),
    overdueServiceOrdersCount: z.number().default(0),
    todayAppointmentsCount: z.number().default(0),
    futureAppointmentsCount: z.number().default(0),
    dailyServiceOrderCapacity: z.number().nullable().optional(),
    dailyAppointmentCapacity: z.number().nullable().optional(),
    serviceOrderCapacityUsagePct: z.number().nullable().optional(),
    appointmentCapacityUsagePct: z.number().nullable().optional(),
    capacityStatus: z.string().optional(),
    availabilityStatus: z.string().optional(),
    currentAvailabilityException: z.unknown().nullable().optional(),
    nextAvailabilityException: z.unknown().nullable().optional(),
    loadStatus: z.string().optional(),
    operationalStatus: z.enum(["NORMAL", "ATENÇÃO", "RISCO", "CRÍTICO"]),
    priority: z.enum(["P0", "P1", "P2", "P3"]),
    interventionReason: z.string().nullable(),
    recommendedActionLabel: z.string().nullable(),
    recommendedActionTarget: z
      .enum(["PERSON", "SERVICE_ORDERS", "APPOINTMENTS", "TIMELINE"])
      .nullable(),
    operationalSummaryText: z.string().nullable().optional(),
    capacitySummaryText: z.string().nullable().optional(),
    riskSummaryText: z.string().nullable().optional(),
    workloadNotes: z.string().nullable().optional(),
    customers: peopleCustomersSchema,
    appointments: peopleAppointmentsSchema,
    serviceOrders: peopleServiceOrdersSchema,
    timeline: peopleTimelineSchema,
    risk: peopleRiskSchema,
    finance: peopleFinanceSchema,
    whatsapp: peopleWhatsappSchema,
  })
  .passthrough();

const peopleOperationalSummarySchema = z
  .object({
    people: z.array(peopleOperationalSummaryPersonSchema).default([]),
  })
  .passthrough();

export const peopleRouter = router({
  /**
   * Listar pessoas ativas da organização
   * Nest: GET /people
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, `/people`, { method: "GET" });
    // Nest retorna array direto ou { ok, data: [] }
    return Array.isArray(raw) ? raw : (unwrapNexoApiResponse(raw) ?? []);
  }),

  /**
   * Listar responsáveis para filtros operacionais de agenda.
   * Nest: GET /people/assignees
   */
  assignees: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, `/people/assignees`, {
      method: "GET",
    });
    return Array.isArray(raw) ? raw : (unwrapNexoApiResponse(raw) ?? []);
  }),

  /**
   * Resumo operacional tenant-scoped da equipe
   * Nest: GET /people/operational-summary
   */
  operationalSummary: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, `/people/operational-summary`, {
      method: "GET",
    });
    const unwrapped = Array.isArray(raw)
      ? { people: raw }
      : unwrapNexoApiResponse(raw);
    const fallback = Array.isArray(unwrapped)
      ? { people: unwrapped }
      : (unwrapped ?? { people: [] });
    return peopleOperationalSummarySchema.parse(fallback);
  }),

  /**
   * Buscar pessoa por ID
   * Nest: GET /people/:id
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(ctx, `/people/${input.id}`, {
        method: "GET",
      });
      return unwrapNexoApiResponse(raw);
    }),

  /**
   * Criar pessoa
   * Nest: POST /people
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        role: z.string().min(1, "Cargo é obrigatório"),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(ctx, `/people`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return unwrapNexoApiResponse(raw);
    }),

  /**
   * Atualizar pessoa
   * Nest: PATCH /people/:id
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        role: z.string().optional(),
        email: z.string().email().optional(),
        active: z.boolean().optional(),
        dailyServiceOrderCapacity: z.number().int().min(1).max(100).optional(),
        dailyAppointmentCapacity: z.number().int().min(1).max(100).optional(),
        workloadNotes: z.string().max(500).nullable().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const raw = await nexoFetch<any>(ctx, `/people/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return unwrapNexoApiResponse(raw);
    }),

  /** Listar indisponibilidades temporárias tenant-scoped. */
  listAvailabilityExceptions: protectedProcedure
    .input(z.object({ personId: z.string().min(1) }).strict())
    .query(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(
        ctx,
        `/people/${input.personId}/availability-exceptions`,
        { method: "GET" }
      );
      return unwrapNexoApiResponse(raw);
    }),

  /** Criar indisponibilidade temporária sem aceitar orgId do client. */
  createAvailabilityException: protectedProcedure
    .input(
      z
        .object({
          personId: z.string().min(1),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          reason: z.string().max(200).nullable().optional(),
        })
        .strict()
        .refine(
          ({ startsAt, endsAt }) => new Date(startsAt) < new Date(endsAt),
          { message: "Início deve ser anterior ao fim", path: ["endsAt"] }
        )
    )
    .mutation(async ({ input, ctx }) => {
      const { personId, ...data } = input;
      const raw = await nexoFetch<any>(
        ctx,
        `/people/${personId}/availability-exceptions`,
        { method: "POST", body: JSON.stringify(data) }
      );
      return unwrapNexoApiResponse(raw);
    }),

  /** Remover indisponibilidade temporária tenant-scoped. */
  deleteAvailabilityException: protectedProcedure
    .input(
      z
        .object({ personId: z.string().min(1), exceptionId: z.string().min(1) })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(
        ctx,
        `/people/${input.personId}/availability-exceptions/${input.exceptionId}`,
        { method: "DELETE" }
      );
      return unwrapNexoApiResponse(raw);
    }),

  /**
   * Métricas de pessoas vinculadas
   * Nest: GET /people/stats/linked
   */
  statsLinked: protectedProcedure.query(async ({ ctx }) => {
    const raw = await nexoFetch<any>(ctx, `/people/stats/linked`, {
      method: "GET",
    });
    return unwrapNexoApiResponse(raw);
  }),

  /**
   * Desativar pessoa (soft delete)
   * Nest: DELETE /people/:id
   * Regra de negócio: bloqueia se houver OS ativa vinculada à pessoa.
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const raw = await nexoFetch<any>(ctx, `/people/${input.id}`, {
        method: "DELETE",
      });
      return unwrapNexoApiResponse(raw);
    }),
});

import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { fetchNexoMe, NexoBootstrapError } from "./_core/context";
import { TRPCError } from "@trpc/server";
import { nexoProxyRouter } from "./routers/nexo-proxy";
import { financeRouter } from "./routers/finance";
import { peopleRouter } from "./routers/people";
import { governanceRouter } from "./routers/governance";
import { dashboardRouter } from "./routers/dashboard";
import { expensesRouter } from "./routers/expenses";
import { launchesRouter } from "./routers/launches";
import { referralsRouter } from "./routers/referrals";
import { aiRouter } from "./routers/ai";
import { billingRouter } from "./routers/billing";
import { analyticsRouter } from "./routers/analytics";
import { integrationsRouter } from "./routers/integrations";
import { appointmentsRouter } from "./routers/appointments";
import { auditRouter } from "./routers/audit-router";
import { authRouter } from "./routers/auth";
import { customersRouter } from "./routers/customers";
import { demoRouter } from "./routers/demo";
import { executionsRouter } from "./routers/executions";
import { globalSearchRouter } from "./routers/global-search";
import { invitesRouter } from "./routers/invites";
import { onboardingRouter } from "./routers/onboarding";
import { operationsRouter } from "./routers/operational";
import { riskRouter } from "./routers/risk";
import { serviceOrdersRouter } from "./routers/service-orders";
import { settingsRouter } from "./routers/settings";
import { timelineRouter } from "./routers/timeline";
import { whatsappRouter } from "./routers/whatsapp";

const SESSION_COOKIES = ["nexo_token", "token", "auth_token"] as const;

export const appRouter = router({
  system: systemRouter,

  nexo: nexoProxyRouter,

  finance: financeRouter,
  people: peopleRouter,
  governance: governanceRouter,
  dashboard: dashboardRouter,
  expenses: expensesRouter,
  launches: launchesRouter,
  referrals: referralsRouter,
  ai: aiRouter,
  billing: billingRouter,
  analytics: analyticsRouter,
  integrations: integrationsRouter,
  auth: authRouter,
  customers: customersRouter,
  appointments: appointmentsRouter,
  serviceOrders: serviceOrdersRouter,
  timeline: timelineRouter,
  executions: executionsRouter,
  whatsapp: whatsappRouter,
  operations: operationsRouter,
  demo: demoRouter,
  settings: settingsRouter,
  onboarding: onboardingRouter,
  invites: invitesRouter,
  globalSearch: globalSearchRouter,
  audit: auditRouter,
  risk: riskRouter,

  session: router({
    me: publicProcedure.query(async ({ ctx }) => {
      try {
        return await fetchNexoMe(ctx.req);
      } catch (error) {
        if (
          error instanceof NexoBootstrapError &&
          error.kind === "unavailable"
        ) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "SESSION_UPSTREAM_UNAVAILABLE",
            cause: error,
          });
        }

        throw error;
      }
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);

      for (const cookieName of SESSION_COOKIES) {
        ctx.res.clearCookie(cookieName, {
          ...cookieOptions,
        });
        ctx.res.clearCookie(cookieName, {
          ...cookieOptions,
          sameSite: "none",
          secure: true,
        });
      }

      return {
        success: true,
      } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;

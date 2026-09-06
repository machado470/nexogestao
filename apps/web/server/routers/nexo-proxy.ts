import { router } from "../_core/trpc";
import { appointmentsRouter } from "./appointments";
import { auditRouter } from "./audit-router";
import { authRouter, meProcedure } from "./auth";
import { customersRouter } from "./customers";
import { demoRouter } from "./demo";
import { executionsRouter } from "./executions";
import { globalSearchRouter } from "./global-search";
import { invitesRouter } from "./invites";
import { onboardingRouter } from "./onboarding";
import { operationsRouter } from "./operational";
import { riskRouter } from "./risk";
import { serviceOrdersRouter } from "./service-orders";
import { settingsRouter } from "./settings";
import { timelineRouter } from "./timeline";
import { whatsappRouter } from "./whatsapp";

/**
 * Compatibility-only namespace. Canonical implementations live in domain routers
 * and are reused here by reference; do not add procedures to this file.
 */
export const nexoProxyRouter = router({
  operations: operationsRouter,
  auth: authRouter,
  me: meProcedure,
  customers: customersRouter,
  appointments: appointmentsRouter,
  serviceOrders: serviceOrdersRouter,
  timeline: timelineRouter,
  executions: executionsRouter,
  whatsapp: whatsappRouter,
  demo: demoRouter,
  settings: settingsRouter,
  onboarding: onboardingRouter,
  invites: invitesRouter,
  globalSearch: globalSearchRouter,
  audit: auditRouter,
  risk: riskRouter,
});

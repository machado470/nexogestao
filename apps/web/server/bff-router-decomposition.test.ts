import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const proxy = read("./routers/nexo-proxy.ts");
const appRouter = read("./routers.ts");

describe("BFF router decomposition guardrails", () => {
  it("keeps nexo-proxy as a compatibility-only composition root", () => {
    expect(proxy).not.toMatch(/publicProcedure|protectedProcedure|nexoFetch|authed(Get|Post|Patch)/);
    expect(proxy).not.toContain("z.object");
    for (const routerName of [
      "customersRouter", "appointmentsRouter", "serviceOrdersRouter", "timelineRouter",
      "executionsRouter", "whatsappRouter", "operationsRouter", "settingsRouter",
    ]) {
      expect(proxy).toContain(routerName);
      expect(appRouter).toContain(routerName);
    }
    expect(proxy).toContain("customers: customersRouter");
    expect(proxy).toContain("appointments: appointmentsRouter");
    expect(proxy).toContain("serviceOrders: serviceOrdersRouter");
    expect(proxy).toContain("whatsapp: whatsappRouter");
  });

  it("keeps every legacy alias wired to the canonical router instance", () => {
    for (const [alias, routerName] of [
      ["operations", "operationsRouter"], ["auth", "authRouter"],
      ["customers", "customersRouter"], ["appointments", "appointmentsRouter"],
      ["serviceOrders", "serviceOrdersRouter"], ["timeline", "timelineRouter"],
      ["executions", "executionsRouter"], ["whatsapp", "whatsappRouter"],
      ["demo", "demoRouter"], ["settings", "settingsRouter"],
      ["onboarding", "onboardingRouter"], ["invites", "invitesRouter"],
      ["globalSearch", "globalSearchRouter"], ["audit", "auditRouter"],
      ["risk", "riskRouter"],
    ]) {
      expect(proxy).toContain(`${alias}: ${routerName}`);
      expect(appRouter).toContain(`${alias}: ${routerName}`);
    }
    expect(proxy).toContain("me: meProcedure");
    expect(read("./routers/auth.ts")).toContain("me: meProcedure");
  });

  it("rejects legacy nexo callers in production frontend sources", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : [];
    });
    const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "../client/src");
    const legacyTrpcPrefix = "trpc." + "nexo.";
    const legacyUtilsPrefix = "utils." + "nexo.";
    const legacyNamespace = new RegExp("\\.\\s*" + "nexo" + "(?:\\.|\\?|\\s*[;,)])");
    for (const file of walk(clientRoot)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain(legacyTrpcPrefix);
      expect(source, file).not.toContain(legacyUtilsPrefix);
      expect(source, file).not.toMatch(legacyNamespace);
    }
  });

  it("does not accept browser-owned tenant identity in tenant-scoped domain routers", () => {
    for (const file of ["customers.ts", "appointments.ts", "service-orders.ts", "timeline.ts", "settings.ts"]) {
      const source = read(`./routers/${file}`);
      expect(source).not.toMatch(/\b(orgId|tenantId|organizationId)\b/);
    }
  });

  it("keeps envelope handling and HTTP concerns in shared foundations", () => {
    expect(proxy).not.toMatch(/unwrap|normalize|fetch\s*\(/i);
    expect(read("./_core/nexoTransport.ts")).toContain("unwrapNexoApiResponse");
    const client = read("./_core/nexoClient.ts");
    expect(client).toContain('"x-request-id"');
    expect(client).toContain('"x-correlation-id"');
    expect(client).toContain("error.status === 429");
  });

  it("does not import Prisma anywhere in the web application", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
    });
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const forbiddenImport = "@prisma" + "/client";
    for (const file of walk(webRoot)) expect(readFileSync(file, "utf8")).not.toContain(forbiddenImport);
  });
});

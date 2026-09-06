import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  getAuditEmptyState,
  getAuditEventMetadata,
  getNextAuditPage,
  normalizeAuditList,
  normalizeAuditSummary,
} from "./AuditPage";

const auditPageSource = readFileSync(new URL("./AuditPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const mainLayoutSource = readFileSync(new URL("../components/MainLayout.tsx", import.meta.url), "utf8");

describe("AuditPage administrative audit contract", () => {
  it("consome os contratos frontend oficiais de lista e resumo", () => {
    expect(auditPageSource).toContain("trpc.audit.listEvents.useQuery");
    expect(auditPageSource).toContain("trpc.audit.getSummary.useQuery");
    expect(auditPageSource).toContain("page, limit: AUDIT_PAGE_SIZE");
    expect(auditPageSource).toContain("actorPersonId: draftFilters.actorPersonId.trim() || undefined");
    expect(auditPageSource).toContain("action: draftFilters.action.trim() || undefined");
  });

  it("protege a rota e a navegação com role ADMIN obrigatória", () => {
    expect(appSource).toContain('const AuditRoute = lazyProtectedPage(AuditPage, {\n  requiredRoles: ["ADMIN"]');
    expect(appSource).toContain('<Route path="/audit" component={AuditRoute} />');
    expect(mainLayoutSource).toContain('id: "audit"');
    expect(mainLayoutSource).toContain('requiredRoles: ["ADMIN"]');
  });

  it("normaliza o carregamento server-side da lista", () => {
    const result = normalizeAuditList({
      data: [{ id: "event-1", action: "CUSTOMER_UPDATED" }],
      pagination: { page: 2, limit: AUDIT_PAGE_SIZE, total: 31, pages: 2 },
    });

    expect(result.events).toEqual([{ id: "event-1", action: "CUSTOMER_UPDATED" }]);
    expect(result.pagination).toEqual({ page: 2, limit: AUDIT_PAGE_SIZE, total: 31, pages: 2 });
  });

  it("normaliza o carregamento do resumo", () => {
    expect(normalizeAuditSummary({
      total: 8,
      byAction: [{ action: "CUSTOMER_UPDATED", count: 5 }],
      byActor: [{ actorPersonId: "person-1", count: 4 }],
    })).toEqual({
      total: 8,
      byAction: [{ action: "CUSTOMER_UPDATED", count: 5 }],
      byActor: [{ actorPersonId: "person-1", count: 4 }],
    });
  });

  it("expõe metadata completo no detalhe do evento", () => {
    const metadata = { before: { name: "Antes" }, after: { name: "Depois" } };
    expect(getAuditEventMetadata({
      id: "event-1",
      createdAt: "2026-05-30T00:00:00.000Z",
      action: "CUSTOMER_UPDATED",
      entityType: "Customer",
      orgId: "org-1",
      metadata,
    })).toEqual(metadata);
  });

  it("avança paginação sem ultrapassar a última página", () => {
    expect(getNextAuditPage(1, 3)).toBe(2);
    expect(getNextAuditPage(3, 3)).toBe(3);
  });

  it("ativa empty state somente após o loading terminar sem eventos", () => {
    expect(getAuditEmptyState([], false)).toBe(true);
    expect(getAuditEmptyState([], true)).toBe(false);
    expect(getAuditEmptyState([{ id: "event-1" } as any], false)).toBe(false);
  });
});

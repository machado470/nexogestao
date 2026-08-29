import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventAction,
  eventCustomerId,
  eventDeepLinks,
  eventEntityId,
  eventEntityLabel,
  eventModule,
  eventSeverity,
  formatDateTime,
  metadataRecord,
  isSafeHumanText,
  text,
  usefulMetadataPairs,
  type TimelineEvent,
} from "./TimelinePage";

const source = readFileSync(
  new URL("./TimelinePage.tsx", import.meta.url),
  "utf8"
);
const docs = readFileSync(
  new URL(
    "../../../../../docs/TIMELINE_OFFICIAL_OPERATIONAL_AUDIT.md",
    import.meta.url
  ),
  "utf8"
);

describe("TimelinePage official operational audit contract", () => {
  it("declara a Timeline como prova oficial, não feed social nem log técnico cru", () => {
    expect(source).toContain("Centro de Evidências Operacionais");
    expect(source).toContain("Fonte oficial");
    expect(source).toContain("sem fabricar histórico");
    expect(source).not.toContain("curtir");
    expect(source).not.toContain("comment");
  });

  it("mantém filtros compactos por tipo, entidade, módulo e período", () => {
    expect(source).toContain("Tipo de evento");
    expect(source).toContain("Entidade");
    expect(source).toContain("Todos os módulos");
    expect(source).toContain("Últimos 7 dias");
    expect(source).toContain("Ator (usuário/sistema)");
  });

  it("exibe evento auditável com ator, entidade, data/hora, módulo e metadata resumida", () => {
    expect(source).toContain("Quem:");
    expect(source).toContain("Entidade:");
    expect(source).toContain("Quando:");
    expect(source).toContain("Módulo:");
    expect(source).toContain("Resumo técnico");
    expect(source).toContain("Fallback honesto");
  });

  it("oferece CTAs reais somente quando há entidade utilizável", () => {
    expect(source).toContain("function eventDeepLinks");
    expect(source).toContain("entityType/entityId");
    expect(source).toContain("Sem CTA de entidade");
    expect(source).toContain("Abrir cliente");
    expect(source).toContain("Abrir O.S.");
    expect(source).toContain("Abrir financeiro");
    expect(source).toContain("Abrir agendamento");
    expect(source).toContain("Abrir WhatsApp");
  });

  it("documenta a página como base oficial de auditoria, risco e governança", () => {
    expect(docs).toContain("fonte oficial de auditoria operacional");
    expect(docs).toContain("Governança e risco");
    expect(docs).toContain("não executam automação");
  });
});

describe("TimelinePage audit helpers", () => {
  const chargeEvent: TimelineEvent = {
    action: "WHATSAPP_MESSAGE_FAILED",
    chargeId: "charge-1",
    actorUserId: "user-1",
    createdAt: "2026-06-12T10:00:00.000Z",
    metadata: {
      amount: 120,
      reason: "provider failed",
      nested: { ignored: true },
    },
  };

  it("normaliza aliases e preserva fallbacks honestos", () => {
    expect(eventAction(chargeEvent)).toBe("MESSAGE_FAILED");
    expect(eventEntityLabel(chargeEvent)).toBe("Cobrança");
    expect(eventEntityId(chargeEvent)).toBe("charge-1");
    expect(eventCustomerId({ metadata: { customerId: "customer-1" } })).toBe(
      "customer-1"
    );
    expect(metadataRecord({ metadata: [] })).toEqual({});
    expect(text("", "fallback")).toBe("fallback");
  });

  it("classifica módulo, criticidade, data e metadata sem inventar campos complexos", () => {
    expect(eventModule(chargeEvent)).toBe("finance");
    expect(eventSeverity(chargeEvent)).toBe("critical");
    expect(formatDateTime(null)).toBe("Sem data");
    expect(usefulMetadataPairs(chargeEvent)).toEqual([
      { key: "Valor", value: "120" },
    ]);
  });

  it("gera deep links compatíveis sem renderizar identificadores como texto", () => {
    expect(eventDeepLinks({ customerId: "customer 1" })[0]?.route).toBe(
      "/customers?customerId=customer%201"
    );
    expect(eventDeepLinks({ serviceOrderId: "os-1" })[0]?.route).toBe(
      "/service-orders?serviceOrderId=os-1"
    );
    expect(eventDeepLinks({ appointmentId: "agenda-1" })[0]?.route).toBe(
      "/appointments?appointmentId=agenda-1"
    );
    expect(eventDeepLinks({ chargeId: "charge-1" })[0]?.route).toBe(
      "/finances?chargeId=charge-1"
    );
  });

  it("bloqueia payload, UUID e chaves técnicas em textos humanos", () => {
    expect(isSafeHumanText("Pagamento confirmado pelo cliente")).toBe(true);
    expect(isSafeHumanText('{"payload":{"chargeId":"x"}}')).toBe(false);
    expect(
      isSafeHumanText("customerId: 59c664ea-f745-4b50-9c74-0ff44305df35")
    ).toBe(false);
  });
});

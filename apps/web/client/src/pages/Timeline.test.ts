import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  hasOfficialCta,
  officialEventLabel,
  safeMetadataEntries,
  type OfficialTimelineEvent,
} from "./TimelinePage";

const source = readFileSync(
  new URL("./TimelinePage.tsx", import.meta.url),
  "utf8"
);

const unknownEvent: OfficialTimelineEvent = {
  id: "event-1",
  eventType: "FUTURE_EVENT_CREATED",
  occurredAt: "2026-08-30T12:00:00.000Z",
  actor: null,
  entity: null,
  module: null,
  severity: null,
  title: null,
  description: "failed overdue restricted são apenas texto",
  consequence: null,
  recommendedAction: null,
  origin: null,
  metadata: { status: "raw", score: 12 },
};

describe("Timeline authoritative contract", () => {
  it("shows an unknown event without locally invented classification", () => {
    expect(officialEventLabel(unknownEvent)).toBe("Evento não classificado");
    expect(unknownEvent.module).toBeNull();
    expect(unknownEvent.severity).toBeNull();
    expect(unknownEvent.consequence).toBeNull();
    expect(unknownEvent.recommendedAction).toBeNull();
  });

  it("only creates a CTA from the official entity target", () => {
    expect(hasOfficialCta(unknownEvent)).toBe(false);
    expect(
      hasOfficialCta({
        ...unknownEvent,
        entity: {
          type: "customer",
          id: "customer-1",
          href: "/customers?customerId=customer-1",
        },
      })
    ).toBe(true);
  });

  it("only formats timestamps and primitive metadata", () => {
    expect(formatDateTime(null)).toBe("Data não informada");
    expect(safeMetadataEntries(unknownEvent)).toEqual([
      ["status", "raw"],
      ["score", 12],
    ]);
  });

  it("prevents reintroduction of the browser decision engine", () => {
    for (const forbidden of [
      "normalizeTimelineEventType",
      "LEGACY_TIMELINE_EVENT_ALIASES",
      "metadataSearchBucket",
      "hasCriticalOperationalMetadata",
      "hasWarningOperationalMetadata",
      "eventModule(",
      "eventSeverity(",
      "eventOperationalConsequence",
      "eventRecommendedAction",
      "Date.now()",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(
      /includes\(["'](?:failed|error|cancel|overdue|warning|risk|restricted|suspended)/i
    );
    expect(source).not.toContain("orgId");
    expect(source).not.toContain("role:");
    expect(source).toContain("query.refetch()");
    expect(source).toContain("Evento não classificado");
  });
});

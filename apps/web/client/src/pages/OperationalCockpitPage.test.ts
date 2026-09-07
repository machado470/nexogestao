import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getCriticalIncidents,
  getDegradedQueues,
  shouldBlockOperationalAction,
} from "./OperationalCockpitPage";

const source = readFileSync(
  new URL("./OperationalCockpitPage.tsx", import.meta.url),
  "utf8"
);

describe("OperationalCockpitPage selectors", () => {
  it("destaca apenas incidentes marcados como CRITICAL pela fonte", () => {
    const list = getCriticalIncidents([
      { id: "1", severity: "INFO" },
      { id: "2", severity: "CRITICAL" },
    ] as Parameters<typeof getCriticalIncidents>[0]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("2");
  });

  it("retorna apenas filas oficialmente degradadas", () => {
    const list = getDegradedQueues([
      {
        queue: "a",
        degraded: false,
        waiting: 0,
        failed: 0,
      },
      {
        queue: "b",
        degraded: true,
        waiting: 2,
        failed: 0,
      },
      {
        queue: "c",
        degraded: true,
        waiting: 0,
        failed: 1,
      },
    ]);

    expect(list.map(item => item.queue)).toEqual(["b", "c"]);
  });

  it("empty states permanecem vazios", () => {
    expect(getCriticalIncidents([])).toEqual([]);
    expect(getDegradedQueues([])).toEqual([]);
  });

  it("bloqueia ação duplicada quando loading ou ação concorrente", () => {
    expect(shouldBlockOperationalAction("loading", false)).toBe(true);
    expect(shouldBlockOperationalAction("idle", true)).toBe(true);
    expect(shouldBlockOperationalAction("idle", false)).toBe(false);
  });
});

describe("OperationalCockpitPage golden-standard contract", () => {
  it("uses the canonical page hierarchy and surfaces", () => {
    expect(source).toContain("<AppPageShell");
    expect(source).toContain("<AppOperationalHeader");
    expect(source).toContain("<AppSectionBlock");
    expect(source).toContain("<AppSectionCard");
    expect(source).toContain("<AppStatCard");
    expect(source).toContain("<AppInfoCard");
    expect(source).toContain("<AppStatusBadge");

    expect(source).not.toContain("MiniCard");
    expect(source).not.toContain("ListCard");
  });

  it("uses official operations contracts as its source", () => {
    expect(source).toContain("trpc.operations.summary.useQuery");
    expect(source).toContain("trpc.operations.incidents.useQuery");
    expect(source).toContain('item.severity === "CRITICAL"');
    expect(source).toContain("item.degraded");
  });

  it("does not rank or reconstruct operational decisions", () => {
    expect(source).not.toContain(".sort(");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("priority");
    expect(source).not.toContain("nextAction");
    expect(source).not.toContain("score");
  });

  it("does not manufacture DLQ severity from backlog counts", () => {
    expect(source).toContain(
      "item.backlog > 0 || item.failed > 0"
    );
    expect(source).toContain('label="DLQ"');
    expect(source).not.toContain(
      'item.backlog > 0 ? "CRITICAL" : "WARNING"'
    );
  });

  it("contains no legacy hardcoded severity palette or broken utility classes", () => {
    expect(source).not.toContain("bg-rose");
    expect(source).not.toContain("bg-amber");
    expect(source).not.toContain("bg-zinc");
    expect(source).not.toContain("rounded-xlborder");
    expect(source).not.toContain("mt-2space-y-2");
  });
});

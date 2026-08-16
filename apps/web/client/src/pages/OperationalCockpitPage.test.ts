import { describe, expect, it } from "vitest";
import { getCriticalIncidents, getDegradedQueues, shouldBlockOperationalAction } from "./OperationalCockpitPage";

describe("OperationalCockpitPage selectors", () => {
  it("destaca incidentes CRITICAL", () => {
    const list = getCriticalIncidents([
      { id: "1", severity: "INFO" },
      { id: "2", severity: "CRITICAL" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("2");
  });

  it("retorna apenas filas degradadas", () => {
    const list = getDegradedQueues([
      { queue: "a", degraded: false, waiting: 0, failed: 0 },
      { queue: "b", degraded: true, waiting: 2, failed: 0 },
      { queue: "c", degraded: true, waiting: 0, failed: 1 },
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

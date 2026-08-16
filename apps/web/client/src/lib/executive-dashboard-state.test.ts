import { describe, expect, it } from "vitest";
import { resolveExecutiveDashboardState } from "./executive-dashboard-state";

describe("resolveExecutiveDashboardState", () => {
  it.each([
    [{ isLoading: true, isError: false }, "LOADING"],
    [{ isLoading: false, isError: true }, "ERROR"],
    [{ isLoading: false, isError: false }, "ERROR"],
    [{ isLoading: false, isError: false, backendState: "EMPTY" as const }, "EMPTY"],
    [{ isLoading: false, isError: false, backendState: "HEALTHY" as const }, "HEALTHY"],
    [{ isLoading: false, isError: false, backendState: "ATTENTION" as const }, "ATTENTION"],
    [{ isLoading: false, isError: false, backendState: "CRITICAL" as const }, "CRITICAL"],
  ])("resolve %j as %s", (input, expected) => {
    expect(resolveExecutiveDashboardState(input)).toBe(expected);
  });
});

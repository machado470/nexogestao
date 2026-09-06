import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { unwrapNexoApiResponse } from "./nexoEnvelope";

describe("unwrapNexoApiResponse", () => {
  it.each([
    [{ value: 1 }, { value: 1 }],
    [{ data: { value: 1 } }, { value: 1 }],
    [{ success: true, data: { value: 1 } }, { value: 1 }],
    [{ ok: true, data: { success: true, data: { value: 1 } } }, { value: 1 }],
  ])("normalizes compatible direct and enveloped payloads", (raw, expected) => {
    expect(unwrapNexoApiResponse(raw)).toEqual(expected);
  });

  it.each([
    { success: false, data: { value: 1 }, message: "domain failure" },
    { ok: false, data: { value: 1 }, error: "transport failure" },
    { success: true, data: { success: false, data: { value: 1 } } },
  ])("never treats an explicit failure as valid data", (raw) => {
    expect(() => unwrapNexoApiResponse(raw)).toThrow(TRPCError);
  });

  it("preserves null instead of manufacturing a healthy or empty value", () => {
    expect(unwrapNexoApiResponse(null)).toBeNull();
  });
});

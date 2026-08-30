import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(
  new URL("./routers/nexo-proxy.ts", import.meta.url),
  "utf8"
);
const timelineRouter = router.slice(
  router.indexOf("timeline: router({"),
  router.indexOf("executions: router({")
);

describe("Timeline BFF authority boundary", () => {
  it("accepts only presentation query fields and derives tenant and role from authentication", () => {
    expect(timelineRouter).toContain("protectedProcedure");
    expect(timelineRouter).toContain("limit: z.number().optional()");
    expect(timelineRouter).toContain("action: z.string().optional()");
    expect(timelineRouter).toContain("cursor: z.string().optional()");
    expect(timelineRouter).not.toContain("orgId");
    expect(timelineRouter).not.toContain("role");
  });

  it("only forwards the API response and does not rebuild classifications", () => {
    expect(timelineRouter).toContain(
      "authedGet(ctx as CtxLike, `/timeline`, input ?? {})"
    );
    expect(timelineRouter).not.toMatch(
      /severity|risk|recommendedAction|consequence/
    );
  });
});

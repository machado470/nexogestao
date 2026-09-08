import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(
  new URL("./routers/timeline.ts", import.meta.url),
  "utf8"
);
const timelineRouter = router;

describe("Timeline BFF authority boundary", () => {
  it("accepts only presentation query fields and derives tenant and role from authentication", () => {
    expect(timelineRouter).toContain("protectedProcedure");
    expect(timelineRouter).toContain("limit: z.number().int().min(1).max(200).optional()");
    expect(timelineRouter).toContain("action: timelineEventTypeSchema.optional()");
    expect(timelineRouter).toContain("cursor: z.string().min(1).optional()");
    expect(timelineRouter).not.toContain("orgId");
    expect(timelineRouter).not.toContain("role");
  });

  it("only forwards the API response and does not rebuild classifications", () => {
    expect(timelineRouter).toContain(
      'authedGet(ctx as NexoContext, "/timeline", input ?? {})'
    );
    expect(timelineRouter).toContain("return parseTimelineList(");
    expect(timelineRouter).not.toMatch(/infer|calculate|sort\(/);
  });
});

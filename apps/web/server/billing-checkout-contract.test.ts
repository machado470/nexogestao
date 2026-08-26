import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./routers/billing.ts", import.meta.url),
  "utf8"
);

describe("billing checkout BFF contract", () => {
  it("aceita plano canônico sem expor identificador do provedor", () => {
    expect(source).toContain(
      'planName: z.enum(["STARTER", "PRO", "BUSINESS"])'
    );
    expect(source).not.toContain("priceId");
    expect(source).not.toContain("price_starter");
    expect(source).not.toContain("price_pro");
    expect(source).not.toContain("price_business");
  });
});

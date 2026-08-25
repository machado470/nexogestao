import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ProfilePage.tsx", import.meta.url),
  "utf8"
);

describe("ProfilePage internal page architecture contract", () => {
  it("usa o shell canônico sem PageWrapper legado", () => {
    expect(source).toContain("<AppPageShell>");
    expect(source).toContain("<AppOperationalHeader");
    expect(source).not.toContain("PageWrapper");
  });
});

describe("ProfilePage operational identity contract", () => {
  it("posiciona o perfil como identidade operacional do usuário", () => {
    expect(source).toContain("Identidade operacional");
    expect(source).toContain("Quem sou dentro da operação");
    expect(source).toContain("<OperationalHealthRing");
    expect(source).toContain("<OperationalWorkloadBar");
    expect(source).toContain("<OperationalActionPanel");
  });

  it("mostra atividade recente como timeline/evidência individual", () => {
    expect(source).toContain("Minha atividade recente");
    expect(source).toContain("<OperationalTimelineItem");
    expect(source).toContain("Nenhum evento individual retornado");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { humanizeTimelineAction } from "./TimelinePage";

const source = readFileSync(
  new URL("./TimelinePage.tsx", import.meta.url),
  "utf8"
);

describe("TimelinePage internal page architecture contract", () => {
  it("usa AppDataTable canônico sem table crua", () => {
    expect(source).toContain("<AppDataTable");
    expect(source).not.toContain("<table");
  });
});

describe("Timeline V2 — Centro de Evidências Operacionais", () => {
  it("não posiciona a Timeline como log técnico", () => {
    expect(source).toContain("Centro de Evidências Operacionais");
    expect(source).toContain("Fonte oficial para provar o que aconteceu");
    expect(source).not.toContain("payload bruto");
  });

  it("mostra KPIs, panorama por módulo e estados humanos", () => {
    expect(source).toContain("Leitura do período");
    expect(source).toContain("<OperationalPanel");
    expect(source).toContain("<OperationalKpiCard");
    expect(source).toContain("Eventos registrados");
    expect(source).toContain("Exigem atenção");
    expect(source).toContain("Impactam receita");
    expect(source).toContain("Último evento");
    expect(source).toContain("Panorama por módulo");
    expect(source).toContain("Saudável");
    expect(source).toContain("Sem histórico");
  });

  it("usa pipeline de evidência completo", () => {
    expect(source).toContain(
      "Evento → Registro → Impacto → Decisão → Ação → Auditoria"
    );
    expect(source).toContain("Feed carregado como memória auditável");
  });

  it("humaniza eventos técnicos e evita títulos crus", () => {
    expect(humanizeTimelineAction("PAYMENT_RECEIVED")).toBe(
      "Pagamento recebido"
    );
    expect(humanizeTimelineAction("CHARGE_CREATED")).toBe("Cobrança criada");
    expect(humanizeTimelineAction("EXECUTION_BLOCKED")).toBe(
      "Bloqueio operacional registrado"
    );
    expect(humanizeTimelineAction("action-send-overdue-charge-reminder")).toBe(
      "Lembrete de cobrança bloqueado"
    );
    expect(humanizeTimelineAction("SERVICE_ORDER_COMPLETED")).toBe(
      "Ordem de serviço concluída"
    );
    expect(humanizeTimelineAction("APPOINTMENT_CONFIRMED")).toBe(
      "Agendamento confirmado"
    );
    expect(humanizeTimelineAction("MESSAGE_SENT")).toBe("Mensagem enviada");
    expect(humanizeTimelineAction("GOVERNANCE_RUN_COMPLETED")).toBe(
      "Verificação de governança concluída"
    );
    expect(humanizeTimelineAction("RISK_UPDATED")).toBe(
      "Sinal de risco atualizado"
    );
  });

  it("organiza feed, contexto e resumo técnico secundário", () => {
    expect(source).toContain("Feed / Linha do Tempo");
    expect(source).toContain("O que aconteceu");
    expect(source).toContain("Quem foi impactado");
    expect(source).toContain("Próxima ação recomendada");
    expect(source).toContain("Resumo técnico");
  });

  it("cria prova operacional como extrato oficial sem histórico fictício", () => {
    expect(source).toContain("Prova operacional");
    expect(source).toContain(
      "Extrato oficial de evidências do período selecionado"
    );
    expect(source).toContain("Sem sinal / sem histórico");
    expect(source).toContain("sem fabricar histórico");
  });

  it("mantém CTAs seguros de navegação, sem automação falsa", () => {
    expect(source).toContain("Abrir financeiro");
    expect(source).toContain("Abrir O.S.");
    expect(source).toContain("Abrir agendamento");
    expect(source).toContain("Abrir cliente");
    expect(source).toContain("Abrir WhatsApp");
    expect(source).toContain("Abrir governança");
    expect(source).toContain("Ver no feed");
    expect(source).toContain("Exportar");
    expect(source).toContain("não executa ação automática");
  });
});

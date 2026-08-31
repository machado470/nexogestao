import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "ServiceOrdersPage.tsx"), "utf8");

describe("ServiceOrdersPage Nexo Operating System UI contract", () => {
  it("keeps the executive hero neutral and the decision block dominant", () => {
    expect(page).toContain("Hero executivo da O.S.");
    expect(page).toContain("Decisão e próxima ação · Próxima melhor ação");
    expect(page).toContain("border-2 border-[var(--accent-primary)]/45");
    expect(page).toContain("FAÇA AGORA:");
    expect(page).not.toContain("bg-gradient");
  });

  it("humanizes timeline events and sanitizes raw technical identifiers", () => {
    expect(page).toContain("getTimelineBusinessLabel");
    expect(page).toContain("Cobrança criada");
    expect(page).toContain("Cobrança vinculada");
    expect(page).toContain("Execução concluída");
    expect(page).toContain("O.S. concluída");
    expect(page).toContain("Evento operacional registrado");
    expect(page).toContain("sanitizeOperationalText");
    expect(page).not.toContain("event?.id ?? `${event?.action");
  });

  it("keeps pipeline, health and radar compact and free of raw IDs in visible cards", () => {
    expect(page).toContain(
      "Cliente → Agendamento → O.S. → Execução → Cobrança → Pagamento"
    );
    expect(page).toContain("Sem agendamento vinculado");
    expect(page).toContain("Cobrança pendente");
    expect(page).toContain("Aguardando pagamento");
    expect(page).toContain("grid grid-cols-2 gap-2 xl:grid-cols-4");
    expect(page).toContain("grid max-h-[220px] gap-2 overflow-auto");
    expect(page).toContain("Resolver");
    expect(page).not.toContain("#{item.code}");
  });

  it("presents the wallet as dense operational rows, not a heavy administrative table", () => {
    expect(page).toContain("Carteira operacional de O.S.");
    expect(page).toContain("linhas operacionais selecionáveis");
    expect(page).toContain("grid max-h-[560px] gap-2 overflow-auto");
    expect(page).not.toContain("<table");
    expect(page).not.toContain("<th");
  });

  it("turns details into an operational cockpit and explains blocked buttons accessibly", () => {
    expect(page).toContain("Detalhe da O.S.");
    expect(page).toContain("Cliente");
    expect(page).toContain("Execução");
    expect(page).toContain("Financeiro");
    expect(page).toContain("Agendamento");
    expect(page).toContain("Governança/Timeline");
    expect(page).not.toContain("Cobrança ID");
    expect(page).toContain("Iniciar indisponível: O.S. já concluída");
    expect(page).toContain("Concluir indisponível: O.S. já concluída");
    expect(page).toContain("Cobrar indisponível: cobrança já vinculada");
    expect(page).toContain(
      "aria-label={getStartUnavailableReason(selectedOrder)}"
    );
  });

  it("keeps operational filters, appointment context and partial outages explicit", () => {
    expect(page).toContain("service-order-customer-filter");
    expect(page).toContain("service-order-responsible-filter");
    expect(page).toContain("service-order-deadline-filter");
    expect(page).toContain("service-order-priority-filter");
    expect(page).toContain('<option value="P0">Prioridade P0</option>');
    expect(page).toContain('params.get("serviceOrderId")');
    expect(page).toContain("setOpenCreate(true)");
    expect(page).toContain("Dados auxiliares parcialmente indisponíveis");
    expect(page).toContain(
      "isso não\n              significa ausência saudável de pendências"
    );
  });

  it("uses the active execution contract when completing and exposes execution records", () => {
    expect(page).toContain("utils.nexo.executions.listByServiceOrder.fetch");
    expect(page).toContain("executionId: String(execution.id)");
    expect(page).toContain("Registros de execução");
    expect(page).toContain("Comunicação");
    expect(page).toContain("Atraso: {item.overdueLabel}");
    expect(page).toContain("{item.financialStatusLabel}");
  });
});

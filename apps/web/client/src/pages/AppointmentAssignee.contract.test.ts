import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compact = (source: string) => source.replace(/\s+/g, " ").trim();

describe("appointment assignee UI contract", () => {
  it("envia filtro de equipe ao servidor e não deriva conflito operacional no calendário", () => {
    const calendar = readFileSync("client/src/pages/CalendarPage.tsx", "utf8");

    const normalizedCalendar = compact(calendar);

    expect(normalizedCalendar).toContain(
      'teamFilter === "all" ? { limit: 1000 } : { assignedToPersonId: teamFilter, limit: 1000 }'
    );
    expect(calendar).not.toContain("conflictIds");
    expect(calendar).not.toContain("hasConflict");
    expect(calendar).not.toContain("Conflito operacional");
    expect(calendar).toContain(
      "Sobreposições são organizadas apenas pelo layout visual da grade."
    );
  });

  it("mantém agendamentos como controle operacional do tempo e entrada da execução", () => {
    const appointments = readFileSync(
      "client/src/pages/AppointmentsPage.tsx",
      "utf8"
    );
    const normalizedAppointments = compact(appointments);

    expect(appointments).toContain("Contexto da agenda");
    expect(appointments).toContain("Agenda operacional");
    expect(appointments).toContain("Detalhe e evidências");
    expect(appointments).not.toContain("Atenção operacional indisponível");
    expect(appointments).not.toContain("Próxima ação indisponível");
    expect(appointments).toContain("Evidências oficiais");
    expect(appointments).toContain("Abrir O.S.");
    expect(appointments).toContain("WhatsApp");
    expect(appointments).not.toContain("Google Calendar");
    expect(appointments).not.toContain("automático");
    expect(appointments).not.toMatch(
      /deriveAppointmentPriority|riskScore|hasConflict/
    );
    expect(normalizedAppointments).toContain(
      'responsibleFilter === "all" ? {} : { assignedToPersonId: responsibleFilter }'
    );
    expect(normalizedAppointments).toContain(
      "routeCustomerId ? { customerId: routeCustomerId } : {}"
    );
    expect(normalizedAppointments).toContain(
      'assignedToPersonId: form.assignedToPersonId === "unassigned" ? null : form.assignedToPersonId'
    );
    expect(appointments).toContain(
      '{ value: "unassigned", label: "Sem responsável" }'
    );
  });
});

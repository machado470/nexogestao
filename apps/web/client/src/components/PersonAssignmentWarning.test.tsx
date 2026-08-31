import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getPersonAssignmentWarning,
  type PersonOperationalSummary,
} from "./PersonAssignmentWarning";

const normalPerson: PersonOperationalSummary = {
  personId: "person-1",
  availabilityStatus: "AVAILABLE",
  capacityStatus: "UNDER_CAPACITY",
  loadStatus: "NORMAL",
};

const compact = (source: string) => source.replace(/\s+/g, " ").trim();

const appointmentPage = readFileSync(
  new URL("../pages/AppointmentsPage.tsx", import.meta.url),
  "utf8"
);
const appointmentPageCompact = compact(appointmentPage);
const createAppointmentModal = readFileSync(
  new URL("./CreateAppointmentModal.tsx", import.meta.url),
  "utf8"
);
const createServiceOrderModal = readFileSync(
  new URL("./CreateServiceOrderModal.tsx", import.meta.url),
  "utf8"
);
const editServiceOrderModal = readFileSync(
  new URL("./EditServiceOrderModal.tsx", import.meta.url),
  "utf8"
);

describe("getPersonAssignmentWarning", () => {
  it.each([
    ["UNAVAILABLE_NOW", "Pessoa indisponível agora"],
    ["UNAVAILABLE_SOON", "Pessoa ficará indisponível em breve"],
  ] as const)("avisa disponibilidade %s", (availabilityStatus, message) => {
    expect(
      getPersonAssignmentWarning({ ...normalPerson, availabilityStatus })
    ).toContain(message);
  });

  it("avisa quando a pessoa está acima da capacidade planejada", () => {
    expect(
      getPersonAssignmentWarning({
        ...normalPerson,
        capacityStatus: "OVER_CAPACITY",
      })
    ).toContain("Pessoa acima da capacidade planejada");
  });

  it("avisa quando a pessoa está com carga operacional alta", () => {
    expect(
      getPersonAssignmentWarning({ ...normalPerson, loadStatus: "OVERLOADED" })
    ).toContain("Pessoa com carga operacional alta");
  });

  it("não avisa para pessoa sem sinal de risco operacional", () => {
    expect(getPersonAssignmentWarning(normalPerson)).toEqual([]);
  });
});

describe("passive manual assignee warning UI contract", () => {
  it("usa people.operationalSummary como fonte real e declara que salvar continua permitido", () => {
    const warning = readFileSync(
      new URL("./PersonAssignmentWarning.tsx", import.meta.url),
      "utf8"
    );
    expect(warning).toContain("trpc.people.operationalSummary.useQuery");
    expect(warning).toContain(
      "A atribuição continua permitida; confirme a decisão operacional antes de salvar."
    );
  });

  it("exibe o aviso no fluxo padronizado de agendamentos sem alterar o responsável enviado", () => {
    expect(appointmentPage).toContain("<AppPageShell>");
    expect(appointmentPage).toContain("AppSectionBlock");
    expect(appointmentPage).toContain("<AppRowActionsDropdown");
    expect(appointmentPageCompact).toContain(
      'personId={ form.assignedToPersonId === "unassigned" ? null : form.assignedToPersonId }'
    );
    expect(appointmentPage).toContain(
      "onWarningShown={assigneeWarningTelemetry.trackShown}"
    );
    expect(createAppointmentModal).toContain(
      "personId={formData.assignedToPersonId}"
    );
    expect(createAppointmentModal).toContain(
      "onWarningShown={assigneeWarningTelemetry.trackShown}"
    );
    expect(appointmentPageCompact).toContain(
      "assigneeWarningTelemetry.trackConfirmed(assignedToPersonId, editing?.id)"
    );
    expect(createAppointmentModal).toContain(
      "assigneeWarningTelemetry.trackConfirmed(payload.assignedToPersonId)"
    );
    expect(appointmentPageCompact).toContain(
      'assignedToPersonId: form.assignedToPersonId === "unassigned" ? null : form.assignedToPersonId'
    );
    expect(createAppointmentModal).toContain(
      "assignedToPersonId: formData.assignedToPersonId || undefined"
    );
  });

  it("exibe o aviso na criação e edição manual de O.S. sem criar bloqueio automático", () => {
    expect(createServiceOrderModal).toContain(
      "personId={formData.assignedToPersonId}"
    );
    expect(editServiceOrderModal).toContain(
      "personId={formData.assignedToPersonId}"
    );
    expect(createServiceOrderModal).toContain(
      "onWarningShown={assigneeWarningTelemetry.trackShown}"
    );
    expect(editServiceOrderModal).toContain(
      "onWarningShown={assigneeWarningTelemetry.trackShown}"
    );
    expect(createServiceOrderModal).toContain(
      "assigneeWarningTelemetry.trackConfirmed(payload.assignedToPersonId)"
    );
    expect(editServiceOrderModal).toContain(
      "assigneeWarningTelemetry.trackConfirmed(parsed.data.assignedToPersonId, serviceOrderId)"
    );
    expect(createServiceOrderModal).toContain(
      "assignedToPersonId: parsed.data.assignedToPersonId || undefined"
    );
    expect(editServiceOrderModal).toContain(
      "? parsed.data.assignedToPersonId\n          : null"
    );
    expect(createServiceOrderModal).not.toContain(
      "getPersonAssignmentWarning("
    );
    expect(editServiceOrderModal).not.toContain("getPersonAssignmentWarning(");
  });
});

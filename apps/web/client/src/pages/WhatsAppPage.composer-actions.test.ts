import { describe, expect, it } from "vitest";

import {
  buildWhatsAppSendPayload,
  getDefaultMessageType,
  getMessageDeliveryPresentation,
  maskPhone,
  presentOfficialWhatsAppActions,
  resolveMessageType,
} from "./WhatsAppPage";

describe("WhatsApp authoritative presentation", () => {
  it("masks personal phone numbers", () => {
    expect(maskPhone("+55 (11) 98765-4321")).toBe("•••• 4321");
    expect(maskPhone(null)).toBe("Telefone cadastrado");
  });

  it("does not claim delivery while queued, sending or uncertain", () => {
    const message = (status: "QUEUED" | "SENDING" | "UNCERTAIN") =>
      getMessageDeliveryPresentation({
        id: "message",
        direction: "OUTBOUND",
        content: "Olá",
        status,
      });
    expect(message("QUEUED").label).toBe("Na fila");
    expect(message("SENDING").label).toBe("Enviando");
    expect(message("UNCERTAIN")).toMatchObject({
      label: "Entrega incerta",
      uncertain: true,
    });
  });

  it("projects official actions without deriving availability or recommendations", () => {
    const official = [
      {
        key: "send-payment-link",
        action: "SEND_PAYMENT_LINK" as const,
        label: "Enviar link oficial",
        group: "Financeiro" as const,
        groupId: "finance" as const,
        availability: "primary" as const,
        disabled: false,
        reason: "Cobrança oficial vinculada",
        requiresHumanApproval: true,
        target: { entityType: "CHARGE", entityId: "charge-1" },
        logicalKey: "official-key",
      },
      {
        key: "confirm-appointment",
        action: "CONFIRM_APPOINTMENT" as const,
        label: "Confirmação indisponível",
        group: "Agenda" as const,
        groupId: "agenda" as const,
        availability: "unavailable" as const,
        disabled: true,
        reason: "Agenda indisponível",
        requiresHumanApproval: true,
      },
    ];
    const palette = presentOfficialWhatsAppActions(official);
    expect(palette.primaryActions).toEqual([official[0]]);
    expect(palette.unavailableActions).toEqual([official[1]]);
    expect(palette.groupedActions.Financeiro).toEqual([official[0]]);
    expect(palette.groupedActions.Agenda).toEqual([official[1]]);
  });

  it("keeps message type and payload presentation contracts", () => {
    expect(getDefaultMessageType()).toBe("MANUAL");
    expect(resolveMessageType({ explicitMessageType: "PAYMENT_LINK" })).toBe(
      "PAYMENT_LINK"
    );
    expect(
      buildWhatsAppSendPayload({
        content: "Olá",
        customerId: "c1",
        messageType: "MANUAL",
      })
    ).toMatchObject({
      content: "Olá",
      customerId: "c1",
      messageType: "MANUAL",
    });
  });
});

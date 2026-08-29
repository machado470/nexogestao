import { describe, expect, it } from "vitest";

import {
  buildWhatsAppComposerActionGroups,
  buildWhatsAppSendPayload,
  getDefaultMessageType,
  getMessageDeliveryPresentation,
  maskPhone,
  resolveMessageType,
} from "./WhatsAppPage";

describe("WhatsApp operational presentation", () => {
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
});

describe("WhatsApp composer action groups", () => {
  it("renders Mais ações as compact operational sections", () => {
    const { groupedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: true,
      canResolveConversation: true,
    });

    expect(Object.keys(groupedActions)).toEqual([
      "Comunicação",
      "Financeiro",
      "Agenda",
      "Ordem de serviço",
      "Execução assistida",
    ]);
    expect(groupedActions.Comunicação.map(action => action.label)).toEqual([
      "Template rápido",
      "Anexar arquivo",
      "Áudio / mensagem de voz",
    ]);
    expect(groupedActions.Financeiro.map(action => action.label)).toEqual([
      "Enviar cobrança",
      "Enviar link de pagamento",
      "Lembrete de pagamento",
    ]);
    expect(groupedActions.Agenda.map(action => action.label)).toEqual([
      "Confirmar agendamento",
      "Lembrete de agendamento",
    ]);
    expect(
      groupedActions["Ordem de serviço"].map(action => action.label)
    ).toEqual(["Atualizar serviço", "Vincular O.S."]);
    expect(
      groupedActions["Execução assistida"].map(action => action.label)
    ).toEqual(["Criar execução assistida", "Marcar conversa como resolvida"]);
  });

  it("keeps unavailable actions disabled with user-facing reasons", () => {
    const { groupedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasOpenCharge: false,
      canSendPaymentLink: false,
      hasUpcomingAppointment: false,
      hasActiveServiceOrder: false,
      canResolveConversation: false,
    });

    expect(
      groupedActions.Comunicação.filter(action => action.disabled).map(
        action => [action.label, action.reason]
      )
    ).toEqual([
      ["Anexar arquivo", "Em breve"],
      ["Áudio / mensagem de voz", "Em breve"],
    ]);
    expect(groupedActions.Financeiro.every(action => action.disabled)).toBe(
      true
    );
    expect(groupedActions.Financeiro.map(action => action.reason)).toEqual([
      "Sem cobrança",
      "Sem cobrança",
      "Sem cobrança",
    ]);
    expect(groupedActions.Agenda.every(action => action.disabled)).toBe(true);
    expect(groupedActions.Agenda.map(action => action.reason)).toEqual([
      "Sem agenda",
      "Sem agenda",
    ]);
    expect(
      groupedActions["Ordem de serviço"].every(action => action.disabled)
    ).toBe(true);
    expect(
      groupedActions["Ordem de serviço"].map(action => action.reason)
    ).toEqual(["Sem O.S.", "Sem O.S."]);
    expect(
      groupedActions["Execução assistida"].every(action => action.disabled)
    ).toBe(true);
  });

  it("classifies composer actions by current context", () => {
    const palette = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasOpenCharge: false,
      canSendPaymentLink: false,
      hasUpcomingAppointment: false,
      hasActiveServiceOrder: false,
      canResolveConversation: false,
    });

    expect(palette.primaryActions.map(action => action.label)).toEqual([
      "Template rápido",
    ]);
    expect(palette.secondaryActions).toEqual([]);
    expect(palette.unavailableActions.map(action => action.reason)).toEqual([
      "Sem cobrança",
      "Sem cobrança",
      "Sem cobrança",
      "Sem agenda",
      "Sem agenda",
      "Sem O.S.",
      "Sem O.S.",
      "Sem ação sugerida",
      "Conversa resolvida",
    ]);
    expect(palette.upcomingActions.map(action => action.label)).toEqual([
      "Anexar arquivo",
      "Áudio / mensagem de voz",
    ]);
    expect(palette.upcomingActions.every(action => action.disabled)).toBe(true);
  });

  it("moves only relevant actions into primary for active operational context", () => {
    const palette = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: true,
      hasPendingAssistedExecution: true,
      hasOpenCharge: true,
      hasPendingCharge: true,
      canSendPaymentLink: true,
      chargeStatus: "OVERDUE",
      hasUpcomingAppointment: true,
      appointmentStatus: "PENDING",
      hasActiveServiceOrder: true,
      serviceOrderStatus: "IN_PROGRESS",
      canResolveConversation: true,
    });

    expect(palette.primaryActions.map(action => action.key)).toEqual([
      "create-assisted-execution",
      "send-charge",
      "send-payment-link",
      "confirm-appointment",
      "update-service",
    ]);
    expect(palette.secondaryActions.map(action => action.key)).toEqual([
      "quick-template",
      "payment-reminder",
      "appointment-reminder",
      "link-service-order",
      "mark-resolved",
    ]);
    expect(palette.unavailableActions).toEqual([]);
  });

  it("shows Recomendadas agora actions when strong context exists", () => {
    const { recommendedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: true,
      hasPendingAssistedExecution: true,
      hasOpenCharge: true,
      hasPendingCharge: true,
      canSendPaymentLink: true,
      chargeDaysOverdue: 3,
      hasUpcomingAppointment: true,
      appointmentStatus: "PENDING",
      hasActiveServiceOrder: true,
      serviceOrderStatus: "IN_PROGRESS",
      canResolveConversation: true,
    });

    expect(recommendedActions.map(action => action.label)).toEqual([
      "Revisar execução assistida",
      "Enviar cobrança",
      "Enviar link de pagamento",
      "Confirmar agendamento",
      "Atualizar serviço",
    ]);
  });

  it("does not show recommended actions when no strong context exists", () => {
    const { recommendedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasPendingAssistedExecution: false,
      hasOpenCharge: false,
      canSendPaymentLink: false,
      hasUpcomingAppointment: false,
      hasActiveServiceOrder: false,
      canResolveConversation: false,
    });

    expect(recommendedActions).toEqual([]);
  });

  it("prioritizes finance actions for overdue or pending charges", () => {
    const { recommendedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasOpenCharge: true,
      hasPendingCharge: true,
      canSendPaymentLink: true,
      chargeStatus: "OVERDUE",
      hasUpcomingAppointment: false,
      hasActiveServiceOrder: false,
      canResolveConversation: true,
    });

    expect(recommendedActions.map(action => action.key).slice(0, 2)).toEqual([
      "send-charge",
      "send-payment-link",
    ]);
  });

  it("prioritizes agenda actions for appointment context", () => {
    const { recommendedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasOpenCharge: false,
      canSendPaymentLink: false,
      hasUpcomingAppointment: true,
      appointmentStatus: "PENDING",
      hasActiveServiceOrder: false,
      canResolveConversation: true,
    });

    expect(recommendedActions.map(action => action.key)).toEqual([
      "confirm-appointment",
    ]);
  });

  it("prioritizes service actions for service order context", () => {
    const { recommendedActions } = buildWhatsAppComposerActionGroups({
      hasSuggestedAction: false,
      hasOpenCharge: false,
      canSendPaymentLink: false,
      hasUpcomingAppointment: false,
      hasActiveServiceOrder: true,
      serviceOrderStatus: "IN_PROGRESS",
      canResolveConversation: true,
    });

    expect(recommendedActions.map(action => action.key)).toEqual([
      "update-service",
    ]);
  });

  it("does not bring back isolated composer controls or General labels", () => {
    const { groupedActions, recommendedActions } =
      buildWhatsAppComposerActionGroups({
        hasSuggestedAction: true,
      });
    const labels = [
      ...recommendedActions,
      ...Object.values(groupedActions).flat(),
    ].map(action => action.label);

    expect(labels).not.toContain("Geral");
    expect(labels).not.toContain("General");
    expect(labels).not.toContain("Intenção");
    expect(labels).not.toContain("Enviar imagem/documento");
    expect(labels).not.toContain("Gravação isolada");
  });
});

describe("WhatsApp composer messageType resolution", () => {
  it("uses MANUAL as the valid default messageType for normal freeform sends", () => {
    expect(getDefaultMessageType()).toBe("MANUAL");
    expect(resolveMessageType()).toBe("MANUAL");
  });

  it("allows contextual actions to override the default messageType", () => {
    expect(
      resolveMessageType({ explicitMessageType: "APPOINTMENT_CONFIRMATION" })
    ).toBe("APPOINTMENT_CONFIRMATION");
    expect(
      resolveMessageType({ explicitMessageType: "APPOINTMENT_REMINDER" })
    ).toBe("APPOINTMENT_REMINDER");
    expect(resolveMessageType({ explicitMessageType: "SERVICE_UPDATE" })).toBe(
      "SERVICE_UPDATE"
    );
    expect(
      resolveMessageType({ explicitMessageType: "PAYMENT_REMINDER" })
    ).toBe("PAYMENT_REMINDER");
    expect(resolveMessageType({ explicitMessageType: "PAYMENT_LINK" })).toBe(
      "PAYMENT_LINK"
    );
    expect(
      resolveMessageType({ explicitMessageType: "EXECUTION_CONFIRMATION" })
    ).toBe("EXECUTION_CONFIRMATION");
  });

  it("prevents undefined, null, General, or unknown values from reaching the API", () => {
    expect(resolveMessageType({ explicitMessageType: undefined })).toBe(
      "MANUAL"
    );
    expect(resolveMessageType({ explicitMessageType: null })).toBe("MANUAL");
    expect(resolveMessageType({ explicitMessageType: "GENERAL" })).toBe(
      "MANUAL"
    );
    expect(resolveMessageType({ explicitMessageType: "General" })).toBe(
      "MANUAL"
    );
  });

  it("builds send mutation payloads with a valid messageType", () => {
    expect(
      buildWhatsAppSendPayload({ content: "Olá", messageType: undefined })
    ).toMatchObject({ content: "Olá", messageType: "MANUAL" });
    expect(
      buildWhatsAppSendPayload({
        content: "Confirmado",
        messageType: "APPOINTMENT_CONFIRMATION",
      })
    ).toMatchObject({
      content: "Confirmado",
      messageType: "APPOINTMENT_CONFIRMATION",
    });
    expect(
      buildWhatsAppSendPayload({
        content: "Serviço atualizado",
        messageType: "SERVICE_UPDATE",
      })
    ).toMatchObject({ messageType: "SERVICE_UPDATE" });
    expect(
      buildWhatsAppSendPayload({
        content: "Link",
        messageType: "PAYMENT_LINK",
      })
    ).toMatchObject({ messageType: "PAYMENT_LINK" });
    expect(
      buildWhatsAppSendPayload({
        content: "Lembrete",
        messageType: "PAYMENT_REMINDER",
      })
    ).toMatchObject({ messageType: "PAYMENT_REMINDER" });
  });
});

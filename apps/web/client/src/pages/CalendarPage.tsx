import { useMemo, useState } from "react";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { AppSectionCard, AppStatCard } from "@/components/app-system";
import { CreateAppointmentModal } from "@/components/CreateAppointmentModal";
import {
  EntityTimelineCard,
  NextBestActionCard,
  OperationalFlowCard,
  OperationalRiskCard,
  OperationalStateCard,
  type OperationalFlowStageState,
  type OperationalStateLevel,
} from "@/components/app/OperationalCommandLayer";
import {
  AppOperationalHeader,
  AppFiltersBar,
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
  AppPageShell,
  AppSectionBlock,
  AppPriorityBadge,
  AppStatusBadge,
} from "@/components/internal-page-system";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";

type ViewMode = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
type EvidenceTone = "neutral" | "success" | "warning" | "danger" | "accent";

type Appointment = {
  id: string;
  customerId: string;
  assignedToPersonId?: string | null;
  customer?: { id: string; name: string } | null;
  startsAt: string;
  endsAt?: string | null;
  status: "SCHEDULED" | "CONFIRMED" | "DONE" | "CANCELED" | "NO_SHOW";
  title?: string | null;
  notes?: string | null;
  updatedAt?: string | null;
  serviceOrderId?: string | null;
  serviceOrder?: { id?: string | null; status?: string | null } | null;
  serviceOrders?: Array<{ id?: string | null; status?: string | null }> | null;
};

const STATUS_COLOR: Record<Appointment["status"], string> = {
  SCHEDULED: "var(--warning)",
  CONFIRMED: "var(--success)",
  DONE: "var(--success)",
  CANCELED: "var(--danger)",
  NO_SHOW: "var(--text-secondary)",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  DONE: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

function getAppointmentEndMs(item: Appointment) {
  const startMs = new Date(item.startsAt).getTime();
  const endMs = item.endsAt ? new Date(item.endsAt).getTime() : NaN;
  if (Number.isFinite(endMs) && endMs > startMs) return endMs;
  return startMs + 60 * 60 * 1000;
}

function getServiceOrderLink(item: Appointment) {
  const directId =
    item.serviceOrderId ??
    item.serviceOrder?.id ??
    item.serviceOrders?.find(order => Boolean(order?.id))?.id ??
    null;
  return directId
    ? `/service-orders?id=${directId}`
    : `/service-orders?appointmentId=${item.id}`;
}

function getPersonName(people: any[], personId?: string | null) {
  if (!personId) return "Responsável não atribuído";
  const person = people.find(
    item => String(item?.id ?? "") === String(personId)
  );
  return String(person?.name ?? person?.fullName ?? "Responsável");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeEventStatus(status: string) {
  if (status === "CANCELED") return "Cancelado";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "DONE") return "Concluído";
  if (status === "NO_SHOW") return "Não compareceu";
  return "Agendado";
}

function getEvidenceTone(
  item: Appointment,
  hasConflict: boolean,
  isDelayed: boolean
): EvidenceTone {
  if (hasConflict || isDelayed || item.status === "NO_SHOW") return "danger";
  if (item.status === "CANCELED") return "warning";
  if (item.status === "CONFIRMED" || item.status === "DONE") return "success";
  return "neutral";
}

export default function CalendarPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useOperationalMemoryState<ViewMode>(
    "nexo.calendar.view.v1",
    "timeGridWeek"
  );
  const [selectedId, setSelectedId] = useOperationalMemoryState<string | null>(
    "nexo.calendar.selected-id.v1",
    null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [teamFilter, setTeamFilter] = useOperationalMemoryState(
    "nexo.calendar.team-filter.v1",
    "all"
  );
  const [serviceFilter, setServiceFilter] = useOperationalMemoryState(
    "nexo.calendar.service-filter.v1",
    "all"
  );
  const [statusFilter, setStatusFilter] = useOperationalMemoryState(
    "nexo.calendar.status-filter.v1",
    "all"
  );
  const [customerFilter, setCustomerFilter] = useOperationalMemoryState(
    "nexo.calendar.customer-filter.v1",
    "all"
  );

  const appointmentsQuery = trpc.nexo.appointments.list.useQuery(
    teamFilter === "all"
      ? { limit: 1000 }
      : { assignedToPersonId: teamFilter, limit: 1000 },
    { enabled: isAuthenticated, retry: false }
  );
  const customersQuery = trpc.nexo.customers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const peopleQuery = trpc.people.assignees.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const appointments = useMemo(
    () => normalizeArrayPayload<Appointment>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const customers = useMemo(
    () =>
      normalizeArrayPayload<{ id: string; name: string }>(customersQuery.data),
    [customersQuery.data]
  );
  const people = useMemo(
    () => normalizeArrayPayload<any>(peopleQuery.data),
    [peopleQuery.data]
  );

  const filteredAppointments = useMemo(() => {
    return appointments.filter(item => {
      const teamOk =
        teamFilter === "all" ||
        String(item.assignedToPersonId ?? "") === teamFilter;
      const serviceOk =
        serviceFilter === "all" ||
        String(item.title ?? "")
          .toLowerCase()
          .includes(serviceFilter.toLowerCase());
      const statusOk = statusFilter === "all" || item.status === statusFilter;
      const customerOk =
        customerFilter === "all" || item.customerId === customerFilter;
      return teamOk && serviceOk && statusOk && customerOk;
    });
  }, [appointments, customerFilter, serviceFilter, statusFilter, teamFilter]);

  const now = Date.now();

  const conflictIds = useMemo(() => {
    const byOwner = new Map<string, Appointment[]>();
    filteredAppointments.forEach(item => {
      if (!item.assignedToPersonId) return;
      const ownerKey = String(item.assignedToPersonId);
      const group = byOwner.get(ownerKey) ?? [];
      group.push(item);
      byOwner.set(ownerKey, group);
    });

    const ids = new Set<string>();
    byOwner.forEach(group => {
      const sorted = [...group].sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      );
      for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const previousEnd = getAppointmentEndMs(previous);
        const currentStart = new Date(current.startsAt).getTime();
        if (currentStart < previousEnd) {
          ids.add(previous.id);
          ids.add(current.id);
        }
      }
    });
    return ids;
  }, [filteredAppointments]);

  const delayedIds = useMemo(() => {
    return new Set(
      filteredAppointments
        .filter(item => {
          const status = String(item.status).toUpperCase();
          return (
            new Date(item.startsAt).getTime() < now &&
            ["SCHEDULED", "CONFIRMED"].includes(status)
          );
        })
        .map(item => item.id)
    );
  }, [filteredAppointments, now]);

  const events = useMemo<EventInput[]>(() => {
    return filteredAppointments.map(item => {
      const hasConflict = conflictIds.has(item.id);
      const isDelayed = delayedIds.has(item.id);
      const signal = hasConflict
        ? "Conflito"
        : isDelayed
          ? "Atraso"
          : STATUS_LABEL[item.status];
      return {
        id: item.id,
        title: `${item.customer?.name ?? "Cliente"} • ${item.title ?? "Serviço"}`,
        start: item.startsAt,
        end: item.endsAt ?? undefined,
        backgroundColor: hasConflict
          ? "var(--danger)"
          : isDelayed
            ? "var(--warning)"
            : STATUS_COLOR[item.status],
        borderColor: hasConflict
          ? "var(--danger)"
          : isDelayed
            ? "var(--warning)"
            : STATUS_COLOR[item.status],
        textColor: "var(--text-primary)",
        extendedProps: {
          status: item.status,
          customerName: item.customer?.name ?? "Cliente",
          serviceName: item.title ?? "Serviço",
          signal,
          timeLabel: new Date(item.startsAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      };
    });
  }, [filteredAppointments, conflictIds, delayedIds]);

  const selected =
    filteredAppointments.find(item => item.id === selectedId) ?? null;

  const executiveRead = useMemo(() => {
    const oneHour = 60 * 60 * 1000;
    const conflicts = conflictIds.size;
    const overload = filteredAppointments.filter(item => {
      const start = new Date(item.startsAt).getTime();
      return start - now <= oneHour && start - now > 0;
    }).length;
    const confirmed = filteredAppointments.filter(
      item => item.status === "CONFIRMED"
    ).length;
    const inProgress = 0;
    const activePeople = teamFilter === "all" ? Math.max(people.length, 1) : 1;
    const assignedActiveAppointments = filteredAppointments.filter(
      item =>
        Boolean(item.assignedToPersonId) &&
        !["CANCELED", "DONE", "NO_SHOW"].includes(item.status)
    ).length;
    const possibleFits = Math.max(
      0,
      activePeople * 12 - assignedActiveAppointments
    );

    return { conflicts, overload, confirmed, inProgress, possibleFits };
  }, [filteredAppointments, conflictIds, now, people.length, teamFilter]);

  const immediateAttention = useMemo(() => {
    return filteredAppointments
      .map(item => {
        const hasConflict = conflictIds.has(item.id);
        const isDelayed = delayedIds.has(item.id);
        if (!hasConflict && !isDelayed) return null;
        return {
          item,
          tone: hasConflict ? "critical" : "warning",
          label: hasConflict ? "Conflito de horário" : "Atraso operacional",
        };
      })
      .filter(Boolean)
      .slice(0, 3) as Array<{
      item: Appointment;
      tone: "critical" | "warning";
      label: string;
    }>;
  }, [filteredAppointments, conflictIds, delayedIds]);

  const activeAppointments = useMemo(
    () =>
      filteredAppointments.filter(
        item => !["CANCELED", "DONE", "NO_SHOW"].includes(item.status)
      ),
    [filteredAppointments]
  );

  const calendarCommand = useMemo(() => {
    const byOwner = new Map<string, Appointment[]>();
    activeAppointments.forEach(item => {
      const ownerKey = String(item.assignedToPersonId ?? "unassigned");
      const group = byOwner.get(ownerKey) ?? [];
      group.push(item);
      byOwner.set(ownerKey, group);
    });

    const overloadedOwners = Array.from(byOwner.entries())
      .map(([ownerId, group]) => ({ ownerId, count: group.length, group }))
      .filter(owner => owner.ownerId !== "unassigned" && owner.count >= 6)
      .sort((a, b) => b.count - a.count);

    const dayLoad = new Map<string, number>();
    activeAppointments.forEach(item => {
      const dayKey = new Date(item.startsAt).toISOString().slice(0, 10);
      dayLoad.set(dayKey, (dayLoad.get(dayKey) ?? 0) + 1);
    });
    const busiestDay = Array.from(dayLoad.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];

    const unconfirmed = activeAppointments.filter(
      item => item.status === "SCHEDULED"
    );
    const delayed = activeAppointments.filter(item => delayedIds.has(item.id));
    const withServiceOrder = activeAppointments.filter(
      item =>
        Boolean(item.serviceOrderId) ||
        Boolean(item.serviceOrder?.id) ||
        Boolean(item.serviceOrders?.some(order => Boolean(order?.id)))
    );
    const unassigned = activeAppointments.filter(
      item => !item.assignedToPersonId
    );

    const possibleFits = executiveRead.possibleFits;
    const emptyWindowSignal =
      activeAppointments.length > 0 &&
      possibleFits >= Math.max(6, people.length * 4);
    const conflictSample = activeAppointments.find(item =>
      conflictIds.has(item.id)
    );
    const overloadedOwner = overloadedOwners[0] ?? null;
    const delayedSample = delayed[0] ?? null;
    const unconfirmedSample = unconfirmed[0] ?? null;

    let level: OperationalStateLevel = "NORMAL";
    let stateReason =
      "Agenda distribuída no recorte atual, sem conflito de responsável ou atraso operacional relevante.";
    let stateImpact =
      "O calendário sustenta a leitura estratégica do tempo: a equipe pode revisar a semana e manter o ritmo de execução.";

    if (
      conflictIds.size > 0 ||
      delayed.length >= 3 ||
      (busiestDay?.[1] ?? 0) >= 10
    ) {
      level = "RESTRICTED";
      stateReason = conflictSample
        ? `${conflictSample.customer?.name ?? "Cliente"} tem sobreposição no responsável ${getPersonName(people, conflictSample.assignedToPersonId)}.`
        : delayed.length >= 3
          ? `${delayed.length} agendamentos ativos já passaram do horário planejado.`
          : `Dia com ${busiestDay?.[1] ?? 0} agendamentos ativos no mesmo recorte.`;
      stateImpact =
        "O tempo da operação está travado: execução, O.S. e governança podem receber atraso em cadeia se o ajuste não acontecer agora.";
    } else if (
      overloadedOwner ||
      unconfirmed.length > 0 ||
      delayed.length > 0 ||
      emptyWindowSignal ||
      unassigned.length > 0
    ) {
      level = "WARNING";
      stateReason = overloadedOwner
        ? `${getPersonName(people, overloadedOwner.ownerId)} concentra ${overloadedOwner.count} agendamentos ativos.`
        : delayedSample
          ? `${delayedSample.customer?.name ?? "Cliente"} está atrasado desde ${formatDateTime(delayedSample.startsAt)}.`
          : unconfirmedSample
            ? `${unconfirmed.length} agendamento(s) ainda aguardam confirmação.`
            : unassigned.length > 0
              ? `${unassigned.length} agendamento(s) sem responsável atribuído.`
              : `${possibleFits} janelas úteis indicam agenda vazia demais para a capacidade atual.`;
      stateImpact =
        "Há oportunidade de rebalancear o tempo antes que a fila vire conflito, atraso ou ociosidade operacional.";
    }

    const risk = conflictSample
      ? {
          title: "Conflito entre atendimentos",
          reason: `${conflictSample.customer?.name ?? "Cliente"} disputa horário com outro evento do mesmo responsável.`,
          impact:
            "A equipe pode perder a janela de execução e empurrar O.S., Timeline e governança para tratamento corretivo.",
          ctaLabel: "Ver conflitos",
          appointmentId: conflictSample.id,
          action: "reschedule" as const,
        }
      : overloadedOwner
        ? {
            title: "Responsável sobrecarregado",
            reason: `${getPersonName(people, overloadedOwner.ownerId)} concentra ${overloadedOwner.count} agendamentos ativos no recorte.`,
            impact:
              "A distribuição desigual aumenta chance de atraso, remarcação e execução sem prova operacional no tempo certo.",
            ctaLabel: "Revisar capacidade",
            appointmentId: overloadedOwner.group[0]?.id,
            action: "rebalance" as const,
          }
        : delayedSample
          ? {
              title: "Risco de atrasar execução",
              reason: `${delayedSample.customer?.name ?? "Cliente"} atrasado desde ${formatDateTime(delayedSample.startsAt)}.`,
              impact: "Pode gerar conflito, atraso ou ociosidade operacional.",
              ctaLabel: "Revisar agenda do dia",
              appointmentId: delayedSample.id,
              action: "review" as const,
            }
          : unconfirmedSample
            ? {
                title: "Agendamentos sem confirmação",
                reason: `${unconfirmed.length} evento(s) ainda estão como agendado, sem confirmação operacional.`,
                impact:
                  "Janelas não confirmadas podem virar ociosidade, remarcação ou conflito de última hora.",
                ctaLabel: "Revisar agendamento",
                appointmentId: unconfirmedSample.id,
                action: "confirm" as const,
              }
            : emptyWindowSignal
              ? {
                  title: "Agenda vazia demais",
                  reason: `${possibleFits} janelas úteis permanecem disponíveis no recorte filtrado.`,
                  impact:
                    "Capacidade sem ocupação reduz previsibilidade de produção e pode ocultar demanda fora do calendário.",
                  ctaLabel: "Ver janelas livres",
                  appointmentId: activeAppointments[0]?.id,
                  action: "fill" as const,
                }
              : {
                  title: "Calendário saudável",
                  reason:
                    "Não há conflito, sobrecarga, atraso ou vazio crítico no recorte atual.",
                  impact:
                    "A operação pode usar o calendário para revisão preventiva da semana sem acionar fluxo automático.",
                  ctaLabel: "Revisar semana",
                  appointmentId: activeAppointments[0]?.id,
                  action: "reviewWeek" as const,
                };

    const nextAction = {
      title: risk.ctaLabel,
      entity: risk.appointmentId
        ? "Agendamento selecionado"
        : "Calendário operacional",
      reason:
        delayed.length > 0
          ? `${delayed.length} atraso detectado no período.`
          : risk.reason,
      impact:
        delayed.length > 0
          ? "Pode reduzir previsibilidade de O.S. e execução."
          : risk.impact,
      primaryActionLabel: risk.ctaLabel,
      appointmentId: risk.appointmentId,
      action: risk.action,
    };

    return {
      level,
      stateReason,
      stateImpact,
      risk,
      nextAction,
      overloadedOwners,
      unconfirmedCount: unconfirmed.length,
      delayedCount: delayed.length,
      withServiceOrderCount: withServiceOrder.length,
      unassignedCount: unassigned.length,
      emptyWindowSignal,
      busiestDayCount: busiestDay?.[1] ?? 0,
    };
  }, [
    activeAppointments,
    conflictIds,
    delayedIds,
    executiveRead.possibleFits,
    people,
  ]);

  const flowStages = useMemo(
    () =>
      [
        {
          id: "time",
          label: "Tempo",
          summary:
            filteredAppointments.length > 0
              ? "Eventos distribuídos no período."
              : "Eventos distribuídos no período.",
          state:
            calendarCommand.level === "RESTRICTED"
              ? "blocked"
              : calendarCommand.level === "WARNING"
                ? "warning"
                : filteredAppointments.length > 0
                  ? "active"
                  : "idle",
          countOrValue: String(filteredAppointments.length),
        },
        {
          id: "appointment",
          label: "Agendamentos",
          summary:
            calendarCommand.unconfirmedCount > 0
              ? `${calendarCommand.unconfirmedCount} aguardando confirmação.`
              : "Eventos preparados para execução.",
          state: calendarCommand.unconfirmedCount > 0 ? "warning" : "done",
          countOrValue: String(activeAppointments.length),
          hrefLabel: "Abrir Agendamentos",
          onClick: () => navigate("/appointments?source=calendar"),
        },
        {
          id: "owner",
          label: "Responsáveis",
          summary:
            calendarCommand.overloadedOwners.length > 0
              ? `${getPersonName(people, calendarCommand.overloadedOwners[0].ownerId)} está sobrecarregado.`
              : calendarCommand.unassignedCount > 0
                ? `${calendarCommand.unassignedCount} sem responsável.`
                : "Equipe vinculada aos eventos.",
          state:
            calendarCommand.overloadedOwners.length > 0
              ? "warning"
              : calendarCommand.unassignedCount > 0
                ? "warning"
                : "done",
        },
        {
          id: "service-order",
          label: "Ordens de Serviço",
          summary:
            calendarCommand.withServiceOrderCount > 0
              ? "Vínculos operacionais retornados."
              : "Vínculos operacionais retornados.",
          state: calendarCommand.withServiceOrderCount > 0 ? "active" : "idle",
          hrefLabel: "Ver O.S.",
          onClick: () => navigate("/service-orders?source=calendar"),
        },
        {
          id: "execution",
          label: "Execução",
          summary:
            calendarCommand.delayedCount > 0
              ? `${calendarCommand.delayedCount} atraso(s) pressionam execução.`
              : "Atrasos e andamento pressionam o dia.",
          state: calendarCommand.delayedCount > 0 ? "blocked" : "active",
        },
        {
          id: "timeline",
          label: "Evidências",
          summary: "Eventos reais derivados do calendário.",
          state: filteredAppointments.length > 0 ? "active" : "idle",
          hrefLabel: "Abrir Timeline oficial",
          onClick: () => navigate("/timeline?source=calendar"),
        },
        {
          id: "risk",
          label: "Governança",
          summary:
            calendarCommand.level === "NORMAL"
              ? "Sinais antes de afetar o controle operacional."
              : "Sinais antes de afetar o controle operacional.",
          state:
            calendarCommand.level === "RESTRICTED"
              ? "blocked"
              : calendarCommand.level === "WARNING"
                ? "warning"
                : "done",
          hrefLabel: "Ver Governança",
          onClick: () => navigate("/governance?source=calendar"),
        },
      ] satisfies Array<{
        id: string;
        label: string;
        summary: string;
        state: OperationalFlowStageState;
        countOrValue?: string;
        hrefLabel?: string;
        onClick?: () => void;
      }>,
    [
      activeAppointments.length,
      calendarCommand,
      filteredAppointments.length,
      navigate,
      people,
    ]
  );

  const distribution = useMemo(() => {
    const total = filteredAppointments.length;
    const confirmed = filteredAppointments.filter(
      item => item.status === "CONFIRMED"
    ).length;
    const pending = filteredAppointments.filter(
      item => item.status === "SCHEDULED"
    ).length;
    const completed = filteredAppointments.filter(
      item => item.status === "DONE"
    ).length;
    const cancelled = filteredAppointments.filter(
      item => item.status === "CANCELED"
    ).length;
    const waiting = filteredAppointments.filter(
      item => item.status === "NO_SHOW"
    ).length;
    const activePeople = teamFilter === "all" ? Math.max(people.length, 1) : 1;
    const capacityTotal = activePeople * 12;
    const capacityUsed = activeAppointments.length;
    const capacityPercent =
      capacityTotal > 0
        ? Math.min(100, Math.round((capacityUsed / capacityTotal) * 100))
        : 0;
    const availableTime = Math.max(0, capacityTotal - capacityUsed);
    return {
      total,
      confirmed,
      pending,
      completed,
      cancelled,
      waiting,
      capacityTotal,
      capacityUsed,
      capacityPercent,
      availableTime,
    };
  }, [
    activeAppointments.length,
    filteredAppointments,
    people.length,
    teamFilter,
  ]);

  const selectedOrCritical = selected ?? immediateAttention[0]?.item ?? null;

  const heroSignals = useMemo(() => {
    const signals = [
      delayedIds.size > 0 ? `${delayedIds.size} atraso(s) detectado(s)` : null,
      calendarCommand.unassignedCount > 0
        ? `${calendarCommand.unassignedCount} sem responsável`
        : null,
      executiveRead.possibleFits > 0
        ? `${executiveRead.possibleFits} janelas livres`
        : null,
      executiveRead.conflicts > 0
        ? `${executiveRead.conflicts} conflito detectado`
        : null,
      distribution.cancelled > 0
        ? `${distribution.cancelled} cancelados`
        : null,
      executiveRead.confirmed > 0
        ? `${executiveRead.confirmed} preparado para executar`
        : null,
    ].filter(Boolean) as string[];
    const uniqueSignals = Array.from(new Set(signals));

    return uniqueSignals.length > 0
      ? uniqueSignals.slice(0, 4)
      : ["Operação do tempo monitorada"];
  }, [
    calendarCommand.unassignedCount,
    delayedIds.size,
    distribution.cancelled,
    executiveRead.conflicts,
    executiveRead.confirmed,
    executiveRead.possibleFits,
  ]);

  const periodSummary = `${filteredAppointments.length} eventos no período · ${delayedIds.size} atraso · ${executiveRead.possibleFits} janelas livres`;

  const availabilityMarkers = useMemo<EventInput[]>(() => {
    if (filteredAppointments.length >= 6 || executiveRead.possibleFits === 0)
      return [];
    const baseDate = filteredAppointments[0]?.startsAt
      ? new Date(filteredAppointments[0].startsAt)
      : new Date();
    return [9, 14, 16]
      .slice(0, Math.min(3, executiveRead.possibleFits))
      .map(hour => {
        const start = new Date(baseDate);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 45);
        return {
          id: `availability-${hour}`,
          title: "Janela livre calculada",
          start: start.toISOString(),
          end: end.toISOString(),
          display: "background",
          backgroundColor: "var(--accent-soft)",
          extendedProps: { isAvailabilityMarker: true },
        };
      });
  }, [executiveRead.possibleFits, filteredAppointments]);

  const operationalEvidence = useMemo(() => {
    return [...filteredAppointments]
      .sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        type: conflictIds.has(item.id)
          ? "Conflito"
          : delayedIds.has(item.id)
            ? "Atraso"
            : STATUS_LABEL[item.status],
        occurredAt: formatDateTime(item.startsAt),
        entity: item.customer?.name ?? "Cliente não identificado",
        actor: getPersonName(people, item.assignedToPersonId),
        tone: getEvidenceTone(
          item,
          conflictIds.has(item.id),
          delayedIds.has(item.id)
        ),
        summary: `${item.title ?? "Serviço não informado"}. Evento real do calendário${item.endsAt ? ` até ${formatDateTime(item.endsAt)}` : " sem término informado"}; não substitui Timeline oficial.`,
      }));
  }, [conflictIds, delayedIds, filteredAppointments, people]);

  const runCalendarAction = (appointmentId?: string, action?: string) => {
    if (action === "reviewWeek") {
      setViewMode("timeGridWeek");
      return;
    }
    if (action === "fill") {
      setShowCreateModal(true);
      return;
    }
    if (appointmentId) {
      const queryAction =
        action === "confirm"
          ? "confirm"
          : action === "reschedule" || action === "rebalance"
            ? "reschedule"
            : "review";
      navigate(
        `/appointments?id=${appointmentId}&action=${queryAction}&source=calendar`
      );
      return;
    }
    navigate("/appointments?source=calendar");
  };

  const isLoading =
    appointmentsQuery.isLoading ||
    customersQuery.isLoading ||
    peopleQuery.isLoading;
  const hasError =
    appointmentsQuery.isError || customersQuery.isError || peopleQuery.isError;

  const refetchAll = () => {
    void Promise.all([
      appointmentsQuery.refetch(),
      customersQuery.refetch(),
      peopleQuery.refetch(),
    ]);
  };

  return (
    <AppPageShell>
      <AppOperationalHeader
        title="Calendário operacional"
        description="Centro de controle do tempo da operação."
        primaryAction={
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo agendamento
          </Button>
        }
        secondaryActions={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            Atualizar leitura
          </Button>
        }
        contextChips={
          <>
            {heroSignals.map(signal => (
              <AppStatusBadge key={signal} label={signal} />
            ))}
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          Calendário mostra distribuição, conflitos, vazios e sobrecarga do
          tempo. Agendamentos continua sendo o fluxo operacional da entrada.
        </p>
      </AppOperationalHeader>

      {!isLoading && !hasError ? (
        <div className="mt-4 space-y-4">
          <section
            aria-label="Visão estratégica do tempo"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            <AppStatCard
              label="Conflitos agora"
              value={String(executiveRead.conflicts)}
              helper="Precisam de decisão para não travar execução."
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <AppStatCard
              label="Sobrecarga"
              value={String(calendarCommand.overloadedOwners.length)}
              helper="Pessoas acima do limite operacional do recorte."
              icon={<Clock3 className="h-4 w-4" />}
            />
            <AppStatCard
              label="Janelas livres"
              value={String(executiveRead.possibleFits)}
              helper="Oportunidades disponíveis para encaixe seguro."
              icon={<Plus className="h-4 w-4" />}
            />
            <AppStatCard
              label="Preparados para executar"
              value={String(executiveRead.confirmed)}
              helper="Agendamentos prontos para execução."
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <AppStatCard
              label="Capacidade da equipe"
              value={`${distribution.capacityPercent}%`}
              helper="Uso do tempo disponível no período filtrado."
              icon={<RefreshCcw className="h-4 w-4" />}
            />
          </section>

          <OperationalFlowCard
            title="Tempo → Agendamentos → Responsáveis → Ordens de Serviço → Execução → Evidências → Governança"
            subtitle="Pipeline operacional do tempo: leitura macro de distribuição, responsáveis, ordens, execução, evidências e governança."
            stages={flowStages}
          />

          <div className="grid gap-4 xl:grid-cols-12">
            <AppSectionCard className="space-y-3 xl:col-span-7">
              <div>
                <p className="nexo-overline">Alertas e distribuição</p>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Atenções que pedem decisão agora
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Até três sinais de atraso, conflito ou risco que podem
                  impactar O.S. e governança.
                </p>
              </div>
              {immediateAttention.length > 0 ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
                  {immediateAttention
                    .slice(0, 3)
                    .map(({ item, tone, label }) => (
                      <article
                        key={item.id}
                        className="min-w-[18rem] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                              {item.customer?.name ??
                                "Cliente não identificado"}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {formatDateTime(item.startsAt)}
                            </p>
                          </div>
                          <AppStatusBadge label={label} />
                        </div>
                        <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
                          {tone === "critical"
                            ? "Conflito de agenda no mesmo responsável."
                            : "Serviço passou do horário planejado."}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                          Consequência: pode impactar O.S. e prova operacional.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(
                                `/appointments?id=${item.id}&source=calendar`
                              )
                            }
                          >
                            Abrir agendamento
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(
                                `/appointments?id=${item.id}&action=reschedule&source=calendar`
                              )
                            }
                          >
                            Remarcar
                          </Button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <AppPageEmptyState
                  title="Sem decisão urgente"
                  description="Nenhum atraso ou conflito crítico no recorte atual."
                />
              )}
            </AppSectionCard>

            <AppSectionCard className="space-y-3 xl:col-span-5">
              <div>
                <p className="nexo-overline">Distribuição do tempo</p>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Carga do período
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Eventos no período", distribution.total],
                  ["Preparados para executar", distribution.confirmed],
                  [
                    "Precisam de atenção",
                    distribution.pending + distribution.waiting,
                  ],
                  ["Finalizados", distribution.completed],
                  ["Cancelados", distribution.cancelled],
                  ["Janelas livres", distribution.availableTime],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-2"
                  >
                    <p className="text-xs text-[var(--text-secondary)]">
                      {label}
                    </p>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                Capacidade do período:{" "}
                <strong className="text-[var(--text-primary)]">
                  {distribution.capacityUsed}/{distribution.capacityTotal}
                </strong>{" "}
                · Janelas livres:{" "}
                <strong className="text-[var(--text-primary)]">
                  {distribution.availableTime}
                </strong>{" "}
                janelas.
              </div>
            </AppSectionCard>
          </div>
        </div>
      ) : null}

      <AppFiltersBar className="mt-4 gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={viewMode}
            onChange={event => setViewMode(event.target.value as ViewMode)}
          >
            <option value="timeGridDay">Dia</option>
            <option value="timeGridWeek">Semana</option>
            <option value="dayGridMonth">Mês</option>
          </select>
          <select
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={teamFilter}
            onChange={event => setTeamFilter(event.target.value)}
          >
            <option value="all">Equipe: todas</option>
            {people.map((person: any) => (
              <option key={String(person.id)} value={String(person.id)}>
                {String(person.name ?? "Colaborador")}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={serviceFilter}
            onChange={event => setServiceFilter(event.target.value)}
          >
            <option value="all">Serviço: todos</option>
            <option value="instalação">Instalação</option>
            <option value="manutenção">Manutenção</option>
            <option value="vistoria">Vistoria</option>
          </select>
          <select
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value="all">Status: todos</option>
            <option value="SCHEDULED">Agendado</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="DONE">Concluído</option>
            <option value="CANCELED">Cancelado</option>
          </select>
          <select
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={customerFilter}
            onChange={event => setCustomerFilter(event.target.value)}
          >
            <option value="all">Cliente: todos</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
      </AppFiltersBar>

      {isLoading ? (
        <AppPageLoadingState description="Consolidando leitura macro do tempo da operação..." />
      ) : null}
      {hasError ? (
        <AppPageErrorState
          description="Não foi possível carregar o calendário da operação."
          onAction={refetchAll}
        />
      ) : null}

      {!isLoading && !hasError ? (
        <>
          {filteredAppointments.length === 0 ? (
            <AppPageEmptyState
              title="Sem eventos para este recorte"
              description="Ajuste filtros ou crie um novo agendamento para preencher vazios operacionais."
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-12">
                <AppSectionBlock
                  title="Calendário visual interativo"
                  subtitle="Grade de leitura com evento legível: cliente, horário, serviço e status."
                  className="xl:col-span-8"
                >
                  <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm font-medium text-[var(--text-primary)]">
                    {periodSummary}
                    <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">
                      Período útil destacado; marcações suaves indicam janela
                      livre calculada, não agendamento real.
                    </span>
                  </div>
                  <div className="hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 shadow-sm xl:block">
                    <FullCalendar
                      plugins={[
                        dayGridPlugin,
                        timeGridPlugin,
                        interactionPlugin,
                      ]}
                      initialView={viewMode}
                      viewDidMount={view =>
                        setViewMode(view.view.type as ViewMode)
                      }
                      headerToolbar={false}
                      events={[...events, ...availabilityMarkers]}
                      eventClick={(arg: EventClickArg) => {
                        if (arg.event.extendedProps.isAvailabilityMarker)
                          return;
                        setSelectedId(arg.event.id);
                      }}
                      eventContent={eventInfo => (
                        <div className="rounded-lg border border-[var(--border-strong)] border-l-4 border-l-[var(--accent-primary)] bg-[var(--surface-primary)] p-2 text-[11px] leading-tight shadow-md ring-1 ring-black/5">
                          <p className="truncate text-[12px] font-black text-[var(--text-primary)]">
                            {eventInfo.event.extendedProps.timeLabel} ·{" "}
                            {eventInfo.event.extendedProps.customerName}
                          </p>
                          <p className="truncate font-semibold text-[var(--text-primary)]">
                            {eventInfo.event.extendedProps.serviceName}
                          </p>
                          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                            {eventInfo.event.extendedProps.signal}
                          </p>
                        </div>
                      )}
                      height="auto"
                      contentHeight={560}
                      editable={false}
                      locale="pt-br"
                      allDaySlot={false}
                      slotMinTime="07:00:00"
                      slotMaxTime="19:00:00"
                      businessHours={{
                        daysOfWeek: [1, 2, 3, 4, 5],
                        startTime: "08:00",
                        endTime: "18:00",
                      }}
                      nowIndicator
                    />
                  </div>
                  <div className="space-y-2 xl:hidden">
                    {filteredAppointments.slice(0, 8).map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-left"
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="block text-sm font-semibold text-[var(--text-primary)]">
                          {formatDateTime(item.startsAt)} ·{" "}
                          {item.customer?.name ?? "Cliente não identificado"}
                        </span>
                        <span className="block text-xs text-[var(--text-secondary)]">
                          {item.title ?? "Serviço não informado"} ·{" "}
                          {STATUS_LABEL[item.status]}
                        </span>
                      </button>
                    ))}
                  </div>
                </AppSectionBlock>

                <AppSectionBlock
                  title="Ficha operacional do evento"
                  subtitle="Contexto mínimo para decidir e acionar rápido."
                  className="xl:col-span-4"
                >
                  {selectedOrCritical ? (
                    <div className="space-y-3">
                      {!selected ? (
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
                          Nenhum evento selecionado. Exibindo próximo evento
                          crítico para orientar a decisão.
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
                        {[
                          [
                            "Cliente",
                            selectedOrCritical.customer?.name ??
                              "Cliente não identificado",
                          ],
                          [
                            "Serviço",
                            selectedOrCritical.title ?? "Serviço não informado",
                          ],
                          [
                            "Horário",
                            `${formatDateTime(selectedOrCritical.startsAt)}–${selectedOrCritical.endsAt ? formatDateTime(selectedOrCritical.endsAt) : "término não informado"}`,
                          ],
                          [
                            "Duração",
                            `${Math.max(1, Math.round((getAppointmentEndMs(selectedOrCritical) - new Date(selectedOrCritical.startsAt).getTime()) / 60000))} min`,
                          ],
                          [
                            "Responsável",
                            selectedOrCritical.assignedToPersonId
                              ? getPersonName(
                                  people,
                                  selectedOrCritical.assignedToPersonId
                                )
                              : "Não informado",
                          ],
                          [
                            "Status",
                            normalizeEventStatus(selectedOrCritical.status),
                          ],
                          ["Próxima ação", "Abrir agendamento"],
                          [
                            "O.S.",
                            selectedOrCritical.serviceOrderId ||
                            selectedOrCritical.serviceOrder?.id ||
                            selectedOrCritical.serviceOrders?.some(order =>
                              Boolean(order?.id)
                            )
                              ? "Vínculo retornado"
                              : "Sem vínculo retornado",
                          ],
                          [
                            "Risco",
                            conflictIds.has(selectedOrCritical.id)
                              ? "Conflito detectado"
                              : delayedIds.has(selectedOrCritical.id)
                                ? "Atraso detectado"
                                : "Sem risco crítico no recorte",
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="border-b border-[var(--border-subtle)] py-2 last:border-b-0"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                              {label}
                            </p>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/appointments?id=${selectedOrCritical.id}&source=calendar&mode=operational_list`
                            )
                          }
                        >
                          Abrir agendamento
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              `/appointments?id=${selectedOrCritical.id}&action=reschedule&source=calendar`
                            )
                          }
                        >
                          <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Remarcar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(getServiceOrderLink(selectedOrCritical))
                          }
                        >
                          Abrir O.S. se existir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            selectedOrCritical.customerId &&
                            navigate(
                              `/customers?id=${selectedOrCritical.customerId}&source=calendar`
                            )
                          }
                        >
                          Abrir cliente se existir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("/timeline?source=calendar")}
                        >
                          Abrir Timeline oficial
                        </Button>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Ações seguras são navegação para fluxos existentes;
                        nenhuma execução automática é disparada pelo calendário.
                      </p>
                    </div>
                  ) : (
                    <AppPageEmptyState
                      title="Nenhum evento crítico no período"
                      description="Use os filtros ou crie um novo agendamento."
                    />
                  )}
                </AppSectionBlock>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <OperationalStateCard
                  title="Leitura macro do tempo"
                  level={calendarCommand.level}
                  reason={calendarCommand.stateReason}
                  impact={calendarCommand.stateImpact}
                  detailsLabel="Ver semana"
                  onDetails={() => setViewMode("timeGridWeek")}
                />
                <OperationalRiskCard
                  title={calendarCommand.risk.title}
                  reason={calendarCommand.risk.reason}
                  impact={calendarCommand.risk.impact}
                  ctaLabel={calendarCommand.risk.ctaLabel}
                  onClick={() =>
                    runCalendarAction(
                      calendarCommand.risk.appointmentId,
                      calendarCommand.risk.action
                    )
                  }
                />
                <NextBestActionCard
                  title="Próxima melhor ação"
                  entity="Calendário operacional"
                  reason={calendarCommand.nextAction.reason}
                  impact={calendarCommand.nextAction.impact}
                  safetyNote="CTAs navegam para fluxos existentes ou ajustam filtros; o calendário não executa automação falsa."
                  primaryActionLabel={
                    calendarCommand.nextAction.primaryActionLabel
                  }
                  onPrimaryAction={() =>
                    runCalendarAction(
                      calendarCommand.nextAction.appointmentId,
                      calendarCommand.nextAction.action
                    )
                  }
                  secondaryActionLabel="Abrir Timeline oficial"
                  onSecondaryAction={() =>
                    navigate("/timeline?source=calendar")
                  }
                />
              </div>

              <AppSectionCard className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="nexo-overline">
                      Ações rápidas e inteligência
                    </p>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      Ações seguras para reorganizar o tempo
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Calendário orienta; Agendamentos executa criação,
                      confirmação e remarcação.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setShowCreateModal(true)}>
                      Novo agendamento
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatusFilter("all")}
                    >
                      Ver janelas livres
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runCalendarAction(
                          calendarCommand.risk.appointmentId,
                          calendarCommand.risk.action
                        )
                      }
                    >
                      Ver conflitos
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTeamFilter("all")}
                    >
                      Revisar capacidade
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/timeline?source=calendar")}
                    >
                      Abrir Timeline oficial
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                    Insight:{" "}
                    {executiveRead.possibleFits > 0
                      ? "existem janelas livres para reduzir conflito ou antecipar demanda."
                      : "a capacidade está ocupada; evite novos encaixes sem rebalancear."}
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                    Equipe hoje: {distribution.capacityPercent}% de uso,{" "}
                    {activeAppointments.length} agendamentos ativos.
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                    Eventos sem vínculo de O.S.:{" "}
                    {Math.max(
                      0,
                      activeAppointments.length -
                        calendarCommand.withServiceOrderCount
                    )}{" "}
                    · CTA seguro: Ver e vincular.
                  </div>
                </div>
              </AppSectionCard>

              <EntityTimelineCard
                title="Prova operacional / Timeline do tempo"
                subtitle="Fallback seguro: eventos derivados de agendamentos com datas reais; não substitui Timeline oficial."
                events={operationalEvidence}
                fullTimelineLabel="Abrir Timeline oficial"
                onFullTimeline={() => navigate("/timeline?source=calendar")}
              />
            </>
          )}
        </>
      ) : null}

      <CreateAppointmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={refetchAll}
        customers={customers}
      />
    </AppPageShell>
  );
}

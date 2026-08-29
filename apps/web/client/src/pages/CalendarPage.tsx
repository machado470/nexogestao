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
  type OperationalFlowStageState,
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

type PersonAssignee = {
  id: string;
  name?: string | null;
  fullName?: string | null;
  dailyAppointmentCapacity?: number | null;
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

function getPersonName(people: PersonAssignee[], personId?: string | null) {
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
    () => normalizeArrayPayload<PersonAssignee>(peopleQuery.data),
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

  const activeAppointments = useMemo(
    () =>
      filteredAppointments.filter(
        item => !["CANCELED", "DONE", "NO_SHOW"].includes(item.status)
      ),
    [filteredAppointments]
  );

  const conflictIds = useMemo(() => {
    const byOwner = new Map<string, Appointment[]>();

    activeAppointments.forEach(item => {
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
          new Date(a.startsAt).getTime() -
          new Date(b.startsAt).getTime()
      );

      let overlappingAnchor: Appointment | null = null;
      let overlappingEnd = Number.NEGATIVE_INFINITY;

      for (const current of sorted) {
        const currentStart =
          new Date(current.startsAt).getTime();
        const currentEnd = getAppointmentEndMs(current);

        if (
          overlappingAnchor &&
          currentStart < overlappingEnd
        ) {
          ids.add(overlappingAnchor.id);
          ids.add(current.id);
        }

        if (
          !overlappingAnchor ||
          currentEnd > overlappingEnd
        ) {
          overlappingAnchor = current;
          overlappingEnd = currentEnd;
        }
      }
    });

    return ids;
  }, [activeAppointments]);

  const delayedIds = useMemo(() => {
    return new Set(
      activeAppointments
        .filter(
          item => new Date(item.startsAt).getTime() < now
        )
        .map(item => item.id)
    );
  }, [activeAppointments, now]);

  const capacitySnapshot = useMemo(() => {
    const reference = new Date(now);

    const relevantPeople =
      teamFilter === "all"
        ? people
        : people.filter(
            person =>
              String(person.id) === String(teamFilter)
          );

    const rows = relevantPeople.map(person => {
      const rawCapacity =
        Number(person.dailyAppointmentCapacity);

      const dailyAppointmentCapacity =
        Number.isFinite(rawCapacity) && rawCapacity > 0
          ? rawCapacity
          : null;

      const todayAppointmentsCount =
        appointments.filter(item => {
          if (
            !item.assignedToPersonId ||
            String(item.assignedToPersonId) !==
              String(person.id)
          ) {
            return false;
          }

          if (
            !["SCHEDULED", "CONFIRMED"].includes(
              item.status
            )
          ) {
            return false;
          }

          const startsAt = new Date(item.startsAt);

          return (
            startsAt.getFullYear() ===
              reference.getFullYear() &&
            startsAt.getMonth() ===
              reference.getMonth() &&
            startsAt.getDate() ===
              reference.getDate()
          );
        }).length;

      const appointmentCapacityUsagePct =
        dailyAppointmentCapacity !== null
          ? Math.round(
              (todayAppointmentsCount /
                dailyAppointmentCapacity) *
                100
            )
          : null;

      return {
        personId: person.id,
        dailyAppointmentCapacity,
        todayAppointmentsCount,
        appointmentCapacityUsagePct,
      };
    });

    const rowsWithCapacity = rows.filter(
      row => row.dailyAppointmentCapacity !== null
    );

    const dailyAppointmentCapacity =
      rowsWithCapacity.reduce(
        (sum, row) =>
          sum + (row.dailyAppointmentCapacity ?? 0),
        0
      );

    const todayAppointmentsCount =
      rowsWithCapacity.reduce(
        (sum, row) =>
          sum + row.todayAppointmentsCount,
        0
      );

    const appointmentCapacityUsagePct =
      dailyAppointmentCapacity > 0
        ? Math.round(
            (todayAppointmentsCount /
              dailyAppointmentCapacity) *
              100
          )
        : null;

    const capacityRemainingToday =
      dailyAppointmentCapacity > 0
        ? Math.max(
            0,
            dailyAppointmentCapacity -
              todayAppointmentsCount
          )
        : null;

    return {
      dailyAppointmentCapacity,
      todayAppointmentsCount,
      appointmentCapacityUsagePct,
      capacityRemainingToday,
      hasConfiguredCapacity:
        rowsWithCapacity.length > 0,
    };
  }, [appointments, now, people, teamFilter]);

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

  const executiveRead = useMemo(
    () => ({
      conflicts: conflictIds.size,
      confirmed: filteredAppointments.filter(
        item => item.status === "CONFIRMED"
      ).length,
    }),
    [conflictIds, filteredAppointments]
  );

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

  const calendarCommand = useMemo(() => {
    const unconfirmed = activeAppointments.filter(
      item => item.status === "SCHEDULED"
    );

    const delayed = activeAppointments.filter(item =>
      delayedIds.has(item.id)
    );

    const withServiceOrder =
      activeAppointments.filter(
        item =>
          Boolean(item.serviceOrderId) ||
          Boolean(item.serviceOrder?.id) ||
          Boolean(
            item.serviceOrders?.some(order =>
              Boolean(order?.id)
            )
          )
      );

    const unassigned = activeAppointments.filter(
      item => !item.assignedToPersonId
    );

    const conflictSample =
      activeAppointments.find(item =>
        conflictIds.has(item.id)
      );

    const delayedSample = delayed[0] ?? null;
    const unconfirmedSample =
      unconfirmed[0] ?? null;
    const unassignedSample =
      unassigned[0] ?? null;

    const capacityExhausted =
      capacitySnapshot.hasConfiguredCapacity &&
      capacitySnapshot.capacityRemainingToday === 0;

    const risk = conflictSample
      ? {
          title: "Conflito entre atendimentos",
          reason:
            `${conflictSample.customer?.name ?? "Cliente"} possui ` +
            "sobreposição visual com outro evento do mesmo responsável.",
          impact:
            "A grade indica colisão de horário e pede revisão no fluxo de Agendamentos.",
          ctaLabel: "Ver conflitos",
          appointmentId: conflictSample.id,
          action: "reschedule" as const,
        }
      : delayedSample
        ? {
            title: "Atraso no calendário",
            reason:
              `${delayedSample.customer?.name ?? "Cliente"} passou ` +
              `do horário planejado desde ${formatDateTime(delayedSample.startsAt)}.`,
            impact:
              "O atraso visual pode pressionar a sequência de execução e deve ser revisado no agendamento.",
            ctaLabel: "Revisar agenda",
            appointmentId: delayedSample.id,
            action: "review" as const,
          }
        : unconfirmedSample
          ? {
              title: "Agendamentos sem confirmação",
              reason:
                `${unconfirmed.length} evento(s) continuam como ` +
                "agendados no recorte atual.",
              impact:
                "A confirmação permanece no fluxo de Agendamentos; o Calendário apenas sinaliza o status retornado.",
              ctaLabel: "Revisar agendamento",
              appointmentId:
                unconfirmedSample.id,
              action: "confirm" as const,
            }
          : unassignedSample
            ? {
                title:
                  "Agendamento sem responsável",
                reason:
                  `${unassigned.length} evento(s) ativos ` +
                  "não possuem responsável atribuído.",
                impact:
                  "A atribuição deve ser revisada antes da execução para preservar responsabilidade operacional.",
                ctaLabel:
                  "Revisar capacidade",
                appointmentId:
                  unassignedSample.id,
                action: "review" as const,
              }
            : capacityExhausted
              ? {
                  title:
                    "Capacidade diária preenchida",
                  reason:
                    `${capacitySnapshot.todayAppointmentsCount}/` +
                    `${capacitySnapshot.dailyAppointmentCapacity} ` +
                    "posições configuradas estão ocupadas hoje.",
                  impact:
                    "O Calendário não inventa encaixes: novos horários devem ser avaliados no fluxo de Agendamentos.",
                  ctaLabel:
                    "Revisar capacidade",
                  appointmentId: undefined,
                  action:
                    "reviewCapacity" as const,
                }
              : {
                  title:
                    "Sem sinal crítico no calendário",
                  reason:
                    "Nenhum conflito visual, atraso ou ausência de responsável foi detectado no recorte atual.",
                  impact:
                    "A leitura permanece preventiva; o estado operacional oficial continua pertencendo à Governança.",
                  ctaLabel: "Revisar semana",
                  appointmentId: undefined,
                  action:
                    "reviewWeek" as const,
                };

    const nextAction = {
      title: risk.ctaLabel,
      entity: risk.appointmentId
        ? "Agendamento selecionado"
        : "Calendário operacional",
      reason: risk.reason,
      impact: risk.impact,
      primaryActionLabel: risk.ctaLabel,
      appointmentId: risk.appointmentId,
      action: risk.action,
    };

    return {
      risk,
      nextAction,
      unconfirmedCount: unconfirmed.length,
      delayedCount: delayed.length,
      withServiceOrderCount:
        withServiceOrder.length,
      unassignedCount: unassigned.length,
    };
  }, [
    activeAppointments,
    capacitySnapshot,
    conflictIds,
    delayedIds,
  ]);

  const flowStages = useMemo(
    () =>
      [
        {
          id: "time",
          label: "Tempo",
          summary:
            conflictIds.size > 0
              ? `${conflictIds.size} evento(s) com sobreposição visual.`
              : "Eventos distribuídos no período.",
          state:
            conflictIds.size > 0
              ? "warning"
              : filteredAppointments.length > 0
                ? "active"
                : "idle",
          countOrValue:
            String(filteredAppointments.length),
        },
        {
          id: "appointment",
          label: "Agendamentos",
          summary:
            calendarCommand.unconfirmedCount > 0
              ? `${calendarCommand.unconfirmedCount} aguardando confirmação.`
              : "Eventos preparados para execução.",
          state:
            calendarCommand.unconfirmedCount > 0
              ? "warning"
              : "done",
          countOrValue:
            String(activeAppointments.length),
          hrefLabel: "Abrir Agendamentos",
          onClick: () =>
            navigate(
              "/appointments?source=calendar"
            ),
        },
        {
          id: "owner",
          label: "Responsáveis",
          summary:
            calendarCommand.unassignedCount > 0
              ? `${calendarCommand.unassignedCount} sem responsável.`
              : "Equipe vinculada aos eventos.",
          state:
            calendarCommand.unassignedCount > 0
              ? "warning"
              : "done",
        },
        {
          id: "service-order",
          label: "Ordens de Serviço",
          summary:
            "Vínculos operacionais retornados.",
          state:
            calendarCommand.withServiceOrderCount >
            0
              ? "active"
              : "idle",
          hrefLabel: "Ver O.S.",
          onClick: () =>
            navigate(
              "/service-orders?source=calendar"
            ),
        },
        {
          id: "execution",
          label: "Execução",
          summary:
            calendarCommand.delayedCount > 0
              ? `${calendarCommand.delayedCount} atraso(s) visuais pedem revisão.`
              : "Sem atraso visual ativo no recorte.",
          state:
            calendarCommand.delayedCount > 0
              ? "warning"
              : "active",
        },
        {
          id: "timeline",
          label: "Evidências",
          summary:
            "Eventos reais derivados do calendário.",
          state:
            filteredAppointments.length > 0
              ? "active"
              : "idle",
          hrefLabel:
            "Abrir Timeline oficial",
          onClick: () =>
            navigate(
              "/timeline?source=calendar"
            ),
        },
        {
          id: "risk",
          label: "Governança",
          summary:
            "Sinais antes de afetar o controle operacional; estado oficial permanece em Governança.",
          state: "active",
          hrefLabel: "Ver Governança",
          onClick: () =>
            navigate(
              "/governance?source=calendar"
            ),
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
      conflictIds.size,
      filteredAppointments.length,
      navigate,
    ]
  );

  const distribution = useMemo(() => {
    const total = filteredAppointments.length;

    const confirmed =
      filteredAppointments.filter(
        item => item.status === "CONFIRMED"
      ).length;

    const pending =
      filteredAppointments.filter(
        item => item.status === "SCHEDULED"
      ).length;

    const completed =
      filteredAppointments.filter(
        item => item.status === "DONE"
      ).length;

    const cancelled =
      filteredAppointments.filter(
        item => item.status === "CANCELED"
      ).length;

    const waiting =
      filteredAppointments.filter(
        item => item.status === "NO_SHOW"
      ).length;

    return {
      total,
      confirmed,
      pending,
      completed,
      cancelled,
      waiting,
      capacityTotal:
        capacitySnapshot.dailyAppointmentCapacity,
      capacityUsed:
        capacitySnapshot.todayAppointmentsCount,
      capacityPercent:
        capacitySnapshot.appointmentCapacityUsagePct,
      capacityRemainingToday:
        capacitySnapshot.capacityRemainingToday,
    };
  }, [capacitySnapshot, filteredAppointments]);

  const selectedOrCritical = selected ?? immediateAttention[0]?.item ?? null;

  const heroSignals = useMemo(() => {
    const signals = [
      delayedIds.size > 0
        ? `${delayedIds.size} atraso(s) detectado(s)`
        : null,

      calendarCommand.unassignedCount > 0
        ? `${calendarCommand.unassignedCount} sem responsável`
        : null,

      capacitySnapshot.hasConfiguredCapacity
        ? `${capacitySnapshot.capacityRemainingToday ?? 0} capacidade restante hoje`
        : null,

      executiveRead.conflicts > 0
        ? `${executiveRead.conflicts} conflitos visuais`
        : null,

      distribution.cancelled > 0
        ? `${distribution.cancelled} cancelados`
        : null,

      executiveRead.confirmed > 0
        ? `${executiveRead.confirmed} preparado para executar`
        : null,
    ].filter(Boolean) as string[];

    const uniqueSignals =
      Array.from(new Set(signals));

    return uniqueSignals.length > 0
      ? uniqueSignals.slice(0, 4)
      : ["Operação do tempo monitorada"];
  }, [
    calendarCommand.unassignedCount,
    capacitySnapshot,
    delayedIds.size,
    distribution.cancelled,
    executiveRead.conflicts,
    executiveRead.confirmed,
  ]);

  const periodSummary =
    `${filteredAppointments.length} eventos no período · ` +
    `${delayedIds.size} atraso · ` +
    (capacitySnapshot.hasConfiguredCapacity
      ? `${capacitySnapshot.capacityRemainingToday ?? 0} capacidade restante hoje`
      : "capacidade diária não configurada");

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
    if (appointmentId) {
      const queryAction =
        action === "confirm"
          ? "confirm"
          : action === "reschedule"
            ? "reschedule"
            : "review";
      navigate(
        `/appointments?id=${appointmentId}&action=${queryAction}&source=calendar`
      );
      return;
    }
    navigate("/appointments?source=calendar");
  };

  const isLoading = appointmentsQuery.isLoading;
  const hasError = appointmentsQuery.isError;
  const partialUnavailable = [
    customersQuery.isError ? "clientes" : null,
    peopleQuery.isError ? "responsáveis" : null,
  ].filter(Boolean) as string[];

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

      {partialUnavailable.length > 0 && !hasError ? (
        <div
          role="status"
          className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center"
        >
          <p className="flex-1">
            Indisponibilidade parcial: não foi possível carregar{" "}
            {partialUnavailable.join(" e ")}. A grade permanece disponível;
            filtros e nomes dependentes dessas fontes podem ficar limitados.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={refetchAll}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

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
              label="Capacidade diária configurada"
              value={
                capacitySnapshot.hasConfiguredCapacity
                  ? String(
                      capacitySnapshot.dailyAppointmentCapacity
                    )
                  : "—"
              }
              helper="Soma dos limites diários configurados para os responsáveis do recorte."
              icon={<Clock3 className="h-4 w-4" />}
            />
            <AppStatCard
              label="Capacidade restante hoje"
              value={
                capacitySnapshot.capacityRemainingToday ===
                null
                  ? "—"
                  : String(
                      capacitySnapshot.capacityRemainingToday
                    )
              }
              helper="Diferença entre capacidade configurada e agendamentos ativos de hoje."
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
              value={
                distribution.capacityPercent === null
                  ? "—"
                  : `${distribution.capacityPercent}%`
              }
              helper="Uso da capacidade diária configurada para hoje."
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
                  [
                    "Capacidade restante hoje",
                    distribution.capacityRemainingToday ?? "—",
                  ],
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
                Capacidade diária configurada:{" "}
                <strong className="text-[var(--text-primary)]">
                  {distribution.capacityTotal > 0
                    ? `${distribution.capacityUsed}/${distribution.capacityTotal}`
                    : "não informada"}
                </strong>{" "}
                · Capacidade restante hoje:{" "}
                <strong className="text-[var(--text-primary)]">
                  {distribution.capacityRemainingToday ?? "—"}
                </strong>.
              </div>
            </AppSectionCard>
          </div>
        </div>
      ) : null}

      <AppFiltersBar className="mt-4 gap-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Período do calendário"
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={viewMode}
            onChange={event => setViewMode(event.target.value as ViewMode)}
          >
            <option value="timeGridDay">Dia</option>
            <option value="timeGridWeek">Semana</option>
            <option value="dayGridMonth">Mês</option>
          </select>
          <select
            aria-label="Filtrar por responsável"
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={teamFilter}
            onChange={event => setTeamFilter(event.target.value)}
            disabled={peopleQuery.isError}
          >
            <option value="all">Equipe: todas</option>
            {people.map((person: any) => (
              <option key={String(person.id)} value={String(person.id)}>
                {String(person.name ?? "Colaborador")}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por serviço"
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
            aria-label="Filtrar por status"
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
            aria-label="Filtrar por cliente"
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
            value={customerFilter}
            onChange={event => setCustomerFilter(event.target.value)}
            disabled={customersQuery.isError}
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
                      A grade mostra somente agendamentos reais. Capacidade
                      restante hoje não representa disponibilidade real de horário.
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
                      events={events}
                      eventClick={(arg: EventClickArg) => {
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
                              ? "Conflito visual detectado no calendário"
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

              <div className="grid gap-4 xl:grid-cols-2">
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
                      Ver capacidade hoje
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
                    {capacitySnapshot.hasConfiguredCapacity
                      ? `${capacitySnapshot.capacityRemainingToday ?? 0} posição(ões) permanecem dentro da capacidade diária configurada; isso não representa horário livre.`
                      : "capacidade diária não configurada para os responsáveis deste recorte."}
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                    Equipe hoje:{" "}
                    {distribution.capacityPercent === null
                      ? "uso de capacidade não calculável"
                      : `${distribution.capacityPercent}% da capacidade configurada utilizada`},{" "}
                    {activeAppointments.length} agendamentos ativos no recorte.
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

import { useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AppDataTable,
  AppFiltersBar,
  AppOperationalHeader,
  AppPageShell,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";
import {
  OperationalActionPanel,
  OperationalHealthRing,
  OperationalInnerCard,
  OperationalKpiCard,
  OperationalPanel,
  OperationalPriorityItem,
  OperationalTimelineItem,
  OperationalWorkloadBar,
} from "@/components/operational";
import { trpc } from "@/lib/trpc";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";
import { useAuth } from "@/contexts/AuthContext";

function currencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatDateTime(value: unknown, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(value: unknown) {
  const status = String(value ?? "OPEN").toUpperCase();
  if (["DONE", "COMPLETED"].includes(status)) return "Concluída";
  if (["CANCELED", "CANCELLED"].includes(status)) return "Cancelada";
  if (status === "IN_PROGRESS") return "Em andamento";
  if (status === "ASSIGNED") return "Atribuída";
  return "Aberta";
}

function averageMinutes(items: any[]) {
  const durations = items
    .map(item => {
      const start = new Date(
        String(item?.startedAt ?? item?.createdAt ?? "")
      ).getTime();
      const end = new Date(
        String(item?.completedAt ?? item?.updatedAt ?? "")
      ).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        return null;
      return Math.round((end - start) / 60000);
    })
    .filter((value): value is number => typeof value === "number");
  if (!durations.length) return "—";
  const avg = Math.round(
    durations.reduce((total, item) => total + item, 0) / durations.length
  );
  return avg < 60 ? `${avg} min` : `${Math.floor(avg / 60)}h ${avg % 60}min`;
}

function compactTitle(item: any, fallback: string) {
  return String(
    item?.title ??
      item?.name ??
      item?.serviceName ??
      item?.code ??
      item?.id ??
      fallback
  );
}

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [availability, setAvailability] = useOperationalMemoryState(
    "nexo.profile.availability.v4",
    "Disponível"
  );
  const [notifications, setNotifications] = useOperationalMemoryState(
    "nexo.profile.notifications.v1",
    "Alertas críticos"
  );
  const [workPreference, setWorkPreference] = useOperationalMemoryState(
    "nexo.profile.work-preference.v1",
    "O.S. urgentes primeiro"
  );

  const meQuery = trpc.nexo.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const appointmentsQuery = trpc.nexo.appointments.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const serviceOrdersQuery = trpc.nexo.serviceOrders.list.useQuery(
    { page: 1, limit: 120 },
    { enabled: isAuthenticated, retry: false }
  );
  const chargesQuery = trpc.finance.charges.list.useQuery(
    { page: 1, limit: 120 },
    { enabled: isAuthenticated, retry: false }
  );
  const timelineQuery = trpc.nexo.timeline.listByOrg.useQuery(
    { limit: 80 },
    { enabled: isAuthenticated, retry: false }
  );

  const me = useMemo(
    () => normalizeObjectPayload<any>(meQuery.data) ?? {},
    [meQuery.data]
  );
  const appointments = useMemo(
    () => normalizeArrayPayload<any>(appointmentsQuery.data),
    [appointmentsQuery.data]
  );
  const serviceOrdersPayload = useMemo(
    () => normalizeObjectPayload<any>(serviceOrdersQuery.data) ?? {},
    [serviceOrdersQuery.data]
  );
  const chargesPayload = useMemo(
    () => normalizeObjectPayload<any>(chargesQuery.data) ?? {},
    [chargesQuery.data]
  );
  const serviceOrders = useMemo(
    () =>
      normalizeArrayPayload<any>(
        serviceOrdersPayload.data ??
          serviceOrdersPayload.items ??
          serviceOrdersQuery.data
      ),
    [serviceOrdersPayload, serviceOrdersQuery.data]
  );
  const charges = useMemo(
    () =>
      normalizeArrayPayload<any>(
        chargesPayload.data ?? chargesPayload.items ?? chargesQuery.data
      ),
    [chargesPayload, chargesQuery.data]
  );
  const timeline = useMemo(
    () => normalizeArrayPayload<any>(timelineQuery.data),
    [timelineQuery.data]
  );

  const personId = String(me.personId ?? me.person?.id ?? "");
  const userId = String(me.id ?? me.userId ?? "");
  const name = String(me.name ?? me.person?.name ?? me.email ?? "Usuário");
  const email = String(me.email ?? me.person?.email ?? "E-mail não informado");
  const role = String(
    me.role ?? me.person?.role ?? me.person?.function ?? "Operador"
  );
  const organization = String(
    me.organization?.name ??
      me.org?.name ??
      me.organizationName ??
      "Organização atual"
  );
  const permissions = normalizeArrayPayload<any>(
    me.permissions ?? me.permissionKeys ?? me.roles ?? me.claims
  );
  const permissionCount = permissions.length || (role ? 1 : 0);
  const lastActivity =
    me.lastActivityAt ?? me.updatedAt ?? timeline[0]?.createdAt;
  const hasRecentActivity = lastActivity
    ? Date.now() - new Date(String(lastActivity)).getTime() <=
      1000 * 60 * 60 * 24 * 7
    : false;

  const owns = (item: any) => {
    const refs = [
      item?.assignedToPersonId,
      item?.assigneePersonId,
      item?.technicianId,
      item?.responsiblePersonId,
      item?.personId,
      item?.ownerId,
      item?.userId,
      item?.createdById,
      item?.actorId,
    ].map(value => String(value ?? ""));
    return (
      (personId && refs.includes(personId)) || (userId && refs.includes(userId))
    );
  };

  const myOrders = serviceOrders.filter(owns);
  const myAppointments = appointments.filter(owns);
  const myTimeline = timeline
    .filter(
      item =>
        owns(item) || String(item?.actorId ?? item?.userId ?? "") === userId
    )
    .slice(0, 10);
  const pendingOrders = myOrders.filter(
    item =>
      !["DONE", "COMPLETED", "CANCELED", "CANCELLED"].includes(
        String(item?.status ?? "").toUpperCase()
      )
  );
  const completedOrders = myOrders.filter(item =>
    ["DONE", "COMPLETED"].includes(String(item?.status ?? "").toUpperCase())
  );
  const delayedOrders = pendingOrders.filter(item => {
    const rawDueDate =
      item?.dueDate ?? item?.scheduledEndAt ?? item?.deadlineAt;
    if (!rawDueDate) return false;
    const due = new Date(String(rawDueDate)).getTime();
    return Number.isFinite(due) && due < Date.now();
  });
  const failedOrders = myOrders.filter(item =>
    ["FAILED", "CANCELED", "CANCELLED"].includes(
      String(item?.status ?? "").toUpperCase()
    )
  );
  const pendingAppointments = myAppointments.filter(
    item =>
      !["DONE", "COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
        String(item?.status ?? "").toUpperCase()
      )
  );
  const overdueAppointments = pendingAppointments.filter(item => {
    const rawDate = item?.scheduledAt ?? item?.startAt ?? item?.date;
    if (!rawDate) return false;
    const scheduledAt = new Date(String(rawDate)).getTime();
    return Number.isFinite(scheduledAt) && scheduledAt < Date.now();
  });
  const paidCharges = charges.filter(
    item => String(item?.status ?? "").toUpperCase() === "PAID" && owns(item)
  );
  const revenueCents = paidCharges.reduce(
    (total, item) => total + Number(item?.amountCents ?? item?.amount ?? 0),
    0
  );
  const assignedWorkload = pendingOrders.length + pendingAppointments.length;
  const hasLowActivityWithWork = assignedWorkload > 0 && !hasRecentActivity;
  const hasInsufficientPermissionSignal = Boolean(
    me.permissionsRequired && permissionCount === 0
  );
  const criticalPendingCount =
    delayedOrders.length +
    overdueAppointments.length +
    (hasInsufficientPermissionSignal ? 1 : 0);
  const hasAnyExecutionSignal =
    myOrders.length > 0 || myAppointments.length > 0 || assignedWorkload > 0;
  const hasPerformanceSignal =
    completedOrders.length > 0 ||
    delayedOrders.length > 0 ||
    failedOrders.length > 0;

  const nextAction = useMemo(() => {
    if (delayedOrders.length) {
      return {
        label: "Destravar O.S. atrasadas",
        detail: `${delayedOrders.length} O.S. atribuída(s) a mim estão vencidas.`,
        path: "/service-orders?scope=mine&status=open",
      };
    }
    if (overdueAppointments.length) {
      return {
        label: "Revisar agenda vencida",
        detail: `${overdueAppointments.length} agendamento(s) pendente(s) ficaram no passado.`,
        path: "/appointments?scope=mine",
      };
    }
    if (pendingOrders.length) {
      return {
        label: "Continuar minhas O.S.",
        detail: `${pendingOrders.length} O.S. aberta(s) sob minha responsabilidade.`,
        path: "/service-orders?scope=mine",
      };
    }
    if (pendingAppointments.length) {
      return {
        label: "Preparar próximos agendamentos",
        detail: `${pendingAppointments.length} agendamento(s) atribuídos a mim.`,
        path: "/appointments?scope=mine",
      };
    }
    if (hasLowActivityWithWork) {
      return {
        label: "Atualizar andamento",
        detail: "Há trabalho comigo sem atividade recente disponível.",
        path: "/timeline?scope=mine",
      };
    }
    if (hasInsufficientPermissionSignal) {
      return {
        label: "Solicitar apoio de alçada",
        detail:
          "Permissões acionáveis não foram retornadas para uma necessidade crítica.",
        path: "/governance",
      };
    }
    return {
      label: "Nenhuma pendência atribuída agora.",
      detail: "Fila individual saudável no recorte carregado.",
      path: "/service-orders?scope=mine",
    };
  }, [
    delayedOrders.length,
    hasInsufficientPermissionSignal,
    hasLowActivityWithWork,
    overdueAppointments.length,
    pendingAppointments.length,
    pendingOrders.length,
  ]);

  const queueItems = [
    pendingOrders.length
      ? {
          label: "O.S. atribuídas",
          value: String(pendingOrders.length),
          detail: delayedOrders.length
            ? `${delayedOrders.length} atrasada(s)`
            : "Abertas para execução",
          path: "/service-orders?scope=mine",
        }
      : null,
    pendingAppointments.length
      ? {
          label: "Agendamentos atribuídos",
          value: String(pendingAppointments.length),
          detail: overdueAppointments.length
            ? `${overdueAppointments.length} vencido(s)`
            : "Próximos compromissos",
          path: "/appointments?scope=mine",
        }
      : null,
    criticalPendingCount
      ? {
          label: "Pendências críticas",
          value: String(criticalPendingCount),
          detail: "Exigem minha ação ou apoio de alçada",
          path: delayedOrders.length
            ? "/service-orders?scope=mine&status=open"
            : "/appointments?scope=mine",
        }
      : null,
    {
      label: "Próxima ação individual",
      value: nextAction.label,
      detail: nextAction.detail,
      path: nextAction.path,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    detail: string;
    path: string;
  }>;

  const operationRows = [
    myOrders.length
      ? {
          label: "Minhas O.S.",
          value: String(myOrders.length),
          detail: `${pendingOrders.length} pendente(s)`,
          path: "/service-orders?scope=mine",
        }
      : null,
    myAppointments.length
      ? {
          label: "Meus agendamentos",
          value: String(myAppointments.length),
          detail: `${pendingAppointments.length} pendente(s)`,
          path: "/appointments?scope=mine",
        }
      : null,
    criticalPendingCount
      ? {
          label: "Minhas pendências",
          value: String(criticalPendingCount),
          detail: "Ação individual necessária",
          path: nextAction.path,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    detail: string;
    path: string;
  }>;

  const timelineEvents = myTimeline
    .slice(0, 3)
    .map((item: any, index: number) => ({
      id: String(item?.id ?? `timeline-${index}`),
      type: String(
        item?.status ?? item?.severity ?? item?.type ?? "Registrado"
      ),
      occurredAt: formatDateTime(item?.createdAt ?? item?.occurredAt),
      entity: String(
        item?.title ?? item?.event ?? item?.action ?? "Evento operacional"
      ),
      actor: String(item?.actorName ?? item?.personName ?? name),
      summary: String(
        item?.description ??
          item?.message ??
          "Evento oficial associado ao meu trabalho."
      ),
    }));

  const permissionLabels = permissions
    .slice(0, 8)
    .map(permission =>
      String(permission?.name ?? permission?.key ?? permission)
    );

  return (
    <AppPageShell>
        <AppOperationalHeader
          title={name}
          description={`${role} em ${organization}. Status: ${availability}. Última atividade: ${formatDateTime(lastActivity)}.`}
          primaryAction={
            <Button onClick={() => navigate("/service-orders?scope=mine")}>
              Abrir minha fila
            </Button>
          }
          secondaryActions={
            <Button
              variant="outline"
              onClick={() =>
                void Promise.all([
                  meQuery.refetch(),
                  appointmentsQuery.refetch(),
                  serviceOrdersQuery.refetch(),
                  chargesQuery.refetch(),
                  timelineQuery.refetch(),
                ])
              }
            >
              Atualizar perfil
            </Button>
          }
          contextChips={
            <>
              <AppStatusBadge label={role} />
              <AppStatusBadge label={organization} />
              <AppStatusBadge label={String(availability)} />
            </>
          }
        />

        <AppFiltersBar>
          <div className="grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-4">
            <span>
              <strong>Função:</strong> {role}
            </span>
            <span>
              <strong>Organização:</strong> {organization}
            </span>
            <span>
              <strong>Status:</strong> {availability}
            </span>
            <span>
              <strong>Última atividade:</strong> {formatDateTime(lastActivity)}
            </span>
          </div>
        </AppFiltersBar>

        <OperationalPanel
          title="Identidade operacional"
          subtitle="Quem sou dentro da operação, minha carga atual e a próxima ação pessoal."
          variant="hero"
          action={<AppStatusBadge label={String(availability)} />}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <OperationalInnerCard
              variant={criticalPendingCount ? "warning" : "success"}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xl font-semibold text-[var(--text-primary)]">
                    {name}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {role} em {organization}. Última atividade:{" "}
                    {formatDateTime(lastActivity)}.
                  </p>
                </div>
                <OperationalHealthRing
                  value={
                    assignedWorkload
                      ? Math.min(100, assignedWorkload * 18)
                      : hasRecentActivity
                        ? 72
                        : 35
                  }
                  label="Atividade pessoal"
                  tone={criticalPendingCount ? "warning" : "success"}
                  compact
                />
              </div>
              <OperationalWorkloadBar
                className="mt-4"
                label="Carga atribuída"
                value={assignedWorkload}
                max={Math.max(5, assignedWorkload + completedOrders.length)}
                tone={criticalPendingCount ? "warning" : "success"}
              />
            </OperationalInnerCard>

            <OperationalActionPanel
              title={nextAction.label}
              description={nextAction.detail}
              impact={
                criticalPendingCount
                  ? "minha fila tem pendências que podem atrasar a operação"
                  : "fila individual sem bloqueio crítico"
              }
              safety="usa somente dados carregados da minha fila, sem alterar permissões ou automações"
              tone={criticalPendingCount ? "warning" : "success"}
              primaryAction={{
                label: "Abrir ação",
                onClick: () => navigate(nextAction.path),
              }}
              secondaryAction={{
                label: "Atualizar",
                onClick: () =>
                  void Promise.all([
                    meQuery.refetch(),
                    appointmentsQuery.refetch(),
                    serviceOrdersQuery.refetch(),
                    chargesQuery.refetch(),
                    timelineQuery.refetch(),
                  ]),
              }}
            />
          </div>
        </OperationalPanel>

        <OperationalPanel
          title="Minha fila agora"
          subtitle="Somente o que está comigo neste momento. Sem contadores vazios espalhados."
          variant="default"
        >
          {assignedWorkload === 0 && criticalPendingCount === 0 ? (
            <OperationalPriorityItem
              tone="low"
              title="Nenhuma pendência atribuída agora."
              description="Sua fila individual está saudável no recorte carregado."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {queueItems.slice(0, 4).map(item => (
                <OperationalKpiCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  helper={item.detail}
                  tone={item.label.includes("crítica") ? "warning" : "default"}
                />
              ))}
            </div>
          )}
        </OperationalPanel>

        {hasAnyExecutionSignal && operationRows.length > 0 && (
          <OperationalPanel
            title="Minha operação"
            subtitle="Resumo compacto de O.S., agendamentos e pendências reais atribuídas a mim."
            variant="compact"
          >
            <div className="grid gap-3 md:grid-cols-3">
              {operationRows.map(item => (
                <OperationalPriorityItem
                  key={item.label}
                  tone={item.label.includes("pendência") ? "medium" : "neutral"}
                  title={`${item.label}: ${item.value}`}
                  description={item.detail}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(item.path)}
                    >
                      Abrir
                    </Button>
                  }
                />
              ))}
            </div>
          </OperationalPanel>
        )}

        {pendingOrders.length > 0 && (
          <AppSectionBlock
            title="Minhas O.S."
            subtitle="Até 5 ordens abertas para execução direta."
          >
            <AppDataTable className="min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <th className="px-3 py-2">O.S.</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.slice(0, 5).map((item: any, index: number) => (
                  <tr
                    key={String(item?.id ?? index)}
                    className="border-b border-[var(--border-subtle)]/60"
                  >
                    <td className="px-3 py-3 font-medium text-[var(--text-primary)]">
                      {compactTitle(item, "Ordem de serviço")}
                    </td>
                    <td className="px-3 py-3">
                      <AppStatusBadge label={statusLabel(item?.status)} />
                    </td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">
                      {formatDateTime(
                        item?.dueDate ??
                          item?.scheduledEndAt ??
                          item?.deadlineAt
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </AppDataTable>
          </AppSectionBlock>
        )}

        {pendingAppointments.length > 0 && (
          <AppSectionBlock
            title="Meus agendamentos"
            subtitle="Até 5 compromissos atribuídos para preparação rápida."
          >
            <AppDataTable className="min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <th className="px-3 py-2">Agendamento</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Quando</th>
                </tr>
              </thead>
              <tbody>
                {pendingAppointments
                  .slice(0, 5)
                  .map((item: any, index: number) => (
                    <tr
                      key={String(item?.id ?? index)}
                      className="border-b border-[var(--border-subtle)]/60"
                    >
                      <td className="px-3 py-3 font-medium text-[var(--text-primary)]">
                        {compactTitle(item, "Agendamento")}
                      </td>
                      <td className="px-3 py-3">
                        <AppStatusBadge label={statusLabel(item?.status)} />
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        {formatDateTime(
                          item?.scheduledAt ?? item?.startAt ?? item?.date
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </AppDataTable>
          </AppSectionBlock>
        )}

        <OperationalPanel
          title="Minha atividade recente"
          subtitle="Eventos oficiais individuais, limitados ao que ajuda a leitura rápida."
          variant="default"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/timeline?scope=mine")}
            >
              Abrir Timeline oficial
            </Button>
          }
        >
          {timelineEvents.length > 0 ? (
            <div className="space-y-3">
              {timelineEvents.map((event, index) => (
                <OperationalTimelineItem
                  key={event.id}
                  title={event.entity}
                  description={event.summary}
                  actor={event.actor}
                  time={event.occurredAt}
                  entityLabel={event.type}
                  tone={index === 0 ? "selected" : "default"}
                  withLine={index < timelineEvents.length - 1}
                />
              ))}
            </div>
          ) : (
            <OperationalPriorityItem
              tone="neutral"
              title="Nenhum evento individual retornado."
              description="A timeline pessoal aparece quando há evidência associada ao usuário atual."
            />
          )}
        </OperationalPanel>

        <AppSectionBlock
          title="Minha performance"
          subtitle="Conclusões, atrasos, falhas e tempo médio sem cartões zerados redundantes."
        >
          {hasPerformanceSignal ? (
            <div className="grid gap-3 md:grid-cols-4">
              <OperationalKpiCard
                label="Concluídas"
                value={String(completedOrders.length)}
                helper="O.S. finalizadas por mim."
                tone="success"
              />
              <OperationalKpiCard
                label="Atrasos"
                value={String(delayedOrders.length)}
                helper="Pendências vencidas."
                tone={delayedOrders.length ? "warning" : "default"}
              />
              <OperationalKpiCard
                label="Falhas"
                value={String(failedOrders.length)}
                helper="Canceladas ou marcadas como falha."
                tone={failedOrders.length ? "critical" : "default"}
              />
              <OperationalKpiCard
                label="Tempo médio"
                value={averageMinutes(completedOrders)}
                helper="Média entre início e conclusão."
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-sm text-[var(--text-secondary)]">
              Sem execução atribuída no período.
            </div>
          )}
        </AppSectionBlock>

        {revenueCents > 0 && (
          <AppSectionBlock
            title="Impacto financeiro"
            subtitle="Exibido somente quando há valor pago atribuído ao usuário."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <OperationalKpiCard
                label="Serviços executados"
                value={String(completedOrders.length)}
                helper="Base de O.S. concluídas."
              />
              <OperationalKpiCard
                label="Valor movimentado"
                value={currencyBRL(revenueCents)}
                helper="Cobranças pagas atribuídas a mim."
                tone="success"
              />
            </div>
          </AppSectionBlock>
        )}

        <AppSectionBlock
          title="Dados pessoais e permissões"
          subtitle="Identidade, papel e alçada usados pela leitura operacional individual."
        >
          <AppDataTable className="min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <th className="px-3 py-2">Campo</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Uso operacional</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  field: "Nome",
                  value: name,
                  usage: "Identifica o responsável individual da operação.",
                },
                {
                  field: "E-mail",
                  value: email,
                  usage: "Referência de autenticação já disponível no perfil.",
                },
                {
                  field: "Papel/função",
                  value: role,
                  usage: "Define a leitura de responsabilidade e alçada.",
                },
                {
                  field: "Organização",
                  value: organization,
                  usage:
                    "Contexto onde O.S., agenda e Timeline foram carregadas.",
                },
                {
                  field: "Permissões",
                  value: permissionLabels.length
                    ? permissionLabels.join(", ")
                    : "Sem lista detalhada retornada",
                  usage: `${permissionCount} sinal(is) de permissão/papel usados sem alterar auth.`,
                },
              ].map(item => (
                <tr
                  key={item.field}
                  className="border-b border-[var(--border-subtle)]/60"
                >
                  <td className="px-3 py-3 font-medium text-[var(--text-primary)]">
                    {item.field}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {item.value}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {item.usage}
                  </td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </AppSectionBlock>

        <AppSectionBlock
          title="Preferências operacionais"
          subtitle="Disponibilidade, notificações e preferências de trabalho usadas para orientar a rotina."
        >
          <AppDataTable className="min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <th className="px-3 py-2">Preferência</th>
                <th className="px-3 py-2">Valor atual</th>
                <th className="px-3 py-2">O que muda na operação?</th>
                <th className="px-3 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  key: "availability",
                  label: "Disponibilidade",
                  value: availability,
                  impact:
                    "Define se novas pendências podem ser direcionadas para mim.",
                  action: () =>
                    setAvailability(
                      availability === "Disponível" ? "Focado" : "Disponível"
                    ),
                },
                {
                  key: "notifications",
                  label: "Notificações",
                  value: notifications,
                  impact: "Controla quais alertas interrompem minha execução.",
                  action: () =>
                    setNotifications(
                      notifications === "Alertas críticos"
                        ? "Tudo da minha fila"
                        : "Alertas críticos"
                    ),
                },
                {
                  key: "work",
                  label: "Preferência de trabalho",
                  value: workPreference,
                  impact:
                    "Ordena minha fila por urgência, prazo ou tipo de serviço.",
                  action: () =>
                    setWorkPreference(
                      workPreference === "O.S. urgentes primeiro"
                        ? "Prazo mais próximo"
                        : "O.S. urgentes primeiro"
                    ),
                },
              ].map(item => (
                <tr
                  key={item.key}
                  className="border-b border-[var(--border-subtle)]/60"
                >
                  <td className="px-3 py-3 font-medium text-[var(--text-primary)]">
                    {item.label}
                  </td>
                  <td className="px-3 py-3">
                    <AppStatusBadge label={String(item.value)} />
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">
                    {item.impact}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={item.action}>
                      Alternar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </AppSectionBlock>
    </AppPageShell>
  );
}

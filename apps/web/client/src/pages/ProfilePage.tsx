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
  const labels: Record<string, string> = {
    DONE: "Concluída",
    COMPLETED: "Concluída",
    CANCELED: "Cancelada",
    CANCELLED: "Cancelada",
    IN_PROGRESS: "Em andamento",
    ASSIGNED: "Atribuída",
    OPEN: "Aberta",
  };
  return (
    labels[String(value ?? "").toUpperCase()] ??
    String(value ?? "Não informado")
  );
}

const actionPaths: Record<string, string> = {
  PERSON: "/people",
  SERVICE_ORDERS: "/service-orders?scope=mine",
  APPOINTMENTS: "/appointments?scope=mine",
  TIMELINE: "/timeline?scope=mine",
};

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const operationalQuery = trpc.people.operationalSummary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const me = useMemo(
    () => normalizeObjectPayload<any>(meQuery.data) ?? {},
    [meQuery.data]
  );
  const people = useMemo(
    () => normalizeArrayPayload<any>(operationalQuery.data?.people),
    [operationalQuery.data]
  );
  const personId = String(me.personId ?? me.person?.id ?? "");
  const person = people.find(item => String(item?.personId ?? "") === personId);
  const name = String(me.name ?? me.person?.name ?? me.email ?? "Usuário");
  const email = String(me.email ?? me.person?.email ?? "E-mail não informado");
  const role = String(
    me.role ?? me.person?.role ?? me.person?.function ?? "Não informado"
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
  const permissionLabels = permissions
    .slice(0, 8)
    .map(permission =>
      String(permission?.name ?? permission?.key ?? permission)
    );

  const serviceOrders = person?.serviceOrders?.recentServiceOrders ?? [];
  const appointments = person?.appointments?.nextAppointments ?? [];
  const timeline = person?.timeline?.lastEvents ?? [];
  const recommendation = person?.recommendedActionLabel
    ? {
        label: String(person.recommendedActionLabel),
        detail: String(
          person.interventionReason ??
            person.operationalSummaryText ??
            "Decisão operacional oficial."
        ),
        path:
          actionPaths[String(person.recommendedActionTarget ?? "")] ??
          "/profile",
      }
    : null;
  const capacityUsage = person?.serviceOrderCapacityUsagePct;
  const receivedAmount =
    person?.finance?.receivedAmountFromAssignedServiceOrders;
  const sourceUnavailable = operationalQuery.isError;

  const refresh = () =>
    void Promise.all([meQuery.refetch(), operationalQuery.refetch()]);

  return (
    <AppPageShell>
      <AppOperationalHeader
        title={name}
        description={`${role} em ${organization}. Última atividade: ${formatDateTime(person?.lastActivityAt)}.`}
        primaryAction={
          <Button onClick={() => navigate("/service-orders?scope=mine")}>
            Abrir minha fila
          </Button>
        }
        secondaryActions={
          <Button variant="outline" onClick={refresh}>
            Atualizar perfil
          </Button>
        }
        contextChips={
          <>
            <AppStatusBadge label={role} />
            <AppStatusBadge label={organization} />
            {person?.availabilityStatus && (
              <AppStatusBadge label={person.availabilityStatus} />
            )}
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
            <strong>Disponibilidade:</strong>{" "}
            {person?.availabilityStatus ?? "Não disponível"}
          </span>
          <span>
            <strong>Última atividade:</strong>{" "}
            {formatDateTime(person?.lastActivityAt)}
          </span>
        </div>
      </AppFiltersBar>

      {sourceUnavailable && (
        <OperationalPanel
          title="Dados operacionais indisponíveis"
          subtitle="A identidade autenticada continua disponível, mas a fonte People não respondeu."
          variant="compact"
        >
          <OperationalPriorityItem
            tone="neutral"
            title="Não foi possível carregar o resumo operacional."
            description="Nenhum estado, risco, prioridade ou capacidade foi presumido."
            action={
              <Button size="sm" variant="outline" onClick={refresh}>
                Tentar novamente
              </Button>
            }
          />
        </OperationalPanel>
      )}

      <OperationalPanel
        title="Identidade operacional"
        subtitle="Quem sou dentro da operação e as decisões oficiais associadas ao meu trabalho."
        variant="hero"
        action={
          person?.operationalStatus ? (
            <AppStatusBadge
              label={`${person.priority} · ${person.operationalStatus}`}
            />
          ) : undefined
        }
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <OperationalInnerCard variant="default">
            <p className="text-xl font-semibold text-[var(--text-primary)]">
              {name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {person?.operationalSummaryText ??
                "Resumo operacional não disponível."}
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {person?.capacitySummaryText ??
                "Capacidade não calculada pela fonte oficial."}
            </p>
            {typeof capacityUsage === "number" && (
              <OperationalWorkloadBar
                className="mt-4"
                label="Uso da capacidade de O.S."
                value={capacityUsage}
                max={100}
                tone="neutral"
              />
            )}
          </OperationalInnerCard>
          {recommendation ? (
            <OperationalActionPanel
              title={recommendation.label}
              description={recommendation.detail}
              impact={
                person?.riskSummaryText ??
                "Impacto descrito pela decisão oficial."
              }
              safety="Recomendação e prioridade fornecidas pelo contrato operacional de People."
              tone="default"
              primaryAction={{
                label: "Abrir ação",
                onClick: () => navigate(recommendation.path),
              }}
              secondaryAction={{ label: "Atualizar", onClick: refresh }}
            />
          ) : (
            <OperationalInnerCard variant="default">
              <p className="font-medium">Próxima ação não calculada</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                A fonte oficial não retornou recomendação. O Perfil não cria uma
                decisão substituta.
              </p>
            </OperationalInnerCard>
          )}
        </div>
      </OperationalPanel>

      <OperationalPanel
        title="Minha fila agora"
        subtitle="Contadores e estados fornecidos pelo resumo operacional oficial."
        variant="default"
      >
        {person ? (
          <div className="grid gap-3 md:grid-cols-4">
            <OperationalKpiCard
              label="O.S. abertas"
              value={String(person.openServiceOrdersCount)}
              helper="Atribuição oficial."
            />
            <OperationalKpiCard
              label="O.S. vencidas"
              value={String(person.overdueServiceOrdersCount)}
              helper="Classificação oficial."
            />
            <OperationalKpiCard
              label="Agenda hoje"
              value={String(person.todayAppointmentsCount)}
              helper="Agenda oficial."
            />
            <OperationalKpiCard
              label="Agenda futura"
              value={String(person.futureAppointmentsCount)}
              helper="Agenda oficial."
            />
          </div>
        ) : (
          <OperationalPriorityItem
            tone="neutral"
            title="Dados individuais não disponíveis."
            description="Não foi encontrado resumo People para a pessoa da sessão autenticada."
          />
        )}
      </OperationalPanel>

      {serviceOrders.length > 0 && (
        <AppSectionBlock
          title="Minhas O.S."
          subtitle="Ordens recentes retornadas pelo contrato individual oficial."
        >
          <AppDataTable className="min-w-[720px]">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">O.S.</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {serviceOrders.map((item: any) => (
                <tr
                  key={item.id}
                  className="border-t border-[var(--border-subtle)]"
                >
                  <td className="px-3 py-3">
                    {item.number ?? item.customerName ?? "Ordem de serviço"}
                  </td>
                  <td className="px-3 py-3">
                    <AppStatusBadge label={statusLabel(item.status)} />
                  </td>
                  <td className="px-3 py-3">{formatDateTime(item.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </AppSectionBlock>
      )}

      {appointments.length > 0 && (
        <AppSectionBlock
          title="Meus agendamentos"
          subtitle="Próximos compromissos retornados pelo contrato individual oficial."
        >
          <AppDataTable className="min-w-[720px]">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Quando</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((item: any) => (
                <tr
                  key={item.id}
                  className="border-t border-[var(--border-subtle)]"
                >
                  <td className="px-3 py-3">
                    {item.customerName ?? "Cliente não informado"}
                  </td>
                  <td className="px-3 py-3">
                    <AppStatusBadge label={statusLabel(item.status)} />
                  </td>
                  <td className="px-3 py-3">{formatDateTime(item.startsAt)}</td>
                </tr>
              ))}
            </tbody>
          </AppDataTable>
        </AppSectionBlock>
      )}

      <OperationalPanel
        title="Minha atividade recente"
        subtitle="Eventos oficiais associados à pessoa autenticada."
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
        {timeline.length ? (
          <div className="space-y-3">
            {timeline.map((event: any, index: number) => (
              <OperationalTimelineItem
                key={event.id}
                title={event.title ?? event.eventType ?? "Evento operacional"}
                description={event.description ?? "Detalhes não informados."}
                actor={name}
                time={formatDateTime(event.createdAt)}
                entityLabel={event.entityType ?? "Evento"}
                tone={index === 0 ? "selected" : "default"}
                withLine={index < timeline.length - 1}
              />
            ))}
          </div>
        ) : (
          <OperationalPriorityItem
            tone="neutral"
            title="Nenhum evento individual retornado."
            description={
              sourceUnavailable
                ? "Timeline indisponível no momento."
                : "A fonte oficial não retornou eventos para esta pessoa."
            }
          />
        )}
      </OperationalPanel>

      <AppSectionBlock
        title="Minha performance"
        subtitle="Métricas calculadas pelo contrato oficial de People."
      >
        {person ? (
          <div className="grid gap-3 md:grid-cols-3">
            <OperationalKpiCard
              label="Concluídas"
              value={String(person.serviceOrders.completedServiceOrdersCount)}
              helper="No período oficial."
            />
            <OperationalKpiCard
              label="Taxa de conclusão"
              value={
                person.serviceOrders.completionRatePct == null
                  ? "Não calculada"
                  : `${person.serviceOrders.completionRatePct}%`
              }
              helper="Cálculo oficial."
            />
            <OperationalKpiCard
              label="Tempo médio"
              value={
                person.serviceOrders.averageCompletionMinutes == null
                  ? "Não calculado"
                  : `${person.serviceOrders.averageCompletionMinutes} min`
              }
              helper="Cálculo oficial."
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Dados de performance não disponíveis.
          </p>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Impacto financeiro"
        subtitle="Atribuição financeira oficial de O.S.; não representa comissão ou produtividade."
      >
        {typeof receivedAmount === "number" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <OperationalKpiCard
              label="Valor recebido vinculado"
              value={currencyBRL(receivedAmount)}
              helper={
                person.finance.financeAttributionNote ??
                "Cobranças vinculadas às O.S. atribuídas."
              }
            />
            <OperationalKpiCard
              label="Cobranças pagas vinculadas"
              value={String(
                person.finance.paidChargesCountFromAssignedServiceOrders
              )}
              helper="Contagem oficial."
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Dado financeiro não disponível ou não calculado.
          </p>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Dados pessoais e permissões"
        subtitle="Identidade e alçada retornadas exclusivamente pela sessão autenticada."
      >
        <AppDataTable className="min-w-[720px]">
          <tbody>
            {[
              ["Nome", name],
              ["E-mail", email],
              ["Papel/função", role],
              ["Organização", organization],
              [
                "Permissões",
                permissionLabels.length
                  ? permissionLabels.join(", ")
                  : "Sem lista detalhada retornada",
              ],
            ].map(([field, value]) => (
              <tr
                key={field}
                className="border-b border-[var(--border-subtle)]"
              >
                <td className="px-3 py-3 font-medium">{field}</td>
                <td className="px-3 py-3 text-[var(--text-secondary)]">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </AppDataTable>
      </AppSectionBlock>
    </AppPageShell>
  );
}

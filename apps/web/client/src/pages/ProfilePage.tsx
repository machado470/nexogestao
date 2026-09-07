import { RefreshCw } from "lucide-react";

import {
  AppAlert,
  AppAlertDescription,
  AppAlertTitle,
  AppField,
  AppFieldGroup,
  AppInput,
} from "@/components/app-system";
import {
  AppOperationalHeader,
  AppPageErrorState,
  AppPageLoadingState,
  AppPageShell,
  AppSectionBlock,
  AppStatusBadge,
} from "@/components/internal-page-system";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  normalizeArrayPayload,
  normalizeObjectPayload,
} from "@/lib/query-helpers";
import { trpc } from "@/lib/trpc";

type SessionProfile = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
  personId?: string | null;
  person?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    active?: boolean | null;
  } | null;
  organization?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
  } | null;
};

type OperationalProfile = {
  personId: string;
  role?: string | null;
  status: string;
  lastActivityAt?: string | null;
  openServiceOrdersCount: number;
  overdueServiceOrdersCount: number;
  todayAppointmentsCount: number;
  futureAppointmentsCount: number;
  dailyServiceOrderCapacity?: number | null;
  dailyAppointmentCapacity?: number | null;
  serviceOrderCapacityUsagePct?: number | null;
  appointmentCapacityUsagePct?: number | null;
  capacityStatus?: string;
  availabilityStatus?: string;
  loadStatus?: string;
  operationalStatus: string;
  priority: string;
  interventionReason: string | null;
  recommendedActionLabel: string | null;
  recommendedActionTarget: string | null;
  operationalSummaryText?: string | null;
  capacitySummaryText?: string | null;
  riskSummaryText?: string | null;
  workloadNotes?: string | null;
};

function present(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "Não informado";
  return String(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function ProfilePage() {
  const { isAuthenticated } = useAuth();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const operationalQuery = trpc.people.operationalSummary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const profile = normalizeObjectPayload<SessionProfile>(meQuery.data);
  const people = normalizeArrayPayload<OperationalProfile>(
    operationalQuery.data?.people
  );
  const personId = profile?.personId ?? profile?.person?.id ?? null;
  const operationalProfile = personId
    ? (people.find(person => person.personId === personId) ?? null)
    : null;

  const name = profile?.name ?? profile?.person?.name ?? null;
  const email = profile?.email ?? profile?.person?.email ?? null;
  const role = profile?.role ?? profile?.person?.role ?? null;
  const organizationName = profile?.organization?.name ?? null;
  const accountStatus = profile?.active ?? profile?.person?.active;

  const refresh = () => {
    void Promise.all([meQuery.refetch(), operationalQuery.refetch()]);
  };

  return (
    <AppPageShell className="gap-4 p-3 md:p-5">
      <AppOperationalHeader
        title={name ?? "Perfil"}
        description="Sua identidade e o contexto individual oficialmente disponíveis na operação."
        secondaryActions={
          <Button
            type="button"
            variant="outline"
            disabled={meQuery.isFetching || operationalQuery.isFetching}
            onClick={refresh}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
        contextChips={
          profile ? (
            <>
              {role ? <AppStatusBadge label={role} /> : null}
              {accountStatus === undefined || accountStatus === null ? null : (
                <AppStatusBadge label={accountStatus ? "Ativo" : "Inativo"} />
              )}
              {organizationName ? (
                <AppStatusBadge label={organizationName} />
              ) : null}
            </>
          ) : undefined
        }
      />

      <AppSectionBlock
        title="Identidade"
        subtitle="Dados factuais da conta e do vínculo da pessoa autenticada. Estes campos são somente leitura porque não existe mutation específica de Perfil."
      >
        {meQuery.isLoading ? (
          <AppPageLoadingState
            title="Carregando identidade"
            description="Consultando os dados da sessão autenticada."
          />
        ) : meQuery.isError ? (
          <AppPageErrorState
            title="Identidade indisponível"
            description="Não foi possível consultar a fonte oficial da conta. Nenhum dado foi presumido."
            actionLabel="Tentar novamente"
            onAction={() => void meQuery.refetch()}
          />
        ) : !profile ? (
          <AppPageErrorState
            title="Identidade não retornada"
            description="A consulta terminou sem dados utilizáveis para a pessoa autenticada."
            actionLabel="Consultar novamente"
            onAction={() => void meQuery.refetch()}
          />
        ) : (
          <AppFieldGroup>
            <AppField label="Nome" htmlFor="profile-name">
              <AppInput
                id="profile-name"
                value={present(name)}
                readOnly
                aria-readonly="true"
              />
            </AppField>
            <AppField label="E-mail" htmlFor="profile-email">
              <AppInput
                id="profile-email"
                type="email"
                value={present(email)}
                readOnly
                aria-readonly="true"
              />
            </AppField>
            <AppField label="Papel de acesso" htmlFor="profile-role">
              <AppInput
                id="profile-role"
                value={present(role)}
                readOnly
                aria-readonly="true"
              />
            </AppField>
            <AppField label="Organização" htmlFor="profile-organization">
              <AppInput
                id="profile-organization"
                value={present(organizationName)}
                readOnly
                aria-readonly="true"
              />
            </AppField>
          </AppFieldGroup>
        )}
      </AppSectionBlock>

      <AppSectionBlock
        title="Contexto operacional oficial"
        subtitle="Leitura individual do resumo operacional de People, sem classificação ou recomendação calculada nesta página."
      >
        {operationalQuery.isLoading ? (
          <AppPageLoadingState
            title="Carregando contexto operacional"
            description="Consultando o resumo oficial de People."
          />
        ) : operationalQuery.isError ? (
          <AppPageErrorState
            title="Contexto operacional indisponível"
            description="A identidade permanece disponível, mas o resumo de People não respondeu ou não está autorizado para esta conta. Nenhuma condição saudável foi presumida."
            actionLabel="Tentar novamente"
            onAction={() => void operationalQuery.refetch()}
          />
        ) : !personId ? (
          <AppAlert>
            <AppAlertTitle>Vínculo individual não informado</AppAlertTitle>
            <AppAlertDescription>
              A sessão não retornou um personId para localizar o contexto
              operacional.
            </AppAlertDescription>
          </AppAlert>
        ) : !operationalProfile ? (
          <AppAlert>
            <AppAlertTitle>Contexto individual não retornado</AppAlertTitle>
            <AppAlertDescription>
              O resumo oficial não contém dados para a pessoa vinculada à
              sessão.
            </AppAlertDescription>
          </AppAlert>
        ) : (
          <div className="space-y-4">
            <div
              className="flex flex-wrap gap-2"
              aria-label="Estados operacionais oficiais"
            >
              <AppStatusBadge label={operationalProfile.status} />
              <AppStatusBadge label={operationalProfile.operationalStatus} />
              <AppStatusBadge label={operationalProfile.priority} />
              {operationalProfile.availabilityStatus ? (
                <AppStatusBadge label={operationalProfile.availabilityStatus} />
              ) : null}
              {operationalProfile.loadStatus ? (
                <AppStatusBadge label={operationalProfile.loadStatus} />
              ) : null}
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["O.S. abertas", operationalProfile.openServiceOrdersCount],
                ["O.S. vencidas", operationalProfile.overdueServiceOrdersCount],
                ["Agenda hoje", operationalProfile.todayAppointmentsCount],
                ["Agenda futura", operationalProfile.futureAppointmentsCount],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3"
                >
                  <p className="text-xs text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 break-words text-lg font-semibold text-[var(--text-primary)]">
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>

            <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="font-medium text-[var(--text-primary)]">
                  Resumo
                </dt>
                <dd className="mt-1 break-words text-[var(--text-secondary)]">
                  {present(operationalProfile.operationalSummaryText)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-[var(--text-primary)]">
                  Última atividade
                </dt>
                <dd className="mt-1 break-words text-[var(--text-secondary)]">
                  {formatDateTime(operationalProfile.lastActivityAt)}
                </dd>
              </div>
            </dl>

            {operationalProfile.recommendedActionLabel ? (
              <AppAlert>
                <AppAlertTitle>
                  {operationalProfile.recommendedActionLabel}
                </AppAlertTitle>
                <AppAlertDescription>
                  <p>{present(operationalProfile.interventionReason)}</p>
                  <p>
                    Destino oficial:{" "}
                    {present(operationalProfile.recommendedActionTarget)}
                  </p>
                  {operationalProfile.riskSummaryText ? (
                    <p>{operationalProfile.riskSummaryText}</p>
                  ) : null}
                </AppAlertDescription>
              </AppAlert>
            ) : (
              <AppAlert>
                <AppAlertTitle>Recomendação não fornecida</AppAlertTitle>
                <AppAlertDescription>
                  A fonte oficial não retornou recomendação para esta pessoa.
                </AppAlertDescription>
              </AppAlert>
            )}
          </div>
        )}
      </AppSectionBlock>

      {operationalProfile ? (
        <AppSectionBlock
          title="Capacidade profissional"
          subtitle="Capacidades, uso e observações entregues diretamente pelo contrato operacional."
        >
          <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
            {[
              [
                "Capacidade diária de O.S.",
                operationalProfile.dailyServiceOrderCapacity,
              ],
              [
                "Capacidade diária de agenda",
                operationalProfile.dailyAppointmentCapacity,
              ],
              [
                "Uso da capacidade de O.S.",
                operationalProfile.serviceOrderCapacityUsagePct,
              ],
              [
                "Uso da capacidade de agenda",
                operationalProfile.appointmentCapacityUsagePct,
              ],
              ["Estado de capacidade", operationalProfile.capacityStatus],
              ["Observações de carga", operationalProfile.workloadNotes],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="font-medium text-[var(--text-primary)]">
                  {label}
                </dt>
                <dd className="mt-1 break-words text-[var(--text-secondary)]">
                  {present(value)}
                </dd>
              </div>
            ))}
          </dl>
          {operationalProfile.capacitySummaryText ? (
            <p className="mt-4 break-words border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-secondary)]">
              {operationalProfile.capacitySummaryText}
            </p>
          ) : null}
        </AppSectionBlock>
      ) : null}
    </AppPageShell>
  );
}

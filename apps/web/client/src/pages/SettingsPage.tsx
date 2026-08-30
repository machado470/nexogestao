import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AppDataTable,
  AppOperationalHeader,
  AppPageShell,
  AppStatusBadge,
} from "@/components/internal-page-system";
import {
  OperationalActionPanel,
  OperationalInnerCard,
  OperationalPanel,
  OperationalPriorityItem,
  OperationalSectionGrid,
} from "@/components/operational";
import { trpc } from "@/lib/trpc";
import { normalizeObjectPayload } from "@/lib/query-helpers";
import { useAuth } from "@/contexts/AuthContext";

type OfficialState =
  | "CONFIGURED"
  | "INCOMPLETE"
  | "NOT_CONFIGURED"
  | "NOT_EVALUATED";
type Summary = {
  evaluatedAt: string;
  organization: { name: string | null; timezone: string | null };
  sections: Array<{
    key: string;
    label: string;
    state: OfficialState;
    available: boolean;
    reason: string;
    target: string | null;
  }>;
  pending: Array<{
    key: string;
    label: string;
    state: OfficialState;
    reason: string;
    target: string | null;
    recommendedAction: string;
  }>;
  access: {
    available: boolean;
    activeMembers: Array<{
      id: string;
      email: string;
      role: string;
      person?: { name?: string | null } | null;
    }>;
    pendingInviteCount: number;
  };
};

const stateLabel: Record<OfficialState, string> = {
  CONFIGURED: "Configurado",
  INCOMPLETE: "Incompleto",
  NOT_CONFIGURED: "Não configurado",
  NOT_EVALUATED: "Não avaliado",
};

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const settingsQuery = trpc.nexo.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const summaryQuery = trpc.nexo.settings.administrativeSummary.useQuery(
    undefined,
    { enabled: isAuthenticated, retry: false }
  );
  const utils = trpc.useUtils();
  const settings = normalizeObjectPayload<{
    name?: string | null;
    timezone?: string | null;
  }>(settingsQuery.data);
  const summary = normalizeObjectPayload<Summary>(summaryQuery.data);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    if (!settingsQuery.data) return;
    setName(String(settings?.name ?? ""));
    setTimezone(String(settings?.timezone ?? ""));
  }, [settings?.name, settings?.timezone, settingsQuery.data]);

  const persistedName = String(settings?.name ?? "");
  const persistedTimezone = String(settings?.timezone ?? "");
  const unsaved = name !== persistedName || timezone !== persistedTimezone;
  const updateMutation = trpc.nexo.settings.update.useMutation({
    onSuccess: async () => {
      toast.success("Configurações da empresa salvas.");
      await Promise.all([
        utils.nexo.settings.get.invalidate(),
        utils.nexo.settings.administrativeSummary.invalidate(),
      ]);
    },
    onError: error =>
      toast.error(error.message || "Não foi possível salvar as configurações."),
  });

  const navigateTo = (target: string | null) => {
    if (!target) return;
    if (target.startsWith("/settings#")) {
      document.getElementById(target.split("#")[1])?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    navigate(target);
  };
  const retry = () => void summaryQuery.refetch();
  const nextAction = summary?.pending[0] ?? null;

  return (
    <AppPageShell>
      <AppOperationalHeader
        title="Configurações"
        description="Centro de Controle do Nexo com diagnóstico administrativo oficial."
        primaryAction={
          <Button
            disabled={!unsaved || updateMutation.isPending}
            onClick={() => updateMutation.mutate({ name, timezone })}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar empresa"}
          </Button>
        }
        secondaryActions={
          <Button variant="outline" onClick={retry}>
            Atualizar leitura
          </Button>
        }
        contextChips={
          <>
            <AppStatusBadge
              label={unsaved ? "Alterações não salvas" : "Sem alterações"}
            />
            <AppStatusBadge
              label={
                summary
                  ? `${summary.pending.length} pendência(s)`
                  : "Não avaliado"
              }
            />
          </>
        }
      />

      <OperationalPanel
        title="Centro de controle do sistema"
        subtitle="Estados fornecidos pelo resumo administrativo oficial."
        variant="hero"
      >
        {summaryQuery.isError ? (
          <OperationalPriorityItem
            tone="medium"
            title="Diagnóstico administrativo indisponível"
            description="Sua sessão continua ativa. Tente carregar o resumo novamente."
            action={<Button onClick={retry}>Tentar novamente</Button>}
          />
        ) : !summary ? (
          <OperationalPriorityItem
            tone="low"
            title="Diagnóstico ainda não avaliado"
            description="Aguardando o resumo administrativo oficial."
          />
        ) : (
          <OperationalSectionGrid>
            {summary.sections.map(section => (
              <OperationalInnerCard key={section.key} interactive>
                <div className="flex min-h-[132px] flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {section.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                        {section.reason}
                      </p>
                    </div>
                    <AppStatusBadge
                      label={
                        section.available
                          ? stateLabel[section.state]
                          : "Indisponível"
                      }
                    />
                  </div>
                  {section.target && (
                    <Button
                      className="mt-auto self-start"
                      size="sm"
                      variant="outline"
                      onClick={() => navigateTo(section.target)}
                    >
                      Revisar
                    </Button>
                  )}
                </div>
              </OperationalInnerCard>
            ))}
          </OperationalSectionGrid>
        )}
      </OperationalPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <OperationalPanel
          title="Próxima configuração recomendada"
          variant="compact"
        >
          {nextAction ? (
            <OperationalActionPanel
              title={nextAction.recommendedAction}
              description={nextAction.reason}
              impact="priorização definida pelo diagnóstico administrativo oficial"
              safety="a página apenas navega para o alvo oficial"
              tone={
                nextAction.state === "NOT_EVALUATED" ? "warning" : "success"
              }
              primaryAction={{
                label: nextAction.recommendedAction,
                onClick: () => navigateTo(nextAction.target),
              }}
            />
          ) : (
            <OperationalPriorityItem
              tone="low"
              title={summary ? "Sem pendências oficiais" : "Não avaliado"}
              description={
                summary
                  ? "O resumo oficial não retornou pendências."
                  : "Nenhuma recomendação pode ser exibida sem o resumo oficial."
              }
            />
          )}
        </OperationalPanel>
        <OperationalPanel title="Pendências de configuração" variant="compact">
          {summary?.pending.map(item => (
            <OperationalPriorityItem
              key={item.key}
              tone={item.state === "NOT_EVALUATED" ? "medium" : "high"}
              title={item.label}
              description={item.reason}
              action={<AppStatusBadge label={stateLabel[item.state]} />}
            />
          )) ?? (
            <p className="text-sm text-[var(--text-muted)]">Não disponível.</p>
          )}
        </OperationalPanel>
      </div>

      <div id="settings-company-form">
        <OperationalPanel
          title="Empresa"
          subtitle="Campos persistidos explicitamente."
          variant="compact"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              Empresa
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Nome da empresa"
              />
            </label>
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              Fuso horário
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={timezone}
                onChange={event => setTimezone(event.target.value)}
                placeholder="America/Sao_Paulo"
              />
            </label>
          </div>
        </OperationalPanel>
      </div>

      <OperationalPanel
        title="Usuários e permissões"
        subtitle="Resumo oficial de acesso do tenant."
        variant="compact"
      >
        <AppDataTable className="min-w-[720px]">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Usuário</th>
              <th className="px-3 py-2 text-left">Função</th>
            </tr>
          </thead>
          <tbody>
            {summary?.access.activeMembers.map(member => (
              <tr key={member.id} className="border-t">
                <td className="px-3 py-3">
                  {member.person?.name ?? member.email}
                </td>
                <td className="px-3 py-3">{member.role}</td>
              </tr>
            )) ?? (
              <tr>
                <td className="px-3 py-4" colSpan={2}>
                  Não disponível.
                </td>
              </tr>
            )}
          </tbody>
        </AppDataTable>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          {summary
            ? `${summary.access.pendingInviteCount} convite(s) pendente(s).`
            : "Convites não avaliados."}
        </p>
      </OperationalPanel>
    </AppPageShell>
  );
}

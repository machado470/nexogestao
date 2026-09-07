import { FormEvent, useEffect, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  AppField,
  AppFieldGroup,
  AppForm,
  AppFormActions,
  AppInput,
  AppSelect,
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
import { normalizeObjectPayload } from "@/lib/query-helpers";
import { trpc } from "@/lib/trpc";

type Currency = "BRL" | "USD" | "EUR";

type OrganizationSettings = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: Currency;
};

const currencyOptions = [
  { value: "BRL", label: "Real brasileiro (BRL)" },
  { value: "USD", label: "Dólar americano (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
];

export default function SettingsPage() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const settings = normalizeObjectPayload<OrganizationSettings>(
    settingsQuery.data
  );
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState<Currency>("BRL");

  useEffect(() => {
    if (!settings) return;
    setName(settings.name);
    setTimezone(settings.timezone);
    setCurrency(settings.currency);
  }, [settings?.currency, settings?.name, settings?.timezone]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.get.invalidate();
      toast.success("Configurações da organização salvas.");
    },
    onError: error => {
      toast.error(error.message || "Não foi possível salvar as configurações.");
    },
  });

  const hasChanges = Boolean(
    settings &&
    (name !== settings.name ||
      timezone !== settings.timezone ||
      currency !== settings.currency)
  );
  const hasRequiredValues = name.trim() !== "" && timezone.trim() !== "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges || !hasRequiredValues || updateMutation.isPending) return;
    updateMutation.mutate({ name, timezone, currency });
  };

  const resetForm = () => {
    if (!settings) return;
    setName(settings.name);
    setTimezone(settings.timezone);
    setCurrency(settings.currency);
    updateMutation.reset();
  };

  return (
    <AppPageShell className="gap-4 p-3 md:p-5">
      <AppOperationalHeader
        title="Configurações"
        description="Defina os dados que orientam o funcionamento desta organização."
        primaryAction={
          <Button
            type="submit"
            form="organization-settings-form"
            disabled={
              !hasChanges || !hasRequiredValues || updateMutation.isPending
            }
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        }
        secondaryActions={
          <Button
            type="button"
            variant="outline"
            disabled={settingsQuery.isFetching || updateMutation.isPending}
            onClick={() => void settingsQuery.refetch()}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
        contextChips={
          settings ? (
            <>
              <AppStatusBadge label={settings.name} />
              {hasChanges ? (
                <AppStatusBadge label="Alterações não salvas" />
              ) : null}
            </>
          ) : undefined
        }
      />

      <AppSectionBlock
        title="Organização"
        subtitle="Nome, fuso horário e moeda são as configurações atualmente persistidas para toda a organização."
      >
        {settingsQuery.isLoading ? (
          <AppPageLoadingState
            title="Carregando configurações"
            description="Consultando os valores persistidos da organização."
          />
        ) : settingsQuery.isError ? (
          <AppPageErrorState
            title="Configurações indisponíveis"
            description="A fonte oficial não respondeu. Nenhum valor padrão foi presumido."
            actionLabel="Tentar novamente"
            onAction={() => void settingsQuery.refetch()}
          />
        ) : !settings ? (
          <AppPageErrorState
            title="Configurações não retornadas"
            description="A consulta terminou sem dados utilizáveis da organização."
            actionLabel="Consultar novamente"
            onAction={() => void settingsQuery.refetch()}
          />
        ) : (
          <AppForm id="organization-settings-form" onSubmit={handleSubmit}>
            <AppFieldGroup>
              <AppField label="Nome da organização" htmlFor="settings-name">
                <AppInput
                  id="settings-name"
                  name="name"
                  autoComplete="organization"
                  value={name}
                  onChange={event => {
                    setName(event.target.value);
                    updateMutation.reset();
                  }}
                  aria-invalid={name.trim() === ""}
                  aria-describedby={
                    name.trim() === "" ? "settings-name-error" : undefined
                  }
                  disabled={updateMutation.isPending}
                  required
                />
                {name.trim() === "" ? (
                  <p
                    id="settings-name-error"
                    className="text-xs text-destructive"
                  >
                    Informe o nome da organização.
                  </p>
                ) : null}
              </AppField>

              <AppField
                label="Fuso horário"
                htmlFor="settings-timezone"
                hint="Usado para apresentar datas e horários da operação."
              >
                <AppInput
                  id="settings-timezone"
                  name="timezone"
                  value={timezone}
                  onChange={event => {
                    setTimezone(event.target.value);
                    updateMutation.reset();
                  }}
                  placeholder="America/Sao_Paulo"
                  aria-invalid={timezone.trim() === ""}
                  aria-describedby={
                    timezone.trim() === ""
                      ? "settings-timezone-error"
                      : undefined
                  }
                  disabled={updateMutation.isPending}
                  required
                />
                {timezone.trim() === "" ? (
                  <p
                    id="settings-timezone-error"
                    className="text-xs text-destructive"
                  >
                    Informe o fuso horário.
                  </p>
                ) : null}
              </AppField>

              <AppField
                label="Moeda operacional"
                htmlFor="settings-currency"
                hint="Define a moeda usada nos valores financeiros da organização."
              >
                <AppSelect
                  value={currency}
                  onValueChange={value => {
                    setCurrency(value as Currency);
                    updateMutation.reset();
                  }}
                  options={currencyOptions}
                  ariaLabel="Moeda operacional"
                />
              </AppField>

              <AppField
                label="Identificador da organização"
                htmlFor="settings-slug"
                hint="Informação somente leitura."
              >
                <AppInput
                  id="settings-slug"
                  value={settings.slug}
                  readOnly
                  aria-readonly="true"
                />
              </AppField>
            </AppFieldGroup>

            {updateMutation.isError ? (
              <p role="alert" className="text-sm text-destructive">
                A alteração não foi salva. Revise os dados e tente novamente.
              </p>
            ) : null}
            {updateMutation.isSuccess && !hasChanges ? (
              <p role="status" className="text-sm text-[var(--success)]">
                Configurações salvas e confirmadas pela fonte oficial.
              </p>
            ) : null}

            <AppFormActions className="justify-between border-t border-[var(--border-subtle)] pt-4">
              <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                <Building2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{settings.slug}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={!hasChanges || updateMutation.isPending}
                >
                  Descartar alterações
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !hasChanges ||
                    !hasRequiredValues ||
                    updateMutation.isPending
                  }
                >
                  {updateMutation.isPending
                    ? "Salvando..."
                    : "Salvar alterações"}
                </Button>
              </div>
            </AppFormActions>
          </AppForm>
        )}
      </AppSectionBlock>
    </AppPageShell>
  );
}

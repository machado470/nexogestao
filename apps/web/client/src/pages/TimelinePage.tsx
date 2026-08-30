import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { Button } from "@/components/ui/button";
import {
  AppPageEmptyState,
  AppPageErrorState,
  AppPageLoadingState,
} from "@/components/internal-page-system";
import {
  AppPageShell,
  AppSectionCard,
  AppSelect,
} from "@/components/app-system";

export type OfficialTimelineEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
  actor: { name: string } | null;
  entity: { type: string; id: string; href: string } | null;
  module: string | null;
  severity: string | null;
  title: string | null;
  description: string | null;
  consequence: string | null;
  recommendedAction: string | null;
  origin: string | null;
  metadata: Record<string, string | number | boolean>;
};

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: "Pagamento recebido",
  CHARGE_CREATED: "Cobrança criada",
  SERVICE_ORDER_STARTED: "Ordem de serviço iniciada",
  SERVICE_ORDER_COMPLETED: "Ordem de serviço concluída",
  APPOINTMENT_CANCELLED: "Agendamento cancelado",
  APPOINTMENT_CONFIRMED: "Agendamento confirmado",
  MESSAGE_SENT: "Mensagem enviada",
  MESSAGE_FAILED: "Mensagem com falha",
  RISK_UPDATED: "Risco atualizado",
  GOVERNANCE_RUN_COMPLETED: "Verificação de governança concluída",
  OPERATIONAL_STATE_CHANGED: "Estado operacional alterado",
};

const ENTITY_LABELS: Record<string, string> = {
  customer: "Cliente",
  service_order: "Ordem de serviço",
  appointment: "Agendamento",
  charge: "Cobrança",
};

export function officialEventLabel(event: OfficialTimelineEvent) {
  return (
    event.title ?? EVENT_LABELS[event.eventType] ?? "Evento não classificado"
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function safeMetadataEntries(event: OfficialTimelineEvent) {
  return Object.entries(event.metadata ?? {}).filter(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  );
}

export function hasOfficialCta(event: OfficialTimelineEvent) {
  return Boolean(event.entity?.id && event.entity?.href);
}

export default function TimelinePage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [eventType, setEventType] = useState("all");
  const [module, setModule] = useState("all");
  const [severity, setSeverity] = useState("all");

  const query = trpc.nexo.timeline.listByOrg.useQuery(
    { limit: PAGE_SIZE },
    { enabled: isAuthenticated, retry: false }
  );
  const events = normalizeArrayPayload<OfficialTimelineEvent>(query.data);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map(event => event.eventType))).sort(),
    [events]
  );
  const modules = useMemo(
    () =>
      Array.from(
        new Set(events.map(event => event.module).filter(Boolean) as string[])
      ).sort(),
    [events]
  );
  const severities = useMemo(
    () =>
      Array.from(
        new Set(events.map(event => event.severity).filter(Boolean) as string[])
      ).sort(),
    [events]
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        event =>
          (eventType === "all" || event.eventType === eventType) &&
          (module === "all" || event.module === module) &&
          (severity === "all" || event.severity === severity)
      ),
    [events, eventType, module, severity]
  );

  return (
    <AppPageShell>
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Centro de Evidências Operacionais
        </p>
        <h1 className="text-2xl font-semibold">Timeline oficial</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Fatos auditáveis fornecidos pela API, sem fabricar histórico,
          criticidade, consequência ou próxima ação no navegador.
        </p>
        <p className="text-xs text-muted-foreground">
          Sessão autenticada:{" "}
          {user?.name ?? user?.email ?? "identidade confirmada"}
        </p>
      </header>

      <AppSectionCard>
        <h2 className="font-semibold">Filtros oficiais</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Os valores disponíveis vêm exclusivamente do recorte carregado.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <AppSelect
            value={eventType}
            onValueChange={setEventType}
            options={[
              { value: "all", label: "Todos os tipos" },
              ...eventTypes.map(value => ({
                value,
                label: EVENT_LABELS[value] ?? value,
              })),
            ]}
          />
          <AppSelect
            value={module}
            onValueChange={setModule}
            options={[
              { value: "all", label: "Todos os módulos" },
              ...modules.map(value => ({ value, label: value })),
            ]}
          />
          <AppSelect
            value={severity}
            onValueChange={setSeverity}
            options={[
              { value: "all", label: "Todas as classificações" },
              ...severities.map(value => ({ value, label: value })),
            ]}
          />
        </div>
      </AppSectionCard>

      <AppSectionCard>
        <h2 className="font-semibold">Próxima melhor ação</h2>
        <p className="text-sm text-muted-foreground">
          A Timeline não calcula decisões. Uma ação só é apresentada no evento
          quando a fonte oficial a informa.
        </p>
      </AppSectionCard>

      {query.isLoading ? (
        <AppPageLoadingState title="Carregando evidências oficiais" />
      ) : query.isError ? (
        <AppPageErrorState
          title="Timeline temporariamente indisponível"
          description="A identidade autenticada foi preservada. Tente carregar novamente a fonte oficial."
          onAction={() => query.refetch()}
        />
      ) : filteredEvents.length === 0 ? (
        <AppPageEmptyState
          title="Nenhuma evidência no recorte"
          description="A ausência de eventos não significa operação saudável; não há classificação disponível."
        />
      ) : (
        <div className="space-y-3" aria-label="Evidências oficiais">
          {filteredEvents.map(event => (
            <article key={event.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{officialEventLabel(event)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {event.description ?? "Descrição não informada"}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </time>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Tipo oficial</dt>
                  <dd>{event.eventType}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ator</dt>
                  <dd>{event.actor?.name ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Módulo</dt>
                  <dd>{event.module ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Classificação</dt>
                  <dd>{event.severity ?? "Não classificado"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Entidade</dt>
                  <dd>
                    {event.entity
                      ? (ENTITY_LABELS[event.entity.type] ?? event.entity.type)
                      : "Não informada"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Origem</dt>
                  <dd>{event.origin ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Consequência</dt>
                  <dd>{event.consequence ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ação recomendada</dt>
                  <dd>{event.recommendedAction ?? "Não disponível"}</dd>
                </div>
              </dl>
              {safeMetadataEntries(event).length > 0 && (
                <details className="mt-4 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Metadata técnica segura
                  </summary>
                  <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                    {safeMetadataEntries(event).map(([key, value]) => (
                      <div key={key}>
                        <dt className="inline font-medium">{key}: </dt>
                        <dd className="inline">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {hasOfficialCta(event) ? (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => navigate(event.entity!.href)}
                >
                  Abrir vínculo oficial <ExternalLink className="ml-2 size-4" />
                </Button>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="size-4" />
                  Sem CTA: vínculo oficial não informado.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </AppPageShell>
  );
}

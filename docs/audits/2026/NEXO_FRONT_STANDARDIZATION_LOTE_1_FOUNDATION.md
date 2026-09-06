# Lote 1 — Consolidação de tokens e componentes base do front interno NexoGestão

Data da entrega: 2026-06-03  
Escopo: fundação visual reutilizável em `apps/web/client/src`, sem migração de páginas inteiras.  
Fonte principal: `docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`.

## 1. Resumo executivo

O Lote 1 consolidou a fundação visual interna do NexoGestão sem alterar páginas de negócio, sem mexer no WhatsApp e sem instalar biblioteca visual nova.

A auditoria do Lote 0 confirmou que a arquitetura própria do Nexo deve ser preservada e que a base estava fragmentada entre `design-system.tsx`, `app-system.tsx`, `internal-page-system.tsx`, `app-modal-system.tsx`, `PagePattern.tsx` e `components/operating-system/*`. Nesta rodada, a ação foi limitada a:

- consolidar tokens com namespace Nexo no CSS base;
- confirmar o catálogo oficial de componentes base;
- adicionar contratos explícitos para status operacional e prioridade global;
- manter legado compatível, sem remoções;
- ampliar a validação visual com avisos não bloqueantes para hardcodes suspeitos no núcleo visual;
- documentar o contrato para preparar o Lote 2, cujo piloto recomendado é Financeiro.

## 2. O que foi consolidado

- Tokens de superfície, overlay, shell, card, input, tabela, foco, sombras e espaçamento foram organizados em aliases `--nexo-*` no CSS base do app.
- O contrato Surface 0/1/2/3 foi explicitado como aliases sem alterar drasticamente a paleta existente.
- `AppOperationalStatusBadge` foi adicionado como wrapper oficial para status operacional global.
- `AppPriorityBadge` foi adicionado como wrapper oficial para prioridade global P0/P1/P2/P3.
- `AppOperationalStateBadge` passou a aceitar também `RISCO`, preservando estados antigos usados por compatibilidade.
- Um hardcode visual no núcleo (`text-white`/surface indefinida no painel de contexto) foi trocado por tokens Nexo em `AppEntityContextPanel`.
- O validador `validate-operating-system.mjs` passou a emitir avisos não bloqueantes para tokens/classes suspeitas no núcleo visual, preservando legado conhecido.

## 3. Tokens confirmados/criados

### Tokens de superfície e estrutura

| Token                    | Função                 | Observação                                           |
| ------------------------ | ---------------------- | ---------------------------------------------------- |
| `--nexo-surface-0`       | Fundo principal do app | Alias para o fundo validado atual.                   |
| `--nexo-surface-1`       | Shell/painel           | Superfície translúcida/elevada já usada no app.      |
| `--nexo-surface-2`       | Card/seção             | Base de card e seção.                                |
| `--nexo-surface-3`       | Modal/overlay          | Superfície dedicada a overlay/modal.                 |
| `--nexo-app-bg`          | Fundo do app           | Agora aponta para Surface 0 no contexto `.app-root`. |
| `--nexo-shell-bg`        | Shell                  | Alias para Surface 1.                                |
| `--nexo-sidebar-bg`      | Sidebar                | Alias para o token de sidebar vigente.               |
| `--nexo-topbar-bg`       | Topbar                 | Alias para header/topbar vigente.                    |
| `--nexo-panel-bg`        | Painel                 | Alias para Surface 1.                                |
| `--nexo-card-surface`    | Card                   | Alias para Surface 2 no tema claro.                  |
| `--nexo-card-muted`      | Card muted             | Mantido e documentado.                               |
| `--nexo-overlay-bg`      | Fundo de overlay       | Alias do overlay vigente.                            |
| `--nexo-overlay-surface` | Superfície de overlay  | Alias de Surface 3/app overlay.                      |

### Tokens semânticos

| Token                    | Função                           |
| ------------------------ | -------------------------------- |
| `--nexo-border-soft`     | Borda padrão suave.              |
| `--nexo-border-strong`   | Borda reforçada.                 |
| `--nexo-text-primary`    | Texto principal.                 |
| `--nexo-text-secondary`  | Texto secundário.                |
| `--nexo-text-muted`      | Texto muted.                     |
| `--nexo-accent`          | Accent do Nexo.                  |
| `--nexo-accent-hover`    | Accent em hover.                 |
| `--nexo-success`         | Status positivo.                 |
| `--nexo-warning`         | Status de atenção.               |
| `--nexo-danger`          | Status crítico/perigo.           |
| `--nexo-info`            | Status informativo.              |
| `--nexo-input-bg`        | Fundo de input.                  |
| `--nexo-input-border`    | Borda de input.                  |
| `--nexo-table-row-hover` | Hover global de linha de tabela. |
| `--nexo-focus-ring`      | Ring/focus.                      |

### Tokens de sombra e espaçamento

| Token                         | Função                          |
| ----------------------------- | ------------------------------- |
| `--nexo-shadow-soft`          | Sombra leve.                    |
| `--nexo-shadow-panel`         | Sombra de painel.               |
| `--nexo-shadow-elev-1`        | Elevação baixa.                 |
| `--nexo-shadow-elev-2`        | Elevação alta.                  |
| `--nexo-space-page-padding-x` | Padding horizontal de página.   |
| `--nexo-space-page-padding-y` | Padding vertical de página.     |
| `--nexo-space-section-gap`    | Espaço entre seções.            |
| `--nexo-space-card-padding`   | Padding padrão de card.         |
| `--nexo-space-toolbar-gap`    | Gap de toolbar.                 |
| `--nexo-control-height-md`    | Altura média de controle.       |
| `--nexo-table-row-height`     | Altura base de linha de tabela. |

## 4. Componentes oficiais confirmados

### Layout

- `AppPageShell`
- `AppPageHeader`
- `AppOperationalHeader`
- `AppPageSection`
- `AppToolbar`
- `AppFiltersBar`

### Cards e blocos

- `AppSectionCard`
- `AppSectionBlock`
- `AppStatCard`
- `AppInfoCard`
- `AppEmptyState`
- `AppMetricCard`
- `AppKpiCard`
- `AppKpiRow`
- `AppChartPanel`

### Dados

- `AppDataTable`
- `AppStatusBadge`
- `AppOperationalStatusBadge`
- `AppPriorityBadge`
- `AppRowActionsDropdown`
- `AppPagination`

### Formulários

- `AppForm`
- `AppFormSection`
- `AppField`
- `AppFieldGroup`
- `AppInput`
- `AppTextarea`
- `AppSelect`
- `AppCheckbox`
- `AppRadio`
- `AppRadioItem`
- `AppInlineHint`
- `AppFormActions`

### Overlays

- `BaseModal`
- `FormModal`
- `ConfirmModal`
- `QuickActionModal`
- `BaseOperationalModal`
- `ModalHeader`
- `ModalBody`
- `ModalFooter`
- `AppPopover`
- `AppPopoverTrigger`
- `AppPopoverContent`
- `AppDropdown`
- `AppDropdownTrigger`
- `AppDropdownContent`
- `AppDropdownItem`

### Feedback

- `AppAlert`
- `AppAlertTitle`
- `AppAlertDescription`
- `AppToast`
- `AppLoadingState`
- `AppSkeleton`
- `AppSuccessState`
- `AppErrorState`

### Histórico

- `AppTimeline`
- `AppTimelineItem`
- `AppActivityFeed`
- `AppEmbeddedTimeline`
- `AppRecentActivityList`

### Navegação

- `AppTabs`
- `AppTabsList`
- `AppTabsTrigger`
- `AppTabsContent`
- `AppBreadcrumbs`
- `AppBreadcrumbItem`
- `AppBreadcrumbLink`
- `AppBreadcrumbList`
- `AppBreadcrumbPage`
- `AppBreadcrumbSeparator`
- `AppSecondaryTabs`

## 5. Componentes duplicados preservados

Nenhum componente legado foi removido. Duplicações identificadas e preservadas:

| Legado/duplicado                                                           | Substituto oficial recomendado                                      | Classificação                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `PagePattern.tsx` (`PageShell`, `PageHero`, `SmartPage`, `SurfaceSection`) | `AppPageShell`, `AppPageHeader`, `AppPageSection`, `AppSectionCard` | Manter por compatibilidade; remover apenas no Lote 7.                  |
| `PageWrapper` em `components/operating-system/Wrappers.tsx`                | `AppPageShell` + `AppOperationalHeader`/`AppPageHeader`             | Migrar gradualmente nos Lotes 2 e 3.                                   |
| `DataTableWrapper`                                                         | `AppDataTable` + contrato de tabela oficial                         | Migrar no Lote 2 para Financeiro quando possível.                      |
| `NexoStatusBadge` paralelo                                                 | `AppStatusBadge`, `AppOperationalStatusBadge`, `AppPriorityBadge`   | Manter como primitive; wrapper App é oficial para páginas novas.       |
| `NexoBadge`/chips locais                                                   | `AppStatusBadge` e wrappers semânticos                              | Migrar no Lote 3; remover apenas no Lote 7.                            |
| Cards locais em páginas                                                    | `AppSectionCard`, `AppSectionBlock`, `AppStatCard`, `AppInfoCard`   | Migrar por página, começando pelo Financeiro no Lote 2.                |
| Modais com `Dialog` direto                                                 | `BaseModal`, `FormModal`, `ConfirmModal`                            | Marcar como legado/detail-legacy; migrar sem alterar fluxo de negócio. |
| Headers paralelos (`PageHeader`, `OperationalHeader`)                      | `AppPageHeader` ou `AppOperationalHeader`                           | Migrar em lotes posteriores.                                           |

## 6. Componentes marcados como legado

- `PagePattern.tsx`: legado preservado por compatibilidade.
- `PageWrapper`: compatível por enquanto, mas não deve ser modelo para telas novas.
- `DataTableWrapper`: compatível enquanto páginas atuais dependem dele.
- `NexoStatusBadge`/`NexoBadge`: primitives mantidas; páginas novas devem consumir wrappers `App*`.
- Modais diretos com `Dialog`: devem migrar para `BaseModal`, `FormModal` ou `ConfirmModal` conforme intenção.
- `CustomerWorkspaceModal` e workspaces pesados em modal: candidatos a `detail-legacy` até a decisão workspace vs modal.

## 7. Regras de uso dos componentes oficiais

1. Páginas novas ou migradas devem começar em `AppPageShell`.
2. Header de página deve usar `AppPageHeader` para páginas simples ou `AppOperationalHeader` para páginas operacionais.
3. Seção/card deve usar `AppPageSection`, `AppSectionCard` ou `AppSectionBlock`; não criar card local sem necessidade.
4. Toolbar/filtros devem usar `AppToolbar`/`AppFiltersBar`.
5. Tabelas devem preferir `AppDataTable` e respeitar tokens de hover/linha.
6. Status de negócio deve usar `AppStatusBadge`; status operacional global deve usar `AppOperationalStatusBadge`.
7. Prioridade global deve usar `AppPriorityBadge`.
8. Formulários em modais devem usar `AppForm`, `AppFormSection`, `AppField`, `AppFieldGroup` e inputs oficiais.
9. Modais simples de formulário devem usar `FormModal`; confirmação deve usar `ConfirmModal`; detalhe pesado deve ser avaliado como workspace ou marcado `detail-legacy`.
10. Não usar `bg-zinc-*`, `bg-slate-*`, `bg-black`, `text-white`, `dark:*`, `border-white`, `p-6/p-8` ou `rounded-2xl` como contrato visual novo sem justificar no relatório do lote.

## 8. Contrato Surface 0/1/2/3

| Surface   | Uso                                                | Token oficial                                            |
| --------- | -------------------------------------------------- | -------------------------------------------------------- |
| Surface 0 | Fundo do app e área externa de página              | `--nexo-surface-0` / `--nexo-app-bg`                     |
| Surface 1 | Shell, painel estrutural, sidebar/topbar por alias | `--nexo-surface-1`, `--nexo-shell-bg`, `--nexo-panel-bg` |
| Surface 2 | Card, seção, tabela e bloco de conteúdo            | `--nexo-surface-2`, `--nexo-card-surface`                |
| Surface 3 | Modal, overlay e superfície elevada temporária     | `--nexo-surface-3`, `--nexo-overlay-surface`             |

Regra: página não deve depender de `bg-black`, `bg-zinc-*`, `bg-slate-*` ou variações locais como contrato. Usar token `--nexo-*` ou classe Nexo existente.

## 9. Contrato de status operacional

Status globais oficiais:

| Status    | Sentido                          | Badge/tom |
| --------- | -------------------------------- | --------- |
| `NORMAL`  | Operação saudável                | `success` |
| `ATENÇÃO` | Exige acompanhamento             | `warning` |
| `RISCO`   | Risco relevante, mas não crítico | `accent`  |
| `CRÍTICO` | Exige ação imediata              | `danger`  |

Componente oficial: `AppOperationalStatusBadge`.

Compatibilidade preservada: `AppOperationalStateBadge` ainda aceita `WARNING`, `RESTRICTED` e `SUSPENDED`.

## 10. Contrato de prioridade P0/P1/P2/P3

| Prioridade | Sentido       | Badge/tom |
| ---------- | ------------- | --------- |
| `P0`       | Agir agora    | `danger`  |
| `P1`       | Resolver hoje | `warning` |
| `P2`       | Acompanhar    | `info`    |
| `P3`       | Informativo   | `neutral` |

Componente oficial: `AppPriorityBadge`.

## 11. Regra Modal vs Workspace

- Usar `ConfirmModal` para confirmação curta e auditável.
- Usar `FormModal` para criação/edição curta com formulário.
- Usar `BaseModal` apenas quando o fluxo exigir composição customizada controlada.
- Usar workspace/painel contextual quando o conteúdo for detalhe pesado, timeline, histórico, cobrança, cliente + O.S. + ação conectada ou fluxo de múltiplas etapas.
- Enquanto não migrado, marcar detalhe pesado como `detail-legacy` e preservar comportamento.

## 12. Proteção contra regressão visual

O script `apps/web/scripts/validate-operating-system.mjs` foi mantido como gate bloqueante para regras já existentes e ampliado com avisos não bloqueantes para:

- `bg-gray-950`;
- `border-white`;
- `border-zinc`;
- `border-slate`;
- `text-white`;
- `dark:bg`;
- `dark:text`;
- `dark:border`;
- `rounded-2xl`;
- `p-6`;
- `p-8`.

A estratégia foi deliberadamente conservadora: não bloquear legado conhecido, não bloquear WhatsApp e não transformar todo hardcode antigo em erro neste lote. O objetivo é sinalizar risco no núcleo visual e orientar os próximos lotes.

## 13. Riscos para WhatsApp e como foram evitados

- `WhatsAppPage.tsx` não foi alterado.
- O layout split do WhatsApp, inbox, conversa, composer, painel lateral e fundos não foram tocados.
- Nenhum componente específico de WhatsApp foi editado.
- As mudanças em `AppPageShell` foram evitadas para reduzir risco, pois o WhatsApp importa esse wrapper.
- O validador continua inspecionando WhatsApp como escopo de legado, mas os novos avisos de fundação não passam pelo arquivo do WhatsApp.

## 14. Arquivos alterados

- `apps/web/client/src/index.css`
- `apps/web/client/src/components/app-system.tsx`
- `apps/web/scripts/validate-operating-system.mjs`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_1_FOUNDATION.md`

## 15. Arquivos apenas analisados

- `docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`
- `apps/web/client/src/components/app-modal-system.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`
- `apps/web/client/src/components/design-system.tsx`
- `apps/web/client/src/components/PagePattern.tsx`
- `apps/web/client/src/components/operating-system/*`
- `apps/web/client/src/components/ui/*`
- `apps/web/package.json`
- `apps/api/package.json`
- `package.json`
- Tailwind/CSS base via `apps/web/client/src/index.css`

## 16. Próximo lote recomendado: Lote 2 Financeiro piloto

O próximo lote recomendado continua sendo Financeiro como piloto real de padronização. O Lote 2 deve:

1. migrar Financeiro para o contrato oficial sem alterar regra de negócio;
2. substituir cards/tabelas/badges locais por wrappers oficiais;
3. manter modais com comportamento atual, migrando apenas se o risco for baixo;
4. medir impacto visual e registrar decisões antes de Clientes/O.S.;
5. não usar Dashboard como referência visual.

## 17. Critérios de aceite

- WhatsAppPage.tsx não foi alterado.
- Não houve instalação de Flowbite.
- Não houve troca de biblioteca visual.
- Não houve mudança de backend.
- Não houve mudança de banco.
- Não houve migration.
- Não houve alteração de autenticação, tenant, orgId, tRPC ou API.
- Não houve refatoração de página inteira.
- Tokens principais foram documentados.
- Componentes oficiais foram documentados.
- Legado foi preservado.
- Validador visual foi melhorado sem quebrar legado.
- Quality gates foram executados e registrados.

## 18. Quality gates executados

Quality gates executados nesta rodada:

- `pnpm prisma:check` — passou.
- `pnpm -r typecheck` — passou.
- `pnpm -r lint` — passou com avisos visuais não bloqueantes do validador.
- `pnpm -s build` — passou.
- `pnpm test` — passou.
- `pnpm ci:preflight` — passou.
- `pnpm --filter ./apps/web lint:os` — passou com avisos visuais não bloqueantes.
- `pnpm --filter ./apps/web test` — passou.
- `pnpm --filter ./apps/api test` — passou.
- `git status --short` — executado antes do commit para conferir apenas os arquivos esperados.

## 19. Confirmações obrigatórias

- WhatsApp congelado foi respeitado.
- Flowbite não foi instalado.
- Nenhuma dependência visual nova foi criada.
- Backend, banco, migrations, autenticação, tenant/orgId e tRPC/API não foram alterados.
- Dashboard não foi alterado.
- Financeiro, Clientes, O.S. e Agendamentos não foram refatorados neste lote.
- Legado não foi removido.
- Fundação visual está pronta para o Lote 2 Financeiro piloto.

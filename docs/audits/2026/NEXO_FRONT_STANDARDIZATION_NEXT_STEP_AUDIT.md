# Auditoria — próxima fase de padronização visual do front interno NexoGestão

Data da auditoria: 2026-06-03  
Escopo: front interno em `apps/web/client/src`, com WhatsApp congelado.  
Tipo de entrega: Lote 0 — auditoria técnica sem alteração visual, sem refatoração e sem mudança de comportamento.

## 1. Resumo executivo

O front interno já possui uma base visual própria do Nexo, mas ela está fragmentada entre três camadas de componentes:

1. `design-system.tsx`, com primitives Nexo históricas como `AppShell`, `NexoMainContainer`, `PageHeader`, `NexoStatCard`, `DataTable`, `NexoStatusBadge`, `NexoBadge`, `NexoTimeline`, `NexoTable`, `SearchInput`, `Input` e `Select`.
2. `app-system.tsx`, que consolida o contrato mais próximo do solicitado para páginas internas: `AppPageShell`, `AppPageHeader`, `AppPageSection`, `AppToolbar`, `AppFiltersBar`, `AppSectionCard`, `AppStatCard`, `AppInfoCard`, `AppEmptyState`, `AppDataTable`, `AppStatusBadge`, `AppRowActionsDropdown`, `AppForm`, `AppField`, `AppInput`, `AppSelect`, `AppTabs`, `AppTimeline`, `AppAlert`, `AppLoadingState`, `AppSkeleton` e helpers relacionados.
3. `internal-page-system.tsx` e `components/operating-system/*`, que implementam a linguagem operacional mais recente: `AppOperationalHeader`, `AppSectionBlock`, `AppOperationalKpiGrid`, `AppOperationalStatusSummary`, `AppContextWorkspace`, `AppEmbeddedTimeline`, `AppNextBestActionBlock`, `AppPagination`, `PageWrapper`, `OperationalTopCard` e outros blocos de sistema operacional.

A padronização deve consolidar a linguagem oficial em cima de `app-system.tsx` + `internal-page-system.tsx`, preservando `design-system.tsx` como camada de primitives/tokens enquanto houver dependências. A remoção de legado deve ficar para lote posterior.

**Conclusões principais:**

- Não há necessidade de instalar Flowbite. A arquitetura própria já existe e deve ser protegida.
- WhatsApp usa poucos componentes compartilhados (`Button`, `AppPageShell`, `AppSkeleton`, `AppPageLoadingState`, dropdown primitives e painel de execução). Qualquer mudança nesses componentes deve ser tratada como risco visual para WhatsApp.
- As páginas mais críticas para iniciar migração são `FinancesPage`, `CustomersPage` e `ServiceOrdersPage`, pois concentram a cadeia Cliente → O.S. → Cobrança e ainda misturam `PageWrapper`, blocos operacionais, tabelas locais e classes visuais por página.
- Dashboard não deve ser fonte visual. `ExecutiveDashboard` ainda contém `max-w-*` divergente, `border-white/*` e uma estrutura muito específica; deve ser migrado apenas depois dos módulos operacionais.
- Existem modais legados com `Dialog` direto e/ou detalhe pesado: `ContactHistoryModal`, `DetailModal`, `EditChargeModal`, `EditServiceOrderModal`, `CreatePersonModal`, `CreateLaunchModal`, `EditPersonModal`, `AuditPage` e `CustomerWorkspaceModal`/workspaces em modal. Eles devem ser marcados como `detail-legacy` quando representarem detalhe/contexto pesado.

## 2. Estado atual da arquitetura visual

### 2.1 Layout e rotas internas

- O roteamento principal fica em `apps/web/client/src/App.tsx`, com lazy imports para Dashboard, Clientes, Agendamentos, Ordens de Serviço, Pessoas, Governança, Financeiro, WhatsApp, Configurações, Perfil, Timeline, Auditoria, Billing e Cockpit Operacional.
- O layout autenticado é aplicado por `AppLayout` em `apps/web/client/src/components/AppLayout.tsx`.
- A camada de shell visual principal está em `design-system.tsx`: `AppShell`, `SidebarNav`, `Topbar` e `NexoMainContainer`.
- Há componentes potencialmente antigos ou duplicados de layout: `MainLayout.tsx`, `AppShell.tsx`, `PagePattern.tsx`, `components/operating-system/Wrappers.tsx` e o uso misto de `PageWrapper` com `AppPageShell`.

### 2.2 Tokens e CSS

- Os tokens globais e classes Nexo vivem em `apps/web/client/src/index.css`.
- Existem tokens de superfície, texto, borda, modal e classes como `nexo-app-shell`, `nexo-app-content`, `nexo-page-shell`, `nexo-page-header`, `nexo-card-*`, `nexo-data-table`, `nexo-modal-body` e `nexo-badge-*`.
- Ainda existem `dark:*`, `border-white/*`, `border-slate-*`, `text-white` e `max-w-*` em páginas/componente locais. A correção deve ser feita por substituição gradual por classes Nexo/tokens, não por limpeza automática.

### 2.3 Padrão atual por página

- `ExecutiveDashboard.tsx`: usa `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock` e `AppStatusBadge`, mas mantém cards e containers específicos com `max-w-*`, `border-white/*`, grids próprios e muitos blocos de decisão locais.
- `CustomersPage.tsx`: usa `PageWrapper`, `OperationalTopCard`, `AppFiltersBar`, `AppContextWorkspace`, `AppEmbeddedTimeline`, `AppSectionBlock`, `AppStatusBadge`, `AppRowActionsDropdown`; é funcionalmente maduro, mas visualmente depende de wrapper operacional paralelo ao contrato final.
- `AppointmentsPage.tsx`: usa `PageWrapper`, `OperationalTopCard`, `FormModal`, `AppForm`, `AppField`, `AppInput`, `AppSelect`, `AppFiltersBar`, `AppSectionBlock` e row actions. Está próximo do contrato, mas precisa uniformizar status/prioridade e toolbar.
- `ServiceOrdersPage.tsx`: usa `PageWrapper`, `OperationalTopCard`, `AppSectionBlock`, `AppStatusBadge`, `AppRowActionsDropdown`, `AppPagination`; possui lista operacional local e cards/timeline por página.
- `FinancesPage.tsx`: usa `PageWrapper`, `AppPageShell`, `OperationalTopCard`, `AppSectionBlock`, `AppDataTable`, `AppStatusBadge`, `AppRowActionsDropdown`; mistura tabela oficial com table markup local e modos financeiros.
- `PeoplePage.tsx`: página curta, usa `PageWrapper`, `OperationalTopCard`, `AppSectionBlock`, `AppDataTable` e `AppStatusBadge`; é candidata a migração simples após O.S./Clientes.
- `SettingsPage.tsx`: usa `PageWrapper`, `AppPageShell`, `OperationalTopCard`, `AppOperationalHeader`, `AppSectionBlock` e `AppStatusBadge`; organização existe por blocos, mas precisa revisar ruído/configurações sem comportamento real.
- `TimelinePage.tsx`: usa `PageWrapper`, `AppPageShell`, `OperationalTopCard`, `AppOperationalHeader`, `AppSectionBlock`, `AppPriorityBadge`, `AppSelect`, `AppTimeline`, `AppSkeleton`; precisa reforçar linguagem auditável e filtros de prova oficial.
- `GovernancePage.tsx`: usa `PageWrapper`, `AppPageShell`, `OperationalTopCard`, `AppSectionBlock`, `AppStatusBadge`, `AppPriorityBadge`, `AppTimeline`; precisa alinhar estados `NORMAL/WARNING/RESTRICTED/SUSPENDED` com os estados operacionais globais.
- `BillingPage.tsx`: usa `PageWrapper`, `AppPageShell`, `OperationalTopCard`, `AppOperationalHeader`, `AppSectionBlock`, `AppDataTable`, `AppStatusBadge`; deve permanecer separado de Financeiro.
- `ProfilePage.tsx`: existe e usa `PageWrapper`, `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppDataTable`, `AppPriorityBadge`, `AppTimeline`; entra como página interna secundária.

## 3. Componentes oficiais encontrados

| Área | Componente oficial atual | Arquivo | Uso observado | Risco de alterar | Recomendação |
|---|---|---|---|---|---|
| Layout | `AppLayout` | `apps/web/client/src/components/AppLayout.tsx` | Layout autenticado geral | Alto: afeta todo app, inclusive WhatsApp | Proteger; só alterar com validação visual completa |
| Layout | `AppShell`, `SidebarNav`, `Topbar`, `NexoMainContainer` | `apps/web/client/src/components/design-system.tsx` | Shell global, sidebar, topbar | Alto: base global | Manter como primitive de shell até contrato final |
| Layout | `AppPageShell` | `apps/web/client/src/components/app-system.tsx` | Dashboard, Financeiro, Configurações, Timeline, Governança, Billing, Perfil, WhatsApp | Alto: WhatsApp usa | Proteger; alterações exigem validação WhatsApp |
| Layout | `AppPageHeader`, `AppPageSection` | `apps/web/client/src/components/app-system.tsx` | Contrato disponível | Médio | Confirmar como API oficial e migrar páginas aos poucos |
| Layout | `PageWrapper` | `apps/web/client/src/components/operating-system/Wrappers.tsx` | Clientes, Agendamentos, O.S., Financeiro, Pessoas, Configurações, Timeline, Governança, Billing, Perfil | Médio/alto | Manter por compatibilidade; migrar para `AppPageShell` em lotes |
| Header | `AppOperationalHeader` | `apps/web/client/src/components/internal-page-system.tsx` | Dashboard e páginas alvo | Médio | Manter como header operacional oficial |
| Cards/seções | `AppSectionBlock` | `apps/web/client/src/components/internal-page-system.tsx` | Todas as páginas alvo exceto WhatsApp | Médio | Oficializar para Surface 2/seções |
| Cards | `AppSectionCard`, `AppInfoCard`, `AppStatCard` | `apps/web/client/src/components/app-system.tsx` | Uso parcial | Médio | Consolidar contrato; evitar cards locais novos |
| Dados | `AppDataTable` | `apps/web/client/src/components/app-system.tsx` e reexport em `internal-page-system.tsx` | Financeiro, Pessoas, Billing, Perfil | Médio | Oficializar; substituir tables locais por wrapper/padrão |
| Dados | `AppStatusBadge` | `app-system.tsx`/`internal-page-system.tsx` | Páginas alvo | Médio | Oficializar com mapa global de status operacional |
| Dados | `AppPriorityBadge` | `internal-page-system.tsx` | Timeline, Governança, Perfil | Baixo/médio | Oficializar com P0/P1/P2/P3 |
| Dados | `AppRowActionsDropdown` | `app-system.tsx` | Clientes, Agendamentos, O.S., Financeiro | Médio | Oficializar para ações por linha |
| Toolbar/filtros | `AppToolbar`, `AppFiltersBar` | `app-system.tsx` e `internal-page-system.tsx` | Clientes, Agendamentos, O.S. | Médio | Tornar único; evitar filtros locais |
| Formulários | `AppForm`, `AppField`, `AppInput`, `AppSelect` | `app-system.tsx` | Agendamentos e modais | Médio | Oficializar; migrar modais antigos |
| Overlays | `BaseModal`, `FormModal`, `ConfirmModal`, `ModalHeader`, `ModalBody`, `ModalFooter` | `app-modal-system.tsx` | Modais novos e alguns legados | Alto: modal visual comum | Oficializar; não mexer sem lote de tokens/modal |
| Feedback | `AppAlert`, `AppLoadingState`, `AppSkeleton`, `AppEmptyState` | `app-system.tsx` | Uso parcial; WhatsApp usa `AppSkeleton` | Alto para Skeleton/Loading por WhatsApp | Oficializar e proteger usos compartilhados |
| Histórico | `AppTimeline`, `AppTimelineItem` | `app-system.tsx`/`internal-page-system.tsx` | Timeline, Governança, Perfil | Médio | Oficializar linguagem auditável |
| Navegação | `AppTabs` | `app-system.tsx` | Contrato disponível | Baixo/médio | Oficializar quando houver abas internas |

## 4. Componentes duplicados encontrados

| Oficial atual | Duplicado/legado | Onde está sendo usado | Risco de alterar | Recomendação |
|---|---|---|---|---|
| `AppPageShell` | `PageWrapper` | Clientes, Agendamentos, O.S., Financeiro, Pessoas, Configurações, Timeline, Governança, Billing, Perfil | Médio: pode alterar largura/padding | Migrar por página na ordem definida; não remover agora |
| `AppPageHeader`/`AppOperationalHeader` | `PageHeader`, `NexoPageHeader`, `NexoOperationalHero`, `components/operating-system/PageHeader.tsx` | Dashboard e componentes operacionais | Médio | Escolher `AppOperationalHeader` para interno; manter demais como compatibilidade |
| `AppSectionCard`/`AppSectionBlock` | `SurfaceCard`, `NexoCard`, `StatCard`, `OperationalTopCard`, cards locais com `rounded-* border-* bg-*` | Todas as páginas alvo | Médio | `AppSectionBlock` para seções; `AppStatCard`/`OperationalTopCard` só até migração |
| `AppDataTable` | `components/DataTable.tsx`, `NexoTable`, `<table>` local | Financeiro, Pessoas, Billing, Perfil, componentes legados | Médio | Migrar tabela por página; manter wrapper antigo até fim |
| `AppStatusBadge` | `NexoStatusBadge`, `Badge`, `NexoBadge`, `ExecutionStatusBadge`, `SeverityBadge`, badges manuais | O.S., Financeiro, Timeline, Governance e componentes de execução | Médio/alto: semântica visual | Criar mapa global e migrar labels/status |
| `AppPriorityBadge` | Chips manuais de severidade/prioridade, `SeverityBadge` | Timeline, Governança, Dashboard | Médio | Migrar para P0/P1/P2/P3 |
| `AppRowActionsDropdown` | `components/operating-system/RowActions.tsx`, dropdowns locais via Radix | Clientes, Agendamentos, O.S., Financeiro, WhatsApp | Alto se mexer em dropdown primitive | Usar oficial nas páginas alvo; não alterar primitive compartilhada com WhatsApp |
| `AppFiltersBar` | filtros por página com `div`/classes locais | Clientes, Agendamentos, O.S., Timeline, Financeiro | Baixo/médio | Padronizar no lote de cada página |
| `BaseModal`/`FormModal`/`ConfirmModal` | `Dialog` direto, `ConfirmDialog`, `ConfirmDeleteModal`, `DetailModal`, `ModalFlowShell`, `ManusDialog`, modais CRUD locais | Vários componentes | Alto | Migrar apenas por lote; marcar detalhe pesado como `detail-legacy` |
| `AppEmptyState`/`AppPageEmptyState` | `components/EmptyState.tsx`, empty markup local | Páginas internas e marketing | Baixo/médio | Oficializar estados internos; preservar marketing |
| `AppLoadingState`/`AppSkeleton` | `SkeletonLoader.tsx`, skeletons locais, `ui/skeleton` direto | WhatsApp, Timeline e componentes | Alto para WhatsApp | Consolidar sem alterar WhatsApp |
| `AppTimeline` | `NexoTimeline`, timelines locais/listas | Timeline, Governance, Perfil, Cliente workspace | Médio | Oficializar como prova operacional |

## 5. Mapa de risco do WhatsApp congelado

WhatsApp não deve entrar na migração. A auditoria confirmou que `apps/web/client/src/pages/WhatsAppPage.tsx` importa e usa:

| Componente/arquivo compartilhado | Uso no WhatsApp | Impacto possível | Mudança altera visual do WhatsApp? | Como validar |
|---|---|---|---|---|
| `Button` de `design-system.tsx` | CTAs, ações de conversa e UI operacional | Alto: botão global pode mudar inbox/conversa/contexto | Sim, se alterar classes/variants | Abrir `/whatsapp`, validar inbox, conversa, composer, contexto lateral e estados de ação |
| `AppPageShell` de `app-system.tsx` | Shell de página WhatsApp | Alto: pode mudar largura/fundo/gap do split | Sim | Verificar altura útil, split, fundo e ausência de scroll indevido |
| `AppSkeleton` de `app-system.tsx` | Loading interno de painéis/execução | Médio | Sim, em loading | Testar carregamento inicial e painéis de execução |
| `AppPageLoadingState` de `internal-page-system.tsx` | Loading da página | Médio | Sim, em loading | Testar tela durante query pendente |
| `DropdownMenu*` primitives | Menus de conversa/ações | Médio/alto | Sim, se primitive mudar | Validar menus de conversa, submenus e posicionamento |
| `WhatsAppActionExecutionPanel` em `lib/whatsappActionExecution.tsx` | Painel de execução de ações sugeridas | Alto para WhatsApp | Sim | Validar ações sugeridas, status e skeletons |

Regra prática: antes de alterar `design-system.tsx`, `app-system.tsx`, `internal-page-system.tsx`, `ui/dropdown-menu.tsx` ou `lib/whatsappActionExecution.tsx`, executar validação visual explícita de WhatsApp. Nesta rodada nenhum desses arquivos foi alterado.

## 6. Matriz página por página

| Página | Problema visual | Arquivo | Componente envolvido | Gravidade | Correção recomendada | Risco para WhatsApp | Prioridade |
|---|---|---|---|---|---|---|---|
| Financeiro | Mistura `PageWrapper` + `AppPageShell`; tabela oficial com `<table>` local; modos financeiros fora do contrato único | `apps/web/client/src/pages/FinancesPage.tsx`, `components/finance-modes/*` | `PageWrapper`, `AppPageShell`, `AppDataTable`, `OperationalTopCard` | Alta | Lote 2 piloto: padronizar shell, KPIs, filtros, tabela, badges e ações sem mexer em regra de negócio | Baixo, se não alterar componentes compartilhados | P0 |
| Clientes | Forte em operação, mas ainda com wrapper paralelo, workspace/modal contextual e muitos blocos locais | `CustomersPage.tsx`, `CustomerWorkspaceModal.tsx` | `PageWrapper`, `AppContextWorkspace`, `AppEmbeddedTimeline`, `AppRowActionsDropdown` | Alta | Lote 3: migrar shell/lista/filtros para contrato; detalhe pesado deve virar Workspace futuro | Baixo/médio | P1 |
| O.S. | Lista operacional e cards locais; precisa uniformizar status, prioridade, alertas e integração financeira | `ServiceOrdersPage.tsx`, `components/service-orders/*` | `PageWrapper`, `AppSectionBlock`, `ServiceOrderCard`, `ServiceOrderDetailsPanel` | Alta | Lote 3: aplicar Surface 2, row actions e badges globais; manter lógica | Baixo/médio | P1 |
| Agendamentos | Próxima do contrato, mas status/filtros/ações ainda precisam linguagem global; usa `FormModal` | `AppointmentsPage.tsx` | `PageWrapper`, `FormModal`, `AppForm`, `AppFiltersBar` | Média | Lote 4: padronizar filtros hoje/amanhã/semana, status e ações | Baixo | P2 |
| Pessoas | Página curta, operacionalmente menos completa; tabela oficial mas poucos sinais de carga/risco | `PeoplePage.tsx` | `PageWrapper`, `AppDataTable`, `OperationalTopCard` | Média | Lote 4: enriquecer visual operacional sem reescrever dados | Baixo | P2 |
| Configurações | Blocos existem, mas precisa contrato por categoria/impacto/estado e remover ruído futuro | `SettingsPage.tsx` | `PageWrapper`, `AppPageShell`, `AppSectionBlock` | Média | Lote 5: reorganizar blocos e estados de salvamento previsíveis | Baixo | P3 |
| Timeline | Usa componentes oficiais, mas ainda contém `text-white` e precisa reforçar visual auditável | `TimelinePage.tsx` | `AppTimeline`, `AppPriorityBadge`, `AppSelect` | Média | Lote 5: filtros de prova, evento auditável e metadata resumida | Baixo | P3 |
| Governança | Estrutura forte, precisa alinhar estados governance com status operacional global | `GovernancePage.tsx` | `AppPriorityBadge`, `AppTimeline`, `OperationalTopCard` | Média | Lote 5: mapa NORMAL/WARNING/RESTRICTED/SUSPENDED + explicabilidade | Baixo | P3 |
| Billing | Separação conceitual correta; precisa não herdar linguagem de Financeiro | `BillingPage.tsx` | `AppDataTable`, `AppStatusBadge`, `OperationalTopCard` | Média | Lote 5: status assinatura, faturas e ações sem surpresa | Baixo | P3 |
| Perfil | Existe; usa tabela/timeline oficiais, mas é secundário e deve seguir padrão Pessoas | `ProfilePage.tsx` | `AppDataTable`, `AppPriorityBadge`, `AppTimeline` | Baixa/média | Migrar junto ou depois de Pessoas | Baixo | P3 |
| Dashboard | Possui containers e max widths próprios; ainda tem `border-white/*`; não deve liderar DS | `ExecutiveDashboard.tsx` | `AppPageShell`, `AppOperationalHeader`, cards locais | Alta, mas dependente | Lote 6: refazer como centro de decisão depois dos módulos | Baixo/médio por componentes compartilhados | P4 |
| WhatsApp | Congelado; usa componentes compartilhados | `WhatsAppPage.tsx` | `Button`, `AppPageShell`, `AppSkeleton`, dropdowns | Crítico | Não migrar; validar somente | N/A | Protegido |

## 7. Lista de hardcodes visuais

Busca executada em `apps/web/client/src/pages`, `apps/web/client/src/components` e `apps/web/client/src/lib` para os padrões solicitados. Resultado resumido:

| Padrão | Arquivos afetados | Total | Observação/recomendação |
|---|---:|---:|---|
| `bg-black` | 7 | 8 | Concentrado em marketing, onboarding e overlay crítico; não é foco interno imediato |
| `bg-zinc-900` | 0 | 0 | Sem ocorrências no escopo buscado |
| `bg-slate-900` | 6 | 7 | Marketing/brand; fora do lote interno |
| `bg-gray-950` | 0 | 0 | Sem ocorrências |
| `text-white` | 23 | 62 | Inclui `TimelinePage`, `ExecutiveDashboard`, `WhatsAppPage` e componentes legados; trocar por tokens ao migrar |
| `border-white` | 5 | 13 | `ExecutiveDashboard` tem 7; não mexer agora |
| `border-zinc` | 2 | 13 | Onboarding e `EditPersonModal` |
| `border-slate` | 14 | 66 | Majoritariamente marketing/público |
| `dark:bg` | 15 | 61 | Componentes legados e onboarding; migrar para tokens quando tocar arquivo |
| `dark:text` | 21 | 114 | Muitos legados; não limpar em massa |
| `dark:border` | 14 | 44 | Muitos legados; não limpar em massa |
| `rounded-2xl` | vários | alto | Presente em componentes oficiais e locais; padronizar por contrato, não remover em massa |
| `p-5`/`p-6`/`p-8` | vários | médio | Precisam ser avaliados por superfície e densidade |
| `h-[calc(...)]` | 3 | 3 | Inclui WhatsApp; não alterar no WhatsApp |
| `max-w-*` | 43 | 89 | Dashboard é o principal alvo interno com divergência de largura |
| `shadow-*` | 35 | 66 | Vários locais/marketing; tokens devem substituir no interno |
| `ring-*` | 14 | 104 | Foco/inputs/modais; migrar com cuidado para não perder acessibilidade |
| `DialogContent` | 12 | 36 | Sinal de modais fora de `BaseModal` |
| `<Dialog` direto | 11 | 54 | Sinal de overlay legado |

### Hardcodes nas páginas alvo internas

| Página | Ocorrências relevantes |
|---|---|
| `ExecutiveDashboard.tsx` | `text-white:1`, `border-white:7`, `max-w-*:19` |
| `CustomersPage.tsx` | Sem ocorrências da lista hardcore principal; ainda possui classes locais de layout/card |
| `AppointmentsPage.tsx` | Sem ocorrências da lista hardcore principal; usa tokens e componentes recentes |
| `ServiceOrdersPage.tsx` | Sem ocorrências da lista hardcore principal; ainda possui cards/listas locais |
| `FinancesPage.tsx` | `max-w-*:2` e `<table>` local junto com `AppDataTable` |
| `PeoplePage.tsx` | Sem ocorrências da lista hardcore principal; página pequena |
| `SettingsPage.tsx` | Sem ocorrências da lista hardcore principal; revisar semântica/ruído |
| `TimelinePage.tsx` | `text-white:3` |
| `GovernancePage.tsx` | Sem ocorrências da lista hardcore principal |
| `BillingPage.tsx` | Sem ocorrências da lista hardcore principal |
| `ProfilePage.tsx` | Sem ocorrências da lista hardcore principal |
| `WhatsAppPage.tsx` | `text-white:1`, `rounded-2xl:3`, `h-[calc(...)]`:1, `max-w-*:3`; protegido, não migrar |

## 8. Lista de modais legados

| Arquivo | Tipo | Sinal encontrado | Classificação | Recomendação |
|---|---|---|---|---|
| `app-modal-system.tsx` | Oficial | `BaseModal`, `FormModal`, `ConfirmModal` | oficial | Manter/proteger |
| `ConfirmDeleteModal.tsx` | Wrapper | usa `BaseModal` | compatível | Migrar para `ConfirmModal` se possível em lote futuro |
| `CreateChargeModal.tsx` | CRUD curto/médio | usa `FormModal` | compatível | Manter, revisar densidade no lote Financeiro |
| `CreateAppointmentModal.tsx` | CRUD curto | verificar uso/modal | provável compatível | Manter criação rápida |
| `CreateCustomerModal.tsx` | CRUD | modal por página | legado controlado | Migrar visual para `FormModal` se ainda não usa |
| `EditCustomerModal.tsx` | CRUD | modal por página | legado controlado | Migrar visual para `FormModal` |
| `CreateServiceOrderModal.tsx` | CRUD | modal por página | legado controlado | Criar/editar curto ok; detalhe pesado não |
| `EditServiceOrderModal.tsx` | CRUD/detalhe | `Dialog` direto e muitas classes locais | detail-legacy se tiver detalhe pesado | Migrar para Workspace se detalhe extenso |
| `EditChargeModal.tsx` | CRUD financeiro | `Dialog` direto e classes `dark:*` | legado | Migrar no lote Financeiro |
| `CreatePersonModal.tsx` | CRUD pessoa | `Dialog` direto | legado | Migrar no lote Pessoas |
| `EditPersonModal.tsx` | CRUD/detalhe pessoa | `Dialog` direto, `h-[calc(...)]`, ring/local | detail-legacy se extenso | Migrar no lote Pessoas |
| `CreateLaunchModal.tsx` | Financeiro/lançamento | `Dialog` direto | legado | Avaliar se pertence ao novo Financeiro |
| `ContactHistoryModal.tsx` | Histórico de cliente | `Dialog` direto, max height, muitos `dark:*` | detail-legacy | Migrar para Workspace/Timeline do cliente |
| `DetailModal.tsx` | Detalhe genérico | `Dialog` direto | detail-legacy | Evitar novos usos; substituir por Workspace |
| `CustomerWorkspaceModal.tsx` | Workspace em modal | `BaseOperationalModal`, detalhe pesado | detail-legacy conceitual | Futuro Workspace não modal |
| `AuditPage.tsx` | Página com Dialog direto | `<Dialog>` em página | legado | Migrar overlay para `BaseModal` em lote Governança/Timeline |
| `TermsModal.tsx`, `ManusDialog.tsx` | Público/específico | `Dialog` direto | fora do foco interno | Não mexer nesta migração |

## 9. Tabelas/listas não padronizadas

| Arquivo | Sinal | Recomendação |
|---|---|---|
| `FinancesPage.tsx` | `AppDataTable` e `<table>` local coexistem; listas por modo financeiro | Lote 2: uma tabela/lista oficial de cobranças com row actions |
| `PeoplePage.tsx` | `AppDataTable` com `<table>` local | Manter padrão, revisar colunas/carga/risco no lote Pessoas |
| `BillingPage.tsx` | `AppDataTable` com `<table>` local | Padronizar faturas/histórico no lote Billing |
| `ProfilePage.tsx` | `AppDataTable` com `<table>` local | Padronizar junto com Pessoas/Perfil |
| `ServiceOrdersPage.tsx` | lista/card operacional e `<ul>` local | Migrar para lista operacional oficial; preservar densidade |
| `TimelinePage.tsx` | feed/lista local com `AppTimeline` | Transformar em prova oficial auditável |
| `GovernancePage.tsx` | múltiplas listas locais em seções | Padronizar histórico/regras/sinais |
| `CustomersPage.tsx` | tabela/lista contextual local | Migrar gradualmente para `AppDataTable` ou lista operacional padrão |

## 10. Badges/chips locais

| Origem | Onde aparece | Risco | Recomendação |
|---|---|---|---|
| `NexoStatusBadge` | `design-system.tsx`, service order cards e wrappers | Médio | Manter como primitive por trás de `AppStatusBadge` |
| `Badge`/`NexoBadge` | `design-system.tsx` | Médio | Não usar diretamente em páginas internas novas |
| `ExecutionStatusBadge` | `components/execution/ExecutionStatusBadge.tsx` | Médio | Mapear para estados globais sem quebrar execução |
| `SeverityBadge` | `components/operating-system/SeverityBadge.tsx` | Médio | Migrar para `AppPriorityBadge`/`AppStatusBadge` |
| Chips manuais por classe | Dashboard, Timeline e componentes operacionais | Médio | Trocar por estado operacional global durante lotes |
| `WhatsAppExecutionStatusBadge` | `lib/whatsappActionExecution.tsx` | Alto para WhatsApp | Não alterar nesta frente; apenas documentar |

## 11. Proposta de Design System Nexo final

### 11.1 Superfícies

| Nível | Nome | Uso | Light mode | Dark mode | Classe/tokens recomendados |
|---|---|---|---|---|---|
| Surface 0 | Fundo principal do app | Atrás do layout autenticado | fundo do app, baixo contraste | fundo escuro operacional | `nexo-app-shell`, `--nexo-app-bg`, `--bg-app`, `--surface-base` |
| Surface 1 | Painel/shell interno | Área de conteúdo e page shell | painel sutil | painel escuro com borda mínima | `nexo-app-content`, `nexo-page-shell`, `--nexo-page-surface` |
| Surface 2 | Card/seção | KPIs, tabelas, blocos operacionais | card claro/elevado | card escuro tokenizado | `AppSectionBlock`, `AppSectionCard`, `nexo-card-kpi`, `nexo-card-informative` |
| Surface 3 | Modal/overlay | Modal, dropdown, popover, workspace overlay | modal claro com header/body/footer separados | modal escuro tokenizado | `BaseModal`, `--modal-bg`, `--modal-body-bg`, `--modal-section-border` |

### 11.2 Espaçamento

| Item | Regra proposta |
|---|---|
| Padding de página | `px-3/pb-4` mobile e `md:px-4/md:pb-5` via `NexoMainContainer`; page shell sem max-width divergente |
| Gap entre seções | `gap-4` padrão; `gap-5` apenas em dashboards/visões densas justificadas |
| Padding de card | `p-4` padrão; `md:p-5` para Surface 2 analítica; `p-3` para lista densa |
| Gap de toolbar | `gap-2` entre ações, `gap-3` entre grupos |
| Altura de botão | `h-9`/`h-10` conforme `Button`; ações de linha `h-8` |
| Altura de input/select | `h-9` para filtros densos; `h-10` para formulário |
| Linha de tabela | `py-3` padrão; `py-2.5` denso |
| Lista densa | `p-3`, `gap-2`, sem sombra local |

### 11.3 Radius

| Elemento | Radius proposto |
|---|---|
| Cards principais | `rounded-2xl` via componente, não solto por página |
| Cards internos/listas | `rounded-xl` |
| Inputs/selects | `rounded-[12px]` ou token equivalente |
| Botões | `rounded-xl` conforme `Button` |
| Badges | `rounded-full` |
| Modais | `rounded-2xl` via `BaseModal` |
| Dropdown/popover | `rounded-xl` ou token do primitive |

### 11.4 Bordas e sombras

- Usar `border-[var(--border-subtle)]`, `border-[var(--border-soft)]` ou `border-[var(--modal-section-border)]`.
- Evitar `border-zinc-*`, `border-slate-*`, `border-gray-*`, `border-white/*`, `border-black/*` em páginas internas.
- Sombras devem vir de tokens/classes Nexo (`--app-overlay-shadow`, `nexo-card-*`) e não de `shadow-*` local.

### 11.5 Cores

- Usar tokens `--text-primary`, `--text-secondary`, `--text-muted`, `--surface-base`, `--surface-contrast`, `--accent-primary`, `--accent-soft`, `--border-subtle`.
- Evitar `bg-black`, `bg-zinc-900`, `bg-slate-900`, `bg-gray-950`, `text-white` puro e `dark:*` solto em componente interno.
- Exceções devem ser documentadas: marketing público, overlays críticos e WhatsApp congelado.

### 11.6 Status operacional global

| Estado | Significado | Tom visual |
|---|---|---|
| `NORMAL` | Fluxo saudável, sem intervenção | success/neutral |
| `ATENÇÃO` | Há sinal que exige acompanhamento | warning |
| `RISCO` | Há impacto operacional/financeiro provável | danger/warning forte |
| `CRÍTICO` | Exige ação imediata ou bloqueio | danger/critical |

### 11.7 Prioridade global

| Prioridade | Significado | SLA visual |
|---|---|---|
| `P0 agir agora` | Interrompe fluxo ou bloqueia dinheiro/execução | destaque crítico |
| `P1 resolver hoje` | Deve entrar na fila do dia | destaque alto |
| `P2 acompanhar` | Monitorar e preparar ação | destaque moderado |
| `P3 informativo` | Contexto sem ação imediata | neutro/informativo |

## 12. Contrato de tokens

Contrato recomendado para evoluir sem quebrar WhatsApp:

| Família | Tokens/Classes | Regra |
|---|---|---|
| App | `--nexo-app-bg`, `--bg-app`, `nexo-app-shell` | Surface 0, só em layout global |
| Page | `--nexo-page-surface`, `nexo-page-shell`, `nexo-page-header` | Surface 1 e cabeçalhos internos |
| Card | `--nexo-card-surface`, `--nexo-card-muted`, `nexo-card-kpi`, `nexo-card-informative` | Surface 2 |
| Modal | `--modal-bg`, `--modal-body-bg`, `--modal-header-bg`, `--modal-footer-bg`, `--modal-section-border` | Surface 3 |
| Texto | `--text-primary`, `--text-secondary`, `--text-muted` | Nenhum `text-white` local em interno sem motivo |
| Borda | `--border-subtle`, `--border-soft`, `--modal-section-border` | Sem `border-slate/zinc/white` em páginas internas |
| Foco | `--ring` ou `--accent-primary` com opacidade padronizada | Manter acessibilidade e evitar ring local arbitrário |
| Status | `nexo-badge-{success,warning,danger,info,neutral,accent}` | Passar por `AppStatusBadge` |
| Prioridade | futuro mapa `P0/P1/P2/P3` | Passar por `AppPriorityBadge` |

## 13. Contrato de componentes oficiais

### Layout

- `AppPageShell`: shell interno oficial; cuidado porque WhatsApp usa.
- `AppPageHeader`/`AppOperationalHeader`: header interno; preferir `AppOperationalHeader` em módulos operacionais.
- `AppPageSection`: seção básica.
- `AppToolbar`/`AppFiltersBar`: barra de ações/filtros.
- `PageWrapper`: legado/compatibilidade; migrar depois.

### Cards

- `AppSectionCard`: card genérico Surface 2.
- `AppSectionBlock`: bloco operacional com título/subtítulo/conteúdo.
- `AppStatCard`: KPI.
- `AppInfoCard`: informação contextual.
- `AppEmptyState`/`AppPageEmptyState`: vazio.

### Dados

- `AppDataTable`: tabela oficial.
- `AppStatusBadge`: status global.
- `AppPriorityBadge`: prioridade global.
- `AppRowActionsDropdown`: ações por linha.
- `AppPagination`: paginação interna.

### Formulários

- `AppForm`, `AppFormSection`, `AppField`, `AppFieldGroup`, `AppInput`, `AppTextarea`, `AppSelect`, `AppCheckbox`, `AppRadio`, `AppInlineHint`, `AppFormActions`.
- Se algum desses não existir no código atual, criar apenas no Lote 1 e com API mínima compatível.

### Overlays

- `BaseModal`, `FormModal`, `ConfirmModal`, `ModalHeader`, `ModalBody`, `ModalFooter`.
- `AppPopover`/`AppDropdown`: hoje dependem de primitives `ui/popover` e `ui/dropdown-menu`; contrato final deve encapsular para páginas internas sem quebrar WhatsApp.

### Feedback

- `AppAlert`, `AppToast`, `AppLoadingState`, `AppSkeleton`, `AppSuccessState`, `AppErrorState`.
- `AppToast` é conceitual hoje sobre `sonner`; contrato deve evitar toasts por página com estilos próprios.

### Histórico

- `AppTimeline`, `AppTimelineItem`, `AppActivityFeed`.
- Timeline deve ser visual auditável, não feed social.

### Navegação

- `AppTabs`, `AppBreadcrumbs`.
- Páginas internas não devem criar tabs locais se `AppTabs` resolver.

## 14. Regra Modal vs Workspace

### Usar MODAL quando for

- Criar.
- Editar.
- Confirmar.
- Ação rápida.
- Formulário curto.
- Confirmação destrutiva.

### Usar WORKSPACE quando for

- Detalhe pesado.
- Histórico.
- Timeline.
- Financeiro vinculado.
- Comunicação.
- Contexto operacional.
- Múltiplas ações.
- Tela com scroll grande.
- Análise de entidade.

Regra de migração: modal gigante atual deve ser marcado como `detail-legacy` e migrado futuramente para Workspace. Não criar novos detalhes gigantes de Cliente, O.S., Financeiro ou Pessoa dentro de modal.

## 15. Ordem de migração recomendada

1. Financeiro.
2. Clientes.
3. Ordens de Serviço.
4. Agendamentos.
5. Pessoas.
6. Configurações.
7. Timeline.
8. Governança.
9. Billing.
10. Dashboard.

Justificativa: Dashboard depende da linguagem consolidada dos módulos operacionais. A padronização deve começar onde execução vira dinheiro e seguir para memória operacional, execução, entrada, equipe e governança. WhatsApp não entra na migração.

## 16. Plano por lotes

### Lote 0 — Auditoria sem alteração

- Mapear componentes, páginas, riscos e hardcodes.
- Criar este relatório.
- Não mudar UI.

### Lote 1 — Tokens e componentes base

- Consolidar contrato em `app-system.tsx`, `internal-page-system.tsx`, `app-modal-system.tsx` e `index.css`.
- Se componentes faltarem, criar APIs mínimas sem migrar páginas.
- Validar que WhatsApp não mudou.

### Lote 2 — Financeiro piloto

- Padronizar KPIs: recebida, pendente, vencida, prevista, próxima ação.
- Unificar filtros por status/período/cliente.
- Unificar tabela/lista de cobranças e row actions: cobrar, enviar link, marcar pago, ver detalhe, cancelar.
- Integrar visualmente com O.S. e timeline financeiro.

### Lote 3 — Clientes + O.S.

- Clientes: busca forte, filtros por status/risco/pendência, saldo pendente, último serviço, próximo agendamento, responsável e ações rápidas.
- O.S.: status forte, filtros, alertas, responsável, valor, integração financeira/timeline.
- Migrar detalhe pesado para estratégia de Workspace futuro, sem reescrever lógica.

### Lote 4 — Agendamentos + Pessoas

- Agendamentos: status, sinais, ações e alertas.
- Pessoas: carga, atribuições, atrasos, risco/sobrecarga, permissões.

### Lote 5 — Configurações + Timeline + Governança + Billing

- Configurações por bloco e impacto real.
- Timeline como prova oficial.
- Governança com explicabilidade e ações aplicadas.
- Billing separado de Financeiro.

### Lote 6 — Dashboard

- Transformar em centro de decisão após linguagem consolidada.
- Evitar cards demais, KPIs sem ação, gráfico inútil e CTAs competindo.

### Lote 7 — Remoção gradual de legado

- Só remover duplicações depois de páginas migradas.
- Rodar testes e validação visual.

## 17. Critérios de aceite

- Nenhuma alteração visual ou comportamental no WhatsApp.
- Nenhuma alteração em backend, banco, migrations, autenticação, tenant/orgId ou tRPC/API.
- Nenhuma instalação de Flowbite ou troca de biblioteca visual.
- Páginas internas usam `AppPageShell`/`AppOperationalHeader`/`AppSectionBlock`/`AppDataTable`/badges oficiais conforme contrato.
- Hardcodes novos são proibidos; hardcodes antigos só são removidos quando o arquivo entrar em lote de migração.
- Modais novos seguem `BaseModal`, `FormModal` ou `ConfirmModal`.
- Detalhes pesados são Workspace, não modal gigante.
- Light/dark funcionam por tokens, não por `dark:*` improvisado local.
- Dashboard só é migrado depois dos módulos.

## 18. Quality gates executáveis

Scripts reais disponíveis no `package.json` raiz e `apps/web/package.json`:

```bash
pnpm prisma:check
pnpm ci:preflight
pnpm -r typecheck
pnpm -s build
pnpm -r lint
pnpm test
pnpm --filter ./apps/web test
pnpm --filter ./apps/api test
pnpm --filter ./apps/web lint:os
pnpm --filter ./apps/web typecheck
pnpm --filter ./apps/web build
git status --short
```

Validações manuais/visuais obrigatórias nos lotes futuros:

- Rotas principais: `/`, `/dashboard`, `/clientes`, `/agendamentos`, `/ordens-servico`, `/financeiro`, `/pessoas`, `/configuracoes`, `/timeline`, `/governanca`, `/billing`, `/perfil`, `/whatsapp`.
- Tema claro/escuro.
- Modais CRUD curtos.
- Dropdowns e row actions.
- Tabelas, listas e paginação.
- Empty states, loading states e error states.
- WhatsApp intacto: split layout, inbox, conversa, contexto lateral, composer, fundo, largura, altura útil, paddings e bordas.

## 19. O que NÃO fazer

- Não começar pelo Dashboard.
- Não migrar WhatsApp.
- Não alterar `WhatsAppPage.tsx` nem classes específicas do WhatsApp.
- Não alterar layout split, inbox, conversa, contexto lateral, altura útil, fundo ou comportamento visual do WhatsApp.
- Não fazer refatoração grande nesta rodada.
- Não alterar backend, banco, migrations, autenticação, tenant/orgId ou tRPC/API.
- Não instalar Flowbite.
- Não copiar catálogo.
- Não trocar biblioteca visual.
- Não remover legado antes de páginas migrarem.
- Não criar componente novo se já existir equivalente.
- Não introduzir hardcodes visuais novos.
- Não usar `dark:*` local improvisado.
- Não usar layout por página se existir `AppPageShell`/contrato oficial.

## 20. Arquivos analisados nesta auditoria

Principais arquivos analisados diretamente:

- `package.json`.
- `apps/web/package.json`.
- `apps/web/client/src/App.tsx`.
- `apps/web/client/src/components/AppLayout.tsx`.
- `apps/web/client/src/components/design-system.tsx`.
- `apps/web/client/src/components/app-system.tsx`.
- `apps/web/client/src/components/internal-page-system.tsx`.
- `apps/web/client/src/components/app-modal-system.tsx`.
- `apps/web/client/src/components/operating-system/Wrappers.tsx`.
- `apps/web/client/src/components/operating-system/OperationalTopCard.tsx`.
- `apps/web/client/src/components/DataTable.tsx`.
- `apps/web/client/src/components/EmptyState.tsx`.
- `apps/web/client/src/components/PagePattern.tsx`.
- `apps/web/client/src/components/ContactHistoryModal.tsx`.
- `apps/web/client/src/components/DetailModal.tsx`.
- `apps/web/client/src/components/EditChargeModal.tsx`.
- `apps/web/client/src/components/EditServiceOrderModal.tsx`.
- `apps/web/client/src/components/CreatePersonModal.tsx`.
- `apps/web/client/src/components/CreateLaunchModal.tsx`.
- `apps/web/client/src/components/EditPersonModal.tsx`.
- `apps/web/client/src/components/CustomerWorkspaceModal.tsx`.
- `apps/web/client/src/pages/ExecutiveDashboard.tsx`.
- `apps/web/client/src/pages/CustomersPage.tsx`.
- `apps/web/client/src/pages/AppointmentsPage.tsx`.
- `apps/web/client/src/pages/ServiceOrdersPage.tsx`.
- `apps/web/client/src/pages/FinancesPage.tsx`.
- `apps/web/client/src/pages/PeoplePage.tsx`.
- `apps/web/client/src/pages/SettingsPage.tsx`.
- `apps/web/client/src/pages/TimelinePage.tsx`.
- `apps/web/client/src/pages/GovernancePage.tsx`.
- `apps/web/client/src/pages/BillingPage.tsx`.
- `apps/web/client/src/pages/ProfilePage.tsx`.
- `apps/web/client/src/pages/WhatsAppPage.tsx` somente para mapear risco; não foi alterado.

## 21. Comandos de auditoria usados

```bash
find .. -name AGENTS.md -print
rg --files -g 'package.json' -g 'AGENTS.md' -g '!node_modules'
cat package.json
cat apps/web/package.json
rg --files apps/web/client/src
rg -n "(AppPageShell|PageWrapper|AppPageHeader|AppSectionBlock|AppSectionCard|AppDataTable|AppStatusBadge|AppPriorityBadge|AppRowActionsDropdown|AppToolbar|AppFiltersBar|BaseModal|FormModal|ConfirmModal|AppForm|AppField|AppInput|AppSelect|AppTabs|AppTimeline|AppAlert|AppEmptyState|AppLoadingState|AppSkeleton|PagePattern|DataTable|design-system|EmptyState|Dialog|Badge|StatusBadge|PriorityBadge|Modal)" apps/web/client/src --glob '!**/*.test.*'
rg -n "(--surface|--bg|--text|--border|nexo-page|nexo-card|nexo-app|dark|modal|data-table|badge)" apps/web/client/src/index.css
python3 - <<'PY'
# contagem de usos de componentes por página alvo
PY
python3 - <<'PY'
# contagem dos hardcodes visuais solicitados
PY
```

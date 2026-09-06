# NexoGestão — Auditoria visual e estrutural do front interno (estado atual)

Data da auditoria: 2026-06-04.

## 1. Escopo e premissas

Esta auditoria foi feita antes de qualquer alteração de tela. O único arquivo criado nesta etapa é este relatório.

Arquivos auditados:

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/components/app-system.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`
- `apps/web/client/src/components/app-modal-system.tsx`
- `apps/web/client/src/components/design-system.tsx`
- `apps/web/client/src/components/operating-system/*`
- `apps/web/client/src/pages/ExecutiveDashboard.tsx`
- `apps/web/client/src/pages/CustomersPage.tsx`
- `apps/web/client/src/pages/AppointmentsPage.tsx`
- `apps/web/client/src/pages/ServiceOrdersPage.tsx`
- `apps/web/client/src/pages/FinancesPage.tsx`
- `apps/web/client/src/pages/WhatsAppPage.tsx`
- `apps/web/client/src/pages/TimelinePage.tsx`
- `apps/web/client/src/pages/GovernancePage.tsx`
- `apps/web/client/src/pages/CalendarPage.tsx`
- `apps/web/client/src/pages/PeoplePage.tsx`
- `apps/web/client/src/pages/ProfilePage.tsx`
- `apps/web/client/src/pages/SettingsPage.tsx`
- `apps/web/client/src/pages/BillingPage.tsx`

Verdade de produto usada nesta leitura:

- Fluxo operacional principal: cliente → agendamento → ordem de serviço → execução → cobrança → pagamento → timeline → risco → governança.
- Dashboard deve ser central de comando, prioridade, risco e próxima ação.
- Clientes devem ser memória viva do negócio.
- Agendamentos são controle de entrada da operação.
- O.S. representa execução real e origem da receita.
- Financeiro é operação virando dinheiro, não ERP genérico.
- WhatsApp é comunicação operacional contextual.
- Timeline é prova oficial da operação.
- Governança decide quando a operação saiu do controle.
- Calendário é visualização estratégica do tempo.
- Pessoas controla quem executa a operação.
- Perfil é identidade operacional individual.
- Configurações controlam comportamento do sistema.
- Billing é cobrança pelo uso do Nexo, separado do financeiro operacional.
- Flowbite deve ser usado somente como referência estrutural/visual; não instalar, não copiar componentes, não trocar shell/arquitetura/tema/overlays/tokens.

## 2. Mapa estrutural do shell interno

### 2.1 Roteamento e layout raiz

- `App.tsx` monta rotas internas com `lazyProtectedPage`, sempre encapsulando páginas protegidas por `AppLayout`.
- `AppLayout` adiciona `ThemeProvider`, `LayoutProtectionGuard`, `MainLayout`, `NotificationCenter` e `CriticalActionOverlay`.
- `Router` define `document.body.dataset.visualContext` e `document.documentElement.dataset.visualContext` como `app` para as rotas internas; isso é parte sensível do tema interno.
- `ProtectedRoute` roda `useOperationalStyleGuard` em desenvolvimento e alerta sobre classes visuais proibidas em botões ou elementos operacionais com `data-operational="true"`.
- Existem fallbacks globais (`FullScreenLoader`, `AuthRouteLoader`, `FullScreenMessage`) com classes e cores próprias. Eles devem continuar fora de qualquer refatoração de páginas.

### 2.2 Camadas visuais existentes

O front já possui quatro famílias de componentes compartilhados:

1. **`design-system.tsx`**
   - Shell: `AppShell`, `NexoAppShell`, `SidebarNav`, `Topbar`, `NexoMainContainer`.
   - Superfícies: `SurfaceCard`, `NexoCard`, `NexoPageSection`, `NexoOperationalHero`.
   - Cards e dados: `StatCard`, `NexoStatCard`, `DataTable`, `NexoTable`, `NexoPriorityList`, `NexoTimeline`, `NexoAlertCard`.
   - Badges e status: `Badge`, `NexoBadge`, `NexoStatusBadge`.
   - Inputs/botões: `NexoSearchInput`, `SearchInput`, `Input`, `Select`, `PrimaryButton`, `SecondaryButton`, `GhostButton`, `Button`.
   - Estados: `EmptyState`, `LoadingState`, `ErrorState`.

2. **`app-system.tsx`**
   - Página: `AppPageShell`, `AppPageHeader`, `AppPageSection`, `AppToolbar`, `AppFiltersBar`.
   - Cards/tabelas/status: `AppSectionCard`, `AppStatCard`, `AppInfoCard`, `AppDataTable`, `AppStatusBadge`.
   - Operação: `AppOperationalStatusBadge`, `AppPriorityBadge`, `AppOperationalStateBadge`, `AppOperationalStateCard`, `AppOperationalStatePanel`, `AppNextActionCard`, `AppNextActionList`, `AppEntityContextPanel`.
   - Forms: `AppForm`, `AppFormSection`, `AppField`, `AppFieldGroup`, `AppInput`, `AppSelect`, `AppTextarea`, `AppCheckbox`, `AppFormActions`.
   - Overlays auxiliares: dropdown/popover aliases.
   - Estados: `AppEmptyState`, `AppLoadingState`, `AppSkeleton`, `AppSuccessState`, `AppErrorState`.
   - Timeline: `AppTimeline`, `AppTimelineItem`, `AppActivityFeed`.

3. **`internal-page-system.tsx`**
   - Página: `AppPageHeader`, `AppOperationalHeader`, `AppFiltersBar`, `AppSecondaryTabs`, `AppPagination`, `AppOperationalBar`.
   - Métricas: `AppMetricCard`, `AppKpiCard`, `AppKpiRow`, `AppChartPanel`.
   - Blocos: `AppSectionBlock`, `AppDataTable`, `AppListBlock`, `AppAlertList`, `AppRecentActivity`, `AppInsightPanel`.
   - Badges e ação: `AppStatusBadge`, `AppPriorityBadge`, `AppNextActionCard`.
   - Estados: `AppEmptyState`, `AppPageLoadingState`, `AppPageErrorState`, `AppPageEmptyState`, `AppInlineSuccessState`, `AppSkeleton`.
   - Aliases operacionais: `AppAttentionBlock`, `AppNextBestActionBlock`, `AppOperationalToolbar`, `AppActionBar`, `AppActionRail`, `AppContextWorkspace`, `AppOperationalEmptyState`, `AppOperationalLoadingState`, `AppOperationalErrorState`.

4. **`app-modal-system.tsx` e `operating-system/AppOperationalModal.tsx`**
   - Modal base: `BaseModal` com `DialogContent`, `ModalHeader`, `ModalBody`, `ModalFooter`.
   - Modal operacional: `BaseOperationalModal`, `QuickActionModal`, `ConfirmModal`, `FormModal`.
   - Modal operacional legado/paralelo: `AppOperationalModal` em `components/operating-system`.

### 2.3 Componentes operacionais avulsos existentes

A pasta `components/operating-system` já fornece blocos úteis, mas hoje eles convivem com os sistemas acima e nem sempre são usados nas páginas auditadas:

- `ActionBar`, `ActionFeed`, `ActionFeedbackButton`, `AlertStrip`.
- `ContextPanel`, `InternalBlocks`, `NextActionCell`, `OperationalHeader`, `OperationalRefinementBlocks`, `OperationalState`, `OperationalStickyZone`.
- `OperationalTopCard`, `PageHeader`, `PipelineStage`, `PrimaryActionButton`, `RowActions`, `SeverityBadge`, `WorkspaceScaffold`, `Wrappers`.

Leitura crítica: existe excesso de fontes de verdade para header, card, toolbar, tabela, badge, estado e modal. A próxima fase deve consolidar uso, não criar uma quinta camada.

## 3. Páginas que usam `AppPageShell`

Todas as páginas auditadas usam `AppPageShell` em algum ponto:

| Página | Uso de `AppPageShell` | Observação |
| --- | --- | --- |
| `ExecutiveDashboard.tsx` | Sim | Usa shell com override agressivo de fundo, largura, radius, padding e cores. |
| `CustomersPage.tsx` | Sim | Padrão moderno majoritário, mas com muitos cards e blocos manuais. |
| `AppointmentsPage.tsx` | Sim | Padrão moderno com `FormModal`; filtros usam tokens de modal. |
| `ServiceOrdersPage.tsx` | Sim | Padrão moderno; layout operacional relativamente alinhado. |
| `FinancesPage.tsx` | Sim | Padrão moderno, mas tabela é duplamente embrulhada. |
| `WhatsAppPage.tsx` | Sim | Recria um app dentro da página com altura fixa, colunas próprias e `bg-transparent`. |
| `TimelinePage.tsx` | Sim | Mistura `PageWrapper` + `AppPageShell`. |
| `GovernancePage.tsx` | Sim | Mistura `PageWrapper` + `OperationalTopCard` + `AppPageShell`; usa `AppPageHeader` em vez de `AppOperationalHeader`. |
| `CalendarPage.tsx` | Sim | Padrão moderno, mas muitos filtros/cards usam tokens de modal fora de modal. |
| `PeoplePage.tsx` | Sim | Usa múltiplos retornos com `AppPageShell`; padrão moderno com duplicações. |
| `ProfilePage.tsx` | Sim | Inverte nesting: `AppPageShell` por fora e `PageWrapper` por dentro. |
| `SettingsPage.tsx` | Sim | Mistura `PageWrapper`, `AppPageShell` e `OperationalTopCard` oculto. |
| `BillingPage.tsx` | Sim | Mistura `PageWrapper`, `AppPageShell` e `OperationalTopCard` oculto. |

## 4. Páginas ainda fora do padrão por `PageWrapper`/`OperationalTopCard`

Páginas que ainda usam `PageWrapper`:

- `TimelinePage.tsx`
- `GovernancePage.tsx`
- `ProfilePage.tsx`
- `SettingsPage.tsx`
- `BillingPage.tsx`

Páginas que ainda usam `OperationalTopCard`:

- `GovernancePage.tsx` usa `OperationalTopCard` visível antes do `AppPageShell`.
- `SettingsPage.tsx` usa `OperationalTopCard className="hidden"` como compatibilidade estrutural.
- `BillingPage.tsx` usa `OperationalTopCard className="hidden"` como compatibilidade estrutural.
- `TimelinePage.tsx` importa `OperationalTopCard`, mas a renderização auditada não mostra uso efetivo visível no trecho principal; isso deve ser limpo depois de confirmar ausência de uso indireto.

Risco estrutural: `PageWrapper` usa `PageShell` e `OperationalHeader` de outra família. Quando combinado com `AppPageShell`, cria dupla camada de spacing, largura e cabeçalho. Isso aumenta chance de divergência de fundo, padding, scroll e responsividade.

## 5. Duplicações encontradas

### 5.1 Cards e superfícies

Há pelo menos cinco padrões simultâneos:

- `AppSectionBlock` de `internal-page-system`.
- `AppSectionCard`/`AppInfoCard`/`AppStatCard` de `app-system`.
- `NexoCard`/`SurfaceCard`/`NexoStatCard` de `design-system`.
- Cards manuais com `rounded-lg|rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base|surface-subtle)] p-*`.
- Cards dark hardcoded no dashboard (`#07182b`, `#0b1f35`, `#F97316`, `#8DA4C4`, `white/[0.03]`).

Páginas com maior reinvenção de cards:

- `ExecutiveDashboard.tsx`: visual próprio escuro, full-bleed, com muitos hex codes.
- `CustomersPage.tsx`: cards de memória do cliente, saúde, cobranças, timeline e notas recriados manualmente.
- `CalendarPage.tsx`: cards com `nexo-modal-section` fora de modal.
- `GovernancePage.tsx`: vários cards manuais para checks, riscos, tendências e políticas.
- `BillingPage.tsx`: cards de plano e assinatura manuais.

### 5.2 Headers

Cabeçalhos existentes:

- `AppOperationalHeader` em `internal-page-system`.
- `AppPageHeader` em `internal-page-system`.
- `AppPageHeader` em `app-system`.
- `PageHeader` em `design-system`.
- `OperationalHeader` em `operating-system`.
- `NexoPageHeader` em `design-system`.

Uso atual:

- O padrão mais comum é `AppOperationalHeader`.
- `GovernancePage.tsx` usa `AppPageHeader`, embora o produto exija decisão/risco/governança; deveria migrar para header operacional.
- Páginas com `PageWrapper` podem renderizar `OperationalHeader` legado além de header interno, criando duplicidade conceitual.

### 5.3 Toolbars e filtros

Padrões encontrados:

- `AppFiltersBar` de `internal-page-system`/`app-system`.
- `ActionBar`/`ActionBarWrapper` de `operating-system`.
- Selects/inputs manuais com tokens de modal.
- Barras específicas por página.

Problemas:

- `CalendarPage.tsx` usa vários `<select>` nativos com `nexo-modal-section` e tokens `--modal-section-*` fora de contexto de overlay.
- `AppointmentsPage.tsx` também usa filtros com `nexo-modal-section` fora de modal.
- `PeoplePage.tsx` usa fallback de variáveis `--nexo-border-subtle`/`--nexo-card-bg`, divergindo dos demais.
- `WhatsAppPage.tsx` tem filtros internos do inbox, não reutiliza toolbar padrão.

### 5.4 Tabelas e listas

Padrões simultâneos:

- `AppDataTable` como alias direto de `DataTable` em `app-system`.
- `AppDataTable` próprio em `internal-page-system`, que embrulha conteúdo em uma `div` com overflow.
- Tabelas manuais dentro de `AppDataTable`.
- Listas em cards manuais.

Exemplos de dupla tabela:

- `FinancesPage.tsx`: `<AppDataTable>` contém `<table className="w-full min-w-[1120px] text-sm">`.
- `BillingPage.tsx`: `<AppDataTable>` contém `<table className="w-full min-w-[720px] text-sm">`.
- `ProfilePage.tsx`: `<AppDataTable>` contém `<table className="w-full table-fixed text-sm">`.

Risco: se `AppDataTable` importado for o wrapper de `internal-page-system`, a semântica fica correta; se for o alias de `app-system`, pode gerar `table > table`. A origem do import deve ser padronizada por página.

### 5.5 Badges/chips

Padrões simultâneos:

- `AppStatusBadge` de `app-system`.
- `AppStatusBadge` de `internal-page-system`.
- `NexoStatusBadge`/`NexoBadge` de `design-system`.
- `SeverityBadge` de `operating-system`.
- Chips manuais com `rounded-full border ... px-2 py-0.5 text-xs`.

Problemas:

- Dashboard usa chips hardcoded escuros e tons de risco próprios.
- Customers, Billing, Governance e Settings misturam status sem uma escala única de severidade/risco/prioridade.
- Há divergência semântica entre `status`, `priority`, `severity`, `risk` e `health`; a UI deveria usar uma matriz única.

### 5.6 Modais e overlays

Padrões existentes:

- `FormModal` em `AppointmentsPage.tsx` e `FinancesPage.tsx`.
- `BaseModal`/`QuickActionModal`/`ConfirmModal` disponíveis.
- `AppOperationalModal` em `components/operating-system`, paralelo ao `app-modal-system`.
- Modais específicos externos ao escopo aparecem no repo, como componentes de edição.

Riscos:

- O overlay base (`DialogOverlay`) usa `z-50`, background derivado de `--bg-app` e `backdrop-blur`. Mudar fundo raiz ou tokens de app altera contraste de todos os modais.
- `BaseModal` e `AppOperationalModal` têm headers/footers sticky/fixos, `max-h-[90vh]`, `overflow-hidden` e scroll interno. Qualquer refactor de shell com `overflow`, `transform`, `filter` ou `backdrop-filter` pode quebrar foco, stacking e scroll.
- Há um hotfix global removendo transform/filter/backdrop-filter de wrappers raiz; não deve ser revertido.

### 5.7 Timeline

Padrões simultâneos:

- `AppTimeline`/`AppTimelineItem` em `app-system`.
- `NexoTimeline`/`TimelineList` em `design-system`.
- `AppEmbeddedTimeline` em `internal-page-system`.
- Timelines manuais em `CustomersPage.tsx`, `TimelinePage.tsx`, `GovernancePage.tsx`, `ProfilePage.tsx` e `WhatsAppPage.tsx`.

Risco de produto: como Timeline é prova oficial da operação, o componente deveria ser mais rígido que um feed visual. Deve exibir fonte, ator, entidade, data, tipo de evento e confiabilidade/auditabilidade.

## 6. Hardcodes visuais relevantes

### 6.1 Dashboard executivo

`ExecutiveDashboard.tsx` é o caso mais distante dos tokens atuais:

- Usa full-bleed com `-mx-*`, `!rounded-none`, `!bg-[#07182b]`, `text-[#F3F6FB]` e `style={{ boxShadow: "none" }}`.
- Usa dezenas de hex codes (`#F97316`, `#8DA4C4`, `#EF4444`, `#FCA5A5`, `#10B981`, `#0b1f35`, etc.).
- Usa `bg-white/[0.03]`, `border-white/[0.05]`, `divide-white/[0.06]` sem equivalentes semânticos.
- Possui prop duplicada `title="Próxima melhor ação"` em um `AppSectionBlock`; isso deve ser corrigido em lote técnico, não na auditoria.

Leitura: produto está certo em priorizar ação e risco, mas visualmente é uma exceção completa ao tema claro/escuro.

### 6.2 WhatsApp

`WhatsAppPage.tsx` cria um workspace próprio:

- `h-[calc(100vh-4.25rem)]`, `bg-transparent`, `px-4 pb-2 pt-2`, `rounded-none border-0`.
- Grid de três colunas com larguras fixas em `xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_minmax(300px,340px)]`.
- O layout faz sentido para chat operacional, mas precisa de contrato explícito com `MainLayout` para não quebrar scroll, topbar e overlays.

### 6.3 Calendário e Agendamentos

- `CalendarPage.tsx` usa `nexo-modal-section`, `--modal-section-bg`, `--modal-section-border`, `--modal-section-text` para filtros e cards da página.
- `AppointmentsPage.tsx` também usa `nexo-modal-section` em toolbar.
- Tokens de modal aplicados fora do overlay podem gerar contraste diferente em claro/escuro e confundir hierarquia.

### 6.4 Outros hardcodes/padrões manuais

- `BillingPage.tsx`: cards de plano usam `rounded-xl border bg-[var(--surface-base)] p-4` e tabela manual.
- `CustomersPage.tsx`: muitos blocos internos com `rounded-xl|rounded-md border ... bg-[var(--surface-subtle)]/30`.
- `GovernancePage.tsx`: cards manuais para risco/checks/políticas com `rounded-lg border`.
- `ProfilePage.tsx`: cards e tabela manual dentro de shell/página mista.

## 7. Inconsistências claro/escuro

Pontos seguros:

- O tema base possui tokens `--app-bg`, `--app-card`, `--app-border`, `--surface-base`, `--surface-subtle`, `--text-*`, `--modal-*` e overrides `.app-root.dark`/`[data-theme="dark"]`.
- `DialogOverlay` e `DialogContent` usam tokens, então modais se adaptam se os tokens forem preservados.

Inconsistências:

- Dashboard é essencialmente uma tela dark fixa. No tema claro, ele não segue `--app-bg`/`--app-card`.
- `AuthRouteLoader` usa `bg-white/90` com dark override; é aceitável como fallback, mas não deve virar padrão interno.
- `CalendarPage.tsx` e `AppointmentsPage.tsx` usam tokens de modal fora de modal; em dark isso tende a parecer overlay dentro da página.
- Cards manuais sem `bg-[var(--surface-base)]` em alguns trechos (`border` sem background) podem ficar translúcidos demais em dark.
- Badges manuais do dashboard têm contraste bom no fundo escuro fixo, mas não são portáveis para tema claro.
- `PeoplePage.tsx` usa variáveis com fallback `--nexo-*`; se essas variáveis forem removidas/alteradas, a página pode divergir do resto.

## 8. Validação por item visual solicitado

| Item | Estado atual | Risco/prioridade |
| --- | --- | --- |
| Fundo padrão | `AppPageShell` e `.nexo-page-shell` usam `--app-bg`; dashboard e WhatsApp sobrescrevem. | Alto para Dashboard; médio para WhatsApp. |
| Largura máxima | `AppPageShell` é `max-w-none`; páginas definem grids próprios. Dashboard usa full-bleed negativo. | Médio. |
| Padding | `NexoMainContainer`, `AppPageShell`, `PageWrapper` e páginas adicionam paddings diferentes. | Alto em páginas mistas. |
| Radius | Tokens existem (`--radius-*`), mas páginas usam `rounded-lg/xl/2xl` e dashboard remove radius. | Médio. |
| Bordas | Predomina `--border-subtle`, mas há `white/[0.05]`, `#F97316/25`, fallbacks `--nexo-*`. | Médio. |
| Cards | Muitos padrões concorrentes. | Alto. |
| Headers | Muitos componentes de header concorrentes. | Alto. |
| Chips/badges | Sem matriz única de status/risco/prioridade. | Alto. |
| Botões | `Button` do design system e `ui/button` coexistem; dashboard customiza cores. | Médio. |
| Tabelas/listas | `AppDataTable` duplicado e tabelas manuais. | Alto. |
| Filtros | Toolbars e selects manuais; tokens de modal fora de modal. | Alto. |
| Modais | Base razoável, mas há dois sistemas. | Alto se mexer em overlay/shell; médio se refatorar só páginas. |
| Dropdowns | Base via shadcn/aliases existe; uso de row actions ainda variado. | Médio. |
| Loading/error/empty | Estados existem, mas páginas mesclam estados compartilhados e mensagens manuais. | Médio. |
| Contraste claro/escuro | Bom nos tokens, irregular nos hardcodes. | Alto no Dashboard e Calendar. |

## 9. Auditoria por página

### 9.1 `ExecutiveDashboard.tsx`

Produto:

- Está alinhado com central de comando: atenção imediata, próxima melhor ação, gargalos e acessos contextuais.
- Evita KPI bonito sem ação na maior parte da tela.

Problemas:

- Hardcode visual extremo e tela dark fixa.
- Full-bleed com margens negativas e `!important` em classes Tailwind.
- Chips, cards e links recriados manualmente.
- Prop duplicada `title` em `AppSectionBlock`.
- Risco de contraste se tokens claros/escuros mudarem, porque a tela não usa a matriz semântica.

Prioridade: lote 2, depois de consolidar shell/header/cards, pois é tela crítica e muito específica.

### 9.2 `CustomersPage.tsx`

Produto:

- Tem boa direção: cliente como memória viva, com resumo, saúde, relação com O.S./cobranças/timeline.

Problemas:

- Muitos cards internos manuais.
- Timeline/atividade e blocos financeiros são recriados localmente.
- Filtros usam `AppFiltersBar`, mas com classes locais de borda/fundo/padding.
- Badges/chips variam entre componentes e spans manuais.

Prioridade: lote 3, pois consolida memória viva, tabela/lista e painel de detalhe.

### 9.3 `AppointmentsPage.tsx`

Produto:

- Boa intenção: agendamento como entrada da operação.

Problemas:

- Toolbar usa tokens de modal fora de modal.
- Ainda há select manual.
- Precisa reforçar ligação agendamento → O.S. → execução, não apenas agenda/lista.

Prioridade: lote 4 junto com Calendar.

### 9.4 `ServiceOrdersPage.tsx`

Produto:

- Relativamente alinhada: O.S. como execução e origem de receita.

Problemas:

- Cards e linhas de contexto ainda têm padrões manuais.
- Filtros e tabela precisam padronizar com o lote de tabela/action bar.
- Modal/ações devem preservar fluxo execução → cobrança → pagamento → timeline.

Prioridade: lote 5, depois de Customers/Appointments para aproveitar componentes consolidados.

### 9.5 `FinancesPage.tsx`

Produto:

- Está no caminho certo: leitura operacional de dinheiro, não ERP.

Problemas:

- Tabela manual dentro de `AppDataTable`.
- `FormModal` usado corretamente, mas deve ser mantido como padrão único.
- Precisa separar claramente cobranças/pagamentos operacionais de Billing/plano SaaS.

Prioridade: lote 6 junto com Billing para garantir separação semântica.

### 9.6 `WhatsAppPage.tsx`

Produto:

- A página entende WhatsApp como comunicação contextual, não chat genérico.
- Tem inbox, conversa, contexto operacional, cobranças, O.S., execução assistida e aprovações.

Problemas:

- Reinventa layout de página inteira com altura fixa e colunas próprias.
- Precisa de contrato de workspace especial para chat, em vez de exceção espalhada.
- Alto risco de scroll/overflow em overlays se mexer no shell.

Prioridade: lote 8, após estabilizar shell e overlays.

### 9.7 `TimelinePage.tsx`

Produto:

- É a prova operacional, mas hoje ainda compete com feeds/listas de outras páginas.

Problemas:

- Mistura `PageWrapper` + `AppPageShell`.
- Precisa virar fonte oficial de componente/tipo visual de evento para ser reutilizada por Clientes, Governança, Perfil, WhatsApp e Dashboard.

Prioridade: lote 1 ou 2 como base semântica, mas refactor visual profundo deve esperar matriz de cards/timeline.

### 9.8 `GovernancePage.tsx`

Produto:

- Deve decidir quando operação saiu do controle.

Problemas:

- Mistura `PageWrapper`, `OperationalTopCard`, `AppPageShell` e `AppPageHeader`.
- Header deveria ser operacional, com severidade, regra violada, impacto e próxima ação.
- Muitos cards manuais para riscos/checks/políticas.
- Usa timeline/atividade de forma similar a outras páginas, sem componente oficial único.

Prioridade: lote 7, depois de Timeline e badge/severity.

### 9.9 `CalendarPage.tsx`

Produto:

- Deve ser visualização estratégica do tempo, não calendário genérico.

Problemas:

- Selects nativos e cards usam tokens de modal fora de modal.
- Layout de capacidade/conflitos precisa ser conectado aos mesmos componentes de risco/prioridade.
- Falta padronização de filtros e visual de slots/agenda.

Prioridade: lote 4 junto com Appointments.

### 9.10 `PeoplePage.tsx`

Produto:

- Deve controlar quem executa a operação.

Problemas:

- Múltiplos retornos com `AppPageShell`, gerando risco de estados loading/error com estrutura diferente.
- Usa `AppSectionCard` em volume alto e cards manuais.
- Tabela/action row precisa seguir padrão único.

Prioridade: lote 5 junto com Service Orders, pois execução depende de pessoas.

### 9.11 `ProfilePage.tsx`

Produto:

- Identidade operacional individual.

Problemas:

- Nesting invertido: `AppPageShell` fora e `PageWrapper` dentro.
- Tabela manual dentro de `AppDataTable`.
- Usa timeline e cards manuais.

Prioridade: lote 1 para remover `PageWrapper` misto; refinamento visual no lote 7/8.

### 9.12 `SettingsPage.tsx`

Produto:

- Centro de controle de comportamento do sistema.

Problemas:

- Usa `PageWrapper` + `AppPageShell`.
- `OperationalTopCard` oculto como compatibilidade estrutural indica dívida técnica.
- Muitos blocos com `AppSectionBlock`, mas configuração deveria ter agrupamento/estado/salvamento mais consistente.

Prioridade: lote 1 para shell; lote 9 para refinamento de UX.

### 9.13 `BillingPage.tsx`

Produto:

- Correto separar cobrança do SaaS Nexo do financeiro operacional.

Problemas:

- Usa `PageWrapper` + `AppPageShell`.
- `OperationalTopCard` oculto como compatibilidade.
- Cards de plano e tabela manual.
- Precisa preservar distinção semântica: Billing não é Financeiro.

Prioridade: lote 6 junto com Financeiro.

## 10. Riscos de quebrar overlays, modais e shell

Não mexer sem testes específicos em:

- `AppLayout`, porque concentra `ThemeProvider`, `LayoutProtectionGuard`, `NotificationCenter` e `CriticalActionOverlay`.
- `MainLayout`/`NexoMainContainer`, porque determinam scroll principal e padding.
- `DialogOverlay`, `DialogContent`, `BaseModal`, `AppOperationalModal`, porque dependem de `z-50`, `fixed`, `max-h-[90vh]`, scroll interno e tokens `--modal-*`/`--app-overlay-*`.
- CSS global que remove `transform`, `filter` e `backdrop-filter` dos wrappers raiz; transform em ancestral de modal pode quebrar posicionamento fixed/portal.
- `data-visual-context="app"`, porque estilos internos dependem disso.

Riscos específicos por página:

- `WhatsAppPage.tsx`: altura fixa e colunas com overflow interno; qualquer padding/height no shell pode criar scroll duplo.
- `ExecutiveDashboard.tsx`: usa margens negativas; alteração do container pode criar overflow horizontal.
- Páginas com `PageWrapper`: trocar wrapper sem ajustar spacing pode duplicar/remover header, padding e max-width.
- Páginas com tokens de modal fora do modal: ao ajustar overlays, Calendar/Appointments podem mudar aparência inesperadamente.

## 11. Proposta de ordem de refatoração em lotes

### Lote 0 — Congelar contratos visuais antes de alterar telas

- Documentar o contrato oficial de `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppFiltersBar`, `AppDataTable`, `AppStatusBadge`, `FormModal`.
- Definir matriz única de `status`, `severity`, `priority`, `risk`, `health`.
- Não instalar Flowbite; usar apenas como inspiração de organização: shell, header, toolbar, cards, table, empty/loading/error.

### Lote 1 — Remover wrappers legados/mistos sem redesenhar conteúdo

Ordem sugerida:

1. `SettingsPage.tsx`
2. `BillingPage.tsx`
3. `ProfilePage.tsx`
4. `TimelinePage.tsx`
5. `GovernancePage.tsx`

Objetivo: eliminar `PageWrapper`/`OperationalTopCard hidden`, manter visual o mais parecido possível, reduzir dupla camada.

### Lote 2 — Consolidar primitives compartilhadas

- Um header operacional oficial.
- Um card/surface oficial para páginas internas.
- Um toolbar/filtros oficial.
- Uma tabela/lista oficial.
- Um badge oficial com semântica operacional.
- Um componente timeline/evento oficial.
- Um contrato para workspace especial (`WhatsApp`/futuras telas de operação em tempo real).

### Lote 3 — Clientes como memória viva

- Reorganizar `CustomersPage.tsx` com primitives oficiais.
- Centralizar timeline/relacionamentos do cliente.
- Reduzir cards manuais.

### Lote 4 — Entrada e tempo da operação

- Refatorar `AppointmentsPage.tsx` e `CalendarPage.tsx` juntas.
- Remover tokens de modal fora de modal.
- Padronizar filtros, lista/agenda e conflito/capacidade.

### Lote 5 — Execução e pessoas

- Refatorar `ServiceOrdersPage.tsx` e `PeoplePage.tsx`.
- Conectar O.S. ↔ responsável ↔ execução ↔ cobrança.
- Padronizar tabela/action rows.

### Lote 6 — Dinheiro operacional vs cobrança do SaaS

- Refatorar `FinancesPage.tsx` e `BillingPage.tsx` mantendo separação semântica.
- Padronizar tabelas e estados financeiros.

### Lote 7 — Prova e controle

- Refatorar `TimelinePage.tsx` como fonte oficial de evento/auditoria.
- Refatorar `GovernancePage.tsx` com severidade, regra, impacto, decisão e próxima ação.

### Lote 8 — Workspaces especiais

- Criar contrato visual para `WhatsAppPage.tsx` sem quebrar shell/overlays.
- Depois aplicar no WhatsApp, preservando inbox/conversa/contexto.

### Lote 9 — Dashboard executivo

- Migrar Dashboard por último ou quase último.
- Manter a força de central de comando, mas trocar hex/hardcodes por tokens e components oficiais.
- Corrigir duplicações técnicas, incluindo prop duplicada de title.

## 12. Conclusão executiva

O front interno já tem uma base robusta de tokens, shell, modais e componentes, mas o estado atual sofre de sobreposição de sistemas: `design-system`, `app-system`, `internal-page-system` e `operating-system` oferecem componentes equivalentes. As páginas mais novas usam `AppPageShell`, porém várias ainda misturam `PageWrapper`, `OperationalTopCard`, headers diferentes, tabelas manuais e cards locais.

A maior prioridade não é trocar aparência com base em Flowbite. A prioridade é escolher uma fonte de verdade interna, preservar tema/shell/overlays e refatorar por lotes pequenos. O risco mais alto está em Dashboard, WhatsApp e páginas com wrappers mistos. O maior ganho estrutural vem de padronizar header, card, toolbar, tabela, badge, modal e timeline antes de redesenhar qualquer tela.

# Fase 1 — auditoria da padronização visual do frontend interno

**Data:** 2026-09-05  
**Baseline:** `4139a7b4`  
**Escopo observado:** `apps/web/client/src`, rotas autenticadas e dependências visuais declaradas em `apps/web/package.json`/`pnpm-lock.yaml`.  
**Natureza desta entrega:** diagnóstico somente. Nenhum componente, página, contrato BFF/API ou cálculo operacional foi alterado; Flowbite não foi instalado.

## 0. Resumo executivo e princípios de guarda

O frontend já tem uma fundação Nexo utilizável, mas não uma única API visual. O shell real é `AppLayout → MainLayout → AppShell`; as páginas compõem principalmente `app-system.tsx` e `internal-page-system.tsx`, enquanto as famílias `components/app`, `components/operational` e `components/operating-system` continuam oferecendo equivalentes. Há ainda primitives em `components/ui`. A maior dívida não é ausência de componentes: é **sobreposição de quatro vocabulários** e implementação local dentro de páginas muito grandes.

O Dashboard atual já segue, na ordem, quase toda a hierarquia desejada e é o candidato correto a padrão-ouro. A migração deve estabilizar sua composição sem tocar nas decisões vindas do backend. Em particular, risco, prioridade, atraso, estado e próxima ação devem ser apenas apresentados; ausência ou erro de um contrato autoritativo deve continuar aparecendo como indisponibilidade, nunca ser “completado” no browser a partir de KPIs auxiliares.

Decisões de Fase 1:

1. Preservar shell, rotas, tema, Radix/primitives atuais, overlays globais e BFF/API.
2. Escolher uma fachada interna canônica antes de remover qualquer legado: `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, uma única família de KPI/tabela/estado e `app-modal-system`.
3. Tratar Flowbite exclusivamente como referência de anatomia e densidade; não copiar classes, paleta, JavaScript, markup rígido ou dependência.
4. Não fazer limpeza global de Tailwind. As substituições devem ocorrer por família, protegidas por contrato e regressão visual.

## A. Inventário da arquitetura e dos componentes existentes

### A.1 Shell, layout e responsividade

| Camada               | Implementação atual                          | Diagnóstico                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entrada autenticada  | `components/AppLayout.tsx`                   | Envolve todo o conteúdo em `ThemeProvider`, instala `LayoutProtectionGuard`, renderiza `MainLayout` e preserva `NotificationCenter` e `CriticalActionOverlay` fora do fluxo do conteúdo. É o ponto correto e deve permanecer fino.                                                                                                   |
| Shell nominal        | `components/AppShell.tsx`                    | Wrapper mínimo que aplica `.nexo-app`. Não é um segundo layout, mas o nome pode induzir a procurar nele sidebar/topbar.                                                                                                                                                                                                              |
| Shell efetivo        | `components/MainLayout.tsx`                  | Concentra autorização de itens, sidebar, topbar, pesquisa, notificações, usuário, logout, tema, persistência de colapso e exceção de layout do WhatsApp. Com 651 linhas, mistura chrome visual, dados e comportamento. Risco global alto.                                                                                            |
| Sidebar              | Local a `MainLayout`                         | Desktop fixo com larguras numéricas de 292/88 px, persistência em `localStorage`, agrupamento por permissões e drawer mobile de 304 px. A largura expandida é aplicada ao `aside`, mas o conteúdo desktop usa margem do token de largura recolhida; CSS adicional é responsável pela sincronização. É uma zona sensível a regressão. |
| Topbar/Header global | Local a `MainLayout`                         | Busca global, notificações em dropdown, perfil, tema e logout. Há estados de loading/error/empty de notificações implementados localmente dentro do header.                                                                                                                                                                          |
| Container principal  | `<main class="nexo-app-content …">`          | Scroll vertical, padding responsivo (`px-3`/`md:px-4`) e regra especial para WhatsApp. Dentro dele, `AppPageShell` aplica largura total, `max-w-none` e `gap-4`.                                                                                                                                                                     |
| Page shell legado    | `operating-system/Wrappers.tsx::PageWrapper` | Continua disponível e compete conceitualmente com `AppPageShell`, embora as páginas-alvo atuais já tenham avançado majoritariamente para `AppPageShell`. Não criar novos usos.                                                                                                                                                       |
| Tema                 | `contexts/ThemeContext.tsx` + `index.css`    | Tema é persistido, aplicado simultaneamente por `data-theme` e classe `.dark`; `MainLayout` ainda reaplica ambos no nó interno. Tokens light/dark são extensos e cobrem shell, surface, texto, estado e overlay. A duplicação de marcadores é tolerável agora, mas precisa de um contrato único futuro.                              |
| Responsividade       | `useMobile`, classes Tailwind e CSS Nexo     | Shell tem estratégia explícita desktop/mobile; páginas usam grids, wraps e overflow. Não existe matriz automatizada uniforme para 320/768/1024/1440 px, e páginas densas ainda dependem de `max-w-*`, `rounded-*` e grids locais.                                                                                                    |

### A.2 Inventário por função

| Função            | Implementações existentes                                                                                                                                                                                                           | Situação                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headers           | `app-system::AppPageHeader`; `internal-page-system::AppPageHeader` e `AppOperationalHeader`; `operating-system/PageHeader`; `operating-system/OperationalHeader`; `OperationalTopCard`                                              | Cinco anatomias/nomenclaturas para topo de página. `AppOperationalHeader` é o melhor destino para páginas operacionais; header simples pode atender administração.                                                                    |
| Cards/seções      | `AppSectionCard`, `AppInfoCard`, `AppPageSection`; `AppSectionBlock`, `AppListBlock`, `AppInsightPanel`; `OperationalPanel`, `OperationalInnerCard`, `OperationalSectionGrid`; `NexoContextBlock`; primitives `ui/card`             | Cobertura suficiente, fronteiras pouco claras. `AppSectionBlock` já une título/subtítulo/CTA ao card.                                                                                                                                 |
| Stat/KPI          | `AppStatCard`; `AppMetricCard`, `AppKpiCard`, `AppKpiRow`, `AppOperationalKpiGrid`; `OperationalKpiCard`, `OperationalHealthRing`, `OperationalWorkloadBar`; `NexoMetricCard`                                                       | Principal foco de consolidação: pelo menos três modelos públicos e cards locais no Dashboard/Pessoas.                                                                                                                                 |
| Tabelas           | `app-system::AppDataTable`; `internal-page-system::AppDataTable`; `components/DataTable`; `operating-system::DataTableWrapper`; primitives `ui/table`; markup `<table>` local                                                       | Os dois `AppDataTable` produzem wrappers quase equivalentes, mas APIs diferentes (um recebe props de table, outro children e detecta `<table>`). Alto risco de uso incorreto e nesting.                                               |
| Filtros/toolbars  | `AppToolbar`/`AppFiltersBar` em `app-system`; outro `AppFiltersBar`, `AppOperationalBar`, `AppSecondaryTabs`, `AppActionBar` em `internal-page-system`; `operating-system/ActionBar` e `OperationalSearchBar`                       | Mesma responsabilidade distribuída; filtros de página ainda organizam estado e layout localmente.                                                                                                                                     |
| Forms/campos      | `AppForm`, `AppFormSection`, `AppField`, `AppFieldGroup`, `AppInput`, `AppSelect`, `AppTextarea`, `AppCheckbox`, `AppRadio`, `AppFormActions`; primitives `ui/input`, `ui/select`, `ui/field`, `ui/form`; inputs diretos em modais  | A fachada existe, mas CRUDs antigos contornam-na. Consolidar anatomia, não validação/regra.                                                                                                                                           |
| Badges            | Dois `AppStatusBadge`; `AppOperationalStatusBadge`, `AppOperationalStateBadge`, `AppPriorityBadge`; `SeverityBadge`; `ui/badge`; chips locais                                                                                       | O maior risco é semântico: tom, status operacional, severidade e prioridade podem parecer intercambiáveis. A UI deve mapear somente apresentação de valores recebidos.                                                                |
| Modal/overlay     | `app-modal-system` (`BaseModal`, `BaseOperationalModal`, `ConfirmModal`, `QuickActionModal`, `FormModal`); `AppOperationalModal`; `ConfirmDialog`, `ConfirmDeleteModal`, `DetailModal`, `ModalFlowShell`, CRUD modals e `ui/dialog` | Base oficial é boa, mas há `Dialog` direto em editar O.S./pessoa/cobrança, lançamento, auditoria e utilitários. Overlays globais (`CriticalActionOverlay`, consentimento e notificações) têm papéis próprios e devem ser preservados. |
| Dropdown/popover  | Aliases App sobre primitives Radix; outro popover em `internal-page-system`; `RowActions`, `AppRowActionsDropdown`; dropdowns locais em `MainLayout` e WhatsApp                                                                     | Manter Radix como infraestrutura acessível; consolidar somente fachadas/anatomia.                                                                                                                                                     |
| Toast/alert       | `sonner`/`ui/sonner`, `AppToast`, `AppAlert`, `AlertStrip`, toasts diretos em páginas                                                                                                                                               | Toast transitório e alert persistente não têm regra de uso documentada/forçada. `AppToast` convive com chamadas diretas a `toast`.                                                                                                    |
| Loading/skeleton  | `AppLoadingState` e `AppSkeleton` em `app-system`; aliases e estados de página em `internal-page-system`; `components/app/AppLoadingState`; `SkeletonLoader`; `QueryStateBoundary`; `ui/skeleton`                                   | Múltiplos níveis úteis, mas nomes repetidos dificultam escolher entre página, seção e linha.                                                                                                                                          |
| Empty/error       | `AppEmptyState` em duas camadas, `AppPageEmptyState`, `AppPageErrorState`, `ErrorBoundary`, `AppErrorBoundary`, `ChartErrorBoundary`, `KpiErrorBoundary`, `QueryStateBoundary`, estados locais                                      | Boa preocupação com falha parcial; precisa taxonomia clara: vazio, indisponível, erro parcial, erro total e sem permissão.                                                                                                            |
| Timeline/activity | `AppTimeline`/`AppActivityFeed`; `AppEmbeddedTimeline`; `OperationalTimelineItem`; `NexoEvidenceTimeline`; listas locais em Timeline/Governança/Perfil/Clientes                                                                     | Há pelo menos quatro representações. Uma timeline de evidência não deve ser confundida com feed decorativo.                                                                                                                           |
| Tabs              | aliases `AppTabs*`, `AppSecondaryTabs`, primitives `ui/tabs` e seletores locais                                                                                                                                                     | Consolidar acessibilidade e responsividade, mantendo seleção como estado de apresentação.                                                                                                                                             |

## B. Duplicações encontradas

1. **Mesmo nome, contratos diferentes:** `AppPageHeader`, `AppFiltersBar`, `AppDataTable`, `AppStatusBadge`, `AppEmptyState`, `AppLoadingState`, `AppSkeleton` e `AppPagination` aparecem em mais de uma camada. Isto eleva o custo de review e permite que imports visualmente idênticos se comportem diferente.
2. **Três famílias operacionais concorrentes:** `internal-page-system`, `components/operational` e `components/operating-system`; `components/app/OperationalCommandLayer` adiciona uma quarta composição para próxima ação.
3. **Cards KPI paralelos:** `AppStatCard`, `AppMetricCard`, `AppKpiCard`, `OperationalKpiCard`, `NexoMetricCard` e cards locais.
4. **Row actions paralelas:** `AppRowActionsDropdown`, `AppRowActions` e `operating-system/RowActions`, além de dropdowns locais.
5. **Overlays paralelos:** `BaseModal`/`FormModal` coexistem com wrappers e `Dialog` direto. O problema é anatomia, foco, scroll, footer e largura inconsistentes, não o primitive Radix.
6. **Page structure local:** páginas de 1.490 a 2.998 linhas (Dashboard, Clientes, Pessoas, O.S. e WhatsApp) misturam normalização de payload, estado, ações e grandes árvores visuais; isto incentiva blocos locais e torna comparação difícil.
7. **Estados de consulta repetidos:** várias páginas repetem branches loading/error/empty apesar de existirem estados de página compartilhados.

## C. Inconsistências visuais

- Headers simples, headers operacionais e “top cards” não têm uma regra única de título, descrição, chips e CTA.
- A densidade varia entre `p-3`, `p-4`, `p-5`, `p-6`, gaps locais e versões `compact`; não há uma matriz publicada por tipo de superfície.
- `rounded-lg`, `rounded-xl`, `rounded-2xl` e `rounded-full` aparecem localmente mesmo com tokens de radius existentes. `Pessoas` (18), `O.S.` (25) e `WhatsApp` (35) são os maiores focos entre as páginas auditadas.
- Sombras explícitas permanecem no wrapper das duas tabelas e em Pessoas; elas escapam parcialmente dos tokens semânticos já existentes.
- Badges usam vocabulários de tom, prioridade e estado sobrepostos. A mesma cor pode representar severidade, saúde, resultado ou seleção.
- Timeline e evidência aparecem como lista, card, item operacional e timeline formal, com pesos de metadata distintos.
- Estados vazios/erro podem ocupar card, seção ou página sem regra clara de altura e CTA.
- Desktop/mobile estão cobertos pelo shell, mas tabelas, calendário e workspaces possuem estratégias próprias; truncamento, scroll horizontal e ordem das ações precisam de validação comum.
- Light/dark está majoritariamente tokenizado nas páginas-alvo. A inconsistência residual está nas cores Tailwind semânticas locais dentro de componentes compartilhados (`emerald`, `amber`, `orange`) e no overlay do shell (`bg-slate-950/20`), não numa proliferação atual de `dark:*` nessas páginas.

## D. Hardcodes problemáticos

### D.1 Achados objetivos na amostra de páginas

Busca estática nas 13 páginas-alvo encontrou **zero** ocorrências de `dark:*` e zero cores Tailwind diretas nas páginas, exceto três fundos e um texto de cor no WhatsApp. Isto mostra progresso real em tokenização e invalida relatórios históricos que ainda atribuíam `border-white/*` ao Dashboard. O débito atual está mais em geometria e composição:

| Página        | `rounded-*` | `shadow-*` | `max-w-*` |
| ------------- | ----------: | ---------: | --------: |
| Dashboard     |           6 |          0 |         0 |
| Clientes      |          13 |          0 |         1 |
| Pessoas       |          18 |          2 |         4 |
| Perfil        |           0 |          0 |         0 |
| Agendamentos  |           5 |          0 |         0 |
| Calendário    |          10 |          0 |         0 |
| O.S.          |          25 |          0 |         3 |
| Financeiro    |           0 |          0 |         1 |
| WhatsApp      |          35 |          0 |         3 |
| Timeline      |           1 |          0 |         1 |
| Governança    |           4 |          0 |         1 |
| Configurações |           2 |          0 |         0 |
| Billing       |           2 |          0 |         0 |

### D.2 Hardcodes estruturais

- `MainLayout`: 292/88/304 px para sidebar e largura mobile; timeout de logout e larguras de dropdown. São decisões legítimas, mas deveriam ser tokens de shell, não números dispersos.
- `index.css`: duas famílias históricas de tokens (`--bg-*` e `--nexo-*`/`--app-*`) e valores hex/rgb. Cores em tokens são aceitáveis; o problema é haver sinônimos sem contrato de depreciação.
- `AppOperationalHeader`: `px-6`, `py-4/5`; `AppSectionBlock`: `mb-4`, `pb-3.5`; tabelas: radius e shadow explícitos. Esses valores devem virar receitas canônicas, não ser replicados nas páginas.
- `AppContextChip` e `AppInsightPanel` ainda usam `emerald-500`, `amber-500/700` e `orange-500` em vez dos tokens de sucesso/aviso/accent.

Não se recomenda substituir automaticamente todo hex: valores fonte dentro de tokens são corretos. O alvo é remover valores de decisão das folhas e reduzir aliases de token.

## E. Auditoria individual das páginas

| Página                | Estrutura atual                                                                                                                                      | Reuso atual                                                                                                                                                    | Local/inconsistências e débito                                                                                                                                                      | Risco                                                                                                                            | Potencial                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Dashboard**         | Header operacional; estados globais; duas colunas para atenção/NBA; KPIs; fluxo; fila; pulso; estado/evidências; WhatsApp executivo; acessos rápidos | `AppPageShell`, `AppOperationalHeader`, `AppContextChip`, `AppSectionBlock`, estados de página, `AppStatusBadge`, `OperationalInnerCard`, composição executiva | Árvore de 1.490 linhas; cards/linhas locais; sobreposição de “estado operacional” no topo e após pulso; governança aparece sobretudo via evidência/timeline, sem bloco nominal.     | **Alto**, por múltiplas queries e autoridade operacional; visualmente é o melhor piloto se mudanças forem somente de composição. | **Muito alto**: define ordem, densidade, falha parcial, seção e navegação.                       |
| **Clientes**          | Centro operacional com header, filtros, tabela/lista, paginação e workspace contextual; abre criação/edição/agendamento/O.S.                         | Amplo uso da fachada App e dos estados compartilhados                                                                                                          | 2.219 linhas; `AppSectionCard` e `AppSectionBlock` coexistem; quatro modais; detalhe contextual e ações carregam alta densidade.                                                    | **Alto**: hub para vários fluxos.                                                                                                | **Muito alto** para toolbar, data table, row actions e workspace.                                |
| **Pessoas**           | Resumo/estado, comando, filtros, cards e visualizações de carga/fluxo, CRUD                                                                          | App shell/states/cards e toda a família `Operational*`                                                                                                         | 2.071 linhas; mistura `AppStatCard` com `OperationalKpiCard/Panel/Flow/HealthRing`; maior “Frankenstein” de famílias e sombras entre páginas não especializadas.                    | **Alto**: disponibilidade, papel e alocação não podem ser reinterpretados.                                                       | **Muito alto** para validar consolidação de KPI e painel.                                        |
| **Perfil**            | Header, visão pessoal, filtros, tabela e atividade operacional                                                                                       | `AppOperationalHeader`, `AppSectionBlock`, `AppDataTable` e componentes `Operational*`                                                                         | Embora menor, mistura as duas famílias e trata conteúdo pessoal com linguagem de cockpit; precisa separar identidade/preferência de evidência operacional.                          | **Médio**.                                                                                                                       | **Alto** para formulário/seção administrativa depois de Pessoas.                                 |
| **Agendamentos**      | Header, filtros, lista/tabela paginada, criação/edição e ação de gerar O.S.                                                                          | Fachada App consistente; `FormModal`; aviso de responsável                                                                                                     | Próxima do destino; cinco radii locais e fluxo modal específico. Deve garantir alternativa mobile da tabela e não derivar atraso/confirmação.                                       | **Médio/alto**.                                                                                                                  | **Muito alto** como primeiro template de lista operacional.                                      |
| **Calendário**        | Header, toolbar de período/navegação, FullCalendar, legenda/estados e modal de agendamento                                                           | Shell/header/filtros/seção/estados App                                                                                                                         | FullCalendar exige CSS/anatomia própria; dez radii locais; responsividade e popover/event click são singulares. Não deve forçar-se ao formato de data table.                        | **Alto visual**, médio lógico.                                                                                                   | **Médio**: toolbar e modal reutilizáveis; grade é especializada.                                 |
| **Ordens de Serviço** | Header/estado, KPIs, filtros/action bar, lista operacional, paginação, fluxo e CRUD                                                                  | Forte uso App, com badges e row actions                                                                                                                        | 2.329 linhas, 25 radii e três max-widths; `AppSectionCard`, `AppStatCard`, `OperationalFlowCard` e seções locais coexistem.                                                         | **Muito alto**: status, prazo, responsável e ligação financeira.                                                                 | **Muito alto** para lista responsiva, badges e detalhe contextual.                               |
| **Financeiro**        | Header, controles, cards informativos e seções por leitura financeira; criação de cobrança                                                           | Shell/header/section/input/select/status                                                                                                                       | Página principal está curta (453 linhas), mas transfere composição aos modos financeiros e gráfico; falta uma linguagem única entre visão, vencidos, pagos, pendentes e relatórios. | **Muito alto** por dinheiro, mesmo com débito visual médio.                                                                      | **Muito alto** para tabs, KPI, filtros e tabela.                                                 |
| **WhatsApp**          | Workspace de três áreas, conversas, composer, ações, aprovações e contexto operacional                                                               | `AppPageShell`, skeleton/loading, dropdown Radix e `OperationalInnerCard`                                                                                      | 2.998 linhas, 35 radii, cores locais e regra especial no `MainLayout`. É uma aplicação dentro do shell; padronizá-la cedo causaria regressão de altura/scroll.                      | **Crítico**.                                                                                                                     | **Médio** para primitives; baixo como template geral. Preservar até as receitas estarem maduras. |
| **Timeline**          | Filtros e coleção de eventos/evidências com estados de consulta                                                                                      | Shell, section card, select e estados                                                                                                                          | Página pequena, mas não usa a timeline compartilhada detectada; composição de feed permanece local. Precisa diferenciar evidência oficial de atividade auxiliar.                    | **Alto semântico**, baixo estrutural.                                                                                            | **Muito alto** para um `EvidenceTimeline` canônico.                                              |
| **Governança**        | Header simples, cards de estado/regra/evidência e ações, com loading/error/empty                                                                     | Shell, `AppPageHeader`, cards e status                                                                                                                         | Header difere das páginas operacionais; eventos/listas são locais. Estados de governança não devem ser traduzidos para risco por conveniência visual.                               | **Muito alto semântico**.                                                                                                        | **Alto** para alert, evidence block e timeline.                                                  |
| **Configurações**     | Header operacional, painéis por configuração, tabela/status e ações                                                                                  | Shell/header/table/status mais família `Operational*`                                                                                                          | Linguagem operacional excessiva para administração; precisa seções de formulário, feedback de salvamento e impacto claro.                                                           | **Alto** por configuração/integrações.                                                                                           | **Muito alto** para form section e settings row.                                                 |
| **Billing**           | Assinatura/limites/faturas/ações e modal                                                                                                             | Shell/cards/table/status, `BaseModal` e família `Operational*`                                                                                                 | 964 linhas; confunde parte da linguagem de KPI operacional com plano/consumo; deve permanecer separado de Financeiro e Pricing público.                                             | **Muito alto** por checkout/quota.                                                                                               | **Alto** para info card, tabela de faturas e modal de confirmação.                               |

### E.1 Ranking de débito

1. **Pessoas:** maior colisão de famílias compartilhadas.
2. **Ordens de Serviço:** maior densidade geométrica e criticidade operacional.
3. **Clientes:** página-hub grande com muitos overlays e fluxos cruzados.
4. **WhatsApp:** débito local alto, mas deve ser adiado pelo risco de workspace.
5. **Dashboard:** composição avançada, porém grande e com blocos locais; dívida é de formalização, não de reordenação ampla.
6. **Financeiro/Billing/Configurações:** consistência transversal e semântica, apesar de menor hardcode na folha.

## F. Componentes candidatos à consolidação

| Contrato canônico proposto                               | Absorver/encapsular                                                              | Não fazer agora                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `AppPageShell`                                           | `PageWrapper` e wrappers de largura locais                                       | Remover wrapper antes de migrar todos os consumidores.                 |
| `AppOperationalHeader` + variante administrativa simples | os dois `AppPageHeader`, `OperationalHeader`, `PageHeader`, `OperationalTopCard` | Forçar contexto operacional em Perfil/Configurações/Billing.           |
| `AppSection` (receita baseada em `AppSectionBlock`)      | `AppSectionCard`, painéis semânticos e headers locais                            | Transformar todo agrupamento em card.                                  |
| `AppKpiCard`/`AppKpiGrid`                                | `AppStatCard`, `AppMetricCard`, `OperationalKpiCard`, `NexoMetricCard`           | Recalcular delta/status; receber valor, label e presentation metadata. |
| `AppDataTable`                                           | os dois componentes homônimos e `DataTableWrapper`                               | Padronizar calendário/WhatsApp como tabela.                            |
| `AppFilterBar`                                           | toolbars/action bars e seletores de período                                      | Misturar mutações primárias com filtros sem hierarquia.                |
| `AppStatusBadge` + `AppPriorityBadge`                    | badges de apresentação duplicados                                                | Converter status de domínio em outro status no componente.             |
| `AppQueryState`                                          | loading/error/empty de página e seção                                            | Colapsar zero, vazio, indisponível e erro na mesma mensagem.           |
| `AppEvidenceTimeline`                                    | timeline/activity/evidence locais                                                | Usar feed decorativo para prova auditável.                             |
| `BaseModal`/`FormModal`/`ConfirmModal`                   | Dialog direto e wrappers CRUD                                                    | Migrar workspace pesado para modal menor ou remover overlays globais.  |
| `AppRowActions`                                          | três menus de ação                                                               | Esconder a ação primária de uma fila dentro de menu.                   |

## G. Proposta inicial do design system interno

Isto é uma proposta de contrato, **não autorização para criar componentes nesta fase**.

### G.1 Camadas

1. **Tokens CSS:** cor semântica, superfície, texto, borda, foco, radius, shadow, spacing, motion e z-index. Manter light/dark como valores alternativos.
2. **Primitives acessíveis:** manter `components/ui`/Radix para button, input, select, dialog, dropdown, popover, tabs e table anatomy.
3. **Recipes Nexo:** shell, page header, section, KPI, filter bar, table/list, badge, query state, evidence timeline e modal.
4. **Composições operacionais:** estado oficial, atenção, NBA, fila, fluxo e evidência; somente recebem contratos autoritativos ou presentation models sem inferência decisória.
5. **Páginas:** orquestram queries, navegação e ações; não definem novos tokens/recipes.

### G.2 Escalas iniciais a ratificar no Dashboard

- Espaçamento: 4/8/12/16/20/24/32; página 12–16 lateral conforme breakpoint; seção 16–20; card 12/16/20 conforme densidade.
- Radius: controle 10–12, card 12–16, overlay 16; pill somente para chip/status.
- Elevação: base sem sombra; card no máximo uma sombra tokenizada; overlay com sombra própria.
- Tipografia: overline/contexto, título de página, título de seção, valor KPI, corpo e metadata.
- Estado: neutral/info/success/warning/danger são **tons de apresentação**; P0–P3 e estados de domínio permanecem valores distintos.
- Responsividade: 360, 768, 1024 e 1440 como cenários mínimos; ação principal permanece visível; tabela tem overflow explícito ou representação de lista aprovada.
- Acessibilidade: foco visível, teclado, ESC/focus trap em modal, alvos mínimos, contraste nos dois temas, `aria-current` e labels em ícones.

## H. Ordem recomendada de migração

0. **Primeira implementação concreta:** formalizar o Dashboard como padrão-ouro apenas no nível de apresentação (ver I), com testes de contrato e snapshots/screenshots light/dark desktop/mobile. Não mudar ordem ou fontes.
1. **Agendamentos:** lista operacional relativamente próxima da base; validar header, filtros, tabela/lista, estados e `FormModal`.
2. **Clientes:** reutilizar a receita comprovada e formalizar workspace/contexto.
3. **Ordens de Serviço:** aplicar lista, badges, ação primária e workspace já validados; revisão extra de contrato.
4. **Financeiro:** consolidar tabs/KPIs/tabela sem aproximar conceitos de Billing.
5. **Calendário:** alinhar header/toolbar/modal, preservando FullCalendar como visualização especializada.
6. **Timeline → Governança:** primeiro oficializar evidência/timeline; depois consumi-la em governança.
7. **Pessoas → Perfil:** consolidar KPIs/painéis em Pessoas e derivar o padrão administrativo/pessoal no Perfil.
8. **Configurações → Billing:** usar form sections, feedback, info cards e modal maduros.
9. **WhatsApp:** por último; manter workspace, scroll e overlays específicos, adotando apenas recipes comprovadas.

Critério de passagem de cada onda: sem mudança no payload/seletores operacionais; testes de contrato; teclado; loading/error/empty/partial; light/dark; 360/768/1024/1440; dados longos; sidebar aberta/recolhida; screenshot comparativo.

## I. Dashboard como padrão-ouro

### I.1 Comparação com a hierarquia desejada

| Hierarquia desejada  | Estado atual                                                             | Diretriz                                                                                   |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Estado operacional   | Presente no header via chips e novamente em bloco inferior               | Tornar o header a leitura primária; bloco inferior deve explicar/evidenciar, não competir. |
| Atenção imediata     | Presente e primeiro bloco decisório                                      | Preservar; sem fallback inferido de KPI quando sinais falham.                              |
| Próxima melhor ação  | Presente ao lado de atenção                                              | Preservar contrato e CTA; nunca reordenar/recalcular no frontend.                          |
| KPIs                 | Presente depois das decisões                                             | Correto; KPIs apoiam, não comandam. Unificar anatomy de card.                              |
| Fluxo operacional    | Presente e explicita Cliente → Agendamento → O.S. → Cobrança → Pagamento | Preservar contrato oficial e estado indisponível honesto.                                  |
| Fila operacional     | Presente depois do fluxo                                                 | Preservar ordenação recebida e ação visível. Definir uma row recipe reutilizável.          |
| Pulso/evidências     | “Pulso da operação” seguido de estado e `NexoEvidenceTimeline`           | Agrupar semanticamente pulso (tendência) e evidência (prova), sem fundir os dados.         |
| Governança/timeline  | Timeline/evidência presente; governança não é seção nominal              | Dar rótulo contextual claro ou navegação para Governança sem fabricar score/estado.        |
| Navegação contextual | “WhatsApp executivo” e “Acessos rápidos contextuais” no fim              | Correto como navegação secundária; não promover acima da fila.                             |

### I.2 Contrato visual do padrão-ouro

- Uma página = um `AppPageShell`; header contextual; blocos na sequência decisão → execução → evidência → navegação.
- Acima da dobra: contexto/estado, atenção e NBA. KPIs nunca substituem essas respostas.
- Seções com anatomia única: título, explicação curta, ação opcional, conteúdo e estado de consulta.
- Falha parcial mantém dados válidos visíveis e nomeia exatamente o contrato indisponível.
- Fila conserva ordem e labels do backend. O frontend pode formatar data/moeda e adaptar layout, não classificar.
- Dashboard deve fornecer as receitas visuais, documentação e fixtures de estado para as demais páginas; não deve exportar lógica de domínio.

## J. Mapa de equivalência conceitual com Flowbite

| Benchmark Flowbite | Equivalente Nexo              | Ideia reaproveitável                                                  | Não copiar                                                                   |
| ------------------ | ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sidebar/navbar     | `MainLayout`                  | grupos, estado ativo, colapso, trigger mobile, distribuição start/end | markup/classes, paleta, plugin JS, segunda sidebar ou shell.                 |
| Stat cards         | família KPI a consolidar      | label → valor → contexto/delta, grid responsivo                       | cores por KPI ou inferência de saúde a partir do valor.                      |
| Section cards      | `AppSectionBlock`             | header/body/action, padding consistente                               | card para todo conteúdo, sombras/elevation genéricas.                        |
| Data tables        | `AppDataTable`                | container de overflow, header, row actions, paginação adjacente       | data-grid heavyweight, ordenação/prioridade implícita no cliente.            |
| Forms              | fachada App + primitives      | label/hint/error, grupos e footer previsível                          | estilos inline por formulário ou validação concorrente ao backend.           |
| Modal              | `app-modal-system`            | overlay, header/body/footer, tamanhos, foco e scroll                  | controller Flowbite, modal para workspace pesado, z-index paralelo.          |
| Dropdown/popover   | Radix + aliases App           | trigger/content, alinhamento, collision, teclado                      | dependência/comportamento Flowbite e menus que escondem ação principal.      |
| Timeline           | futuro `AppEvidenceTimeline`  | rail, marker, tempo, ator, descrição e CTA                            | timeline puramente decorativa ou fabricação de eventos.                      |
| Toast/alerts       | Sonner + `AppAlert`           | toast transitório; alert persistente contextual                       | usar toast para risco/erro que precisa permanecer visível.                   |
| Filter bars        | `AppFiltersBar`               | grupos, wrap, busca, filtros ativos e clear                           | controles com larguras fixas e toolbar que mistura todas as ações.           |
| Tabs               | `AppTabs*`/`AppSecondaryTabs` | lista/trigger/painel acessíveis e overflow mobile                     | tabs como navegação de rota sem semântica clara.                             |
| Badges             | badges App                    | tamanho e contraste consistentes                                      | taxonomia de cores Flowbite ou mapeamento que altere significado do backend. |

Flowbite não consta das dependências auditadas e não deve ser adicionado.

## K. Riscos de regressão e arquivos principais

### K.1 Riscos

1. **Autoridade operacional:** alteração visual pode inadvertidamente trocar seletores, sort, fallback ou normalização. Separar commits de composição e proibir cálculos novos.
2. **Shell global:** `MainLayout` afeta toda rota, permissões, mobile, notificações, tema e WhatsApp.
3. **Import ambiguity:** consolidar exports homônimos pode mudar comportamento sem erro de TypeScript.
4. **Overlay/foco:** substituir Dialog direto pode quebrar focus trap, composição de formulário, scroll, ESC e portais.
5. **Light/dark:** remover classe local antes do token equivalente pode reduzir contraste; validar ambos os temas.
6. **Responsive density:** tabelas e grids podem vazar horizontalmente ou esconder CTA; WhatsApp é especialmente dependente de altura útil.
7. **Partial failure:** um boundary genérico pode apagar seções válidas quando só uma query falha.
8. **Especializações legítimas:** FullCalendar e workspace WhatsApp não devem ser forçados ao mesmo componente de lista.
9. **Remoção prematura:** componentes aparentemente duplicados podem atender contratos diferentes em páginas fora das 13 rotas-alvo.

### K.2 Arquivos principais envolvidos nas próximas fases

- Shell/tema/rotas: `apps/web/client/src/App.tsx`, `components/AppLayout.tsx`, `components/AppShell.tsx`, `components/MainLayout.tsx`, `contexts/ThemeContext.tsx`, `index.css`.
- Fachadas: `components/app-system.tsx`, `components/internal-page-system.tsx`, `components/app-modal-system.tsx`, `components/app/*`, `components/operational/index.tsx`, `components/operating-system/*`, `components/ui/*`.
- Páginas: `pages/ExecutiveDashboard.tsx`, `CustomersPage.tsx`, `PeoplePage.tsx`, `ProfilePage.tsx`, `AppointmentsPage.tsx`, `CalendarPage.tsx`, `ServiceOrdersPage.tsx`, `FinancesPage.tsx`, `WhatsAppPage.tsx`, `TimelinePage.tsx`, `GovernancePage.tsx`, `SettingsPage.tsx`, `BillingPage.tsx`.
- Especializações/overlays: `components/Create*Modal.tsx`, `components/Edit*Modal.tsx`, `components/Confirm*`, `components/DetailModal.tsx`, `components/service-orders/*`, `components/finance-modes/*`, `components/dashboard/*`.
- Guardrails existentes: `Architecture.*.test.ts`, `components/AppVisualFoundation.contract.test.ts`, contratos por página e `apps/web/scripts/validate-operating-system.mjs`.

## Conclusão explícita

### O que deve ser preservado

- `AppLayout → MainLayout → AppShell`, navegação autorizada, colapso/mobile, topbar, busca, tema light/dark, notificações e overlays globais.
- Primitives Radix/UI, tokens semânticos atuais e o sistema oficial de modal como base evolutiva.
- Estados honestos de loading/error/empty/indisponível e falha parcial.
- Ordem decisória atual do Dashboard e toda decisão operacional retornada pela API/BFF.
- FullCalendar e WhatsApp como composições especializadas dentro do shell.

### O que deve ser consolidado

- Headers, page shell/wrapper, section cards, KPI cards/grids, tabelas, filtros/action bars, badges, query states, row actions, timeline/evidência e anatomia de forms/modais.
- Os exports homônimos de `app-system` e `internal-page-system` em uma fachada documentada, com adapters temporários.
- Tokens sinônimos e receitas de spacing/radius/shadow/responsividade, após ratificação no padrão-ouro.

### O que deve ser removido

- **Somente depois da migração e prova de não uso:** `PageWrapper`, headers/top cards redundantes, wrappers de tabela/row actions duplicados, KPI cards paralelos, Dialogs diretos e classes locais já cobertas pela receita canônica.
- Fallbacks visuais que aparentem uma decisão quando a fonte autoritativa estiver indisponível.
- Não remover agora overlays globais, primitives, componentes especializados ou aliases ainda consumidos.

### Primeira implementação concreta depois desta auditoria

Executar um **lote Dashboard padrão-ouro, exclusivamente visual**, que: (1) congela por testes a ordem estado → atenção → NBA → KPIs → fluxo → fila → pulso/evidências → governança/timeline → navegação; (2) escolhe e documenta as recipes canônicas de header, seção, KPI, fila e query state usando os componentes existentes; (3) substitui apenas duplicações locais do Dashboard; e (4) registra screenshots light/dark em desktop e mobile. O lote não deve alterar queries, BFF, normalizadores, ordenação, labels operacionais, fallbacks ou execução de ações.

## Apêndice — método e comandos de auditoria

Foram usados inventário de arquivos, busca textual e contagem estática. Comandos reproduzíveis:

```bash
find apps/web -path '*/node_modules' -prune -o -type f -print | sort
wc -l apps/web/client/src/components/{AppLayout.tsx,MainLayout.tsx,AppShell.tsx,app-system.tsx,internal-page-system.tsx,app-modal-system.tsx} apps/web/client/src/pages/*.tsx
rg -n '^export (function|const|type|interface)' apps/web/client/src/components
rg -n 'Flowbite|flowbite' package.json pnpm-lock.yaml apps/web/package.json
rg -n 'Dialog(Content|Trigger)|BaseModal|FormModal|ConfirmModal' apps/web/client/src/components apps/web/client/src/pages
rg -n 'AppOperationalHeader|AppSectionBlock|Atenção imediata|Próxima melhor ação|KPIs operacionais|Fluxo operacional|Fila operacional|Pulso da operação|Acessos rápidos' apps/web/client/src/pages/ExecutiveDashboard.tsx
```

As contagens de hardcodes são indicadores, não critérios automáticos de remoção: ocorrências em strings dinâmicas, primitives e tokens precisam de revisão semântica antes de qualquer edição.

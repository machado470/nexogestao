# Auditoria Visual Comparativa NEXO-01

Data: 2026-06-07
Escopo: ExecutiveDashboard, Customers, Appointments, ServiceOrders, Finances, Timeline, People, Profile, Settings, Calendar e Billing.
Fora de escopo: WhatsApp, backend, banco e integrações de WhatsApp.

## 1. Inventário visual por página

| Página | Header | Filtros | Cards/KPIs | Tabelas | Badges/empty states | Scroll/responsividade | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ExecutiveDashboard | `AppOperationalHeader` compacto com CTA contextual | Sem barra tabular dominante | Cards operacionais e KPI compacto | Tabelas internas com borda/radius do sistema | `AppStatusBadge` e `AppPageEmptyState` | Conteúdo em shell único, scroll por áreas extensas | CONSISTENTE |
| Customers | `AppOperationalHeader` compacto | `AppFiltersBar` com altura 9, gap 2, px 3/py 2 | `AppSectionBlock` e cards internos `rounded-xl` | `AppDataTable` direto, container com scroll interno controlado | Badges Nexo e empty state padrão | Scroll interno apenas na listagem | CONSISTENTE |
| Appointments | `AppOperationalHeader` compacto | `AppFiltersBar` e busca no header | KPIs compactos e blocos de ação | `AppDataTable` direto | Badges Nexo e empty state padrão | Layout em shell único | CONSISTENTE |
| ServiceOrders | `AppOperationalHeader` compacto | `AppFiltersBar` px 3/py 2 | `AppSectionBlock` dominante | `AppDataTable` direto | Badges Nexo e empty state padrão | Scroll interno na lista grande | CONSISTENTE |
| Finances | `AppOperationalHeader` compacto | `AppFiltersBar` px 3/py 2 | Blocos financeiros no padrão interno | Tabela estava aninhada dentro de `AppDataTable`; corrigida para tabela direta | Badges Nexo | Scroll interno preservado | PARCIALMENTE CONSISTENTE -> CONSISTENTE |
| Timeline | `AppOperationalHeader` compacto | `AppFiltersBar` em grid responsivo | `AppSectionBlock` para prova operacional | Sem divergência estrutural relevante | Badges/empty state do sistema | Grade responsiva | CONSISTENTE |
| People | `AppOperationalHeader` compacto | `AppFiltersBar` com densidade levemente maior por abas | `AppSectionBlock` e `AppDataTable` | Tabela direta | Badges Nexo | Scroll controlado | CONSISTENTE |
| Profile | `AppOperationalHeader` compacto | Controle de disponibilidade no header | `AppSectionBlock` dominante | Tabela estava aninhada dentro de `AppDataTable`; corrigida para tabela direta | Badges Nexo | Layout em blocos responsivos | PARCIALMENTE CONSISTENTE -> CONSISTENTE |
| Settings | `AppOperationalHeader` compacto | Navegação por seções em bloco | Formulários dentro de `AppSectionBlock` | Não aplicável | Badges Nexo | Responsivo em grid | CONSISTENTE |
| Calendar | `AppOperationalHeader`, mas filtro e cards usavam superfície modal | Usava `AppToolbar` e tokens `nexo-modal-section` | KPIs manuais com radius/superfície diferentes | Não aplicável | Badges Nexo | FullCalendar com altura própria | INCONSISTENTE -> CONSISTENTE |
| Billing | `AppOperationalHeader` compacto | Sem barra de filtros | Planos em cards simples | Tabela estava aninhada dentro de `AppDataTable`; corrigida para tabela direta | Badges Nexo | Layout responsivo | PARCIALMENTE CONSISTENTE -> CONSISTENTE |

## 2. Comparação com padrão dominante atual

O padrão dominante observado nas páginas internas é:

- Header: `AppOperationalHeader`/`nexo-page-header`, borda sutil, radius de painel, padding horizontal 6 e vertical 4-5, CTA primário à direita e ações secundárias antes do CTA.
- Filtros: `AppFiltersBar` com `nexo-app-toolbar`, altura mínima 9/controle médio, `gap-2`, `px-3 py-2`, borda `border-subtle`, fundo `surface-base`.
- Cards: `AppSectionBlock`/`AppSectionCard`, `rounded-2xl` externo; cards internos `rounded-xl`, borda `border-subtle`, fundo `surface-subtle`, padding 3-5 conforme densidade.
- KPIs: `AppKpiRow`/`AppMetricCard`, densidade compacta, valor `text-2xl`, label uppercase pequeno e altura mínima aproximada de 118px.
- Tabelas: `AppDataTable` como `<table>` direto, cabeçalho uppercase, células com padding padronizado e containers de scroll quando a lista é extensa.
- Badges: `AppStatusBadge`/`NexoStatusBadge`, tamanho compacto, radius pill, tom semântico.
- Empty states: `AppPageEmptyState`, ícone pequeno em tile, título curto e descrição operacional.
- Scroll: shell global único; scroll interno somente em tabelas/listas longas ou no calendário.
- Responsividade: grids `md`/`xl`, filtros com wrap, tabelas com largura mínima e overflow controlado.

## 3. Inconsistências encontradas

1. Calendar comunicava parte da superfície como modal (`nexo-modal-section`) apesar de ser página interna principal.
2. Calendar usava `AppToolbar` genérico em vez de `AppFiltersBar`, deixando a barra menos aderente ao padrão dominante de filtros das páginas operacionais.
3. Calendar tinha KPIs manuais mais baixos e com linguagem visual diferente de `AppKpiRow`.
4. Finances, Profile e Billing renderizavam uma `<table>` dentro de `AppDataTable`, criando semântica visual/DOM inconsistente com Customers, Appointments, ServiceOrders e People.
5. Billing herdava a inconsistência da tabela no histórico de cobrança do SaaS.

## 4. Correções realizadas

- Calendar: barra de filtros alinhada para `AppFiltersBar` com tokens de página interna.
- Calendar: superfícies internas migradas de tokens de modal para `border-subtle`, `surface-subtle`, `rounded-xl` e textos `text-primary/text-muted`.
- Calendar: KPIs manuais substituídos por `AppKpiRow`, preservando os mesmos dados e significado.
- Calendar: descrição do header ajustada para reforçar a fonte da verdade “visualização estratégica do tempo”.
- Finances/Profile/Billing e modos financeiros: tabelas deixaram de ser aninhadas e passaram a usar `AppDataTable` diretamente.

## 5. Padrão Nexo consolidado

- HEADER NEXO: `AppOperationalHeader`; padding `px-6 py-4/5`, radius `rounded-xl`, borda `border-subtle`, CTA primário à direita.
- FILTROS NEXO: `AppFiltersBar`; controles `h-9`, radius `rounded-md`, `gap-2`, `px-3 py-2`, fundo `surface-base`.
- CARD NEXO: `AppSectionBlock` externo `rounded-2xl` e cards internos `rounded-xl`, borda `border-subtle`, padding 3-5.
- KPI NEXO: `AppKpiRow`/`AppMetricCard`, min-height aproximado 118px, label uppercase, valor `text-2xl`, densidade compacta.
- TABELA NEXO: `AppDataTable` como tabela direta; cabeçalho uppercase, linhas com borda sutil, scroll externo quando necessário.
- BADGE NEXO: `AppStatusBadge`, pill compacto, tom semântico e sem badges isolados fora do sistema.
- EMPTY STATE NEXO: `AppPageEmptyState`, linguagem operacional curta, ícone em tile e espaçamento centralizado.

## 6. Fontes da verdade

- Dashboard permanece como centro de decisão.
- Clientes permanece como memória viva da operação.
- Agendamentos permanece como controle operacional do tempo.
- Calendário foi reforçado como visualização estratégica do tempo.
- O.S. permanece como execução real.
- Financeiro permanece como dinheiro travado + cobrança.
- Timeline permanece como prova oficial da operação.
- Pessoas permanece como responsáveis pela operação.
- Perfil permanece como central individual de execução.
- Configurações permanece como controle operacional do sistema.
- Billing permanece como cobrança do SaaS.

## 7. Confirmações de escopo

- WhatsApp não foi auditado nem alterado.
- Backend não foi alterado.
- Banco não foi alterado.
- Integrações/fluxos de WhatsApp não foram alterados.

# Padronização visual e operacional — Lote 3 — Clientes + Ordens de Serviço

Data da execução: 2026-06-03  
Escopo: `apps/web/client/src/pages/CustomersPage.tsx` e `apps/web/client/src/pages/ServiceOrdersPage.tsx`.  
Referência oficial aplicada: contrato validado no Financeiro no Lote 2.

## 1. Resumo executivo

O Lote 3 aplicou a fundação visual Nexo aos módulos piloto de Clientes e Ordens de Serviço (O.S.), preservando a lógica existente e sem alterar backend, banco, API, tRPC, autenticação, tenant/orgId, WhatsApp, Dashboard, Governança ou Timeline global.

O Financeiro permanece como referência oficial do padrão: página com `AppPageShell`, `AppOperationalHeader`, cartões oficiais, tabela oficial, badges oficiais de status/prioridade, estados padronizados e próxima melhor ação baseada somente nos dados já carregados.

Clientes foi tratado como memória operacional do relacionamento: quem é o cliente, o que aconteceu e qual a próxima ação segura. O.S. foi tratada como execução: estado da fila, responsável, risco e próxima ação de execução/cobrança.

## 2. Arquivos analisados

- `docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_1_FOUNDATION.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_2_FINANCEIRO.md`
- `apps/web/client/src/pages/FinancesPage.tsx`
- `apps/web/client/src/pages/CustomersPage.tsx`
- `apps/web/client/src/pages/ServiceOrdersPage.tsx`
- `apps/web/client/src/components/app-system.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`
- `apps/web/client/src/components/operating-system/Wrappers.tsx`
- `apps/web/client/src/components/operating-system/OperationalTopCard.tsx`
- modais existentes relacionados: `CreateCustomerModal`, `EditCustomerModal`, `CreateAppointmentModal`, `CreateServiceOrderModal`, `EditServiceOrderModal`.

## 3. Arquivos alterados

- `apps/web/client/src/pages/CustomersPage.tsx`
- `apps/web/client/src/pages/ServiceOrdersPage.tsx`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_3_CLIENTES_OS.md`

## 4. Estrutura antiga Clientes

A página de Clientes já era operacionalmente madura, mas ainda combinava camadas visuais distintas:

1. `PageWrapper` legado como wrapper externo.
2. `AppOperationalHeader` para o cabeçalho.
3. `OperationalTopCard` como bloco de decisão da carteira.
4. KPIs com `AppStatCard`, mas fora de um cartão de seção oficial.
5. Bloco de intervenção com `AppNextBestActionBlock`.
6. Atenção imediata com cards locais.
7. Filtros e busca com input local e botões locais.
8. Lista/card operacional manual para clientes.
9. Workspace de detalhe com `AppContextWorkspace` e `AppEmbeddedTimeline`.
10. Modais existentes para criar/editar cliente, agendamento e O.S.

### Itens mapeados em Clientes

- Lista: cards operacionais manuais e agora tabela oficial complementar.
- Tabela: não havia tabela oficial antes; foi adicionada uma tabela compacta com `AppDataTable`.
- Cards: KPIs e cards manuais; KPIs foram envolvidos por `AppSectionCard`.
- Badges/chips: chips locais em cabeçalho e `ActionCue` local.
- Filtros/busca: `AppFiltersBar`, input local e botões locais preservados por segurança.
- Dropdowns: `AppRowActionsDropdown` oficial já existia e foi preservado.
- Detalhe: `AppContextWorkspace`, considerado detalhe pesado.
- Modais: create/edit curtos preservados.
- Loading/error/empty: estados de página já padronizados foram preservados.

## 5. Estrutura nova Clientes

A estrutura operacional agora segue o contrato do Financeiro:

1. `AppPageShell`
2. `AppOperationalHeader`
3. `AppSectionCard` — próxima decisão da carteira / próxima melhor ação macro
4. `AppSectionCard` — resumo do cliente/carteira
5. `AppNextBestActionBlock` — intervenção operacional recomendada com ação, motivo e impacto
6. `AppSectionBlock` — atenção imediata
7. `AppFiltersBar` — busca e filtros
8. `AppSectionBlock` — carteira operacional com `AppDataTable` e cards operacionais existentes
9. `AppContextWorkspace` — detalhe legado pesado preservado
10. `AppEmbeddedTimeline` — timeline embutida do cliente preservada

## 6. Estrutura antiga O.S.

A página de O.S. tinha foco operacional, mas ainda usava wrapper e cards paralelos:

1. `PageWrapper` legado como wrapper externo.
2. `AppOperationalHeader` para cabeçalho.
3. `OperationalTopCard` para próxima execução.
4. KPIs com `AppStatCard` soltos.
5. Filtros com `AppFiltersBar` e botões locais.
6. Atenção imediata com cards locais.
7. Carteira de O.S. em cards manuais.
8. Detalhe lateral/inline com dados operacionais, financeiro, agendamento, timeline e ações.
9. Modais existentes para criar/editar O.S.

### Itens mapeados em O.S.

- Status: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `DONE`, `CANCELED` mapeados para linguagem operacional.
- Filtros: todas, abertas, em andamento, atrasadas, concluídas, concluídas sem cobrança.
- Lista: cards de execução manuais.
- Cards: KPIs, atenção imediata e detalhe.
- Badges: `AppStatusBadge` simples, sem status operacional oficial.
- Modais: `CreateServiceOrderModal` e `EditServiceOrderModal` preservados.
- Detalhe: bloco grande com operação, financeiro, agendamento, timeline e ações.
- Ações: iniciar, concluir, gerar cobrança, editar, WhatsApp, abrir cliente.
- Timeline: timeline da O.S. via `nexo.timeline.listByServiceOrder` preservada.
- Integrações financeiras: geração de cobrança e status de cobrança vinculada preservados.

## 7. Estrutura nova O.S.

A estrutura operacional agora segue o contrato do Financeiro:

1. `AppPageShell`
2. `AppOperationalHeader`
3. `AppSectionCard` — próxima melhor ação de execução
4. `AppSectionCard` — saúde operacional / KPIs
5. `AppFiltersBar` — fila/filtros de execução
6. `AppSectionBlock` — atenção imediata
7. `AppSectionBlock` — carteira de O.S. com `AppDataTable` e cards existentes
8. `AppSectionBlock` — detalhe, timeline relacionada e ações reais
9. Modais existentes preservados

## 8. Componentes oficiais aplicados

Foram aplicados ou preservados nos dois módulos:

- `AppPageShell`
- `AppOperationalHeader`
- `AppSectionCard`
- `AppSectionBlock`
- `AppStatCard`
- `AppDataTable`
- `AppStatusBadge`
- `AppOperationalStatusBadge`
- `AppPriorityBadge`
- `AppRowActionsDropdown`
- `AppFiltersBar`
- `AppPageLoadingState`
- `AppPageErrorState`
- `AppPageEmptyState`
- `AppPagination`
- `AppContextWorkspace` e `AppEmbeddedTimeline` preservados onde já existiam

## 9. Hardcodes removidos/reduzidos

Reduções aplicadas:

- Remoção de `PageWrapper` em Clientes e O.S.
- Remoção de `OperationalTopCard` em Clientes e O.S.
- Remoção do chip local `ActionCue` em Clientes.
- Substituição de chips locais do cabeçalho por `AppStatusBadge` e `AppOperationalStatusBadge`.
- Envolvimento dos KPIs em `AppSectionCard`, reduzindo wrappers manuais soltos.
- Inclusão de `AppDataTable` oficial nas carteiras para reduzir dependência exclusiva de cards locais.
- Substituição de badges de status de cards/listas por `AppOperationalStatusBadge` onde havia status operacional.
- Inclusão de `AppPriorityBadge` para próxima ação/prioridade real.

Hardcodes preservados por segurança:

- Inputs locais de busca e botões de filtro, porque a rodada não altera contrato de filtros/API.
- Cards detalhados de workspace/detalhe, pois são candidatos a workspace e não devem ser redesenhados agora.
- Pequenos textos/tokens internos de timeline embutida, sem alterar Timeline global.

## 10. Próxima Melhor Ação implementada

### Clientes

A próxima ação usa apenas dados já carregados:

- cobrança vencida/pendente;
- O.S. aberta;
- agendamento futuro;
- período sem contato;
- intervenção operacional existente retornada pelos utilitários locais.

A recomendação mostra:

- ação: CTA real da carteira ou intervenção;
- motivo: contexto operacional/financeiro/comunicação;
- impacto: destravar caixa, execução, agenda ou retomada de contato.

Não houve score novo, backend novo ou API nova.

### O.S.

A próxima ação usa apenas dados já carregados:

- O.S. concluída sem cobrança;
- O.S. atrasada;
- O.S. sem responsável;
- O.S. aberta/pronta para iniciar;
- O.S. em andamento pronta para concluir.

A recomendação mostra:

- ação: iniciar, concluir, gerar cobrança, editar/definir responsável ou revisar;
- motivo: prazo, responsável, cobrança ou execução;
- impacto: risco operacional exibido no bloco oficial.

## 11. Status e prioridade aplicados

### Status operacional

Foi usada somente a linguagem oficial:

- `NORMAL`
- `ATENÇÃO`
- `RISCO`
- `CRÍTICO`

Clientes:

- `RISCO`: cobrança vencida ou 30+ dias sem contato;
- `ATENÇÃO`: pendência, O.S. aberta ou 15+ dias sem contato;
- `NORMAL`: sem sinal operacional relevante;
- `CRÍTICO`: agregado da carteira com alto volume de risco.

O.S.:

- `RISCO`: atrasada ou concluída sem cobrança;
- `ATENÇÃO`: sem responsável ou em andamento sem prazo;
- `NORMAL`: sem bloqueio crítico;
- `CRÍTICO`: agregado com alto volume de atrasos/concluídas sem cobrança.

### Prioridade

Foi usada somente a escala oficial:

- `P0`
- `P1`
- `P2`
- `P3`

A prioridade aparece somente vinculada a ação real ou item operacional real.

## 12. Estados loading/error/empty

Estados preservados e padronizados:

- Clientes: `AppPageLoadingState`, `AppPageErrorState`, `AppPageEmptyState`.
- O.S.: `AppPageLoadingState`, `AppPageErrorState`, `AppPageEmptyState`.

Não foram criados estados paralelos.

## 13. Workspace candidates encontrados

### Clientes

`AppContextWorkspace` em Clientes é um forte candidato a workspace oficial futuro, pois concentra:

- resumo do cliente;
- comunicação;
- financeiro;
- O.S.;
- agendamentos;
- timeline;
- ações cruzadas.

Classificação: `workspace-candidate` e `detail-legacy` pesado. Não migrado neste lote.

### O.S.

O detalhe atual de O.S. é candidato a workspace futuro, pois concentra:

- estado de execução;
- responsável;
- dados financeiros/cobrança;
- agendamento relacionado;
- timeline/histórico;
- ações de execução.

Classificação: `workspace-candidate` e `detail-legacy` pesado. Não migrado neste lote.

## 14. Detail-legacy encontrados

- Clientes: detalhe contextual em `AppContextWorkspace` marcado como `detail-legacy` pesado.
- O.S.: detalhe inline/lateral da O.S. marcado como `detail-legacy` pesado.
- Modais curtos de criação/edição foram preservados como adequados para o momento.
- `EditServiceOrderModal` pode ser reavaliado em lote futuro se crescer como fluxo pesado.

## 15. Timeline embutida analisada

### Clientes

Existe timeline embutida no detalhe do cliente usando `AppEmbeddedTimeline`, alimentada por dados do workspace/timeline do cliente. Ela não foi removida, duplicada ou migrada. Não houve alteração na Timeline global.

### O.S.

Existe timeline/histórico embutido no detalhe da O.S. via consulta de timeline por O.S. Ela permanece local ao detalhe, não foi globalizada e não teve contrato alterado.

Resultado: timeline embutida existe nos dois módulos, está contextualizada e foi preservada. Não houve refatoração da Timeline global.

## 16. Lógica/API preservada

Foram preservadas as chamadas e fluxos existentes, incluindo:

- listagem de clientes;
- workspace de cliente;
- listagem de agendamentos;
- listagem de O.S.;
- listagem de cobranças;
- listagem de pessoas;
- envio de WhatsApp já existente;
- iniciar/concluir O.S.;
- gerar cobrança a partir de O.S.;
- criar/editar cliente;
- criar agendamento;
- criar/editar O.S.;
- timeline por cliente e por O.S.

Não houve backend novo, banco novo, migration, alteração de API, tRPC, autenticação, tenant ou orgId.

## 17. Riscos para WhatsApp

Risco identificado: Clientes e O.S. possuem ações que navegam para WhatsApp com contexto de cliente/O.S./cobrança.

Mitigação:

- `WhatsAppPage.tsx` não foi alterado.
- Inbox, conversa, composer, contexto lateral, layout split, fundo, altura útil e filtros do WhatsApp não foram alterados.
- Não houve alteração em componentes específicos do WhatsApp.
- As ações continuam sendo navegação/contexto já existente.

## 18. Quality gates

Quality gates solicitados para execução ao final do lote:

- `pnpm prisma:check`
- `pnpm -r typecheck`
- `pnpm -r lint`
- `pnpm -s build`
- `pnpm test`
- `pnpm ci:preflight`
- `pnpm --filter ./apps/web lint:os`
- `pnpm --filter ./apps/web test`
- `pnpm --filter ./apps/api test`
- `git status --short`

## 19. Próximo lote recomendado

Próximo lote recomendado: **LOTE 4 — Agendamentos + Pessoas**.

Justificativa:

1. Clientes e O.S. agora estão alinhados ao Financeiro como cadeia operacional principal.
2. Agendamentos é o próximo elo natural da execução.
3. Pessoas permite consolidar responsável, capacidade e accountability operacional.
4. WhatsApp, Dashboard, Governança e Timeline global devem continuar fora deste próximo lote, salvo decisão explícita posterior.

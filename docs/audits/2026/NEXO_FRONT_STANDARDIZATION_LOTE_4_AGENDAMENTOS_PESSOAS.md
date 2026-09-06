# Nexo Front Standardization — Lote 4: Agendamentos + Pessoas

Data: 2026-06-03  
Escopo: front interno, somente módulos `Agendamentos` e `Pessoas`.

## 1. Resumo executivo

O Lote 4 aplicou o contrato visual e operacional validado nos lotes anteriores aos módulos que controlam a entrada da operação (`Agendamentos`) e os responsáveis pela execução (`Pessoas`). A migração removeu o uso local de `PageWrapper`/`OperationalTopCard` nas páginas alvo, introduziu `AppPageShell`, saúde operacional, próxima melhor ação, status operacional oficial, prioridade oficial e tabelas oficiais com ações reais já existentes.

A lógica de negócio, chamadas tRPC/API, payloads de criação/edição, autenticação, tenant/orgId, backend, banco e migrations foram preservados. WhatsApp foi apenas mantido como destino de navegação já existente em Agendamentos; `WhatsAppPage.tsx` não foi alterado.

## 2. Arquivos analisados

- `docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_1_FOUNDATION.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_2_FINANCEIRO.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_3_CLIENTES_OS.md`
- `apps/web/client/src/pages/AppointmentsPage.tsx`
- `apps/web/client/src/pages/PeoplePage.tsx`
- `apps/web/client/src/components/app-system.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`
- Dependências diretas usadas pelas páginas: `CreateServiceOrderModal`, `CreatePersonModal`, `EditPersonModal`, `FormModal`, `PersonAssignmentWarning`, `useAssigneeWarningTelemetry`.

## 3. Arquivos alterados

- `apps/web/client/src/pages/AppointmentsPage.tsx`
- `apps/web/client/src/pages/PeoplePage.tsx`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_4_AGENDAMENTOS_PESSOAS.md`

## 4. Estrutura antiga Agendamentos

A página de Agendamentos já tinha lógica operacional madura, mas ainda estava visualmente presa a partes legadas:

1. `PageWrapper` como wrapper externo.
2. `AppOperationalHeader` com busca e total.
3. Filtros manuais em `AppFiltersBar`.
4. Lista em cards locais clicáveis.
5. Status textual com `AppStatusBadge` simples.
6. Ações por linha via `AppRowActionsDropdown`.
7. Detalhe inline com card local.
8. Timeline por cliente via `AppEmbeddedTimeline` apenas quando havia `customerId` na URL.
9. Modal curto de criação/edição com `FormModal`.
10. Modal de criação de O.S. preservado.

Itens auditados:

- Lista atual: cards locais em grid.
- Filtros atuais: todos, hoje, amanhã, semana, não confirmados, confirmados, atrasados, cancelados, responsável e busca textual.
- Cards atuais: cada card mostrava cliente, horário, observação/título, responsável, duração e O.S.
- Badges/status: `SCHEDULED`, `CONFIRMED`, `DONE`, `CANCELED`, `NO_SHOW` mapeados para labels textuais.
- Modais: `FormModal` para criar/editar/remarcar; `CreateServiceOrderModal` para O.S.
- Detalhe: inline, pesado o suficiente para ser marcado como `detail-legacy`.
- Ações: confirmar, cancelar, editar/remarcar, criar O.S., abrir cliente, enviar WhatsApp, abrir O.S.
- Loading/error/empty: já usavam estados internos oficiais.
- Integração com cliente: URL `/customers?customerId=...` e timeline por customerId.
- Integração com O.S.: listagem de O.S. carregada e modal de criação.
- Integração com WhatsApp: navegação para `/whatsapp?...template=APPOINTMENT_REMINDER` preservada.
- Integração com timeline: `nexo.timeline.listByCustomer` preservada.

## 5. Estrutura nova Agendamentos

A nova estrutura segue a sequência oficial do contrato Nexo:

1. `AppPageShell`
2. `AppOperationalHeader`
3. `AppSectionCard` — Saúde da agenda
4. `AppNextBestActionBlock` — Próxima melhor ação
5. `AppFiltersBar` — filtros operacionais existentes
6. `AppSectionBlock` — fila/carteira operacional
7. `AppDataTable` — tabela oficial de agendamentos
8. `AppRowActionsDropdown` — ações reais por linha
9. `AppSectionBlock` — detalhe legado com timeline embutida
10. `FormModal` e `CreateServiceOrderModal` preservados

## 6. Estrutura antiga Pessoas

A página de Pessoas era mais curta e concentrava muita marcação em uma única linha:

1. `PageWrapper` como wrapper externo.
2. `OperationalTopCard` como card superior paralelo.
3. KPIs com `AppStatCard` soltos.
4. Sinais de atribuição administrativos com cards e bloco manual.
5. Loading/error/empty oficiais.
6. Tabela em `AppDataTable` wrapper interno com `<table>` manual.
7. Botões manuais por linha para detalhe, O.S., agenda e edição.
8. Detalhe operacional com cards locais e formulário inline de indisponibilidade.
9. Modais `CreatePersonModal` e `EditPersonModal` preservados.

Itens auditados:

- Lista atual: tabela de carga por responsável.
- Cards atuais: KPIs de pessoas ativas, sobrecarregadas, O.S. atrasadas e agenda do dia.
- Gráficos atuais: não havia gráfico.
- Filtros: não havia filtros operacionais; foi criado filtro local funcional sobre dados carregados.
- Badges/status: ativo/inativo, disponibilidade, carga e capacidade com `AppStatusBadge` simples.
- Modais: criação e edição preservadas.
- Detalhe: bloco inline com responsabilidade, carga, disponibilidade e indisponibilidades recentes/futuras.
- Ações: detalhe, abrir O.S., abrir agenda, editar.
- Loading/error/empty: estados oficiais já existentes.
- Relação com O.S.: contadores e navegação para `/service-orders`.
- Relação com agendamentos: contadores e navegação para `/appointments`.
- Relação com permissões: formulário e sinais administrativos dependem de `role === "ADMIN"`.
- Relação com timeline: não havia timeline/histórico dedicado; apenas `lastActivityAt`.

## 7. Estrutura nova Pessoas

A nova estrutura segue o padrão operacional consolidado:

1. `AppPageShell`
2. `AppOperationalHeader`
3. `AppSectionCard` — Saúde da equipe
4. `AppNextBestActionBlock` — Próxima melhor ação
5. `AppFiltersBar` — filtros locais funcionais sobre dados já carregados
6. `AppSectionBlock` — sinais de atribuição administrativos preservados
7. `AppSectionBlock` — fila de pessoas com `AppDataTable`
8. `AppRowActionsDropdown` — ações reais por pessoa
9. `AppSectionBlock` — responsabilidade e carga como `detail-legacy`
10. `CreatePersonModal` e `EditPersonModal` preservados

## 8. Componentes oficiais aplicados

Foram aplicados ou preservados:

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
- `AppPageEmptyState`
- `AppPageErrorState`
- `AppPageLoadingState`
- `AppPagination` em Agendamentos
- `AppEmbeddedTimeline` em Agendamentos
- `AppNextBestActionBlock`
- `FormModal` em Agendamentos

## 9. Tokens aplicados

Foram aplicados tokens Nexo/tokens oficiais existentes, incluindo:

- `--nexo-text-primary`
- `--nexo-text-secondary`
- `--nexo-text-muted`
- `--nexo-border-subtle`
- `--nexo-card-bg`
- `--nexo-control-bg`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--border-subtle`
- `--surface-base`
- `--surface-subtle`
- `--accent-soft`
- `--accent-primary`
- `--primary-foreground`

## 10. Hardcodes removidos/reduzidos

Reduções em Agendamentos:

- Removido `PageWrapper`.
- Removida lista de cards locais como estrutura principal.
- Substituída leitura operacional local por `AppDataTable`, `AppOperationalStatusBadge` e `AppPriorityBadge`.
- Adicionados KPIs dentro de `AppSectionCard`.
- Reduzido uso de bordas/backgrounds locais no bloco novo.

Reduções em Pessoas:

- Removido `PageWrapper`.
- Removido `OperationalTopCard`.
- Substituídos botões manuais por linha por `AppRowActionsDropdown`.
- Substituídos cards locais de detalhe por `AppSectionCard`.
- Inputs do formulário inline passaram a usar bordas/superfícies/tokens Nexo.
- Tabela passou a usar `AppDataTable` oficial.

Hardcodes preservados por segurança:

- Botões de filtro ainda são botões locais funcionais dentro de `AppFiltersBar`, como no padrão dos lotes anteriores.
- Modais existentes não foram reescritos.
- Detalhes inline não foram convertidos para workspace nesta rodada.

## 11. Status operacional aplicado

Agendamentos usam somente:

- `NORMAL`: confirmado/concluído/cancelado sem atraso crítico carregado.
- `ATENÇÃO`: agendamento `SCHEDULED` próximo sem confirmação ou `CANCELED` como sinal de acompanhamento.
- `RISCO`: agendamento vencido ainda `SCHEDULED`/`CONFIRMED`.
- `CRÍTICO`: `NO_SHOW`.

Pessoas usam somente:

- `NORMAL`: pessoa ativa sem sinais carregados de sobrecarga, indisponibilidade ou capacidade no limite.
- `ATENÇÃO`: `BUSY`, `AT_CAPACITY`, `UNAVAILABLE_SOON` ou `INVITED`.
- `RISCO`: O.S. atrasada, `OVERLOADED`, `OVER_CAPACITY` ou `UNAVAILABLE_NOW`.
- `CRÍTICO`: pessoa `INACTIVE`/`SUSPENDED` ainda com O.S. abertas ou agendamentos hoje.

## 12. Prioridade aplicada

Agendamentos usam somente:

- `P0`: no-show ou vencido.
- `P1`: agendamento próximo sem confirmação.
- `P2`: agendamento aberto sem O.S. vinculada no carregamento.
- `P3`: reservado para ordenação informativa, sem exibição quando não há ação real.

Pessoas usam somente:

- `P0`: inativo/suspenso com carga operacional no carregamento.
- `P1`: pessoa com O.S. atrasada ou sobrecarga.
- `P2`: acompanhamento de risco/atenção de capacidade ou disponibilidade.
- `P3`: reservado para ordenação informativa, sem exibição quando não há ação real.

## 13. Próxima melhor ação aplicada

Agendamentos:

- Remarcar/cancelar agendamento vencido.
- Confirmar agendamento próximo sem confirmação.
- Criar/preparar O.S. para agendamento sem O.S. vinculada.
- CTAs reais: selecionar detalhe, confirmar via mutation existente ou abrir modal existente de O.S.

Pessoas:

- Verificar redistribuição de carga quando há sobrecarga ou O.S. atrasada.
- Revisar disponibilidade/capacidade quando há indisponibilidade ou capacidade no limite.
- CTA real: abrir detalhe da pessoa selecionada.

Não houve score novo, backend novo, API nova, dados fake ou botão sem handler real.

## 14. Estados loading/error/empty padronizados

Agendamentos preservou:

- `AppPageLoadingState`
- `AppPageErrorState`
- `AppPageEmptyState`

Pessoas preservou e reforçou:

- `AppPageLoadingState`
- `AppPageErrorState`
- `AppPageEmptyState`

## 15. Modais analisados

Agendamentos:

- `FormModal` para criar/editar/remarcar foi preservado com os mesmos campos, payloads e mutations.
- `CreateServiceOrderModal` foi preservado com `initialCustomerId` e `appointmentId` já existentes.

Pessoas:

- `CreatePersonModal` preservado.
- `EditPersonModal` preservado.

Nenhum modal pesado foi migrado para workspace nesta rodada.

## 16. Detail-legacy encontrados

- Agendamentos: `Detalhe do agendamento`, com resumo, ações reais e timeline por cliente, permanece como `detail-legacy`.
- Pessoas: `Responsabilidade e carga`, com cards de carga/capacidade e formulário de indisponibilidade, permanece como `detail-legacy`.

## 17. Workspace candidates encontrados

- Agendamentos: detalhe com timeline, cliente, O.S. e ações pode virar workspace de preparação/entrada operacional.
- Pessoas: detalhe com carga, capacidade, disponibilidade, indisponibilidades e última atividade pode virar workspace de responsabilidade/capacidade.

## 18. Timeline/responsabilidade analisadas

Agendamentos:

- Responsável/executor: exibido por `assignedToPersonId`/`personId` usando lista de pessoas carregada.
- Histórico/timeline: mantido via `nexo.timeline.listByCustomer`, somente quando `customerId` existe na URL.
- Última atividade: não há campo operacional dedicado exibido além de `createdAt`/`updatedAt` disponíveis no registro; lacuna documentada.

Pessoas:

- Responsável/executor: a própria pessoa é o responsável operacional.
- Histórico/timeline: não há timeline dedicada nesta página.
- Última atividade: `lastActivityAt` é exibido na fila e no detalhe quando disponível.
- Relações com O.S./agendamentos: contadores e navegação existentes preservados.

## 19. Lógica/API preservada

Foram preservadas as chamadas:

- `trpc.nexo.appointments.list`
- `trpc.nexo.appointments.create`
- `trpc.nexo.appointments.update`
- `trpc.nexo.customers.list`
- `trpc.people.list`
- `trpc.nexo.serviceOrders.list`
- `trpc.nexo.timeline.listByCustomer`
- `trpc.people.operationalSummary`
- `trpc.analytics.assigneeWarningSummary`
- `trpc.people.listAvailabilityExceptions`
- `trpc.people.createAvailabilityException`
- `trpc.people.deleteAvailabilityException`

Nenhuma chamada tRPC/API foi alterada, removida ou criada.

## 20. Riscos para WhatsApp

Risco baixo:

- `WhatsAppPage.tsx` não foi alterado.
- Inbox, conversa, composer, contexto lateral, layout split, fundo, altura útil e filtros do WhatsApp não foram alterados.
- A única relação mantida é a navegação já existente de Agendamentos para `/whatsapp` com parâmetros de lembrete.

## 21. Quality gates executados

Executados/registrados nesta rodada:

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

Resultados finais detalhados devem ser lidos no resumo da entrega/commit.

## 22. Próximo lote recomendado

LOTE 5:

- Configurações
- Timeline
- Governança
- Billing

Não iniciado nesta rodada.

## 23. O que NÃO foi feito

- Não foi alterado `WhatsAppPage.tsx`.
- Não foi alterado Dashboard.
- Não foi alterado Financeiro.
- Não foi alterado Clientes.
- Não foi alterado O.S.
- Não foi alterado Governança.
- Não foi alterada Timeline global.
- Não foi alterado Configurações.
- Não foi alterado Billing.
- Não foi alterado backend.
- Não foi alterado banco.
- Não foi criada migration.
- Não foi alterada autenticação.
- Não foi alterado tenant/orgId.
- Não foi alterada API/tRPC.
- Flowbite não foi instalado.
- Não foi trocada biblioteca visual.
- Não foi removido legado global.
- Não foi feito redesign amplo.
- Não foram criados dados fake.
- Não foram criados botões sem ação real.

## 24. Correção pós-testes

Após a padronização visual do Lote 4, os testes web quebrados foram executados isoladamente com `pnpm --dir apps/web exec vitest run client/src/components/PersonAssignmentWarning.test.tsx client/src/pages/PeoplePage.operational-summary.test.ts client/src/pages/AppointmentAssignee.contract.test.ts`.

### Testes quebrados analisados

- `client/src/components/PersonAssignmentWarning.test.tsx`
  - Assert afetado: contrato textual do aviso em `AppointmentsPage.tsx`, que esperava a prop `personId` em uma única linha e dependia de âncoras em comentário.
  - Causa raiz: estrutura DOM/JSX alterada pela nova UI com `AppPageShell`, `AppDataTable` e formatação multilinha do JSX; o comportamento real do aviso permaneceu observacional.
- `client/src/pages/PeoplePage.operational-summary.test.ts`
  - Assert afetado: contrato administrativo de Pessoas acoplado ao bloco anterior de sinais de atribuição.
  - Causa raiz: troca de estrutura visual para o shell padronizado e cards oficiais, sem alteração da procedure `trpc.analytics.assigneeWarningSummary` nem da regra `role === "ADMIN"`.
- `client/src/pages/AppointmentAssignee.contract.test.ts`
  - Assert afetado: contrato de filtro/remoção de responsável em Agendamentos acoplado a strings exatas.
  - Causa raiz: a página passou para a tabela e ações oficiais do padrão Nexo; as chamadas, payloads e opção `Sem responsável` permaneceram os mesmos.

### Arquivos alterados na correção

- `apps/web/client/src/pages/AppointmentsPage.tsx`
  - Removidas âncoras de contrato em comentário para evitar teste baseado em texto artificial.
  - Mantidos os handlers reais, payloads de criação/edição e telemetria observacional de aviso de responsável.
- `apps/web/client/src/components/PersonAssignmentWarning.test.tsx`
  - Ajustado para validar o JSX real padronizado de Agendamentos com normalização de whitespace, sem depender de comentários.
  - Reforçado que `assignment-warning` continua passivo, observacional e sem bloqueio automático.
- `apps/web/client/src/pages/PeoplePage.operational-summary.test.ts`
  - Ajustado para validar `AppPageShell`, `AppSectionCard`, `AppNextBestActionBlock`, `AppDataTable`, `AppOperationalStatusBadge`, `AppPriorityBadge` e `AppRowActionsDropdown`.
  - Mantido o contrato tenant/admin de `assigneeWarningSummary` e a linguagem observacional.
- `apps/web/client/src/pages/AppointmentAssignee.contract.test.ts`
  - Ajustado para validar a página padronizada e preservar o contrato real de filtro, edição e remoção de responsável.

### Por que não houve regressão funcional

- A falha foi de contrato textual/estrutura DOM após a troca para componentes oficiais, não de comportamento.
- `assignment-warning` segue lendo `people.operationalSummary`, exibindo aviso passivo e registrando telemetria apenas quando o usuário confirma manualmente.
- Os payloads de `appointments.create`/`appointments.update` continuam preservando `assignedToPersonId`, incluindo remoção explícita com `null` na edição e ausência de responsável sem bloqueio automático.
- Os sinais administrativos de Pessoas continuam restritos a administradores, continuam tenant-scoped e continuam declarados como observacionais.
- Não houve alteração de backend, banco, migration, API/tRPC, WhatsApp, Dashboard ou rollback do padrão Nexo.

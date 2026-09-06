# Auditoria estrutural das páginas internas do NexoGestão

Data da auditoria: 2026-06-21  
Escopo: `/people`, `/profile`, `/timeline`, `/billing`/`/plans`, `/calendar` e `/dashboard`/rota principal equivalente.  
Regra aplicada: auditoria somente documental; sem refatorar, sem alterar layout, sem alterar API, sem criar componentes e sem inventar dados.

## Resumo executivo

As páginas auditadas já estão majoritariamente orientadas ao padrão operacional do NexoGestão e usam componentes compartilhados relevantes (`AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, badges, tabelas, timeline e camada de comando operacional). O principal problema não é ausência total de sistema visual, mas excesso de lógica, hierarquia e composição dentro dos arquivos de página. `PeoplePage`, `TimelinePage`, `CalendarPage` e `ExecutiveDashboard` concentram muitos helpers, mapeamentos, inferências e blocos de UI no mesmo arquivo, o que aumenta risco de regressão antes de qualquer ajuste visual.

A identidade operacional do Nexo aparece com força em Dashboard, Timeline, Pessoas e Calendário, porém ainda há lacunas importantes de contrato de dados: responsáveis, prazos, conflitos, risco de acesso, método de pagamento, renovação, disponibilidade real, permissões e desempenho individual nem sempre vêm de APIs dedicadas. Onde o contrato não entrega o dado, as páginas geralmente usam fallback honesto ou calculam sinais no front a partir de listas existentes; isso evita inventar dados, mas deixa a experiência dependente de inferências frágeis.

Não foram encontrados padrões explícitos de `bg-black`, `bg-zinc-900`, `bg-slate-900` ou `text-white` soltos nas páginas auditadas. Ainda assim, há duplicação estrutural e estilos próprios por composição manual de cards, grids, pills e painéis operacionais, principalmente nas páginas grandes.

## Tabela geral das páginas auditadas

| Página | Nota | Problema principal | O que falta | Prioridade |
|-------|------|--------------------|-------------|------------|
| `/people` | 7.5/10 | Arquivo muito grande e página mistura cadastro, disponibilidade, carga, riscos e timeline em composição própria extensa. | Contrato mais direto de carga/atraso por pessoa, disponibilidade consolidada, intervenção recomendada e desempenho operacional. | Alta |
| `/profile` | 7.0/10 | Perfil individual ainda depende de agregações transversais no front e não tem contrato dedicado para central individual completa. | Permissões detalhadas, preferências editáveis, desempenho individual real, carga atribuída e trilha do usuário. | Alta |
| `/timeline` | 8.0/10 | Muito madura como evidência, mas o arquivo é grande e concentra humanização, severidade, filtros, prova e ações. | Contrato mais rico de autoria, entidade, cadeia causal, anexos/evidências e exportação/auditoria oficial. | Média-alta |
| `/billing` | 6.5/10 | Tela cobre plano/status/limites, mas risco de acesso, método de pagamento, renovação e histórico ainda parecem insuficientes. | Método de pagamento, próxima cobrança/renovação confiável, invoices, falhas, grace period, risco de bloqueio e rota `/plans` explícita se aplicável. | Média-alta |
| `/calendar` | 7.5/10 | Boa leitura do tempo, mas conflitos, vazios e sobrecarga são majoritariamente inferidos no front. | API de conflitos, janelas vazias, capacidade por responsável, indisponibilidade e ações rápidas contextualizadas. | Média |
| `/dashboard` | 8.5/10 | É o centro mais alinhado à missão, mas tem alta complexidade local e depende de muitos fallbacks quando contratos não retornam campos. | Contrato canônico de decisão/NBA, gargalos, responsáveis, impacto financeiro e próximos passos executáveis. | Revisão final |

## Rotas e arquivos principais

As rotas são registradas em `apps/web/client/src/App.tsx`: `/dashboard`, `/people`, `/calendar`, `/profile`, `/timeline`, `/billing` e também `/dashboard/operations` apontam para páginas protegidas/lazy correspondentes.

| Rota | Arquivo principal | Observação |
|---|---|---|
| `/people` | `apps/web/client/src/pages/PeoplePage.tsx` | Página de pessoas/equipe. |
| `/profile` | `apps/web/client/src/pages/ProfilePage.tsx` | Central individual do usuário. |
| `/timeline` | `apps/web/client/src/pages/TimelinePage.tsx` | Prova operacional oficial. |
| `/billing` | `apps/web/client/src/pages/BillingPage.tsx` | Plano/cobrança SaaS. Não foi identificada página principal separada para `/plans` no escopo auditado. |
| `/calendar` | `apps/web/client/src/pages/CalendarPage.tsx` | Calendário operacional com FullCalendar. |
| `/dashboard` e equivalente `/dashboard/operations` | `apps/web/client/src/pages/ExecutiveDashboard.tsx` | Centro de decisão operacional. |

## Componentes reutilizáveis encontrados

| Componente | People | Profile | Timeline | Billing | Calendar | Dashboard |
|---|---:|---:|---:|---:|---:|---:|
| `AppPageShell` | Sim | Sim | Sim | Sim | Sim | Sim |
| `AppPageHeader` | Não identificado; usa headers operacionais alternativos | Não identificado | Não identificado | Não identificado | Não identificado | Não identificado |
| `AppOperationalHeader` | Não direto; composição operacional própria | Sim | Sim | Não | Sim | Sim |
| `AppSectionCard` | Sim | Não | Sim | Sim | Sim | Não |
| `AppSectionBlock` | Sim | Sim | Sim | Não | Sim | Sim |
| `AppDataTable` | Não | Sim | Não | Sim | Não | Não |
| `AppStatusBadge` | Via sistemas internos/operacionais | Sim | Sim | Sim | Sim | Sim |
| `AppTimeline` | Não | Não | Sim | Sim | Não | Não; usa `NexoEvidenceTimeline` |
| `BaseModal`/`FormModal`/`ConfirmModal` | Modais próprios de pessoa | Não | Não | `BaseModal` | `CreateAppointmentModal` | Não |
| Componentes operacionais próprios do Nexo | Sim | Parcial | Sim | Parcial | Sim | Sim |

## 1. `/people`

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/PeoplePage.tsx`.
- Componentes importados: `CreatePersonModal`, `EditPersonModal`, `NextBestActionCard`, `AppInput`, `AppOperationalStatusBadge`, `AppPageShell`, `AppSectionCard`, `AppStatCard`, `Button`, componentes operacionais (`OperationalActionPanel`, `OperationalFlow`, `OperationalHealthRing`, `OperationalInnerCard`, `OperationalKpiCard`, `OperationalPanel`, `OperationalPriorityItem`, `OperationalSectionGrid`, `OperationalTimelineItem`, `OperationalWorkspace`), `AppFiltersBar`, `AppPageEmptyState`, `AppPageErrorState`, `AppPageLoadingState`, `AppSectionBlock`.
- Hooks usados: `useMemo`, `useState`, `useLocation`, `useAuth`, `trpc.useUtils`, queries e mutations do tRPC.
- Serviços/API usados: `people.operationalSummary`, `people.listAvailabilityExceptions`, `people.createAvailabilityException`, `people.deleteAvailabilityException`, `analytics.assigneeWarningSummary`, `nexo.timeline.listByOrg`.
- Estados locais relevantes: filtros/abas, busca, pessoa selecionada, abertura de modais, controle de disponibilidade/exceções e estados de criação/edição/exclusão.
- Dados reais disponíveis: pessoas, resumo operacional, exceções de disponibilidade, alertas por responsável, eventos recentes da timeline.
- Dados mockados/fallback: não há mock explícito como fonte principal; há fallback e derivação no front para labels, severidade, leitura de carga, timeline e mensagens quando dados completos não chegam.

### Estrutura visual atual

1. Shell da página.
2. Cabeçalho/hero operacional com leitura de equipe.
3. Ações principais: criar pessoa, editar pessoa, gerenciar disponibilidade/intervenção conforme contexto.
4. KPIs/cards de saúde operacional e equipe.
5. Filtros/abas/busca.
6. Blocos de prioridades/carga/sobrecarga/risco.
7. Lista ou tabela de pessoas.
8. Painéis de fluxo e próxima melhor ação.
9. Timeline/prova recente relacionada à operação de pessoas.
10. Modais de criação/edição e disponibilidade.
11. Loading/error/empty states via componentes internos.

### Problemas de hierarquia

- A página tenta ser ao mesmo tempo cadastro, escala, cockpit de carga, disponibilidade e prova operacional.
- Há muitos blocos com sinais parecidos: saúde, carga, atrasos, prioridades e timeline podem competir pela atenção.
- CTAs de cadastro e intervenção operacional podem ficar no mesmo nível visual, embora tenham pesos diferentes.
- A missão de “quem está sobrecarregado, atrasado e onde intervir” existe, mas ainda divide espaço com estrutura de CRUD.

### Lacunas de produto

- Falta contrato consolidado por pessoa com: carga atual, atrasos sob responsabilidade, disponibilidade real, bloqueios, próximos compromissos e intervenção recomendada.
- Falta separar claramente “gestão cadastral” de “intervenção operacional agora”.
- Falta dado de capacidade/limite por pessoa para definir sobrecarga sem inferir.

### Problemas visuais e técnicos

- Não foram encontrados `bg-black`, `bg-zinc-900`, `bg-slate-900` ou `text-white` soltos.
- Arquivo com aproximadamente 1751 linhas, indicando acoplamento alto entre helpers, contrato, composição e UI.
- Há muita estrutura própria com componentes operacionais de baixo nível; recomendável extrair depois, mas não nesta etapa.

### Dados e contratos

- API: `people.operationalSummary`, disponibilidade/exceções, analytics por responsável e timeline.
- Inferido no front: agrupamentos, severidade, labels, estado de carga e narrativa de intervenção.
- Faltam: capacidade oficial, SLA/atraso por pessoa, distribuição por horário, disponibilidade consolidada e motivo operacional do gargalo.
- Sem inventar dados: quando a API não entrega detalhes, a página tende a usar fallback textual/estado vazio em vez de afirmar fatos inexistentes.

## 2. `/profile`

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/ProfilePage.tsx`.
- Componentes importados: `Button`, `PageWrapper`, `AppDataTable`, `AppFiltersBar`, `AppKpiRow`, `AppOperationalHeader`, `AppPageShell`, `AppSectionBlock`, `AppStatusBadge`.
- Hooks usados: `useMemo`, `useLocation`, `useOperationalMemoryState`, `useAuth` e queries tRPC.
- Serviços/API usados: `nexo.me`, `nexo.appointments.list`, `nexo.serviceOrders.list`, `finance.charges.list`, `nexo.timeline.listByOrg`.
- Estados locais relevantes: memória operacional/estado de filtros via `useOperationalMemoryState`; demais leituras são derivadas por memoização.
- Dados reais disponíveis: usuário/pessoa atual, agendamentos, O.S., cobranças e timeline da organização.
- Dados mockados/fallback: fallback para campos ausentes do usuário, disponibilidade/status e textos genéricos quando não há atribuição ou dado individual.

### Estrutura visual atual

1. Shell/wrapper.
2. Header operacional do perfil.
3. KPIs individuais derivados.
4. Filtros/visões do perfil.
5. Seções de execução atribuída: agenda, O.S., cobranças e timeline.
6. Tabelas/listas com `AppDataTable`.
7. Badges de status.
8. Empty/loading/error states conforme queries.

### Problemas de hierarquia

- O perfil ainda parece um painel agregado de coisas relacionadas ao usuário, não uma central individual completa.
- Permissões e preferências não aparecem com peso suficiente frente a execução operacional.
- Desempenho individual depende de dados espalhados e filtrados no front, o que pode esconder informação importante.
- Poucas ações “Faça agora” individualizadas; a página tende a diagnosticar mais do que executar.

### Lacunas de produto

- Missão esperada: central individual de execução, desempenho, permissões e preferências.
- Faltam permissões efetivas, histórico de alterações do usuário, preferências editáveis, disponibilidade, metas/SLAs individuais e pendências atribuídas via contrato dedicado.

### Problemas visuais e técnicos

- Não foram encontrados fundos escuros hardcoded nem `text-white` solto.
- Usa bem `AppOperationalHeader`, `AppKpiRow`, `AppDataTable`, `AppSectionBlock`, mas ainda carrega `PageWrapper` junto de `AppPageShell`, o que merece revisão posterior de composição.

### Dados e contratos

- API: `nexo.me`, listas de agenda/O.S./financeiro/timeline.
- Inferido no front: o que pertence ao usuário, métricas individuais, estado operacional e resumo de atividade.
- Faltam: endpoint de perfil operacional individual, permissões resolvidas, preferências, auditoria própria e performance real.
- Sem inventar dados: quando não há dado individual, a página precisa declarar ausência em vez de presumir produtividade ou permissão.

## 3. `/timeline`

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/TimelinePage.tsx`.
- Componentes importados: ícones `lucide-react`, `AppFiltersBar`, `AppOperationalHeader`, `AppPagination`, empty/error/loading/skeleton states, `AppPriorityBadge`, `AppSectionBlock`, `AppStatusBadge`, `AppPageShell`, `AppSectionCard`, `AppSelect`, `AppStatCard`, `AppTimeline`, `AppTimelineItem`, `Button`, e componentes da Operational Command Layer (`EntityTimelineCard`, `NextBestActionCard`, `OperationalFlowCard`, `OperationalRiskCard`, `OperationalStateCard`).
- Hooks usados: `useEffect`, `useMemo`, `useState`, `useLocation`, `useAuth`, `usePageDiagnostics`, `useRenderWatchdog`, query tRPC.
- Serviços/API usados: `nexo.timeline.listByOrg`.
- Estados locais relevantes: filtros, paginação, seleção de severidade/entidade/ação, diagnóstico de página.
- Dados reais disponíveis: eventos de timeline da organização, ação, severidade, datas e vínculos quando retornados.
- Dados mockados/fallback: humanização de ações e resumos operacionais derivados; fallback textual quando payload/entidade/autoria não vêm completos.

### Estrutura visual atual

1. Shell.
2. Header operacional da Timeline.
3. Estado operacional/evidência principal.
4. Filtros de tipo, severidade, entidade e período.
5. Cards/KPIs de prova, risco e fluxo.
6. Lista/timeline oficial com paginação.
7. Ações de navegação/investigação/exportação quando aplicável.
8. Empty/loading/error/skeleton states.

### Problemas de hierarquia

- A página está bem alinhada à missão de prova oficial, mas concentra muitos papéis: evidência, risco, fluxo, exportação, investigação e log.
- Alguns cards de risco/evidência podem repetir a mesma mensagem se o contrato vier pobre.
- A ação seguinte nem sempre é tão explícita quanto a prova apresentada.

### Lacunas de produto

- Missão esperada: centro de evidências e prova oficial, não apenas log.
- Faltam contratos para cadeia causal entre eventos, autor resolvido, antes/depois de alterações, anexos/evidências, hash/imutabilidade/exportação formal e trilha por entidade com contexto completo.

### Problemas visuais e técnicos

- Não foram encontrados fundos escuros hardcoded nem `text-white` solto.
- Arquivo com aproximadamente 2408 linhas; alto risco de regressão ao mexer em visual sem decomposição prévia.
- Boa adoção de `AppTimeline`, `AppOperationalHeader`, `AppSectionBlock`, badges e estados padrão.

### Dados e contratos

- API: `nexo.timeline.listByOrg`.
- Inferido no front: labels humanizados, severidade visual, tipo de entidade, importância operacional e próxima ação.
- Faltam: campos oficiais de evidência, autoria detalhada, entidade normalizada, anexos, correlação entre eventos e exportação auditável.
- Sem inventar dados: o texto deve continuar explícito quando só existe evento básico ou payload limitado.

## 4. `/billing` ou `/plans`

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/BillingPage.tsx`.
- Componentes importados: `toast`, `Button`, `AppDataTable`, `AppPageShell`, `AppSectionCard`, `AppStatCard`, `AppStatusBadge`, `AppTimeline`, `AppTimelineItem`, `BaseModal`, `PageWrapper`.
- Hooks usados: `useMemo`, `useState`, queries/mutations tRPC.
- Serviços/API usados: `billing.status`, `billing.limits`, `billing.checkout`, `billing.cancel`, `integrations.readiness`.
- Estados locais relevantes: plano selecionado, modal de cancelamento/checkout/cancelamento, estado de mutação.
- Dados reais disponíveis: status/assinatura, limites, readiness de integrações, eventos/histórico se retornados pelo status.
- Dados mockados/fallback: planos e mensagens comerciais podem ser estáticos no front; histórico/risco aparece limitado quando a API não retorna detalhe.

### Estrutura visual atual

1. Shell/wrapper.
2. Header/resumo de assinatura.
3. Cards de plano/status/limites.
4. Planos/opções de upgrade ou checkout.
5. Histórico em tabela/timeline quando disponível.
6. Modal de cancelamento/ação administrativa.
7. Estados de loading/error/empty e toasts de mutação.

### Problemas de hierarquia

- A página ainda tende a parecer tela SaaS de plano/checkout, não controle operacional de risco de acesso.
- Status, renovação, falha de pagamento e método de pagamento deveriam ser mais prioritários que comparação comercial de planos.
- CTA de upgrade/cancelamento pode competir com ação urgente de resolver cobrança, se houver risco.

### Lacunas de produto

- Missão esperada: plano atual, cobrança, renovação, método de pagamento, histórico e risco de acesso.
- Faltam método de pagamento resolvido, próxima cobrança/renovação, invoices, falhas recentes, grace period, bloqueio iminente, owner/admin responsável e rota `/plans` dedicada se a estratégia exigir separação entre billing operacional e catálogo.

### Problemas visuais e técnicos

- Não foram encontrados fundos escuros hardcoded nem `text-white` solto.
- Mistura `AppPageShell` com `PageWrapper`, `AppSectionCard`, `AppDataTable`, `AppTimeline` e `BaseModal`; revisar depois para padronizar shell e tabela.
- Uso de planos estáticos no front é aceitável para catálogo, mas não deve substituir contrato real da assinatura.

### Dados e contratos

- API: `billing.status`, `billing.limits`, `integrations.readiness`, mutations de checkout/cancelamento.
- Inferido no front: risco/urgência a partir de status, limites e readiness.
- Faltam: payment method, invoices, próximo vencimento, renovação, provider status detalhado, bloqueio/grace period e eventos financeiros completos.
- Sem inventar dados: se status não contém histórico ou método, a UI deve mostrar ausência declarada, não dado genérico.

## 5. `/calendar`

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/CalendarPage.tsx`.
- Componentes importados: FullCalendar (`dayGrid`, `timeGrid`, `interaction`), ícones, `Button`, `AppSectionCard`, `AppStatCard`, `CreateAppointmentModal`, componentes da Operational Command Layer, `AppOperationalHeader`, `AppFiltersBar`, empty/error/loading states, `AppPageShell`, `AppSectionBlock`, `AppPriorityBadge`, `AppStatusBadge`.
- Hooks usados: `useMemo`, `useState`, `useLocation`, `useAuth`, `useOperationalMemoryState`, queries tRPC.
- Serviços/API usados: `nexo.appointments.list`, `nexo.customers.list`, `people.assignees`.
- Estados locais relevantes: filtro por responsável/status/período, modo de calendário, evento selecionado, modal de criação, memória operacional.
- Dados reais disponíveis: agendamentos, clientes e responsáveis.
- Dados mockados/fallback: conflitos, vazios, sobrecarga e disponibilidade são derivados quando possível; não há contrato dedicado de capacidade temporal.

### Estrutura visual atual

1. Shell.
2. Header operacional do calendário.
3. Ações rápidas: novo agendamento, atualizar/navegar.
4. KPIs/cards de agenda.
5. Filtros.
6. Camada de decisão/risco/fluxo operacional.
7. FullCalendar com eventos.
8. Listas/empty states de agenda.
9. Modal de criação de agendamento.
10. Loading/error states.

### Problemas de hierarquia

- A grade do calendário compete com a leitura operacional de tempo; precisa manter a decisão acima e a grade como ferramenta.
- Conflitos, vazios e sobrecarga aparecem mais como leitura inferida do que como fonte oficial.
- Ações rápidas existem, mas podem ser mais contextuais: resolver conflito, redistribuir responsável, preencher janela vazia.

### Lacunas de produto

- Missão esperada: distribuição do tempo, conflitos, vazios, sobrecarga e ações rápidas.
- Faltam endpoint de conflitos, disponibilidade por pessoa, capacidade diária, janelas livres, O.S. impactadas e recomendações de remanejamento.

### Problemas visuais e técnicos

- Não foram encontrados fundos escuros hardcoded nem `text-white` solto.
- FullCalendar naturalmente traz superfície própria; exige cuidado para não divergir dos tokens internos.
- Página ainda usa `AppSectionCard`/`AppStatCard` junto de sistema interno e Operational Command Layer; refatoração deve padronizar composição depois.

### Dados e contratos

- API: agendamentos, clientes e assignees.
- Inferido no front: conflito, carga por dia/responsável, status operacional, gargalos de agenda.
- Faltam: conflito oficial, disponibilidade, capacidade, indisponibilidades, duração real por serviço e sugestão de ação.
- Sem inventar dados: quando não houver conflito oficial, comunicar como “sinal calculado pela agenda carregada”, não como verdade auditável.

## 6. `/dashboard` ou rota principal equivalente

### Arquivo principal, imports, hooks e serviços

- Arquivo principal: `apps/web/client/src/pages/ExecutiveDashboard.tsx`.
- Componentes importados: ícones, `useQuery` do React Query, `Button`, `AppContextChip`, `AppOperationalHeader`, empty/error/loading states, `AppPageShell`, `AppSectionBlock`, `AppPriorityBadge`, `AppStatusBadge`, `NexoEvidenceTimeline`, `NexoPriorityPanel`, `NexoOperationalPipeline`, `NexoGovernanceDecisionCard`, `NexoExecutiveMetric`, helpers de execução WhatsApp.
- Hooks usados: `useMemo`, `useQuery`, `useLocation`, `useAuth`, `useRenderWatchdog`, queries tRPC.
- Serviços/API usados: `dashboard.kpis`, `dashboard.alerts`, `nexo.timeline.listByOrg`, `nexo.whatsapp.listPendingApprovals`, além de React Query para health/readiness ou chamada auxiliar conforme implementação.
- Estados locais relevantes: predominantemente derivados por memoização; navegação via `useLocation`.
- Dados reais disponíveis: KPIs, alertas, fila operacional, timeline, aprovações WhatsApp, status/apresentação.
- Dados mockados/fallback: várias leituras são fallback a partir de alertas/KPIs quando o BFF não retorna contrato canônico de decisão.

### Estrutura visual atual

1. Shell.
2. Header operacional.
3. Estado/decisão executiva imediata.
4. Próxima melhor ação/prioridades.
5. Métricas executivas compactas.
6. Pipeline operacional.
7. Evidência/timeline compacta.
8. Governança/risco/incidentes.
9. CTAs para módulos donos.
10. Loading/error/empty states.

### Problemas de hierarquia

- A página está mais alinhada à missão de cockpit do que as demais, mas o arquivo é grande e concentra regras de negócio de apresentação.
- Pode haver sobreposição entre prioridade, incidente, risco, gargalo e evidência quando todos são derivados de fontes parecidas.
- CTAs devem permanecer roteadores para módulo dono, não ações que prometem resolver sem contexto.

### Lacunas de produto

- Missão esperada: centro de decisão, atenção imediata, próxima melhor ação, fluxo e gargalos.
- Faltam contrato canônico de NBA, gargalo oficial, responsável, prazo, impacto financeiro, risco operacional unificado e cadeia causal com timeline.

### Problemas visuais e técnicos

- Não foram encontrados fundos escuros hardcoded nem `text-white` solto.
- Arquivo com aproximadamente 1774 linhas; mexidas visuais têm risco alto por causa de helpers locais e múltiplas fontes de dados.
- Usa componentes Nexo específicos fortes (`NexoEvidenceTimeline`, `NexoPriorityPanel`, `NexoOperationalPipeline`, `NexoGovernanceDecisionCard`, `NexoExecutiveMetric`).

### Dados e contratos

- API: `dashboard.kpis`, `dashboard.alerts`, timeline e aprovações WhatsApp.
- Inferido no front: estado operacional, prioridade, gargalo, impacto, contexto de CTA e narrativa executiva.
- Faltam: objeto único de decisão operacional, responsável/prazo por incidente, impacto financeiro confiável, correlação com entidades e ações recomendadas oficiais.
- Sem inventar dados: manter fallbacks discretos e indicar quando o dado vem de contagem/status disponível.

## Problemas transversais de hierarquia

1. **Arquivos de página grandes demais:** Timeline, People, Dashboard e Calendar estão acima do ideal para refatoração visual segura.
2. **Camadas misturadas:** páginas contêm contrato, normalização, inferência de negócio, mapeamento visual e renderização.
3. **Duplicação de padrões operacionais:** prioridade, risco, timeline, KPIs, fluxo e empty states aparecem em várias páginas com composições próprias.
4. **CTAs com pesos diferentes no mesmo nível:** cadastro/edição e intervenção operacional competem em People, Billing e Calendar.
5. **Falta de contratos dedicados:** muitas respostas operacionais são montadas no front a partir de listas genéricas.
6. **Risco de relatório passivo:** Profile e Billing ainda precisam de ações “faça agora” mais claras quando houver contexto real.

## Problemas visuais e técnicos transversais

- Busca textual nas páginas auditadas não encontrou `bg-black`, `bg-zinc-900`, `bg-slate-900` nem `text-white` soltos.
- Há composição duplicada de cards, painéis, grids e badges em páginas grandes.
- Mistura de sistemas (`app-system`, `internal-page-system`, `operating-system/Wrappers`, `design-system` e `ui/button`) deve ser racionalizada depois, sem mudar comportamento agora.
- FullCalendar e modais próprios são pontos de atenção para light/dark e tokens.
- Textos técnicos podem aparecer quando payload/ação da timeline ou status de billing não são humanizados por contrato.

## Componentes que deveriam ser criados ou usados em etapa posterior

Sem criar nesta auditoria, recomenda-se avaliar posteriormente:

- `PeopleOperationalWorkloadPanel`: carga, atraso, disponibilidade e intervenção por pessoa.
- `ProfileExecutionCenter`: visão individual de execução, permissões e preferências.
- `OfficialEvidenceTimelinePanel`: timeline oficial com autoria, entidade, cadeia causal e exportação.
- `BillingAccessRiskPanel`: risco de acesso, cobrança, renovação, método de pagamento e grace period.
- `CalendarCapacityPanel`: conflitos, vazios, capacidade e redistribuição.
- `DashboardDecisionContractAdapter`: adaptador fino para consumir contrato canônico de decisão sem espalhar fallback pelo componente.

## Riscos de regressão

| Página | Riscos principais |
|---|---|
| `/people` | Quebrar criação/edição, disponibilidade, filtros, derivação de carga ou leitura de timeline. |
| `/profile` | Filtrar errado dados do usuário, expor permissões incorretas ou duplicar shell/wrapper. |
| `/timeline` | Alterar significado auditável, perder paginação/filtros, humanizar errado ações ou esconder severidade. |
| `/billing` | Disparar checkout/cancelamento errado, mostrar status de assinatura incorreto ou prometer método/histórico inexistente. |
| `/calendar` | Quebrar FullCalendar, seleção de evento, modal de criação ou cálculo de conflito/carga. |
| `/dashboard` | Mudar prioridade/NBA, gargalo, CTAs de roteamento ou fallback “sem inventar dados”. |

## Resultado dos comandos solicitados

Os comandos foram executados após a criação deste relatório.

```bash
pnpm -r typecheck
```

Resultado: **sucesso**.

```bash
pnpm -s build
```

Resultado: **sucesso**.

## Plano de refatoração recomendado

1. **Pessoas**
   - Primeiro separar leitura operacional de cadastro.
   - Introduzir contrato/adapter para carga, atraso, disponibilidade e intervenção.
   - Só depois reorganizar visualmente cards e CTAs.
2. **Perfil**
   - Criar contrato de perfil operacional individual.
   - Separar execução, desempenho, permissões e preferências.
   - Reforçar ações “faça agora” somente com dados reais.
3. **Timeline**
   - Isolar humanização e mapeamento de severidade em helpers testáveis.
   - Fortalecer contrato de evidência oficial antes de mudar visual.
   - Preservar filtros, paginação e ausência de dados inventados.
4. **Billing/Planos**
   - Diferenciar catálogo/planos de controle operacional de assinatura.
   - Priorizar risco de acesso, renovação, método e histórico.
   - Só exibir dados de cobrança quando vierem do contrato.
5. **Calendário**
   - Separar grade visual de camada de decisão/capacidade.
   - Criar contrato para conflitos, vazios e sobrecarga.
   - Transformar ações rápidas em intervenções contextuais reais.
6. **Dashboard revisão final**
   - Após as páginas donas estarem melhores, revisar o Dashboard como orquestrador.
   - Reduzir fallback local com contrato canônico de decisão.
   - Garantir que CTAs encaminham para módulos donos sem duplicar execução.

# Auditoria completa do front interno — NexoGestão

Data: 2026-04-12
Escopo: páginas internas + layout raiz + componentes compartilhados + histórico de regressão local.

## 1) Mapa real das páginas internas e papel esperado no fluxo operacional

Fluxo operacional de referência do produto:
Cliente -> Agendamento -> Ordem de Serviço -> Execução -> Cobrança -> Pagamento -> Timeline -> Risco -> Governança.

Rotas internas mapeadas no app:
- `/executive-dashboard` (Dashboard)
- `/customers` (Clientes)
- `/appointments` (Agendamentos)
- `/service-orders` (Ordens de Serviço)
- `/whatsapp` (WhatsApp)
- `/finances` (Financeiro)
- `/billing` (Billing)
- `/calendar` (Calendário)
- `/timeline` (Timeline)
- `/governance` (Governança/Risco)
- `/settings` (Configurações)
- `/profile` (Perfil)
- `/people` (Pessoas, menu administrativo)

## 2) Diagnóstico geral (estado atual x estado esperado)

### Estado atual observado

1. Existe **injeção global de bloco operacional** no layout (`GlobalActionEngine`) para praticamente todas as páginas autenticadas.
2. Existe **barra global de execução** (`ExecutionGlobalBar`) também injetada acima do conteúdo de página.
3. Páginas operacionais estão com o mesmo padrão visual de topo (`OperationalTopCard + AppKpiRow + AppSectionBlock`), reduzindo diferenciação funcional entre módulos.
4. `PageWrapper` recebe `title`, mas ignora esse `title` no `OperationalHeader`.
5. `OperationalHeader` atual remove o `<h1>` e deixa apenas descrição, enfraquecendo hierarquia visual por página.
6. Dashboard ficou com engine local **e** engine global (duplicação funcional de “próximas ações”).
7. Settings e Profile perderam contexto operacional real e ficaram com conteúdo genérico/hardcoded.

### Estado esperado (de acordo com arquitetura operacional)

- Dashboard como centro decisório (cockpit) com blocos fortes de priorização/execução.
- Páginas operacionais com conteúdo contextual do módulo (não clone de dashboard).
- Blocos globais mínimos no layout (navegação, contexto leve, notificações), sem empurrar conteúdo específico de negócio para todas as telas.
- Header por página com título e descrição contextuais preservados.

## 3) Regressões principais identificadas (com ponto de início)

## Regressão A — “Engine de execução” tornou-se global no layout

**Ponto de início identificado:** commit `5805a0c` (`feat: tornar engine de ações global e orientada à execução`).

Impacto:
- `GlobalActionEngine` passou a renderizar dentro do `MainLayout` para todas as páginas autenticadas.
- O dashboard já possui `AppNextActions` próprio; com a engine global, fica duplicado no topo/miolo.
- Páginas operacionais recebem um bloco de decisão típico do dashboard, quebrando separação “cockpit x tela operacional”.

## Regressão B — Barra global de execução adicionada para todas as páginas

**Ponto de início identificado:** commit `6b833e9` (`feat(web): add global execution visibility and controls`).

Impacto:
- `ExecutionGlobalBar` aparece acima de todo conteúdo interno.
- Mais uma camada global de decisão/controle, somando com `GlobalActionEngine` e reduzindo foco da tela específica.

## Regressão C — Quebra de hierarquia do header interno (perda de título visível por página)

**Ponto de início identificado:** commit `00d7f85` (`Refina header interno e contraste no dark mode`).

Impacto:
- `PageWrapper` deixou de encaminhar `title` ao `OperationalHeader`.
- `OperationalHeader` removeu estrutura com `<h1>` e manteve apenas descrição.
- Páginas que dependem de `PageWrapper` perderam identidade de cabeçalho interno (ficando dependentes da topbar global).

## Regressão D — Simplificação agressiva com perda de conteúdo real de páginas

**Ponto de início identificado:** commit `faeba1b` (`feat(web): unify internal page content pattern across core modules`).

Impacto:
- Alto volume de remoção (mais de 8 mil linhas) nas páginas internas centrais.
- Diversas telas ficaram padronizadas de forma excessiva, com perda de composição específica de módulo.
- `SettingsPage` e `ProfilePage` passaram a exibir conteúdo mais genérico/hardcoded em vez de preservar contrato funcional anterior.

## 4) Componentes/blocos aparecendo globalmente e que não deveriam

### Indevidos como “globais default”

1. `GlobalActionEngine` no `MainLayout`.
2. `ExecutionGlobalBar` no `MainLayout`.

Esses dois blocos são de execução/decisão operacional e deveriam ser:
- exclusivos do Dashboard, **ou**
- condicionais por rota e papel da página, com escopo explícito.

### Deveria permanecer global

- Sidebar
- Topbar
- Busca global
- Notificações
- Overlay crítico

## 5) Análise página por página

## 5.1 Dashboard (`/executive-dashboard`)
- Objetivo funcional: cockpit de decisão operacional.
- Papel no fluxo: orquestra prioridades do ciclo completo.
- Deve ter: KPIs críticos, gargalos, próxima ação executável, estado operacional e risco.
- Não deve ter: cards aleatórios sem ação.
- Estado atual: bom núcleo de decisão e ações; porém há duplicação por engine global no layout.
- Problemas: sobreposição de camadas “global + local” para próximas ações.
- Recuperar: manter engine forte no dashboard, remover duplicidade global.
- Estrutura ideal final: dashboard concentra “decisão”, layout não injeta outro engine acima dele.

## 5.2 Clientes (`/customers`)
- Objetivo funcional: relacionamento, estado da base e próxima ação por cliente.
- Papel no fluxo: entrada e contexto comercial para agendamento/OS/cobrança.
- Deve ter: base de clientes, risco por cliente, atalhos contextuais.
- Não deve ter: engine global de execução genérica no topo.
- Estado atual: funcional, com tabela e ações contextuais.
- Problemas: depende de header enfraquecido (`PageWrapper` sem título no header interno) + recebe engine global indevido.
- Recuperar: título interno explícito e contexto de cliente no topo.
- Estrutura ideal final: topo do módulo focado em relacionamento + tabela operacional + ações por linha.

## 5.3 Agendamentos (`/appointments`)
- Objetivo funcional: operação de agenda, confirmação e status.
- Papel no fluxo: ponte entre cliente e execução.
- Deve ter: fila com status, horário, cliente, confirmação e criação rápida.
- Não deve ter: cockpit global de execução no topo.
- Estado atual: funcional e orientada a dados.
- Problemas: mesma moldura visual excessiva de outras páginas + bloco global no layout.
- Recuperar: diferenciação de identidade da página (agenda) com toolbar/filtros mais próprios.
- Estrutura ideal final: foco em calendário/fila de agenda e pendências de confirmação.

## 5.4 Ordens de Serviço (`/service-orders`)
- Objetivo funcional: execução operacional (pipeline de O.S.).
- Papel no fluxo: núcleo de execução antes de cobrança.
- Deve ter: status forte, progresso, prioridades, ação por O.S.
- Não deve ter: topo genérico de dashboard repetido.
- Estado atual: possui pipeline e ações úteis.
- Problemas: padronização visual excessiva e dependência de header interno sem título.
- Recuperar: reforçar linguagem de execução (estágio, SLA, bloqueios, dono).
- Estrutura ideal final: foco em execução e transição para cobrança/WhatsApp.

## 5.5 Financeiro (`/finances`)
- Objetivo funcional: cobrança/pagamento/atraso com ação rápida.
- Papel no fluxo: monetização operacional.
- Deve ter: carteira, vencimento, pagamento, priorização de cobrança.
- Não deve ter: dashboard duplicado.
- Estado atual: bem conectado ao backend e com ações reais.
- Problemas: contaminação por engine global + topo visual muito parecido com outras páginas.
- Recuperar: manter dados reais e diferenciar visualmente de módulos não financeiros.
- Estrutura ideal final: visão financeira acionável sem poluição de blocos globais.

## 5.6 WhatsApp (`/whatsapp`)
- Objetivo funcional: comunicação operacional contextual.
- Papel no fluxo: execução de contato ligada a cobrança/O.S./agenda.
- Deve ter: histórico por cliente, status de envio, ações de comunicação contextual.
- Não deve ter: experiência de chat genérico sem vínculo operacional.
- Estado atual: tem envio real, histórico e automações sugeridas.
- Problemas: soma de “automações da própria página” + engine global do layout pode duplicar intenção de ação.
- Recuperar: manter automações contextuais do canal e retirar engine genérico global da tela.
- Estrutura ideal final: comunicação como módulo operacional especializado.

## 5.7 Billing (`/billing`)
- Objetivo funcional: plano, limites e saúde comercial da conta.
- Papel no fluxo: governança comercial/monetização da operação.
- Deve ter: status de assinatura, limites, bloqueios e upgrade com contexto.
- Não deve ter: virar ERP denso nem dashboard clone.
- Estado atual: possui camada comercial robusta e contextual.
- Problemas: mistura padrões (`PageWrapper` + `SmartPage`) cria linguagem híbrida; recebe blocos globais que roubam foco.
- Recuperar: manter conteúdo comercial existente e limpar interferência global.
- Estrutura ideal final: módulo comercial claro, separado de cockpit operacional.

## 5.8 Calendário (`/calendar`)
- Objetivo funcional: visão temporal e remanejamento operacional.
- Papel no fluxo: suporte de capacidade e distribuição de execução.
- Deve ter: calendário, detalhe de evento, ações de encaminhamento.
- Não deve ter: blocos genéricos de dashboard no topo.
- Estado atual: usa padrão próprio (`PageHero/PageShell/SurfaceSection`) diferente das demais páginas.
- Problemas: inconsistência arquitetural (não acompanha mesmo shell de páginas internas).
- Recuperar: preservar função temporal, alinhar hierarquia visual com sistema interno sem perder a natureza de calendário.
- Estrutura ideal final: módulo temporal com identidade própria, mas tokens e header consistentes com o app.

## 5.9 Timeline (`/timeline`)
- Objetivo funcional: feed auditável vertical.
- Papel no fluxo: trilha de auditoria e histórico.
- Deve ter: lista vertical consistente, filtros por evento/entidade/ator.
- Não deve ter: blocos genéricos sem relação com histórico.
- Estado atual: existe filtro e feed; base funcional razoável.
- Problemas: header/hierarquia enfraquecidos e visual de topo muito similar às demais páginas.
- Recuperar: reforçar semântica de auditoria (tipo evento, entidade, ator, severidade, data).
- Estrutura ideal final: feed de auditoria dominante na tela.

## 5.10 Governança/Risco (`/governance`)
- Objetivo funcional: supervisão de risco e contenção.
- Papel no fluxo: controle institucional e risco operacional.
- Deve ter: score, séries, entidades em risco, recomendações acionáveis.
- Não deve ter: virar cópia de dashboard geral.
- Estado atual: dados de risco e recomendações existem.
- Problemas: excesso de padronização visual com telas operacionais transacionais.
- Recuperar: destacar natureza de supervisão/controle e política.
- Estrutura ideal final: módulo de supervisão com linguagem própria (risco, política, governança).

## 5.11 Configurações (`/settings`)
- Objetivo funcional: parâmetros da organização com persistência real.
- Papel no fluxo: base institucional que afeta operação/financeiro/governança.
- Deve ter: seções claras/tabs, formulário real, feedback previsível.
- Não deve ter: placeholders estáticos não conectados.
- Estado atual: página simplificada com KPI hardcoded e campos genéricos.
- Problemas: perdeu integração/contrato mais robusto que existia anteriormente.
- Recuperar: versão anterior orientada a `nexo.settings.get/update` com validação e estados de query.
- Estrutura ideal final: formulário real por seções (org, usuários, integrações, notificações).

## 5.12 Perfil (`/profile`)
- Objetivo funcional: identidade do usuário, contexto de acesso e segurança.
- Papel no fluxo: governança de acesso individual.
- Deve ter: dados reais de usuário/role/sessão/segurança.
- Não deve ter: blocos fictícios sem integração.
- Estado atual: KPIs/atividades hardcoded e formulário genérico.
- Problemas: perdeu vínculo forte com identidade real e permissões.
- Recuperar: versão anterior com dados reais de `useAuth` e contexto de papel/permissão.
- Estrutura ideal final: identidade real + segurança + atividade recente verificável.

## 6) O que ainda está correto e deve ser preservado

1. Estrutura global de navegação (sidebar/topbar/menu por domínio) é boa base.
2. Módulos centrais (Clientes, Agendamentos, O.S., Financeiro, WhatsApp, Governança, Timeline) mantêm integração real com backend e estados loading/error/empty.
3. Componentes de tabela/status/ações contextuais em páginas operacionais estão úteis como kit base (`AppDataTable`, `AppStatusBadge`, `AppRowActions`).
4. Billing mantém valor comercial real (limites/plano/readiness/upgrade).

## 7) Raiz do problema (objetiva)

Raiz 1 — **Globalização de blocos de execução**:
- Engine e barra de execução foram promovidas ao layout raiz sem escopo por rota.
- Resultado: páginas operacionais herdaram camadas de decisão que deveriam estar no dashboard (ou seletivas).

Raiz 2 — **Quebra da hierarquia de header interno**:
- `PageWrapper` + `OperationalHeader` perderam o título interno por página.
- Resultado: telas com menor identidade funcional e percepção de “miolo parecido”.

Raiz 3 — **Padronização excessiva com supressão de conteúdo específico**:
- Refactor massivo reduziu diferenciação de módulos e removeu partes relevantes em Settings/Profile.

## 8) Arquivos diretamente envolvidos na regressão (núcleo)

### Estrutural (layout/composição)
- `apps/web/client/src/components/MainLayout.tsx`
- `apps/web/client/src/components/app/GlobalActionEngine.tsx`
- `apps/web/client/src/components/ExecutionGlobalBar.tsx`
- `apps/web/client/src/components/operating-system/Wrappers.tsx`
- `apps/web/client/src/components/operating-system/OperationalHeader.tsx`

### Páginas que foram simplificadas em excesso
- `apps/web/client/src/pages/SettingsPage.tsx`
- `apps/web/client/src/pages/ProfilePage.tsx`
- (e revisão fina de identidade visual em: Customers/Appointments/ServiceOrders/Finances/WhatsApp/Timeline/Governance)

## 9) O que remover, restaurar e reestruturar

## Remover
1. Renderização global obrigatória de `GlobalActionEngine` em todas as rotas.
2. Renderização global obrigatória de `ExecutionGlobalBar` em todas as rotas.

## Restaurar
1. Passagem de `title` em `PageWrapper -> OperationalHeader`.
2. `<h1>` e hierarquia de cabeçalho no `OperationalHeader`.
3. Contrato funcional de `SettingsPage` (query/mutation reais).
4. Contexto real de `ProfilePage` baseado em usuário/role/permissões.

## Reestruturar
1. Política de blocos globais vs contextuais (com matrix por rota).
2. Kit de topo por tipo de página:
   - dashboard center,
   - página operacional transacional,
   - página de supervisão (risco/governança),
   - página de administração (settings/profile/billing).

## 10) Arquitetura recomendada (alvo)

## AppLayout
- Responsável apenas por providers, overlays globais e proteção de contexto.

## MainLayout
- Sidebar + Topbar + MainContainer.
- Sem blocos de negócio globais obrigatórios.
- Permitir `route slots` explícitos para banners/insights opcionais.

## Sidebar/Topbar
- Permanecem globais.
- Topbar exibe contexto de rota e ações utilitárias (busca/notificação/perfil), sem engine de execução.

## AppPageHeader / PageShell
- Todo módulo interno deve ter header contextual com título + descrição + ações do módulo.
- Headline do módulo não pode depender só da topbar.

## Bloco de ações globais
- virar componente opt-in por rota (`showGlobalExecution=true` apenas dashboard + (opcional) governança).

## Ações contextuais por página
- ficam no topo/toolbar da própria página (não no layout).

## Dashboard center
- único lugar padrão para engine forte de priorização e execução (cockpit).

## Modais, cards, tabelas
- preservar DS interno atual (tokens e componentes), reforçando variações por domínio de página.

## 11) Plano de correção em etapas (prioridade)

### Fase P0 — Corrigir estrutura sem quebrar fluxo
1. Tirar `GlobalActionEngine` e `ExecutionGlobalBar` do modo global obrigatório.
2. Reativar título no `OperationalHeader` e passagem correta em `PageWrapper`.
3. Definir allowlist de páginas que podem exibir bloco de execução global (inicial: só dashboard).

### Fase P1 — Recuperar identidade funcional por módulo
1. Revisar topo de cada página para remover “mesmo miolo” e reforçar semântica de domínio.
2. Ajustar clientes/agendamentos/O.S./financeiro/whatsapp/timeline/governança para padrões contextuais distintos.

### Fase P2 — Restaurar módulos administrativos degradados
1. Reconstituir `SettingsPage` com dados reais e persistência.
2. Reconstituir `ProfilePage` com dados reais de identidade/permissões/segurança.

### Fase P3 — Hardening visual/funcional
1. Checklist de regressão por tema claro/escuro, loading/empty/error, modal, tabela, filtros, dropdowns.
2. Teste de hierarquia visual por rota (snapshot/manual guiado).

## 12) Resumo executivo da regressão

- Houve **mais de uma regressão**, em blocos distintos:
  - (A) globalização indevida de engine/barra de execução,
  - (B) quebra de header interno,
  - (C) simplificação agressiva com perda de conteúdo específico.
- O ponto mais objetivo da quebra estrutural é a combinação de commits:
  - `00d7f85` (header/title),
  - `5805a0c` (global engine),
  - `6b833e9` (execution bar global),
  - `faeba1b` (simplificação massiva de páginas).

# Auditoria Restante NexoGestão

## 1. Status atual
- Build: **OK** (`pnpm -s build` concluiu em todos os pacotes).
- API: **sobe e responde** (contexto informado + contrato existente em `apps/api/src/...`).
- WEB: **sobe e renderiza**, porém com bloqueio de bootstrap em cenários de erro de sessão.
- Health: **OK** (contexto informado).
- Auth bootstrap: **P0** — existe branch explícito de erro com mensagem “Falha no bootstrap de autenticação” na rota raiz.
- Fluxo principal: **parcial** — endpoints existem em boa parte, mas há lacunas de produto real (dashboard genérico em partes, placeholders no BFF, seed inconsistente para demo operacional completa dependendo do modo, e mocks em módulos críticos).

## 2. P0 — bloqueia uso real

### P0.1 — Bootstrap de autenticação pode derrubar entrada no produto
- área: Auth / Bootstrap / Root routing
- sintoma: usuário vê “Falha no bootstrap de autenticação” na raiz.
- causa provável: `session.me` pode entrar em erro “SERVICE_UNAVAILABLE” (falha/cooldown upstream de `/me`) e `authState` vira `error`, acionando tela bloqueante na root.
- evidência:
  - `App.tsx` renderiza erro explícito na root quando `rootBranch === "error_screen"`.
  - `routers.ts` converte `NexoBootstrapError(kind="unavailable")` em `TRPCError SERVICE_UNAVAILABLE`.
  - `context.ts` aplica cooldown de indisponibilidade do `/me` e lança `NexoBootstrapError("unavailable")`.
- impacto: bloqueio de acesso inicial; percepção de sistema instável mesmo com backend no ar.
- recomendação: tratar indisponibilidade transitória de `session.me` como **degradação não bloqueante** em rota pública (especialmente `/` e `/login`) e separar claramente erro de rede x erro de autenticação.

### P0.2 — Risco de fluxo sem login utilizável se seed não for executado
- área: Ambiente / Seed / Login
- sintoma: sem usuário válido no banco, login falha com “Usuário inválido”.
- causa provável: execução sem seed básico/pilot.
- evidência:
  - `auth.service.ts` exige usuário existente com senha, ativo e person vinculado.
  - `prisma/seed.ts` cria admin default (`admin@nexogestao.local`) somente quando seed roda.
- impacto: ambiente “sobe” mas é inutilizável operacionalmente para demo/operação inicial.
- recomendação: deixar fluxo “primeiro acesso” explícito (setup wizard) quando não houver usuário, ou garantir seed mínimo automático em ambiente dev/demo.

## 3. P1 — precisa corrigir antes de demo/venda

### P1.1 — Contrato de bootstrap sensível a indisponibilidade de `/me`
- área: BFF/API contrato auth
- sintoma: bootstrap falha por indisponibilidade temporária, não por credencial inválida.
- causa provável: acoplamento forte de `session.me` ao upstream sem fallback robusto para páginas públicas.
- evidência: `fetchNexoMe` usa timeout/cooldown e propaga erro de indisponibilidade; `session.me` transforma em `SERVICE_UNAVAILABLE`.
- impacto: demo pode quebrar por oscilação local/rede sem relação com credenciais.
- recomendação: política de retry/backoff controlado + fallback para estado “não autenticado” em telas públicas.

### P1.2 — Dashboard no BFF contém retornos vazios silenciosos
- área: Dashboard / Produto
- sintoma: painéis podem vir vazios sem erro explícito (`return []`).
- causa provável: implementação parcial/defensiva sem observabilidade de ausência de dados.
- evidência: múltiplos `return []` em `apps/web/server/routers/dashboard.ts`.
- impacto: dashboard perde papel de centro decisório; pode parecer “bonito porém cego”.
- recomendação: diferenciar “sem dado real” vs “erro de integração” e obrigar sinais operacionais mínimos.

### P1.3 — Contact e SDK internos marcados como placeholder
- área: Comunicação/Integrações
- sintoma: módulos existem com comportamento placeholder.
- causa provável: implementação incompleta para fluxo real.
- evidência:
  - `apps/web/server/routers/contact.ts` descreve placeholder e retorna listas vazias.
  - `apps/web/server/_core/sdk.ts` retorna `"SDK placeholder"`.
- impacto: risco alto em demo/venda se fluxo prometido depende dessas integrações.
- recomendação: classificar oficialmente como “não suportado em produção” até implementação real.

### P1.4 — WhatsApp em modo mock por padrão
- área: WhatsApp operacional
- sintoma: envio pode ocorrer em provider mock se configuração real ausente.
- causa provável: factory usa fallback para mock.
- evidência: `provider.factory.ts` define fallback para `mock`; `mock.provider.ts` produz ids simulados.
- impacto: falsa percepção de operação real (mensagem “enviada” sem canal externo real).
- recomendação: bloquear features críticas para orgs produtivas quando provider real não configurado.

### P1.5 — Execução de testes no monorepo inconsistente
- área: Qualidade técnica
- sintoma: `pnpm -s test` falha por task ausente em parte dos projetos.
- causa provável: padronização incompleta de scripts `test` por package no turbo.
- evidência: erro “Could not find task `test` in project”.
- impacto: baixa confiabilidade para regressão antes de demo/venda.
- recomendação: padronizar task `test` mínima em todos os workspaces relevantes.

## 4. P2 — melhoria importante
- Dashboard ainda mistura KPI/visão sem forçar “próxima melhor ação” em todas as rotas.
- Clientes ainda tem risco de virar cadastro se workspace contextual não for sempre carregado/visível.
- Agendamentos e O.S. dependem de consistência de estados e CTAs inline; UX precisa reforçar conversão entre etapas.
- Timeline precisa cobertura 100% dos eventos críticos (há evidências de lacunas históricas em docs e arquitetura de placeholders em áreas periféricas).
- Billing x Financeiro: separação existe no código (routers/módulos distintos), mas precisa validação funcional end-to-end de regras comerciais reais.

## 5. P3 — polimento
- Hardening visual/estados de loading/empty/error pode ser refinado por página.
- Consistência fina de modais, ações em menu contextual e linguagem operacional.
- Melhorias de legibilidade e priorização visual em dark/light mode.

## 6. Lacunas por página
- Dashboard: risco de vazios silenciosos e pouca prescrição de ação prioritária.
- Clientes: base boa, mas precisa garantir memória operacional + financeira + comunicação em um só contexto sem fragmentação.
- Agendamentos: validar conflito, geração de O.S. e rastreabilidade em timeline para todas transições.
- O.S.: reforçar anti-gap “concluir sem cobrança” e estado de atraso/travamento com ação sugerida.
- Financeiro: fluxo principal existe, porém precisa garantir impacto em risco/governança de forma explícita em UI.
- WhatsApp: risco operacional enquanto provider mock for aceito como fallback padrão.
- Timeline: precisa prova oficial completa por entidade/ação crítica.
- Governança: estrutura existe, validar se ações automáticas estão realmente executando e registrando efeitos.
- Calendário: confirmar ligação operacional com agendamentos e ações contextuais.
- Pessoas: validar carga/performance/responsabilidade no uso real (não só cadastro).
- Perfil: tende a cadastro; falta evidência de painel operacional individual robusto.
- Configurações: há risco de serem majoritariamente declarativas em parte dos fluxos.
- Billing: existe separação estrutural de Financeiro, mas precisa validação funcional de assinatura/limites/faturas reais.

## 7. Fluxo operacional ponta a ponta

| Etapa | Status | Problema | Próxima correção |
|---|---|---|---|
| Cliente | Parcialmente OK | risco de contexto fragmentado | consolidar workspace operacional/financeiro/comunicação |
| Agendamento | Parcialmente OK | validar conflitos + transição robusta | garantir regras + timeline em cada mudança |
| O.S. | Parcialmente OK | risco de conclusão sem desdobramento financeiro claro | CTA obrigatório para cobrança/pós-execução |
| Execução | Parcialmente OK | governança/risco ainda precisa prova E2E | auditar jobs/efeitos reais em produção-like |
| Cobrança | OK estrutural | integração de risco pode ficar opaca | explicitar impacto em risco e próxima ação |
| Pagamento | OK estrutural | rastreabilidade e UX de exceções | melhorar feedback de estados e reconciliação |
| Timeline | Parcial | lacunas potenciais de eventos | cobertura 100% eventos críticos |
| Risco | Parcial | precisa confirmar uso de dados reais em todas regras | validar cenários negativos fim-a-fim |
| Governança | Parcial | risco de ser painel sem enforcement forte | provar ações executadas + trilha oficial |

## 8. Mocks/TODOs/Placeholders encontrados

| Arquivo | Tipo | Impacto | Ação |
|---|---|---|---|
| `apps/web/server/routers/contact.ts` | placeholder + `return []` | P1 (fluxo de comunicação) | implementar persistência/integração real |
| `apps/web/server/_core/sdk.ts` | placeholder explícito | P1 (integrações) | substituir por SDK real ou remover da superfície |
| `apps/web/server/routers/dashboard.ts` | múltiplos `return []` | P1 (decisão operacional) | retornar estado semântico + erro observável |
| `apps/web/server/_core/audit.ts` | TODO | P2 | implementar trilha completa |
| `apps/web/server/_core/softDelete.ts` | placeholder | P2 | concluir padrão transversal |
| `apps/api/src/queue/queue.service.ts` | simulated id | P2 | garantir separação clara simulado vs real |
| `apps/api/src/whatsapp/providers/mock.provider.ts` | provider mock | P1 em demo/venda | gate de produção e sinalização forte |

## 9. Problemas de contrato BFF/API

| Frontend/BFF | API | Problema | Impacto |
|---|---|---|---|
| `session.me` (TRPC) | `GET /me` | indisponibilidade vira erro de bootstrap na root | bloqueio de entrada (P0) |
| `auth.login` via BFF | `POST /auth/login` | depende de token + cookie persistido; sem seed login inviável | bloqueio dev/demo (P0) |
| BFF usa `/me` e `/auth/*` sem `/v1` | API controllers em raiz (`/me`, `/auth`) | **não há evidência de divergência /v1 neste código atual** | baixo (informacional) |
| cookie `nexo_token` + Authorization Bearer | Jwt guard em `/me` | contrato existe, mas frágil a erros transitórios upstream | instabilidade percebida |

## 10. Problemas de UX global
1. Erro de bootstrap bloqueante na raiz para falhas transitórias.
2. Estados vazios silenciosos em áreas decisórias (dashboard/contact).
3. Risco de mock parecer produção (WhatsApp).
4. Falta de distinção forte entre “sem dados” e “erro operacional”.
5. Inconsistência potencial entre páginas quanto a CTAs de próxima ação.

## 11. Ordem recomendada de correção
1. Corrigir estratégia de bootstrap/auth (não bloquear root por indisponibilidade transitória).
2. Garantir seed/login demo deterministicamente (conta padrão e fluxo sem usuário).
3. Fechar fluxo oficial Cliente→Agendamento→O.S.→Cobrança→Pagamento com CTAs obrigatórios.
4. Cobrir timeline em 100% dos eventos críticos do fluxo principal.
5. Endurecer WhatsApp/Financeiro para operação real (sem mock mascarado).
6. Transformar dashboard em centro de decisão (atenção imediata + próxima ação).
7. Eliminar placeholders críticos no BFF (`contact`, `sdk`, vazios silenciosos).
8. Validar Billing separado de Financeiro com regras comerciais reais.
9. Padronizar testes/scripts typecheck no monorepo.
10. Consolidar documentação operacional de runbook de demo/produção.

---

## Anexo — respostas diretas às hipóteses do item 1 (Auth bootstrap)
- cookie velho: **possível**, mas não é a única causa; código trata 401 como não autenticado.
- ausência de usuário seedado: **sim, causa real de bloqueio de login**.
- endpoint errado: **não há evidência principal** (BFF chama `/auth/login` e `/me`, coerente com API atual).
- prefixo `/v1` divergente: **não evidenciado no estado atual**.
- BFF chamando rota errada: **não evidenciado como causa principal**.
- token não persistido: **não evidenciado primariamente** (BFF seta `nexo_token` no login).
- `session.me` não tratando 401: **401 é tratado como não autenticado**; problema central é indisponibilidade/upstream.
- tela pública bloqueada por bootstrap indevido: **parcialmente** — root mostra erro bloqueante em branch de bootstrap error; precisa degradação melhor.

## Anexo — seed/login credenciais identificadas
- `prisma/seed.ts` (seed base/pilot): `admin@nexogestao.local` / `123456`.
- `prisma/seed-demo.ts` (demo específico): define `admin@nexogestao.local` / `Admin@123456` na criação local desse seed.
- O seed **cria organização + usuário admin + person**; modos demo/pilot populam partes do fluxo operacional.

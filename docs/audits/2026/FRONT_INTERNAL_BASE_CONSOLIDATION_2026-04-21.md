# NexoGestão — Consolidação da Base do Front Interno (2026-04-21)

## Regra mãe aplicada

**Modernizar sem quebrar** com execução por camadas:
1. tokens
2. componentes base
3. padrões de layout
4. páginas
5. substituição gradual

---

## Fase 1 — Auditoria e consolidação da fundação

### Fundação oficial definida (a partir do que já existe)

- `AppPageHeader` (wrapper de cabeçalho operacional).  
- `AppSectionBlock` / `AppSectionCard` (blocos reutilizáveis e silenciosos).  
- `AppDataTable` (container padrão para tabelas operacionais).  
- `AppStatusBadge` / `AppPriorityBadge` (status e prioridade normalizados).  
- `AppRowActionsDropdown` (ações por linha com previsibilidade de interação).  
- `BaseModal` / `BaseOperationalModal` / `QuickActionModal` / `FormModal` / `ConfirmModal` (base de overlays compatíveis).  
- `AppPageShell` + `PageWrapper` já existente nas páginas (preservado).

### Pontos de reinvenção mapeados

1. Existem implementações paralelas de "badge de status" fora da base, em modais e componentes pontuais.
2. Há estruturas de "card + header + CTA" reimplementadas por página sem contrato comum.
3. Parte das áreas de ação de linha usam botões locais em vez de dropdown padronizado.
4. Modais de detalhe cresceram além da função de criação/edição/confirmação.
5. Há sinais de acoplamento entre listagem e detalhe em overlays grandes (risco para contexto).

### Decisão de baixo risco

- **Não apagar** legado agora.
- Consolidar a camada oficial e orientar novas implementações para ela.
- Marcar detalhe pesado em modal como `detail-legacy` para guiar extração futura para workspace.

---

## Fase 2 — Modernização visual da base (sem ruptura)

### Ajustes aplicados na camada base

- Cartões base com borda mais discreta, raio consistente e leitura mais silenciosa.
- Header de seção com tipografia levemente mais forte e melhor respiração vertical.
- Data table padrão com acabamento visual controlado (borda/sombra leve).
- Dropdown de ações por linha com foco visível e estados consistentes.
- Modal base com acabamento coerente ao overlay tokenizado do app.

### Regras preservadas

- Tokens atuais do Nexo (sem sistema paralelo).
- Tema claro/escuro existente.
- Overlays e contratos de interação.
- Rotas, fluxo e comportamento operacional já validado.

---

## Fase 3 — Revisão de modais (preparação de transição)

### Contrato atualizado da base

Adicionado `ModalIntent` em `BaseModal`:
- `create`
- `edit`
- `confirm`
- `detail-legacy`

Uso atual:
- `ConfirmModal` passa a declarar `confirm`.
- `QuickActionModal` e `FormModal` declaram `edit`.
- `BaseOperationalModal` mantém compatibilidade e adota `edit` por padrão.

### Benefício

Sem quebrar modais atuais, a base passa a distinguir claramente o que é modal de ação e o que ainda é detalhe legado — preparando migração para workspace.

---

## Fase 4 — Ordem de migração segura (sem executar tudo agora)

### Sequência oficial recomendada

1. Financeiro
2. Clientes
3. Ordens de Serviço
4. Agendamentos
5. WhatsApp
6. Dashboard
7. Timeline / Configurações / Perfil

### Critério de rollout

- Primeiro validar uma página com os blocos consolidados.
- Só depois expandir para a próxima área.
- Sem remoção em massa de componentes antigos nas primeiras ondas.

---

## Fase 5 — Preparação para Workspace Operacional

Foi criado um **scaffold de workspace** reutilizável para orientar evolução incremental:

- `WorkspaceScaffold` com regiões:
  - contexto principal
  - timeline
  - comunicação
  - financeiro
  - CTA dominante

Objetivo: reduzir dependência de modal gigante, mantendo contexto e ação na mesma superfície.

---

## O que fica pendente para a próxima etapa

1. Migrar primeiro caso real (Financeiro) para validar padrão completo lista → workspace.
2. Substituir badges/status locais por `AppStatusBadge` onde ainda houver duplicação.
3. Reduzir modais de detalhe mais pesados, começando por fluxos com mais scroll interno.
4. Criar guideline de "quando usar Modal vs Workspace" no handbook interno.

---

## Resumo executivo

Evoluímos a base do front interno com baixo risco, mantendo fluxo e arquitetura atuais, padronizando fundação visual/estrutural e abrindo caminho para a próxima fase de workspace operacional **sem reescrever o produto**.

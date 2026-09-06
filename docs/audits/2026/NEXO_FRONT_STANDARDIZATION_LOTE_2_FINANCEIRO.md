# Lote 2 — Padronização visual do Financeiro piloto

Data da entrega: 2026-06-03  
Escopo: página `FinancesPage` e documentação do piloto visual.  
Fonte contratual: Lote 0 (`docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`) + Lote 1 (`docs/NEXO_FRONT_STANDARDIZATION_LOTE_1_FOUNDATION.md`).

## 1. Resumo executivo

O Lote 2 aplicou o padrão visual Nexo em uma página real de alto valor operacional: **Financeiro**. A migração foi limitada à fundação visual da página, preservando dados, mutations, rotas e comportamento de negócio existentes.

A página agora enfatiza a leitura operacional de cobrança e caixa: quem deve, quanto deve, quando vence e qual ação financeira vem primeiro. O piloto passou a usar `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppSectionCard`, `AppInfoCard`, `AppStatCard`, `AppDataTable`, `AppStatusBadge`, `AppOperationalStatusBadge`, `AppPriorityBadge`, `AppRowActionsDropdown`, estados oficiais de loading/error/empty e `FormModal` para fluxos curtos compatíveis.

## 2. Objetivo do lote

Validar a fundação visual Nexo consolidada no Lote 1 em uma tela operacional real, sem transformar o Financeiro em ERP e sem alterar backend, banco, autenticação, tenant, orgId, tRPC/API ou regras de negócio.

Objetivos específicos:

- priorizar execução financeira sobre visual de dashboard genérico;
- destacar recebido, a receber, vencido/em risco e previsto com dados existentes;
- destacar uma próxima melhor ação derivada localmente da carteira carregada;
- mapear status financeiro e prioridade operacional com badges oficiais;
- preservar ações existentes de cobrar, registrar pagamento, editar, cancelar, abrir cliente, abrir O.S. e WhatsApp contextual;
- documentar riscos, decisões e próximos passos antes de migrar Clientes e O.S.

## 3. Arquivos analisados

- `docs/NEXO_FRONT_STANDARDIZATION_NEXT_STEP_AUDIT.md`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_1_FOUNDATION.md`
- `apps/web/client/src/pages/FinancesPage.tsx`
- `apps/web/client/src/components/CreateChargeModal.tsx`
- `apps/web/client/src/components/app-system.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`
- `apps/web/client/src/components/app-modal-system.tsx`
- `apps/web/client/src/components/finance-modes/FinanceOverview.tsx`
- `apps/web/client/src/components/finance-modes/FinancePending.tsx`
- `apps/web/client/src/components/finance-modes/FinanceOverdue.tsx`
- `apps/web/client/src/components/finance-modes/FinancePaid.tsx`
- `apps/web/client/src/components/finance-modes/FinanceReports.tsx`
- `apps/web/client/src/components/finance-modes/FinanceTrendEngine.tsx`
- `apps/web/client/src/components/finance/FinanceOverviewAreaChart.tsx`
- `apps/web/client/src/App.tsx`
- `apps/web/client/src/lib/operationalConsistency.ts`
- `apps/web/client/src/lib/actionFlow.ts`
- `apps/web/client/src/lib/operational-health.ts`
- `apps/web/client/src/lib/operational-attention.ts`
- `apps/web/client/src/lib/operational-interventions.ts`
- `apps/web/client/src/lib/operational-prioritization.ts`
- `apps/web/client/src/lib/trpc.ts`
- `apps/web/scripts/validate-operating-system.mjs`

## 4. Arquivos alterados

- `apps/web/client/src/pages/FinancesPage.tsx`
- `apps/web/scripts/validate-operating-system.mjs`
- `docs/NEXO_FRONT_STANDARDIZATION_LOTE_2_FINANCEIRO.md`

## 5. Estrutura anterior do Financeiro

A estrutura anterior já tinha alguns componentes oficiais, mas ainda misturava camadas:

- `PageWrapper` legado envolvendo a página;
- `OperationalTopCard` como top card paralelo ao contrato `AppSectionCard`;
- chips manuais no header;
- badges de status sem mapeamento financeiro explícito;
- ausência de prioridade P0/P1/P2/P3 por linha;
- cards locais em detalhe e atenção imediata;
- `QuickActionModal` em ações curtas de pagamento/edição;
- inputs/selects/textareas locais nos modais;
- tabela operacional com `AppDataTable`, mas sem coluna de prioridade.

## 6. Estrutura nova do Financeiro

A estrutura atual ficou organizada como:

1. `AppPageShell` como raiz visual da página.
2. `AppOperationalHeader` com contexto operacional, ações reais e badges oficiais.
3. Card oficial de próxima decisão financeira com `AppSectionCard`.
4. KPIs com `AppStatCard` para recebido, a receber, vencido e previsto.
5. Bloco `Saúde do caixa` com `AppSectionBlock` + `AppInfoCard`.
6. Bloco de intervenção financeira dominante com `AppSectionBlock` + `AppInfoCard`.
7. Bloco de atenção imediata com cards informativos e ações existentes.
8. Carteira operacional com `AppOperationalBar`, filtros funcionais, `AppDataTable`, status, prioridade e menu por linha.
9. Detalhe financeiro em seção própria, preservado como detalhe inline/legado leve, com cards oficiais.
10. Modais curtos de pagamento/edição com `FormModal`, `AppFormSection`, `AppField`, `AppFieldGroup`, `AppInput`, `AppSelect` e `AppTextarea`.

## 7. Componentes oficiais aplicados

- `AppPageShell`
- `AppOperationalHeader`
- `AppSectionBlock`
- `AppSectionCard`
- `AppInfoCard`
- `AppStatCard`
- `AppDataTable`
- `AppOperationalBar`
- `AppPagination`
- `AppStatusBadge`
- `AppOperationalStatusBadge`
- `AppPriorityBadge`
- `AppRowActionsDropdown`
- `AppPageLoadingState`
- `AppPageErrorState`
- `AppPageEmptyState`
- `FormModal`
- `AppFormSection`
- `AppField`
- `AppFieldGroup`
- `AppInput`
- `AppSelect`
- `AppTextarea`

## 8. Tokens aplicados

A página passou a depender mais do contrato Nexo em superfícies e semântica visual:

- `--nexo-card-surface` no card principal de próxima decisão;
- `--nexo-border-strong` no card principal de ação financeira;
- `--nexo-text-primary`, `--nexo-text-secondary` e `--nexo-text-muted` na leitura principal do piloto;
- tokens legados compatíveis já consolidados no Lote 1, como `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--surface-elevated` e `--surface-subtle`, preservados em áreas onde os componentes oficiais ainda os usam.

## 9. Hardcodes removidos/reduzidos

Reduções feitas localmente na página:

- remoção de `PageWrapper` legado no Financeiro;
- remoção de `OperationalTopCard` no Financeiro em favor de `AppSectionCard`;
- troca de chips manuais do header por `AppStatusBadge` e `AppOperationalStatusBadge`;
- troca de cards manuais de atenção/detalhe por `AppInfoCard`;
- troca de `QuickActionModal` por `FormModal`;
- troca de inputs/select/textarea com classes locais por campos oficiais de formulário.

Não foi feito sweep global. Classes locais necessárias à tabela HTML interna e pequenos itens de timeline foram preservadas por segurança. O validador visual também foi ajustado para aceitar o contrato oficial `AppPageShell` + `AppSectionCard` no piloto Financeiro, sem relaxar regras para WhatsApp ou alterar visual de páginas.

## 10. Badges/status/prioridade aplicados

Status financeiro mapeado visualmente:

- `PENDING` → `Pendente`, tom `warning`;
- `PAID` → `Paga`, tom `success`;
- `OVERDUE` → `Vencida`, tom `danger`;
- `CANCELED` → `Cancelada`, tom `neutral`.

Prioridade operacional aplicada por linha:

- `P0`: vencida com 15+ dias de atraso ou valor alto;
- `P1`: vencida recente;
- `P2`: pendente próxima do vencimento ou sem vencimento confiável;
- `P3`: informativa, paga, cancelada ou pendente sem urgência imediata.

Status operacional global aplicado no header:

- `NORMAL`: sem pendências/vencidos relevantes;
- `ATENÇÃO`: há pendências;
- `RISCO`: há vencidos;
- `CRÍTICO`: há volume elevado de vencidos.

## 11. Estados loading/error/empty padronizados

Estados preservados e padronizados com componentes oficiais:

- loading: `AppPageLoadingState` para carregamento de cobranças, clientes e O.S.;
- erro: `AppPageErrorState` com CTA real de refetch;
- vazio: `AppPageEmptyState` para busca sem resultado e ausência de cobranças no contexto atual.

## 12. Ações preservadas

Ações reais preservadas:

- atualizar dados carregados;
- criar cobrança via `CreateChargeModal` existente;
- cobrar ou enviar link via WhatsApp contextual;
- registrar pagamento (`finance.charges.pay`);
- editar cobrança (`finance.charges.update`);
- cancelar cobrança (`finance.charges.delete`);
- abrir cliente;
- abrir O.S.;
- navegar para carteira filtrada por status;
- refazer busca após erro.

Nenhum botão fake foi adicionado. CTAs novos são apenas composição visual sobre handlers já existentes ou filtros locais reais.

## 13. Lógica/API preservada

As chamadas já existentes foram preservadas:

- `trpc.finance.charges.list.useQuery`
- `trpc.nexo.customers.list.useQuery`
- `trpc.nexo.serviceOrders.list.useQuery`
- `trpc.finance.charges.pay.useMutation`
- `trpc.finance.charges.delete.useMutation`
- `trpc.finance.charges.update.useMutation`
- `trpc.finance.charges.getById.useQuery`
- `trpc.nexo.timeline.listByCustomer.useQuery`
- `trpc.nexo.timeline.listByServiceOrder.useQuery`

As derivações locais de saúde, próxima ação, status operacional e prioridade foram calculadas apenas a partir dos dados já carregados. Não houve API nova, backend novo, migration, alteração de banco ou payload novo obrigatório.

## 14. Modais analisados e decisão tomada

- `CreateChargeModal` já usa `FormModal` e foi preservado sem alterar fluxo/payload.
- Modal de marcar como pago: migrado de `QuickActionModal` para `FormModal`, por ser fluxo curto e compatível.
- Modal de editar cobrança: migrado de `QuickActionModal` para `FormModal`, por ser fluxo curto e compatível.
- Detalhe financeiro inline foi preservado como `detail-legacy` leve na página, não convertido em workspace nesta rodada.

## 15. Riscos para WhatsApp e confirmação de não alteração

Risco identificado: a página Financeiro navega para `/whatsapp` com contexto de cliente/cobrança, mas isso não exige alteração visual no WhatsApp.

Mitigação aplicada:

- `WhatsAppPage.tsx` não foi alterado;
- nenhum componente específico do WhatsApp foi alterado;
- `AppPageShell` e outros componentes compartilhados usados pelo WhatsApp não foram modificados;
- ações de WhatsApp no Financeiro preservam apenas navegação/contexto já existente.

## 16. Validação light/dark

A validação foi conservadora:

- uso preferencial de componentes oficiais e tokens Nexo;
- remoção de chips/cards/form fields manuais em pontos de maior impacto;
- sem `bg-black`, `bg-zinc-*`, `bg-slate-*`, `bg-gray-950`, `text-white`, `border-white` ou `dark:*` introduzidos em `FinancesPage.tsx`;
- tabela e timeline preservam pequenos trechos locais com tokens existentes por compatibilidade visual.

## 17. Quality gates executados

Executados nesta rodada:

- `pnpm --filter ./apps/web exec tsc --noEmit --pretty false`
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

Os resultados finais estão registrados no resumo da execução.

## 18. Próximo lote recomendado: Clientes + O.S.

Recomendação para o próximo lote:

1. migrar Clientes como origem operacional da cobrança e comunicação;
2. migrar O.S. como origem de execução que vira receita;
3. manter Agendamentos e Dashboard fora até a cadeia Cliente → O.S. → Financeiro estar consistente;
4. avaliar se detalhes pesados devem virar workspace em vez de modal.

## 19. O que NÃO foi feito

- Não foi alterado `WhatsAppPage.tsx`.
- Não foi alterado Dashboard.
- Não foram migrados Clientes, O.S. ou Agendamentos.
- Não houve backend.
- Não houve banco.
- Não houve migration.
- Não houve alteração de autenticação, tenant ou orgId.
- Não houve alteração de tRPC/API.
- Não foi instalado Flowbite.
- Não foi trocada a biblioteca visual.
- Não foi removido legado global.
- Não foi feita refatoração em massa.
- Não foram criados dados fake.
- Não foram criados CTAs sem handler real.
- Não houve tentativa de transformar Financeiro em ERP.

# NexoGestão — Alinhamento visual do Dashboard Executivo

Data: 2026-06-04.

## Arquivos alterados

- `apps/web/client/src/pages/ExecutiveDashboard.tsx`
- `apps/web/client/src/components/internal-page-system.tsx`

## Padrões substituídos

- Removido o wrapper full-bleed do Dashboard (`-mx-*`, `!rounded-none`, fundo escuro fixo e `style` local), voltando ao contrato de `AppPageShell` usado nas páginas internas.
- Substituídos cards e seções com fundo/borda hardcoded por `AppSectionBlock` com tokens internos (`--surface-base`, `--border-subtle`, `--accent-primary`, `--danger`).
- Substituídos chips manuais do header por uma primitive compartilhada pequena (`AppContextChip`) no `internal-page-system`.
- Substituídos KPIs manuais por `AppMetricCard`, preservando valores, ícones, contexto e navegação.
- Substituídas cores fixas do Dashboard (`#07182b`, `#0b1f35`, `#F97316`, `#EF4444`, `#8DA4C4`, `white/[...]`) por tokens semânticos do app.
- Mantido o layout estratégico em blocos: atenção imediata, próxima melhor ação, KPIs, fluxo operacional, fila, pulso e acessos contextuais.

## Componentes compartilhados usados

- `AppPageShell`
- `AppOperationalHeader`
- `AppSectionBlock`
- `AppMetricCard`
- `AppStatusBadge`
- `AppPageLoadingState`
- `AppPageErrorState`
- `AppPageEmptyState`
- `AppContextChip` (nova primitive reutilizável pequena em `internal-page-system`)

## Lógica mantida

- Nenhuma query tRPC foi alterada.
- Nenhum endpoint/fetch operacional foi alterado.
- Nenhuma regra de negócio, cálculo de KPI ou priorização foi alterada.
- `Operational Actions`, `Next Best Action`, alertas, fila operacional, gargalos, links para módulos e aprovações WhatsApp foram preservados.
- A ordem e os critérios de severidade continuam iguais aos dados já retornados pelo Dashboard.

## Riscos evitados

- Não houve alteração de backend, schema, API, router ou queries.
- Não houve alteração em `AppLayout`, `MainLayout`, overlays, modais ou portal/dialog.
- Não foi instalado Flowbite e nenhum componente externo foi copiado.
- Evitou-se criar um novo sistema visual paralelo; a única primitive criada é genérica para chips/contexto e fica no sistema interno.
- Removidos hardcodes que deixavam o Dashboard preso a dark mode fixo e aumentavam risco de contraste ruim em light mode.

## Checklist manual sugerido para prints light/dark

1. Abrir `/dashboard` em light mode e confirmar:
   - fundo igual às demais páginas internas;
   - header com card/borda/radius do sistema;
   - cards com bordas e superfícies sem bloco full-bleed escuro;
   - chips legíveis no header;
   - botões primários/link seguindo o tema;
   - estados de loading/error/empty com o mesmo padrão interno.
2. Alternar para dark mode e confirmar:
   - cards usam tokens do tema, sem contraste lavado;
   - chips de risco/atenção continuam legíveis;
   - `Próxima melhor ação` mantém hierarquia sem parecer landing;
   - `Atenção imediata`, `Fila operacional` e `Pulso da operação` não usam divisores brancos hardcoded.
3. Validar navegação dos CTAs:
   - Financeiro;
   - O.S.;
   - Agendamentos;
   - WhatsApp;
   - Timeline.
4. Validar overlays/modais a partir de outras páginas após navegar pelo Dashboard, para garantir que nenhum wrapper com `transform`, `filter`, `overflow` ou portal foi afetado.

## Resultado dos testes

- `pnpm -r typecheck`: passou.
- `pnpm -s build`: passou.
- `pnpm -r lint`: passou; a validação visual retornou apenas avisos não bloqueantes já emitidos pelo validador de Operating System para tokens legados/revisáveis.

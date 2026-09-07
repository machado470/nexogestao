# Auditoria final do golden standard do frontend interno — 2026-09-07

## 1. Baseline e método

- **Baseline inspecionada:** `e04862b4` (`Merge pull request #968 ... billing`), com a implementação de Billing em `5732ebf1`.
- **Escopo:** código presente em `apps/web/client/src`, rotas de `App.tsx`, menu de `MainLayout.tsx`, primitives, páginas, modais e helpers importados pelos fluxos auditados. A classificação não foi inferida do histórico.
- **Método:** leitura estrutural de cada página; inventário de imports/primitives; buscas por decisão, hardcodes, overlays, responsividade e acessibilidade; leitura do validador; testes, typecheck, lint e build.
- **Limite da evidência:** esta é uma validação estrutural/code-level. Não houve sessão autenticada nem validação visual real em navegador; portanto contraste percebido, clipping, ordem de foco completa e comportamento em breakpoints físicos permanecem sem comprovação visual.

### Critério de classificação

- **A — golden standard:** composição canônica e estados coerentes, sem pendência estrutural identificada.
- **B — quase concluída:** base canônica, mas com resíduos localizados que merecem migração pequena e dedicada.
- **C — parcialmente legada:** mistura relevante entre primitives canônicos e estruturas locais/legadas.
- **D — legada:** não adota a composição interna atual e requer migração própria.

## 2. Rotas e superfícies encontradas

O menu torna alcançáveis Dashboard, Clientes, Agendamentos, O.S., Financeiro, WhatsApp, Timeline, Calendário, Governança, Pessoas, Billing, Auditoria, Perfil e Configurações. Também existem as rotas internas contextuais `/whatsapp/webhooks` e `/cockpit/operations`, além do onboarding autenticado. Os aliases `/dashboard`, `/finance`, `/executive-dashboard-new`, `/launches`, `/invoices`, `/expenses`, `/referrals`, `/operations` e `/dashboard/operations` redirecionam para destinos consolidados; não são páginas paralelas a migrar.

Os destinos contextuais observados (`routeHint`, links de entidade e links entre Cliente, Agenda, O.S., Financeiro, WhatsApp, Timeline e Governança) apontam para rotas existentes. A proteção de notificações valida `routeHint` antes de navegar. Não foi encontrado destino novo que precisasse ser fabricado.

## 3. Matriz de maturidade

| Página/superfície | Classe | Problemas encontrados | Prioridade | Recomendação |
| --- | :---: | --- | --- | --- |
| Dashboard executivo | A | Nenhum bloqueante estrutural; mantém estado → atenção → ação → KPIs → fluxo → fila → evidências. | — | Manter como referência de linguagem, não de layout universal. |
| Clientes | A | Arquivo muito grande e workspaces densos, mas shell, header, filtros, tabela, estados, badges e overlays compatíveis estão consolidados. | — | Manter; decomposição futura só por manutenção, não por migração visual. |
| Pessoas | B | Shell, header, filtros, capacidade, disponibilidade, carga e decisão oficial estão corretos; `CreatePersonModal`/`EditPersonModal` ainda montam `Dialog` diretamente, e o modal de edição contém border dark específico. | Média | Migrar apenas os dois modais para `FormModal` em trabalho pequeno dedicado. |
| Perfil | A | Formulário, campos, estados, tokens e composição canônicos. | — | Manter. |
| Agendamentos | A | Shell/header/filtros/states e novo agendamento em `FormModal`; dados operacionais vêm do contrato. | — | Manter. |
| Calendário | A | Composição visual canônica, fallback móvel em lista, filtros acessíveis, estados e painel contextual; capacidade/disponibilidade são oficiais. Cards factuais internos são semanticamente locais, não shells concorrentes. | — | Manter; validar FullCalendar visualmente quando houver sessão. |
| Ordens de Serviço | B | Base canônica, porém mantém cards `<article>` locais, inputs/selects nativos estilizados e dropdown `<details>` local. O warning remanescente de `lint:os` é real. | Alta | Próximo candidato a uma migração pequena de surfaces/filtros/overlay, sem alterar decisão oficial. |
| Financeiro | C | Shell e blocos são canônicos, mas a confirmação de pagamento manual é um `AppInfoCard` fixo (`inset`/`z-50`) usado como overlay em vez de modal; carteira é uma lista local, não tabela/lista canônica. | Alta | Migrar o pagamento manual para `FormModal` e revisar a composição da carteira em etapa própria. |
| WhatsApp | C | Shell e filtros existem, mas a página de 2,8k linhas conserva cascatas/dropdowns próprios e `z-[60]/z-[70]`; há muita responsabilidade visual local. | Alta | Auditoria/migração própria dos overlays e decomposição, preservando o executor oficial. |
| Timeline | A | Shell, header, filtros, states e trilha sem reordenação operacional; o marcador visual da linha é legítimo. O warning anterior era falso positivo. | — | Manter. |
| Governança / risco | A | Estado, score, sinais e próxima ação são consumidos dos contratos oficiais; blocks, alerts, badges, tokens e estados estão consolidados. | — | Manter. |
| Configurações | A | Shell, header, forms, field groups, actions, inputs/selects e estados canônicos. | — | Manter. |
| Billing | A | Composição, cards, alertas, estados e cancelamento em `ConfirmModal` seguem a baseline mais recente. | — | Manter. |
| Auditoria | D | Usa `Card`, `Table`, `Dialog`, `Input` e empty state diretamente; não possui `AppPageShell`, `AppOperationalHeader`, filters bar nem modal canônico. | Alta | Próxima migração integral candidata; não alterar nesta auditoria. |
| Recuperação de webhooks WhatsApp | B | Shell/blocks/cards/states são canônicos; confirmação ainda usa o adapter legado `ConfirmDialog`, filtros usam controles nativos e detalhes locais. | Média | Trocar confirmação por `ConfirmModal` e uniformizar fields em mudança localizada. |
| Cockpit operacional / SRE | C | Tem header e states, mas não `AppPageShell`; reinventa `MiniCard`, `ListCard` e badge, com tons Tailwind diretos. | Média | Migrar como superfície pequena e isolada; não transformar em Dashboard. |
| Onboarding autenticado | C | Fluxo específico, mas conserva surfaces `bg-white`, `text-zinc`, dark overrides e sombras por página; está fora do page system interno. | Média | Definir explicitamente se entra no golden standard interno e, se sim, migrar separadamente. |

**Totais:** A = **9**, B = **3**, C = **4**, D = **1** (17 superfícies). O frontend interno **não está pronto para encerrar a fase**: Auditoria, Financeiro e WhatsApp são pendências prioritárias; O.S. é o resíduo B mais relevante.

## 4. Dimensões transversais

### Primitives consolidados

`AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppFiltersBar`, `AppStatusBadge` e os estados `AppPageLoadingState`, `AppPageErrorState` e `AppPageEmptyState` formam a composição dominante. `AppSectionCard`/`AppInfoCard`, `AppDataTable`, `AppPagination`, `AppForm`, `AppField`, `AppFieldGroup`, `AppInput`, `AppSelect` e `AppFormActions` já cobrem os casos maduros. `FormModal` está presente em Novo Agendamento, Nova O.S., Nova Cobrança e Despesa; `ConfirmModal` cobre cancelamento de Billing; `BaseModal` cobre confirmação destrutiva compatível.

`AppPageHeader` não é necessário nas superfícies novas: `AppOperationalHeader` é o header canônico observado. A ausência de todo primitive em toda página não foi tratada como falha.

### Duplicações relevantes

1. `AuditPage` replica card, tabela, filtros, empty e dialog com primitives de `ui`.
2. `OperationalCockpitPage` define localmente `MiniCard`, `ListCard`, `Row` e `Badge`.
3. Pessoas mantém dois dialogs próprios para create/edit; edição também diverge nos tokens.
4. Financeiro simula modal com card fixo.
5. O.S. mantém cards de resumo/métricas/execução e um dropdown `details` locais.
6. WhatsApp mantém seu sistema de menus em cascata; ele é funcionalmente especializado, mas ainda duplica responsabilidade de overlay/stacking.
7. `EmptyState.tsx` e `SkeletonLoader.tsx` antigos ainda coexistem com os states canônicos. Nas páginas A auditadas prevalecem os states do page system.

Não foi criada abstração nova: as duplicações não são todas equivalentes e devem ser tratadas junto da página proprietária.

### Modais e overlays

| Fluxo | Situação |
| --- | --- |
| Novo Cliente | `ModalFlowShell`, adapter consolidado com tokens de overlay; aceitável, embora anterior a `FormModal`. |
| Novo Agendamento | `FormModal`; canônico. |
| Nova O.S. | `FormModal`; canônico. |
| Billing cancel | `ConfirmModal`; canônico. |
| Novo/editar Pessoa | `Dialog` direto; resíduo B. |
| Pagamento manual | card fixo; violação real, categoria C. |
| Webhook replay | `ConfirmDialog`/AlertDialog; funcional e acessível pelo Radix, mas fora da API canônica atual. |
| Audit detail | `Dialog` direto; parte da página D. |

Os modais baseados em Radix fornecem ESC, focus trap e semântica. `app-modal-system` padroniza superfície tokenizada, altura máxima, body rolável e footer. Esses atributos só foram confirmados no código; tab order e retorno de foco não foram exercitados em navegador.

### Light/dark e hardcodes visuais

- **A — legítimos:** cores hex dos gráficos financeiros representam séries de dados, não surfaces; tokens `--surface-*`, `--text-*`, `--border-*`, `--app-overlay-*` e `--modal-*` são dominantes no app.
- **B — legado:** `ServiceOrderCard`/`ServiceOrderDetailsPanel`, `SkeletonLoader`, `EmptyState`, modais de Pessoa/edição financeira e Onboarding ainda usam gray/zinc/white e dark overrides diretos.
- **C — regressões/pendências:** card fixo de pagamento no Financeiro; surface/dialog local de Auditoria; primitives locais do Cockpit.
- **D — exceções documentadas:** `z-[60]` e `z-[70]` do menu em cascata de WhatsApp resolvem nesting de dropdown, mas são stacking improvisado e precisam ser substituídos por uma política canônica antes do fechamento. O dot `bg-slate-400` de status indisponível é uma cor semântica localizada, de baixo risco.

Não foram encontrados `bg-black`, `text-white` ou hex de surface nas páginas A do escopo principal. A coerência light/dark foi validada apenas pela composição de tokens e variantes no código.

### Responsividade

As páginas A usam `min-w-0`, wrapping, grids progressivos e overflow de tabela. Clientes declara largura mínima na tabela dentro do wrapper rolável; Calendário troca FullCalendar por lista móvel; Dashboard evita colunas rígidas antes de breakpoints; Billing e Governança colapsam seus grids. O.S. tem controles com `max-w` no desktop mas filters bar muda para coluna no mobile.

Riscos restantes: o menu de WhatsApp combina larguras/alturas calculadas e stacking próprio; o pre de metadata em Auditoria e tabelas diretas dependem de overflow local; ações do pagamento fixo no Financeiro não têm a política responsiva de `FormModal`; textos do Cockpit usam `truncate` e podem ocultar contexto. Nenhum desses pontos foi verificado visualmente.

### Acessibilidade

Os fluxos maduros apresentam botões reais, labels associados ou `aria-label`, status textual além de cor e states com mensagens. Calendário oferece lista móvel e labels dos filtros; O.S. e Pessoas associam os filtros por `htmlFor`/`id`. Radix sustenta os modais canônicos.

Pendências reais: labels visuais do formulário de disponibilidade em Pessoas envolvem controles, mas devem ser normalizados por `AppField`; filtros/inputs de Auditoria carecem do sistema de `aria-invalid`/descrição usado pelos forms canônicos; o dropdown `<details>` de O.S. não fecha por seleção/ESC como um menu canônico; não há evidência de política de foco nos overlays em cascata de WhatsApp. Não foi adicionada ARIA redundante nesta auditoria.

## 5. Decisão operacional client-side

### Classificação das ocorrências relevantes

- **A — fato do contrato:** `priority`, `riskLevel`, `severity`, `isOverdue`, `daysOverdue`, `operationalStatus`, `recommendedAction`, `recommendedActionTarget`, capacidade e disponibilidade exibidos em Clientes, Pessoas, Agenda, O.S., Financeiro, Dashboard e Governança. Mapeamentos nessas páginas convertem enums oficiais em rótulo/tom e não recalculam a decisão.
- **B — transformação visual:** `new Date`/`Intl` para apresentação; ordenação cronológica de coleções de detalhe em Clientes; ordenação alfabética das opções de filtro na Timeline/WhatsApp; transformação dos eventos do Calendário para o FullCalendar; filtros de Cockpit sobre flags oficiais.
- **C — estado de interface:** busca, filtros, seleção, paginação, período “últimas 24h” da Auditoria e persistência de sidebar/tema/memória de fluxo em `localStorage`. `actionFlow` registra contexto de UX e não autoriza uma ação.
- **D — decisão indevida:** **nenhuma ocorrência ativa foi confirmada nas páginas ou helpers diretamente importados por elas**.

Há módulos antigos e atualmente sem consumidor de produção (`priorityEngine`, `operationEngine`, `operational-prioritization`, `smartActions`, `operations/operational-hub` e `operations/operational-intelligence` via helper não usado) que contêm score, pesos, relógio e sorting. Eles não participam do bundle por um caminho importado pelas páginas auditadas, portanto não foram classificados como regressão D ativa. Ainda assim, são dívida arquitetural: remover ou isolar em uma limpeza posterior impedirá reuso acidental. Os únicos imports atuais de `operational-intelligence` nas páginas são de **tipo** (`OperationalSeverity`).

## 6. Investigação dos warnings de `lint:os`

### ServiceOrdersPage.tsx

- **Regra:** `hasDirectCardClass`, aviso “possível card direto em página sem componente operacional oficial”.
- **Código:** cards nativos de resumo, métricas, execução e comunicação usam combinações `rounded-* border ... p-*`; a página não importa `AppSectionCard`/`AppActionCard`/`OperationalInnerCard`.
- **Veredito:** **resíduo legado real**, não falso positivo. O warning foi preservado. A correção envolve várias surfaces e deve ocorrer na pequena migração dedicada de O.S., não como substituição cega nesta auditoria.

### TimelinePage.tsx

- **Regra original:** a mesma heurística procurava `p-4`/`rounded-xl` em qualquer `className` e só verificava se algum card canônico específico aparecia no arquivo.
- **Código exato responsável:** `p-3 md:p-4` passado ao próprio `AppFiltersBar`; o único círculo arredondado adicional é o marcador semântico da linha do tempo.
- **Veredito:** **falso positivo heurístico**. A regra agora procura classes de card apenas em containers HTML nativos (`article`, `aside`, `div`, `section`), sem enfraquecer a detecção dos cards reais de O.S. Depois da mudança, Timeline deixa de avisar e O.S. continua avisando.

## 7. Conclusão e próximos passos

O design system é consistente nas nove páginas A, mas não em todo o frontend interno. Não se deve encerrar a fase enquanto houver uma página D e quatro páginas C.

Ordem objetiva sugerida, sem iniciar automaticamente qualquer migração:

1. **Auditoria (D):** migrar shell/header/filtros/tabela/states/detail modal.
2. **Financeiro (C):** substituir o pagamento fixo por `FormModal` e consolidar a carteira.
3. **WhatsApp (C):** normalizar overlays/stacking e decompor responsabilidades sem tocar na decisão oficial.
4. **Cockpit (C):** adotar shell/cards/badges/states canônicos.
5. **Onboarding (C):** decidir formalmente se pertence ao standard interno e tratar tokens.
6. **O.S. (B):** surfaces, fields e dropdown local; manter o warning até concluir.
7. **Pessoas e webhook recovery (B):** migrar dialogs/fields pontuais.
8. Remover módulos de decisão dormentes depois de confirmar que não são API pública interna.

## 8. Quality gates executados

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @nexogestao/web test -- client/src/pages/TimelinePage.contract.test.ts client/src/pages/ServiceOrdersPage.operational-contract.test.ts client/src/pages/PeoplePage.contract.test.ts client/src/pages/CalendarPage.contract.test.ts client/src/pages/BillingPage.contract.test.ts client/src/pages/GovernancePage.contract.test.ts client/src/pages/ProfilePage.contract.test.ts client/src/pages/AuditPage.contract.test.ts` | Sucesso; pela configuração do script, Vitest executou a suíte web completa: 62 arquivos e 366 testes. |
| `pnpm -r typecheck` | Sucesso nos projetos web, common e API. |
| `pnpm --filter @nexogestao/web lint:os` | Sucesso, com um warning não bloqueante e real em O.S.; Timeline não gera mais falso positivo. |
| `pnpm lint` | Inconclusivo por limitação do ambiente: o subprocesso do pacote web tentou instalar `pnpm@10.30.3` e não avançou; foi interrompido. O lint funcional do web foi executado diretamente por `lint:os`. |
| `pnpm build` | Sucesso nos três projetos do workspace. |
| `git diff --check` | Sucesso. |

# Arquitetura visual interna do NexoGestão

**Base auditada:** `d354a51c` (merge do PR #933); `1b2fd580353ec4f9a97ea14100c8811d39b46405` confirmado como ancestral.  
**Escopo:** frontend interno. Nenhum contrato operacional, cálculo de KPI ou regra de negócio foi movido para o navegador.

## Fórmula oficial

O Nexo é uma mesa de decisão, não um catálogo de widgets. Cada página segue a ordem **contexto e estado → prioridade → ação → evidência → exploração**. `MainLayout` é o único shell autenticado; `AppPageShell` controla largura e ritmo; o header identifica estado e ações; seções agrupam informação por decisão. Cards só existem quando delimitam uma unidade semântica — não para decorar.

Superfícies têm quatro níveis: app (`--app-bg`), shell (`--app-shell`), painel (`--app-panel`) e card/overlay (`--app-card`, `--app-overlay-*`). Texto, borda, accent e estados usam exclusivamente tokens semânticos. Light e dark compartilham componentes e mudam apenas valores dos tokens. Gradientes, glow, blur decorativo e cores locais não fazem parte da fórmula.

A escala oficial é 4/8/12/16/20/24 px; controles têm 40 px; raios são 10 px (controle), 12 px (card) e 16 px (overlay). A tipografia usa overline para contexto, título curto para decisão, corpo para evidência e texto muted para metadado. O foco permanece sempre visível via token de ring. Desktop prioriza densidade e alinhamento; tablet reduz colunas sem omitir ações; mobile empilha, mantém alvos de toque e permite scroll apenas em regiões explicitamente roláveis. A largura máxima é 100rem, com respiro lateral fluido.

## Matriz transversal

| Família/página                                         | Objetivo e conteúdo dominante                                     | Estrutura/inconsistências observadas                                                        | Duplicações/hardcodes                                 | Padrão e componentes necessários                                                                  | Onda             |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| AppLayout/MainLayout, sidebar, topbar                  | Navegação, identidade, busca, notificações e tema                 | `AppShell`/`MainLayout` já centralizam o chrome; coexistem wrappers históricos              | larguras históricas e classes locais em telas antigas | manter shell único, tokens de shell/sidebar/topbar, foco e colapso responsivo                     | fundação         |
| Executive Dashboard                                    | decidir o que destrava operação e caixa; KPIs, riscos, NBA e fila | já preserva falha parcial e fontes autoritativas; precisava ser formalizado como referência | seções antigas tinham aparência de mural              | `AppPageShell`, header operacional, blocos, priority panel, métricas, pipeline e estados honestos | padrão-ouro      |
| Clientes                                               | operar carteira e próxima ação por cliente                        | centro operacional forte, mas convive com workspace/modal legado                            | cards/ações e filtros de gerações distintas           | toolbar, filtros, tabela base, status, row actions; detalhe como workspace                        | 1                |
| Agendamentos                                           | confirmar e executar agenda                                       | lista/filtros/modais densos; responsividade irregular                                       | toolbars e campos repetidos                           | filters bar, data table/lista mobile, FormModal e estados                                         | 1                |
| Calendário                                             | visualizar capacidade e conflito temporal                         | composição própria necessária, overlay ainda ligado ao fluxo de agendamento                 | popovers e controles locais                           | page header, toolbar, popover e modal oficiais                                                    | 1                |
| Ordens de Serviço                                      | executar O.S., prazo, responsável e cobrança                      | boa semântica operacional, vários subcomponentes históricos                                 | badges/actions parcialmente duplicados                | tabela/lista responsiva, status, row actions, contextual workspace                                | 1                |
| Financeiro                                             | controlar caixa, vencidos, recebimentos e relatórios              | múltiplos modos com densidade desigual                                                      | painéis e filtros por modo                            | tabs, filters bar, stat/section cards e tabela                                                    | 2                |
| Governança e Risco/Auditoria                           | comprovar risco, controle e evidência                             | blocos de governança e auditoria com hierarquias diferentes                                 | alertas/badges locais                                 | section card, alert, status, data table e evidence block                                          | 2                |
| Timeline                                               | explicar eventos e evidências                                     | timeline própria e filtros operacionais                                                     | itens e metadados repetidos                           | `AppTimeline`, filters bar, empty/error/loading                                                   | 2                |
| WhatsApp e recuperação                                 | executar comunicação e aprovações                                 | inbox é workspace singular; recuperação é fluxo especializado                               | banners e menus locais                                | shell preservado, alert, dropdown, status e modal base                                            | 3                |
| Pessoas                                                | administrar equipe, papéis e disponibilidade                      | tabela/formulários misturam padrões antigos e novos                                         | badges, row actions e dialogs                         | data table, FormModal, status e alert                                                             | 4                |
| Perfil                                                 | identidade e preferências pessoais                                | formulário longo com seções próprias                                                        | labels/actions repetidos                              | page section, form section, fields e feedback                                                     | 4                |
| Configurações                                          | configuração administrativa e integrações                         | grande densidade e contratos autoritativos já protegidos                                    | panels/forms/modals históricos                        | tabs, form sections, alerts e FormModal                                                           | 4                |
| Billing e Planos                                       | assinatura, limites e checkout                                    | Billing interna e Pricing pública têm papéis distintos                                      | cards de plano não devem contaminar UI operacional    | section/info cards, status e confirm modal; manter Pricing pública fora do shell                  | 4                |
| Demais internas: Cockpit, Webhook recovery, onboarding | fluxos especializados                                             | não devem criar segundo shell nem fórmula paralela                                          | wrappers pontuais                                     | consumir tokens e estados fundamentais; preservar fluxo especializado                             | conforme família |

### Achados por elemento

- **Headers/PageShell:** coexistem nomes históricos, mas o contrato novo deve ser o destino; migração será por família, sem big bang.
- **Cards/tabelas/listas:** a maior fonte de Frankenstein é padding/raio/sombra local. Tabela deve ter overflow horizontal explícito e alternativa legível no mobile.
- **Filtros/forms:** controles devem usar altura, foco, borda e superfície semânticos; toolbars quebram linha em tablet/mobile.
- **Dropdowns/popovers:** Radix permanece a base acessível, envelopada pelos exports App; collision padding e navegação por teclado são obrigatórios.
- **Badges/timeline:** status não pode inferir regra; apenas apresenta o valor autoritativo recebido.
- **Loading/empty/error:** ausência, indisponibilidade e zero são estados diferentes. Erro parcial não apaga evidência válida.
- **Toasts/alerts:** toast confirma efeito transitório; alert permanece junto da decisão. Ambos usam tons semânticos.
- **Modal:** `BaseModal` compõe Radix, overlay tokenizado, ESC, foco inicial opcional, cinco tamanhos, body rolável e header/footer fixáveis. Formulários grandes rolam somente no body.

## Componentes oficiais disponíveis

A fundação usada pelo Dashboard inclui shells/seções, toolbar/filtros, section/stat/info cards, estados empty/loading/skeleton/error, badges semânticos, base tabular, tabs, breadcrumbs, dropdown/popover, row actions, alert/toast e timeline. O sistema de overlay inclui `BaseModal`, `ModalHeader`, `ModalBody`, `ModalFooter`, `FormModal`, `ConfirmModal` e compatibilidades operacionais. Componentes legados só serão removidos quando cada substituição estiver comprovada por teste.

## Contrato do Dashboard padrão-ouro

A ordem renderizada é: **Operação hoje**, **Atenção imediata**, **Próxima melhor ação**, **KPIs operacionais**, **Fluxo operacional**, **Fila operacional**, pulso e acessos contextuais. Listas são curtas e acionáveis. Loading total, erro total, leitura parcial, indisponibilidade e vazio têm mensagens honestas. O frontend apresenta contratos do BFF: não recalcula KPI, estado, risco, prioridade ou próxima ação.

## Proteção e critérios de aceite

O validador bloqueia Flowbite, engines paralelos, imports diretos de tabela em páginas governadas, shells ausentes, hardcodes escuros no design system e modal improvisado em páginas. Testes de contrato fixam os componentes, escala semântica, overlay, acessibilidade básica do modal e ordem decisória do Dashboard. Flowbite foi apenas benchmark; não foi instalado nem importado.

## Ondas seguintes

1. **Operação — Clientes, Agendamentos, Calendário e O.S.** Dependências: filtros, tabela/lista responsiva, badges, row actions e FormModal. Primeiro estabilizar listas e depois workspaces; não alterar contratos.
2. **Controle — Financeiro, Governança e Timeline.** Dependências: tabs, section/stat cards, data table, alert e timeline já disponíveis; alinhar evidência e estados parciais após onda 1.
3. **Comunicação — WhatsApp.** Dependências: padrões de workspace, dropdown/popover, status e modal consolidados; preservar inbox e aprovações autoritativas.
4. **Administração — Pessoas, Perfil, Configurações e Billing.** Dependências: form sections/fields/actions, alerts, tabs e FormModal; executar por último para reutilizar padrões validados nas ondas operacionais.

Cada onda exige light/dark em desktop/tablet/mobile, teclado, conteúdo longo, dados densos, sidebar aberta/recolhida e testes de rotas/contratos. Não abrir migrações paralelas entre famílias.

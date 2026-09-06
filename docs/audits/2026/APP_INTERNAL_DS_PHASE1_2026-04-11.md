# NexoGestão — Design System Interno (Kickoff Fase 1-3)

Data: 2026-04-11

## Objetivo desta entrega

Iniciar a nova fase do front interno do NexoGestão com:

- auditoria da arquitetura visual atual do app interno,
- benchmark estrutural em padrões de Application UI do Flowbite (somente referência),
- consolidação inicial de uma camada de componentes próprios do Nexo,
- criação da base unificada de modal (reutilizável),
- proteção inicial contra regressão visual por hardcodes escuros.

> Decisão arquitetural: **Nexo mantém arquitetura própria** (layout, tema, shell, overlays e tokens). Flowbite foi usado apenas como benchmark de composição e densidade visual.

---

## 1) Auditoria e mapeamento da estrutura atual

### Shell/layout existentes

- `AppLayout` mantém `ThemeProvider` + overlays globais (`NotificationCenter`, `CriticalActionOverlay`).
- `MainLayout` concentra app shell interno (sidebar, topbar, main container, navegação e permissão).
- `AppShell` encapsula o container global do app.
- `design-system.tsx` já traz blocos importantes (`NexoAppShell`, `NexoSidebar`, `NexoTopbar`, `NexoMainContainer`, `NexoStatCard`, `NexoStatusBadge`, `DataTable`).

### Elementos operacionais existentes

- Page shell legado: `PagePattern.tsx` (`PageShell`, `PageHero`, `SmartPage`).
- Modais em múltiplos formatos:
  - `ModalFlowShell` (base de fluxo),
  - modais diretos com `Dialog` por tela,
  - variações com classes visuais divergentes.

### Principais inconsistências identificadas

1. **Duplicação de base modal** (estruturas paralelas por tela).
2. **Hardcodes visuais** em alguns modais/telas (`bg-white`, `dark:*`, escalas de cinza diretas), fora dos tokens do app.
3. **Componentes com mesma função e aparência diferente** (ex.: formulário de criação com variação de spacing/headers/rodapé).
4. **Página “reinventando layout interno”** em pontos de toolbar/section/empty-state/tabela.

---

## 2) Mapa de equivalência (benchmark Flowbite → implementação Nexo)

| Grupo (benchmark)            | Referência estrutural (Flowbite)   | Implementação Nexo (alvo)                                  |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| App shell (sidebar + navbar) | Application Shell                  | `MainLayout` + `NexoSidebar` + `NexoTopbar`                |
| Stat cards                   | KPI cards compactos                | `AppStatCard`                                              |
| Section cards                | Section/panel cards                | `AppSectionCard` / `AppInfoCard`                           |
| Data tables                  | Dense data table + actions         | `AppDataTable` + `AppRowActionsDropdown`                   |
| Forms                        | Form sections + field groups       | `AppForm`, `AppField`, `AppFormSection`, `AppFieldGroup`   |
| Modal                        | Sticky header/footer + scroll body | `BaseModal`, `FormModal`, `ConfirmModal`                   |
| Dropdown/Popover             | row actions / contextual menu      | `AppDropdown`, `AppRowActionsDropdown`                     |
| Timeline                     | Vertical feed                      | `AppTimeline`, `AppTimelineItem`, `AppActivityFeed`        |
| Toast/Alert                  | Feedback operacional               | `AppToast`, `AppAlert`, `AppSuccessState`, `AppErrorState` |
| Filter/toolbars              | horizontal filter bar              | `AppToolbar`, `AppFiltersBar`                              |
| Tabs                         | section tabs                       | `AppTabs`                                                  |
| Badges                       | state badges                       | `AppStatusBadge`                                           |

**Nota:** benchmark de estrutura, hierarquia e densidade; **sem copiar catálogo** e **sem importar Flowbite runtime/style**.

---

## 3) Mapa das páginas internas e padrão ideal

### Páginas no app interno atual

- Dashboard Executivo (`/executive-dashboard`)
- Clientes (`/customers`)
- Agendamentos (`/appointments`)
- Ordens de Serviço (`/service-orders`)
- Financeiro (`/finances`)
- WhatsApp (`/whatsapp`)
- Billing (`/billing`)
- Calendário (`/calendar`)
- Timeline (`/timeline`)
- Governança (`/governance`)
- Pessoas (`/people`)
- Configurações (`/settings`)

### Padrão-alvo por página (fase contínua)

- todas as páginas internas devem convergir para: `AppPageShell` + `AppPageHeader` + blocos `AppSectionCard`;
- listas/tabelas com `AppDataTable` + `AppStatusBadge` + `AppRowActionsDropdown`;
- formulários via `AppForm` e família;
- criação/edição/confirmação com `BaseModal`/`FormModal`/`ConfirmModal`.

---

## 4) Camada inicial do design system interno criada

Foram adicionados dois núcleos:

1. `client/src/components/app-system.tsx`:
   - layout/shell de página,
   - cards/surfaces,
   - dados (table, status badge, row actions, paginação),
   - formulários (field, field-group, sections, hints, actions),
   - feedback (toast/alert/loading/skeleton/success/error),
   - timeline/feed,
   - tabs/breadcrumbs.

2. `client/src/components/app-modal-system.tsx`:
   - `BaseModal`, `ModalHeader`, `ModalBody`, `ModalFooter`,
   - `FormModal`, `ConfirmModal`,
   - tamanhos `sm|md|lg|xl|full`,
   - body rolável, header/footer fixáveis,
   - bloqueio de fechamento em ação crítica,
   - alinhado aos tokens do app.

---

## 5) Sistema de modal moderno — consolidação inicial

### O que foi feito

- `ModalFlowShell` foi migrado para usar `FormModal` como base estrutural.
- `CreateAppointmentModal` foi migrado para `FormModal` + componentes de formulário (`AppForm`, `AppField`, `AppSelect`).

### Resultado

- mesma linguagem de header/body/footer,
- sem modal “solto” por tela,
- scroll concentrado no body,
- fechamento previsível com bloqueio em `pending`.

---

## 6) Regras de arquitetura visual (anti-regressão)

Documento-guia operacional (este arquivo) define:

- não usar componente de catálogo direto em páginas internas,
- toda composição interna passa por componentes do DS Nexo,
- modais internos devem usar `BaseModal`/`FormModal`/`ConfirmModal`,
- evitar hardcodes escuros (`bg-zinc-900`, `bg-slate-900`, `bg-black`) e padrões similares fora de token.

Adicionalmente, o script `lint:os` foi estendido para inspeção de classes proibidas em páginas/componentes internos.

---

## 7) Próximos passos recomendados (fase 4 em diante)

1. Migrar fluxos de criação/edição principais para `FormModal`:
   - Novo Cliente,
   - Nova O.S.,
   - confirmações críticas.
2. Refatorar páginas prioritárias:
   - Dashboard Executivo,
   - Clientes,
   - Agendamentos,
   - Ordens de Serviço,
   - Financeiro.
3. Fechar sweep de hardcodes remanescentes e padronizar toolbar/cards/tables em todas as páginas internas.
4. Validar light/dark para todas as rotas internas no checklist de regressão operacional.

---

## Confirmação explícita

✅ O Nexo continua usando arquitetura própria (layout, tema, overlays e tokens internos).

✅ Flowbite foi tratado somente como referência estrutural/visual de Application UI.

✅ Não houve instalação de Flowbite nem substituição da base arquitetural do Nexo.

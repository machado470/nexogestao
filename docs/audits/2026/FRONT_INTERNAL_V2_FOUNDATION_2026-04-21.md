# NexoGestão Front Interno V2 — Fundação (2026-04-21)

## 1) Auditoria visual objetiva (fase inicial)

### Layout e costura entre páginas auditados
- `AppLayout` e `MainLayout` (estrutura global autenticada, sidebar/topbar e área útil). 
- `PageShell` legado e `AppPageShell`/`AppPageHeader` consolidados.
- `design-system.tsx` (Sidebar/Topbar/DataTable), `DataTable.tsx` legado e wrappers em `internal-page-system.tsx`.
- Sistema de modais (`app-modal-system.tsx`) e modais por domínio (`Create*Modal`, `Confirm*Modal`, `DetailModal`).
- Biblioteca de componentes internos (`app-system.tsx`, `internal-page-system.tsx`, `operating-system/*`).

### Duplicações e divergências encontradas
- **Tabela duplicada** em três frentes: `design-system.tsx::DataTable`, `components/DataTable.tsx` e `internal-page-system.tsx::AppDataTable`.
- **Shell de página duplicado**: `PagePattern.tsx::PageShell` coexistindo com `app-system.tsx::AppPageShell`.
- **Badge de status duplicada**: `NexoStatusBadge` (design-system) e variantes locais em páginas/componentes.
- **Modal base consolidado existe**, porém havia páginas ainda com assinatura visual local em torno de diálogo.

### Problemas de consistência mapeados
- Espaçamento irregular entre páginas e blocos (variação de `space-y`, `p-*`, `gap-*` sem contrato único).
- Toolbars/filtros com densidade e altura inconsistentes.
- Cards equivalentes com respiros diferentes em páginas diferentes.
- Repetição de construções de header/section por tela, apesar de haver base reutilizável.

---

## 2) Fundação V2 consolidada nesta entrega

### Tokens e regras práticas adicionadas
Foram definidos tokens explícitos para spacing e densidade operacional no CSS base do app:
- `--nexo-space-page-padding-x`
- `--nexo-space-page-padding-y`
- `--nexo-space-section-gap`
- `--nexo-space-card-padding`
- `--nexo-space-toolbar-gap`
- `--nexo-control-height-md`
- `--nexo-table-row-height`

Aplicação direta:
- `nexo-page-shell` agora usa padding/gap por token (previsível e centralizado).
- `nexo-app-toolbar` com gap/padding/altura padrão.
- `nexo-data-table tbody tr` com altura mínima padronizada.

### Design system interno ajustado
- `AppPageShell` passou a depender do contrato de spacing do CSS (`nexo-page-shell`) sem reforço local de `space-y-*`.
- `AppToolbar` passou a usar classe dedicada `nexo-app-toolbar`.
- `AppDropdown` e `AppPopover` foram separados corretamente (antes `AppPopover` apontava para dropdown), incluindo exports de trigger/content/item para API curta e previsível.

---

## 3) Sistema de modal (base única)

A base de modal do Nexo continua oficial e foi mantida como contrato:
- `BaseModal`
- `ModalHeader`
- `ModalBody`
- `ModalFooter`
- `FormModal`
- `ConfirmModal`

Características já presentes e preservadas:
- overlay consistente
- bloqueio de fechamento quando necessário (`closeBlocked`)
- suporte a ESC/interação externa com controle
- tamanhos `sm/md/lg/xl/full`
- body com scroll interno controlado
- header/footer fixos opcionais
- foco inicial configurável

---

## 4) Proteção contra regressão visual

O validador `apps/web/scripts/validate-operating-system.mjs` foi ampliado para também verificar hardcodes escuros proibidos no núcleo de design system e no conjunto principal de modais internos.

Resultado esperado:
- reduzir regressão de `bg-black`, `bg-zinc-900`, `bg-slate-900` em surfaces/overlays
- manter disciplina visual no core reutilizável

---

## 5) Dashboard e base para próximas páginas

O Dashboard já está na base interna V2 (AppPageShell/AppPageHeader/AppSectionBlock/AppKpiRow/AppStatusBadge), com foco em:
- atenção imediata
- próxima melhor ação
- fluxo Cliente → Agendamento → O.S. → Cobrança → Pagamento
- fila operacional
- pulso da operação

A infraestrutura consolidada nesta rodada deixa a migração incremental pronta para:
- Clientes
- Agendamentos
- O.S.
- Financeiro
- WhatsApp

sem recriar header/card/table/modal por tela.

---

## 6) Confirmação de diretriz arquitetural

✅ O NexoGestão **mantém arquitetura e identidade próprias**.

Nesta fase não houve instalação/import de Flowbite, nem cópia cega de catálogo. O trabalho foi de consolidação interna com tokens, wrappers e contratos de componente do próprio Nexo.

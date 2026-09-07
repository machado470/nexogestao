# Consolidação Golden Standard — WhatsApp — 2026-09-07

## Baseline

- Baseline real: `7195c6d9`, merge do Financeiro disponível neste clone (commit equivalente `6c288d74`; o hash informado `cb1cf835` não está neste histórico).
- Branch de trabalho: `codex/whatsapp-golden-standard-consolidation-2026-09-07`.
- Migração golden anterior encontrada: `9e27ff95 feat(web): migrate WhatsApp to golden standard`, integrada por `e191418d`.
- A composição existente com `AppPageShell`, `AppOperationalHeader`, `AppFiltersBar`, `AppSectionBlock` e workspace em três áreas foi preservada; esta entrega é uma consolidação, não uma reescrita.

## Diagnóstico da categoria C

A superfície principal ainda importava diretamente Radix/shadcn para montar um menu em cascata de ações e templates. O submenu adicionava superfícies `nexo-cascade-*` e níveis locais `z-[60]`/`z-[70]`. Confirmação e cancelamento de workflows ainda usavam `window.confirm` e `window.prompt`, fora da infraestrutura de overlay e sem a experiência de foco consistente do design system.

## Contratos e autoridade operacional

O BFF `apps/web/server/routers/whatsapp.ts` mantém os contratos Zod e os endpoints autenticados:

- queries `health`, `listConversations`, `getConversation`, `getMessages`, `getContext`, `listPendingApprovals` e `listExecutionHistory`;
- mutations `sendMessage`, `sendTemplate`, `retryMessage`, `requestExecution`, `approveExecution`, `executeExecution` e `cancelExecution`;
- transporte para `/whatsapp/conversations`, mensagens, contexto e action executions sem envio arbitrário de `orgId` pela página.

A página continua apenas projetando `priority`, `priorityReason`, ownership, governance, intelligence e ações oficiais recebidas. O filtro usa `filter`, preservando a ordem relativa do inbox. O único `sort` remanescente organiza alfabeticamente as opções factuais de responsáveis, não as conversas. Datas são construídas somente para formatação de apresentação. Não há cálculo local de score, risco, SLA, cooldown, stale lock, ranking ou next-best-action.

## Consolidação visual e overlays

- O menu principal passou a usar exclusivamente `AppDropdown`, `AppDropdownTrigger`, `AppDropdownContent`, `AppDropdownItem`, `AppDropdownLabel` e `AppDropdownSeparator`.
- Os aliases canônicos de label e separator foram expostos junto às demais primitives em `app-system`.
- Templates existentes foram achatados no mesmo menu acessível. O submenu em cascata foi removido, mantendo as mesmas opções e handlers já existentes.
- `nexo-cascade-surface`, `nexo-cascade-submenu`, `z-[60]` e `z-[70]` foram removidos. Posicionamento, portal, Escape, click-away e retorno de foco ficam sob a primitive canônica.
- Execução usa `ConfirmModal`; cancelamento com justificativa usa `FormModal`, label associado e bloqueio durante mutation. Os overlays nativos foram removidos.
- Nenhum token global de stacking foi alterado.

## Envio, falhas e segurança

O envio manual continua aguardando `mutateAsync`, bloqueia pelo estado `isPending`, limpa o composer somente após sucesso e preserva o texto quando a mutation falha. Retentativa continua vinculada exclusivamente à mutation oficial. Os estados `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `UNCERTAIN` e `CANCELED` permanecem textuais, sem normalizar desconhecidos para enviado.

Autenticação, tenant derivado da sessão, provider ids, idempotência, ownership, locks, dispatch e infraestrutura WhatsApp não foram modificados.

## Responsividade, acessibilidade e temas

O workspace preserva uma coluna no mobile, lista/conversa alternadas, duas colunas a partir de `md` e três em `xl`, sempre com `min-w-0`, `min-h-0` e contenção de overflow. O menu canônico limita largura por viewport e altura pela área disponível do Radix. A validação estrutural cobre 360, 768, 1280 e 1440 px; em mobile, o contexto operacional continua acessado pela ação “Abrir contexto operacional”, como no baseline.

Os menus são operáveis por teclado e herdam Escape, foco e retorno de foco. Modais canônicos fornecem diálogo e focus trap; o campo de motivo possui label explícito. Cores e superfícies continuam baseadas em tokens, incluindo light/dark, sem novos hardcodes `bg-white`, `bg-black`, `text-white` ou `text-black`.

## Guardrails e limitações

`WhatsAppPage.golden-standard.test.ts` agora bloqueia reintrodução de import direto de dropdown, submenus, cascatas, z-index numérico local, `<details>`, listeners manuais e prompts/confirms nativos.

Não houve mudança em Webhook Recovery, ServiceOrders, Pessoas, Cockpit, Onboarding ou infraestrutura. Não foram adicionadas novas rotas, templates ou decisões operacionais. A validação visual automatizada depende de uma sessão/tenant com dados reais; por isso a entrega registra validação estrutural programática, sem afirmar inspeção autenticada de conteúdo real.

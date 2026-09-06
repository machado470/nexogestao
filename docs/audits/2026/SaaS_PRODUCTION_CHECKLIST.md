# NexoGestão — Checklist de SaaS pronto para clientes pagantes

## 1) Multi-tenancy seguro
- [x] `PrismaService` força `orgId` em models multi-tenant para leituras/escritas.
- [x] `TenantAccessGuard` global valida token vs `x-org-id` vs payload de mutação.
- [x] Endpoints críticos (`customers`, `serviceOrders`, `finance`, `timeline`) usam `@Org()` do token.

## 2) Billing / planos
- [x] Planos ativos para comercialização: Starter, Pro, Scale (compatível com legado `BUSINESS`).
- [x] Limites por plano aplicados via `QuotasService`.
- [x] Trial refletido no payload de limites (`trial.isTrial`, `trial.endsAt`).
- [x] Bloqueio por quota inclui CTA de upgrade para `/billing/plans`.

## 3) Métricas de uso
- [x] Tracking de criação de clientes.
- [x] Tracking de criação/fechamento de O.S.
- [x] Tracking de criação/pagamento de cobranças.
- [x] Endpoint de funil SaaS (`/analytics/saas-funnel`) com:
  - cliente -> O.S.
  - O.S. -> cobrança
  - cobrança -> paga

## 4) Auditoria
- [x] Eventos críticos com `actorUserId`, `entityType`, `entityId`, metadata.
- [x] Before/after em updates críticos (clientes e O.S.).
- [x] Visualização em `/audit` e `/audit/events`.

## 5) Permissões
- [x] Roles canônicas: `ADMIN`, `OPERADOR`, `FINANCEIRO`.
- [x] Compatibilidade com legado: `MANAGER`, `STAFF`, `VIEWER`.

## 6) Backup / segurança
- [x] Scripts de backup/restore em `infra/backup` e `scripts/restore-db.sh`.
- [ ] Expandir soft-delete para todas entidades críticas (fase seguinte).

## 7) Mobile UX real
- [ ] Revisão de modais e teclado mobile no app web (fase seguinte).

## 8) Notificações
- [x] Alertas internos já suportados pelo módulo `notifications`.
- [x] Mensageria WhatsApp operacional para cobrança/lembrete/recibo.

## 9) Risk engine
- [x] Base operacional já presente em `risk` + `operational-state`.
- [ ] Evoluir score financeiro-operacional composto (fase seguinte).

## 10) Teste real
- [x] Base de integração e concorrência disponível em `apps/api/test/integration`.
- [ ] Adicionar cenários de stress de UI + cliques rápidos no frontend (fase seguinte).

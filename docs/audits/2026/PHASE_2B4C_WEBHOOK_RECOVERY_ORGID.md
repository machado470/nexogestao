# Auditoria do `orgId` no recovery de webhooks WhatsApp — Fase 2B.4C

## Escopo e origem

Os endpoints de consulta, detalhe, estatísticas e replay de recovery ficam no `WhatsAppController`. O `orgId` autenticado é fornecido pelo decorator `@Org()`, portanto deriva do contexto/JWT validado pelo `JwtAuthGuard`. Um `orgId` opcional de query existe apenas nas leituras administrativas; `resolveWebhookAdminOrgId` rejeita valores diferentes do tenant autenticado. Os endpoints de replay encaminham diretamente o `orgId` autenticado e não aceitam substituição de tenant pelo body.

## Autorização e risco

O controller inteiro exige `JwtAuthGuard`, `RolesGuard` e role `ADMIN`. Assim, somente um administrador autenticado do próprio tenant pode chamar o recovery. Apesar da descrição “admin/debug”, o contrato atual é administrativo **intra-tenant**, e não uma operação de plataforma cross-tenant.

Não foi identificada falha crítica de autorização: as consultas e mutações do service recebem o tenant já restringido, e a tentativa de selecionar outro `orgId` é rejeitada antes da chamada. O risco residual é de manutenção: uma futura alteração que aceite o tenant solicitado sem compará-lo ao tenant autenticado poderia criar acesso cross-tenant. Esta fase preserva o contrato e não redesenha o endpoint.

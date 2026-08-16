# Auditoria de consistência operacional

**Data:** 2026-08-16. **Base auditada:** `09dd4fd84257a3d66e657a5db4c812acab3f35ff` na branch `work`, inicialmente limpa. O repositório não possui remote configurado. Gerenciador declarado: pnpm 10.30.3.

## Estado comprovado e diferenças para a intenção

Antes deste lote não havia modelo Outbox (`prisma/schema.prisma`), embora houvesse BullMQ (`src/queue`), idempotência persistida por `(orgId, scope, key)` (`common/idempotency`) e webhooks com entrega própria (`webhooks`). Não se duplicou fila: a nova Outbox cobre a lacuna entre commit de negócio e enfileiramento; o dispatcher existente continua consumidor real.

`TimelineService.logInTransaction` já oferecia evidência transacional, enquanto `log` gravava e depois tentava webhook. Pagamento já usava a primeira forma; criação de cobrança e conclusão de O.S. usavam efeitos posteriores. A documentação de Timeline e filas, portanto, descrevia uma meta apenas parcialmente aplicada.

## Fluxos reais e persistência

| Operação | Fluxo observado | Classificação apó lote |
|---|---|---|
| criar/atualizar agendamento | controller autenticado → `AppointmentsService`; Prisma e Timeline; sobreposição protegida por constraint/migrations | proteção parcial; não migrado para Outbox |
| iniciar O.S. | `ServiceOrdersService.update` valida transição e `updatedAt`; Timeline/auditoria posteriores | proteção parcial |
| concluir O.S. | update condicional + Timeline oficial + Outbox na mesma transação; automação, cobrança e WhatsApp depois | protegido no fato; efeitos existentes têm idempotência própria, mas ainda não são todos consumidores Outbox |
| criar cobrança | `FinanceService.createCharge`; Charge, Timeline e Outbox atômicas; WhatsApp depois | protegido no recorte |
| registrar pagamento | update condicional, Payment, Timeline e Outbox na transação; WhatsApp depois | protegido no recorte |
| WhatsApp | `WhatsAppService.enqueueMessage`, dispatcher/job e claims persistidos; chaves determinísticas | proteção parcial reutilizada; sucesso/falha ainda não foi migrado para a Outbox canônica |
| risco | `RiskService`/snapshots e sinais da Timeline | proteção parcial; regras existem, mas snapshots não carregam `orgId` nem versão da regra diretamente |
| governança | jobs e `GovernanceRunService.upsert`; ações operacionais possuem chave lógica | proteção parcial; não conectado automaticamente neste lote para evitar ciclo/bloqueio novo |
| SSE/notificação | notificação persiste antes do Pub/Sub; hub SSE é efêmero | já protegido quanto à fonte persistente; SSE não é verdade |

## Transações, falhas parciais e concorrência

A Outbox isola o único SQL bruto em `OutboxRepository`: claim atômico, lotes pequenos, `SKIP LOCKED`, recuperação de lock e propriedade por `lockedBy`. O worker não segura transação durante webhook, aplica retry/backoff, conserva falha definitiva e sanitiza erro. O contrato é pelo menos uma vez; idempotência do webhook continua apoiada em entregas persistidas.

Riscos residuais confirmados: idempotência de `ServiceOrder.idempotencyKey` e `Charge.idempotencyKey` é global no schema legado, apesar de as buscas incluírem tenant; efeitos posteriores da conclusão (automação/WhatsApp) ainda podem se perder se o processo morrer antes da chamada; `TimelineEvent` não possui colunas dedicadas de correlação/origem (ficam em metadados); banco permite update/delete direto da Timeline, embora serviço não exponha tais operações. Corrigir constraints globais exige migração de dados e ficou fora do recorte seguro.

## Multi-tenant

Controllers derivam `orgId` do usuário autenticado/guards, e serviços críticos usam `findFirst`/`updateMany` com `orgId`. A Outbox possui FK para organização, unicidade `(orgId,idempotencyKey)` e o worker usa `event.orgId`, nunca `payload.orgId`. Ainda faltam FKs compostas para impedir, no banco, toda relação cruzada de entidades que individualmente têm `orgId`; hoje a barreira principal é de serviço. Classificação: **proteção parcial**.

## Timeline, risco e governança

A Timeline é append-only pela API (`TimelineService` somente cria/lista). Os novos fatos carregam `origin=operational`; o contrato proíbe que eventos derivados retornem como evidência primária. Não foi criado consumidor de risco/governança porque isso ampliaria comportamento automático sem regra versionada. Lacuna confirmada: pesos/versão e causalidade não são persistidos uniformemente no motor atual.

## Seeds e inicialização

O entrypoint usa `prisma migrate deploy` quando `AUTO_MIGRATE=1`. Antes, qualquer `SEED_MODE` executava seed inclusive em produção, e `seed.ts` assumia piloto por padrão. Agora ambas as camadas falham de modo seguro em produção, salvo frase explícita de break-glass. Desenvolvimento/piloto permanecem compatíveis. Concorrência entre seeds explícitas ainda depende dos upserts internos; recomenda-se executar seed como job único, nunca em réplicas da API.

## Plano mínimo do próximo lote

1. Migrar sucesso/falha do dispatcher WhatsApp para fato transacional sem incluir corpo sensível.
2. Mover automação e criação automática de cobrança da conclusão para consumidores idempotentes reais.
3. Adicionar teste PostgreSQL real de dois workers e recuperar lock no pipeline com `RUN_REAL_INTEGRATION=true`.
4. Planejar constraints compostas tenant-entidade e alterar unicidades legadas somente apó auditoria de colisões.
5. Versionar sinais do risco antes de conectá-lo; manter governança como recomendação/aprovação existente.

## Lote 2 — Prova real e fechamento da entrega

### Diagnóstico rastreável

* O `OutboxModule` declara `OutboxWorker` uma vez em `providers` e é o mesmo módulo estático importado por `AppModule`, `FinanceModule` e `ServiceOrdersModule`. O compilador de módulos do Nest reutiliza o token do mesmo módulo estático; a inspeção sustenta **um worker por contexto/processo Nest**, não um por importador. O worker guarda um único `timer`, cancela-o em `onApplicationShutdown`, testa `stopping` antes de claim/schedule e fica desligado quando `NODE_ENV=test` (`apps/api/src/outbox/outbox.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/outbox/outbox.worker.ts`).
* Antes deste lote, `PROCESSED` era gravado logo depois de `WebhookDispatcher.dispatchTimelineEvent`. Isso significava apenas que o dispatcher retornou; como os modelos de webhook não estavam no schema Prisma, o `WebhookService` podia usar o fallback `disabled-*`, sem entrega real. Agora os modelos existentes na migration de webhook também estão no schema, e o dispatcher só retorna depois de persistir cada handoff obrigatório e enfileirá-lo. A chamada HTTP permanece no processor BullMQ, fora da transação/claim (`apps/api/src/outbox/outbox.worker.ts`, `apps/api/src/webhooks/webhook.dispatcher.ts`, `apps/api/src/webhooks/webhook.service.ts`, `apps/api/src/queue/processors/webhook.processor.ts`). Portanto, `PROCESSED` significa **handoffs persistidos e jobs aceitos**, não chamada externa concluída nem “exatamente uma vez”.
* O fan-out cria uma `WebhookDelivery` por endpoint. A identidade `outbox:<eventId>:endpoint:<endpointId>` e a constraint composta impedem que retry recrie A quando a tentativa em B falha; `upsert(update: {})` reutiliza a entrega. O `jobId` deriva da entrega persistida. A prova unitária repete o dispatcher com dois endpoints (`apps/api/src/webhooks/webhook.dispatcher.spec.ts`, `prisma/schema.prisma`, `prisma/migrations/20260816210000_outbox_webhook_idempotency/migration.sql`). Não há conceito legado de consumidor opcional.
* O tenant passado ao dispatcher é `event.orgId`, e não `payload.orgId`. O teste real persiste payload forjado e confirma que o registro reivindicado preserva separadamente o tenant oficial (`apps/api/src/outbox/outbox.worker.ts`, `apps/api/test/integration/outbox-postgres.integration.spec.ts`).
* `markProcessed`, `markRetry` e `markFailed` filtram por `id + PROCESSING + lockedBy`. O teste PostgreSQL usa dois `PrismaClient`/repositories, 12 eventos e dois workers, comprova divisão 6/6 sem interseção, rejeição de finalização pelo não dono, lock ainda válido, recuperação após envelhecimento, incremento de tentativas, bloqueio antes de `availableAt`, retry e preservação de `FAILED` (`apps/api/src/outbox/outbox.repository.ts`, `apps/api/test/integration/outbox-postgres.integration.spec.ts`).
* Erros persistidos são limitados e removem credenciais, URLs e sequências semelhantes a telefone. Payload de webhook contém o fato mínimo e não recebe segredo do endpoint (`apps/api/src/outbox/outbox.worker.ts`, `apps/api/src/webhooks/webhook.dispatcher.ts`).

### PostgreSQL isolado e reprodução

O ambiente exclusivo usa PostgreSQL 15, projeto Compose `nexogestao_outbox_test`, banco `nexogestao_outbox_test`, porta 55432 e volume removido no encerramento. O teste recusa uma `DATABASE_URL` cujo nome não contenha `outbox_test`/`test_outbox`.

```bash
./scripts/run-outbox-integration.sh
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/nexogestao_outbox_test?schema=public' RUN_REAL_OUTBOX_INTEGRATION=true pnpm --filter ./apps/api test -- test/integration/outbox-postgres.integration.spec.ts
docker compose -p nexogestao_outbox_test -f docker-compose.outbox-test.yml down -v
```

### Decisões e riscos residuais

Os efeitos pós-commit da conclusão de O.S. (analytics, cobrança condicional, automação e WhatsApp) continuam diretos em `ServiceOrdersService.update`. Embora cobrança e WhatsApp possuam chaves determinísticas, migrar apenas parte sem registro estável de consumo interno criaria dupla execução; não houve migração parcial perigosa (`apps/api/src/service-orders/service-orders.service.ts`). Fatos definitivos de WhatsApp também não foram adicionados: publicar depois da atualização de `WhatsAppMessage` reintroduziria janela; a solução segura deve integrar o fato à mesma transação do resultado (`apps/api/src/whatsapp/whatsapp.dispatcher.job.ts`, `apps/api/src/whatsapp/whatsapp.service.ts`).

As unicidades globais legadas de `ServiceOrder.idempotencyKey` e `Charge.idempotencyKey` não foram alteradas sem consulta de colisões em dados reais e validação de integrações externas. A Outbox já usa `(orgId,idempotencyKey)` e o teste real prova colisão no mesmo tenant e independência entre tenants (`prisma/schema.prisma`, `apps/api/test/integration/outbox-postgres.integration.spec.ts`).

O guard de seed agora possui função testável sem conexão e o script executa comportamentalmente a função real do entrypoint com `pnpm` substituído: produção sem frase/incorreta falha, frase exata passa e desenvolvimento permanece permitido; nenhum banco é acessado (`prisma/seed-guard.ts`, `prisma/seed.ts`, `scripts/test-production-seed-guard.sh`, `apps/api/test/seed-guard.behavior.spec.ts`).

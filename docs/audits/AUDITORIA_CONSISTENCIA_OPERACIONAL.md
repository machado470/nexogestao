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

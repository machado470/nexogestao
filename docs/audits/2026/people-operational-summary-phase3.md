# people.operationalSummary Fase 3 — vínculos auditáveis

## Financeiro confiável

O único vínculo financeiro por pessoa considerado confiável nesta fase é:

`Payment -> Charge -> ServiceOrder -> assignedToPersonId`

Esse caminho permite afirmar somente que um pagamento ou cobrança está relacionado a uma O.S. atribuída à pessoa. Ele não prova autoria comercial, venda realizada, comissão ou produtividade financeira individual.

Cobranças sem `serviceOrderId`, pagamentos sem cobrança, valores de `ServiceOrder.amountCents` isolados e vínculos apenas por cliente não são usados para métricas financeiras por pessoa.

## WhatsApp confiável

O único vínculo de WhatsApp por pessoa considerado confiável nesta fase é:

`Person.userId -> WhatsAppConversation.assignedUserId`

Mensagens só são contadas quando pertencem a uma conversa atribuída por esse vínculo. Mensagens soltas, vínculo apenas por cliente, `entityType/entityId` e contexto genérico não são usados para inferir responsabilidade da pessoa.

Quando a pessoa não possui `userId`, o bloco de WhatsApp retorna `null` para evitar atribuição falsa.

## Métricas deliberadamente não calculadas

- comissão por pessoa;
- venda atribuída por pessoa;
- produtividade financeira individual;
- redistribuição automática de carteira, cobrança, agenda ou conversa;
- inferência de comunicação por cliente sem regra operacional explícita.

# Auditoria — Lote Financeiro Inteligente

## Dados reais usados

- `Charge`: valor, status, vencimento, vínculo de cliente/O.S., pagamentos e timeline por cobrança.
- `Payment`: pagamentos vinculados à cobrança para derivar último pagamento.
- `Customer`: identificação e contato exibidos na fila.
- `ServiceOrder`: origem operacional da cobrança quando vinculada.
- `TimelineEvent`: última interação, último lembrete de cobrança, último risco operacional e recomendações anteriores.
- `WhatsAppMessage`: última interação com cliente por WhatsApp.
- `Risk Engine/Governance`: consumo do estado já registrado em eventos `RISK_UPDATED`/`CUSTOMER_OPERATIONAL_RISK_UPDATED`, limitado a `NORMAL`, `WARNING`, `RESTRICTED` e `SUSPENDED`.

## Derivações operacionais

- `daysOverdue`: diferença em dias entre vencimento e data atual quando a cobrança está vencida.
- `lastPaymentDate`: pagamento mais recente vinculado à cobrança ou `paidAt` da própria cobrança.
- `lastContactDate`: data mais recente entre timeline do cliente e WhatsApp.
- `lastChargeReminderDate`: último evento de lembrete de cobrança por `chargeId`.
- `priority`/`priorityReason`: atraso, valor em aberto e risco existente.
- `nextBestCollectionAction`: ação determinística, sem IA ou previsão inventada.

## Ordenação da fila

1. Cobranças vencidas.
2. Maior valor em aberto.
3. Maior risco existente.
4. Ausência de contato recente.
5. Prioridade derivada.

## Eventos de timeline

- `COLLECTION_ACTION_RECOMMENDED`: criado apenas quando a recomendação atual difere da última registrada para a cobrança.
- `COLLECTION_PRIORITY_CHANGED`: criado apenas quando a prioridade muda em relação ao evento anterior.

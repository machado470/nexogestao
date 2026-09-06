# Dashboard executivo — gaps de leitura operacional

Este lote transforma o dashboard em centro de decisão sem criar um novo read model e sem completar lacunas com estimativas no frontend.

## Dados reaproveitados

- `/dashboard/metrics`: clientes, O.S., receita, cobranças, pagamentos recebidos via `Payment` e comparação semanal equivalente com a semana anterior.
- `/dashboard/alerts`: O.S. atrasadas, cobranças vencidas, agenda do dia, clientes com pendências, O.S. concluídas sem cobrança e fila transversal leve com até 6 itens reais, incluindo conversas aguardando a operação e agendamentos futuros sem confirmação.
- `/internal/operational-signals?limit=8`: sinais operacionais priorizados.
- `/internal/operational-signals/next-best-action`: Próxima Melhor Ação real.
- `nexo.whatsapp.listPendingApprovals`: entrada compacta para aprovações pendentes.

## Gaps mantidos explícitos

1. O volume final do fluxo usa `Payment.paidAt` como fonte oficial e não converte cobrança `PAID` em pagamento. Cenários legados sem entidade `Payment` permanecem honestamente como zero recebido no período; não há fallback por cobrança paga.
2. A comparação operacional usa a semana corrente até agora contra a janela equivalente da semana anterior. Quando a base anterior é zero, o contrato retorna `null` e o Pulso informa ausência de base histórica suficiente.
3. A fila transversal leve agora sai de `/dashboard/alerts`, priorizando até 6 itens reais nesta ordem simples: O.S. atrasadas, cobranças vencidas, mensagens falhando, conversas `WAITING_OPERATOR` e agendamentos `SCHEDULED` sem confirmação. Se o produto precisar priorização transversal mais sofisticada, o próximo lote pode avaliar um read model operacional dedicado.

## Gaps resolvidos neste lote

- Agendamentos futuros sem confirmação entram como `UNCONFIRMED_APPOINTMENT` quando permanecem em `SCHEDULED` dentro da janela móvel das próximas 48 horas a partir da leitura. A busca é limitada e ordenada por `startsAt` ascendente.
- Conversas reais em `WAITING_OPERATOR` entram individualmente como `CUSTOMER_AWAITING_RESPONSE`, ordenadas pela maior espera observável (`waitingSince`, depois `lastInboundAt` e `lastMessageAt`). O vínculo com cliente continua opcional: a fila usa a conversa persistida e não cria cliente ou conversa virtual.

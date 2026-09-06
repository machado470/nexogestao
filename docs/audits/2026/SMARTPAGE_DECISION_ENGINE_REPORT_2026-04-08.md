# Relatório — Evolução SmartPage para motor de decisão operacional

Data: 2026-04-08

## 1) Ações implementadas

### Modelo de ação operacional
- Criado o modelo `SmartAction` com campos:
  - `label`
  - `reason`
  - `impact` (`revenue | risk | operation`)
  - `priority` (numérico)
  - `auto` (opcional)
- Criado `SmartActionWithExecution` para execução direta no front (`onExecute`).

### Geradores de ações por domínio
- **Service Orders**
  - Regra: O.S. concluída sem cobrança → ação **Gerar cobrança**.
- **Finance**
  - Regra: cobrança vencida → ação **Enviar WhatsApp**.
- **Customers**
  - Regra: cliente sem agendamento → ação **Sugerir agendamento**.
- **Appointments**
  - Regra: agendamento não confirmado (`SCHEDULED`) → ação **Enviar confirmação**.

### SmartPage atualizada
- Passa a receber `operationalActions`.
- Ordena e exibe ações com destaque para a ação principal.
- Mantém bloco de prioridades existentes e passa a permitir execução direta via botão.
- CTA principal da SmartPage executa a ação principal quando disponível.

## 2) Critérios de prioridade

Ordem de decisão implementada:
1. `impact = revenue` (maior prioridade)
2. `impact = risk`
3. `impact = operation`
4. Em empate de impacto, usa `priority` numérico (descendente)
5. Em novo empate, ordenação alfabética por `label`

## 3) Pontos de automação futura

- Acionamento automático (`auto = true`) com:
  - políticas de janela (horário comercial, cooldown por cliente),
  - validação de canal (telefone WhatsApp válido),
  - proteção de duplicidade (idempotência por entidade e período).
- Loop fechado de execução:
  - registrar sucesso/falha por ação,
  - recalcular prioridade pós-execução,
  - sugerir próxima ação com base em resultado real.
- Pontuação dinâmica de prioridade:
  - incorporar valor financeiro (`amountCents`), atraso em dias e SLA operacional.
- Rotina de “batch actions”:
  - execução em lote para múltiplas cobranças vencidas / confirmações pendentes.

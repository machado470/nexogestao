# Auditoria rápida — contrato `/people/operational-summary`

## Antes

`GET /people/operational-summary` já era tenant-scoped pelo `orgId` do contexto autenticado e retornava `{ people: [...] }` com identidade básica, status derivado de `active`, contadores de O.S. abertas/atrasadas, agendamentos de hoje/futuros, capacidades diárias, percentuais de uso, `capacityStatus`, disponibilidade atual/próxima, última atividade por timeline e `loadStatus`.

## Uso anterior no front

`PeoplePage.tsx` consumia diretamente os contadores, capacidade, disponibilidade, `lastActivityAt`, `workloadNotes` e `loadStatus`, mas ainda derivava no cliente o status operacional, prioridade, leitura humana, narrativa de capacidade/risco, ordenação de intervenção e textos de recomendação.

## Dados existentes que não chegavam como contrato explícito

O banco já tinha carga por O.S. e agendamento atribuídos, capacidade diária por pessoa, exceções de disponibilidade e eventos de timeline. O que faltava era consolidar esses sinais em campos operacionais estáveis para intervenção: `operationalStatus`, `priority`, `interventionReason`, ação recomendada e textos humanos auditáveis.

## Agora

O endpoint passa a entregar, por pessoa, o contrato operacional consolidado com identidade, responsabilidade, capacidade, disponibilidade, intervenção (`loadStatus`, `operationalStatus`, `priority`, `interventionReason`, `recommendedActionLabel`, `recommendedActionTarget`) e resumos humanos (`operationalSummaryText`, `capacitySummaryText`, `riskSummaryText`). Campos antigos foram preservados para compatibilidade.

## Lacunas documentadas

- Não há redistribuição automática de carga nesta fase.
- Não há métrica financeira confiável por pessoa no contrato de Pessoas; a UI mantém texto honesto sem inventar valores.
- Eventos futuros desejáveis para auditoria fina: pessoa criada/editada/desativada, disponibilidade criada/removida e mudança de capacidade. A timeline já pode ser aproveitada quando esses eventos forem emitidos de forma consistente.
- Quando capacidade diária não está configurada, percentuais continuam `null` e o texto informa indisponibilidade em vez de estimar números.

# Governança / risco operacional — diagnóstico da migração

Data da inspeção: 2026-09-07. Escopo exclusivo: `/governance`.

## Baseline

- O repositório estava limpo em `work`, no merge `e24dadd6`.
- O hash informado para a Timeline (`6ead6a9d`) não existe neste clone. O trabalho
  está preservado pelo commit `50ad148a` (`feat(web): migrate Timeline to golden
standard`) e pelo merge `e24dadd6`.
- A migração de Governança partiu dessa baseline na branch
  `codex/migrar-governanca-risco-operacional-padrao-ouro`.

## Diagnóstico anterior

`GovernancePage.tsx` misturava `AppPageHeader` e `AppSectionCard` com estruturas
locais. A página esperava todas as consultas antes de exibir qualquer conteúdo,
embora elas pudessem degradar separadamente. Também:

- derivava uma área de risco a partir de texto (`signalArea`);
- criava destinos de investigação no navegador (`routeForSignal`);
- filtrava sinais segundo a classificação local;
- apresentava estado, score, sinais, próxima ação e histórico em composição de
  cards com peso semelhante.

### Auditoria da lógica local

- **A — fatos:** valores, estado, razões, severidade, origem, timestamps, fatores,
  ação recomendada e execuções devolvidos pelos contratos.
- **B — apresentação:** tradução de rótulos, `new Date` exclusivamente para
  formatação, badge/tom visual, quebra de texto e navegação para `routeHint`.
- **C — decisão operacional paralela:** classificação textual da área do sinal e
  fabricação de destino conforme IDs. Ambas foram removidas. Não havia cálculo
  local de score, threshold, transição de estado ou ordenação por peso na página.

## Contratos oficiais consumidos

| Procedure tRPC                 | Endpoint API                                            | Schema Zod no BFF         | Campos autoritativos usados                                                              |
| ------------------------------ | ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `governance.operationalState`  | `GET /v1/governance/operational-state`                  | `operationalStateSchema`  | `operationalState`, `source`, `evidenceAt`, `availability`, `reason`, `evaluatedRecords` |
| `governance.autoScore`         | `GET /v1/governance/auto-score`                         | `autoScoreSchema`         | `score`, `level`, `lastUpdated`, `source`, `availability`, `reason`, `factors`           |
| `governance.runs`              | `GET /v1/governance/runs?limit=12`                      | `governanceRunSchema[]`   | identificador, contagens, score institucional, início/fim, duração e bucket              |
| `dashboard.operationalSignals` | `GET /v1/internal/operational-signals?limit=50`         | `operationalSignalSchema` | ordem da lista, severidade, área, título, razão, resumo, impacto, origem, detecção e IDs |
| `dashboard.nextBestAction`     | `GET /v1/internal/operational-signals/next-best-action` | `nextBestActionSchema`    | título, razão, impacto, recomendação, entidade, origem, detecção e `routeHint`           |

O BFF continua apenas validando e encaminhando esses dados; a organização vem da
sessão autenticada. Nenhum contrato foi ampliado na API. O schema já
`passthrough` de sinais passou a declarar explicitamente razão, origem e detecção
para que a UI preserve evidências já emitidas pela API de forma tipada.

## Dados que não existem nos contratos atuais

- Sinais não possuem destino oficial próprio (`routeHint` existe apenas na
  próxima melhor ação).
- Runs não informam ator/origem, razão/evidência textual, resultado nominal,
  estado anterior ou estado posterior.
- Não há contrato de políticas/regras informativas consumido pela página.
- Não há contrato de ações executadas associado a cada run; a próxima melhor
  ação é uma recomendação, não prova de execução.

Essas ausências devem permanecer explícitas ou ser omitidas. Em particular,
ausência/falha nunca pode ser convertida em `NORMAL`.

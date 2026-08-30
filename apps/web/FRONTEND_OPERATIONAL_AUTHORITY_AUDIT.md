# Auditoria final de autoridade operacional do frontend

Auditoria transversal executada sobre a base `f9e1aa42`. A classificação usada foi:
**fato** (valor retornado pela API), **apresentação** (formatação, filtro, paginação ou
ordenação visual) e **decisão** (risco, prioridade, urgência, recomendação, bloqueio ou
execução automática). Decisões pertencem aos contratos oficiais.

| Superfície | Dados e contrato oficial | Decisão local encontrada | Classificação e correção | Proteção/testes |
| --- | --- | --- | --- | --- |
| Dashboard / Executive | cockpit, notificações e resumos executivos | motores genéricos órfãos ainda podiam reconstruir plano e prioridade | decisão; motores removidos, cockpit oficial preservado | guardrail e contratos do dashboard |
| Clientes | `/customers/operational-summary`, workspace e fatos relacionados | workspace compartilhado recalculava risco, severidade e próxima ação | decisão; passou a apresentar status, sinal, motivo, prioridade e ação do resumo oficial | validador exige o contrato oficial e proíbe os resolvers locais |
| Pessoas / Perfil | summaries oficiais de pessoas, sessão e perfil | nenhuma violação ativa confirmada | fatos/apresentação; filtros e formatação preservados | testes de contrato existentes |
| Agendamentos / Calendário | agenda, conflitos, capacidade e recomendações oficiais | cálculos de layout, duração e agrupamento revisados | apresentação; preservados, sem criar status oficial | testes de contrato existentes |
| Ordens de Serviço | decisão operacional da O.S. e domínio de executions | motor genérico órfão poderia competir com o contrato | decisão; árvore local de rules/policy/prioritizer removida | guardrails de O.S. e validador |
| Financeiro | stats e operational queue oficiais | componentes legados não consumidos contêm projeções locais, mas não integram a página auditada | código inativo; página oficial mantida, sem fallback decisório | guardrail financeiro existente |
| WhatsApp | prioridade e ações oficiais do inbox | motor de decisão genérico podia consultar fatos e gerar ações fora do inbox | decisão; runner automático e resolvers removidos | guardrail WhatsApp existente |
| Timeline | eventos e metadados autoritativos | nenhuma violação ativa confirmada | apresentação; filtros factuais preservados | contrato de autoridade existente |
| Governança / Risco | summary e explicações oficiais | policy/risk-governance local órfã | decisão; motor removido | contrato BFF e validador |
| Configurações | administrative summary oficial | nenhuma violação ativa confirmada | fatos/apresentação | contrato existente |
| Billing / Planos | status e catálogo oficial de assinatura | contagem de dias é somente texto de apresentação; não altera elegibilidade | apresentação; preservada | contrato de billing existente |
| Auxiliares / compartilhados | sessão, navegação, consentimento e estado visual | automação global, memória de execução e logs decisórios persistidos no browser | decisão/estado operacional; removidos. Tema, sidebar, filtros e rascunhos visuais permanecem | validador bloqueia árvores e hooks conhecidos |
| BFF | sessão autenticada e encaminhamento para API | inputs críticos auditados quanto a `orgId`, `organizationId`, `tenantId` e `role` | autoridade; nenhum contexto do navegador aceito nos contratos críticos | validação estática objetiva no validador |

## Resultado

Não restam consumidores conhecidos dos motores paralelos removidos. Falha do resumo
oficial no workspace resulta em **decisão oficial indisponível**, nunca em estado normal,
baixo risco ou ação inventada. Permanecem no navegador somente estado de interface,
formatação e filtros de apresentação.

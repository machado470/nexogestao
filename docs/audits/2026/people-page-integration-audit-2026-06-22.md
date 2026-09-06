# Auditoria de integração — Página Pessoas (2026-06-22)

## Escopo e Fonte da Verdade Pessoas

Esta auditoria compara a página `PeoplePage` com a Fonte da Verdade Pessoas já documentada no produto: Pessoas deve responder “quem executa, qual é a carga e onde há risco operacional?”, usando `people.operationalSummary` e sinais reais de responsabilidade, sem inferir dados ausentes, sem automatizar redistribuições e sem substituir Configurações.

A arquitetura esperada também define a cadeia `Pessoa → Agendamentos → O.S. → Financeiro → Timeline → Risco/Governança`: Financeiro só deve ganhar leitura por responsável quando houver dado confiável por pessoa; Timeline é a prova oficial da responsabilidade; Risco/Governança interpreta sobrecarga, atraso, indisponibilidade e status crítico como necessidade de intervenção segura.

## Como a página consome dados hoje

`PeoplePage` consome diretamente:

- `trpc.people.operationalSummary`, que chama `GET /people/operational-summary`.
- `trpc.analytics.assigneeWarningSummary`, apenas para `ADMIN`.
- `trpc.people.listAvailabilityExceptions`, apenas para a pessoa selecionada.
- `trpc.nexo.timeline.listByOrg({ limit: 5 })`, como timeline agregada recente da organização.

No backend, `GET /people/operational-summary` consolida somente pessoas ativas/inativas do tenant, O.S. abertas atribuídas, agendamentos ativos futuros/hoje, última atividade por `TimelineEvent.personId` e exceções de disponibilidade futuras/atuais.

## Matriz por integração

| Integração | Existe integração? | Existe dado disponível? | Está sendo usado? | Está sendo exibido? | Está sendo ignorado? |
| --- | --- | --- | --- | --- | --- |
| People | Sim. CRUD, assignees, detalhe e operational-summary existem. | Sim: `Person` tem status ativo, papel, capacidades, risco operacional, disponibilidade, relações com agenda, O.S. e timeline. | Sim, mas principalmente via resumo operacional. | Sim: identidade, status, carga, capacidade, disponibilidade, prioridade/intervenção derivada/contratada. | Parcialmente: `riskScore`, `operationalRiskScore`, `operationalState`, offboarding e vínculo `userId` não entram no resumo exibido. |
| Customers | Não há integração direta Pessoas→Clientes na página. | Parcial: `Customer` se liga a O.S., agendamentos, cobranças, WhatsApp e timeline; por responsável é possível inferir via O.S./agenda atribuída. | Não. | Não. | Sim: clientes atendidos, clientes ativos por responsável e clientes aguardando resposta por responsável não são expostos em Pessoas. |
| Appointments | Sim, via `operational-summary`. | Sim: `Appointment.assignedToPersonId`, status, início/fim e índice por responsável existem. | Sim: hoje e futuros. | Sim: contadores de hoje/futuros e carga/capacidade de agenda. | Sim: conflitos, atrasos específicos de agenda, próximos compromissos detalhados e status por compromisso não são exibidos. |
| ServiceOrders | Sim, via `operational-summary`. | Sim: `ServiceOrder.assignedToPersonId`, status, prazos, início/fim e valor existem. | Sim: O.S. abertas e atrasadas. | Sim: contadores, carga, atraso e navegação para O.S. | Sim: concluídas, tempo médio, taxa de conclusão e detalhes das O.S. não são exibidos. |
| Finance | Não há integração financeira por pessoa na página. | Parcial e tecnicamente confiável apenas por caminho `Charge.serviceOrder.assignedToPersonId` e `Payment.charge.serviceOrder.assignedToPersonId`. | Não. | Não; a UI informa “Aguardando vínculo financeiro”/“sem dado financeiro inventado”. | Sim: receitas/cobranças/pagamentos por O.S. atribuída não são consumidos, apesar do relacionamento existir. |
| Timeline | Parcial. Há timeline por pessoa no backend e timeline agregada no front. | Sim: `TimelineEvent.personId`, `customerId`, `serviceOrderId`, `appointmentId`, `chargeId`. | Parcial: summary usa última atividade por pessoa; página usa timeline agregada da organização. | Sim: última atividade por pessoa e 5 eventos agregados da organização. | Sim: endpoint `/persons/:id/timeline` não é consumido; histórico operacional individual real não aparece na página. |
| Risk | Parcial no backend; fraco na página. | Sim: `RiskSnapshot.personId`; `TemporalRiskService` calcula sinais por pessoa com O.S., agenda, cobranças, pagamentos, WhatsApp e timeline. | Não diretamente na `PeoplePage`; apenas textos/intervenções do operational-summary e derivação local de carga/capacidade. | Parcial: risco operacional narrativo de carga/capacidade, não risk engine completo. | Sim: histórico de risco individual, tendências e sinais operacionais por executor não são exibidos. |
| Governance | Parcial indireta. | Sim: ações de governança podem executar atribuição e logar timeline com `personId`; leituras agregadas de governança existem. | Não como fonte da página Pessoas. | Não há bloco de intervenções/bloqueios/restrições de governança por pessoa. | Sim: intervenções relacionadas a pessoas, alertas/restrições e ações executadas por governança ficam fora da página. |
| WhatsApp | Não há integração direta com Pessoas. | Parcial: conversas têm `assignedUserId`, mensagens têm status/falha e podem se ligar a cliente/entidade; risk engine aproxima aguardando resposta via clientes com O.S. atribuída. Não há `assignedToPersonId` direto em conversa/mensagem. | Não. | Não. | Sim: mensagens enviadas, conversas atribuídas, falhas e clientes aguardando resposta ligados ao responsável não são exibidos. |
| operational-summary | Sim. | Sim, com contrato estável de carga/capacidade/disponibilidade/intervenção. | Sim, é a fonte principal. | Sim. | Ignora domínios externos ao contrato atual: clientes, financeiro, WhatsApp, risk snapshots, governança e timeline individual detalhada. |

## Clientes

- **Quantidade de clientes atendidos:** dado disponível de forma indireta por `Customer` ligado a O.S./agendamentos, mas não existe métrica no `operational-summary` nem consumo na página. Tecnicamente confiável se a regra de “atendido” for definida: por O.S. concluída, agendamento realizado, ou qualquer vínculo histórico.
- **Clientes em risco vinculados:** não há campo de risco no `Customer` e não há métrica por responsável na página. Pode haver risco operacional indireto por O.S./financeiro/WhatsApp no risk engine, mas não como cliente-em-risco canônico para Pessoas.
- **Clientes sem resposta vinculados:** WhatsApp possui conversas em espera e cliente vinculado; o risk engine já conta `WAITING_OPERATOR` por cliente com O.S. atribuída ao responsável. A página não consome isso.
- **Clientes ativos por responsável:** existe caminho técnico por O.S./agenda atribuída e `Customer.active`, mas não há endpoint/contrato pronto em Pessoas.

## Agendamentos

- **Carga atual:** existe e é exibida por `todayAppointmentsCount` e `futureAppointmentsCount`.
- **Conflitos:** a criação/atualização de agenda valida responsável e há estruturas de janela temporal, mas `PeoplePage` não recebe conflitos por pessoa.
- **Atrasos:** o risk engine identifica agendamentos passados sem execução; `operational-summary` não retorna atraso de agenda.
- **Próximos compromissos:** existe contagem futura; não existe lista de próximos compromissos por pessoa na página.

## Ordens de Serviço

- **Abertas:** existe e é exibido.
- **Atrasadas:** existe e é exibido por responsável.
- **Concluídas:** dado existe no modelo, mas não entra no `operational-summary`.
- **Tempo médio:** tecnicamente calculável com `startedAt`/`finishedAt` em O.S. concluídas, mas não existe contrato pronto.
- **Taxa de conclusão:** tecnicamente calculável se for definido recorte temporal e denominador; não existe contrato pronto.

## Financeiro

Possibilidade real e confiável:

- **Receita gerada pela pessoa:** confiável apenas como receita de cobranças/pagamentos de O.S. atribuídas à pessoa (`Payment -> Charge -> ServiceOrder.assignedToPersonId`). Não prova autoria comercial da venda nem execução integral quando há reatribuições históricas.
- **Cobranças originadas de serviços executados:** confiável para cobranças com `serviceOrderId` e O.S. atribuída; não cobre cobranças sem O.S.
- **Pagamentos relacionados:** confiável para pagamentos ligados a cobranças com `serviceOrderId` e O.S. atribuída.

A página acerta ao não inventar métrica financeira: hoje exibe fallback explícito de ausência de dado financeiro por pessoa.

## WhatsApp

- **Mensagens enviadas:** existem por `WhatsAppMessage`, mas não há vínculo direto com `Person`; só é seguro quando `entityType/entityId`, cliente ou metadata permitirem regra explícita.
- **Conversas atribuídas:** existe `assignedUserId`, mas Pessoas é `Person`; precisa mapear `Person.userId` com segurança.
- **Falhas de envio:** existem por status/falha em mensagem e eventos de timeline/risk engine, mas sem contrato por pessoa na página.
- **Clientes aguardando resposta:** existe como conversa `WAITING_OPERATOR` e o risk engine conta por clientes com O.S. atribuída ao responsável; não é exibido em Pessoas.

## Timeline

- **Última atividade real:** existe e é usada no resumo por `TimelineEvent.personId`; risk engine também considera atualizações de pessoa/O.S./agenda.
- **Eventos executados pela pessoa:** existe endpoint `/persons/:id/timeline`, mas `PeoplePage` usa timeline agregada da organização, não timeline individual.
- **Histórico operacional individual:** tecnicamente existe, mas não está exibido.

## Risk Engine

- **Risco individual:** existe `RiskSnapshot.personId` e `Person.operationalRiskScore`, além de cálculo temporal por pessoa. Não aparece como histórico/score do risk engine em Pessoas.
- **Sinais operacionais por executor:** existem no `TemporalRiskService` com O.S., agenda, financeiro, WhatsApp e timeline. Não são consumidos pela página.
- **Tendências de deterioração:** existem snapshots históricos possíveis, mas não são consumidos/exibidos.

## Governança

- **Intervenções relacionadas a pessoas:** governança executa atribuição e registra timeline com ator/pessoa; não há painel por pessoa.
- **Bloqueios/restrições:** `Person.operationalState` comporta estado operacional, mas `operational-summary` não expõe diretamente esse campo canônico.
- **Alertas/restrições:** existem leituras agregadas de governança; não há endpoint/contrato por pessoa na página.

## O que já existe

1. Centro operacional de Pessoas com fonte principal `people.operationalSummary`.
2. Carga real por O.S. abertas/atrasadas e agendamentos hoje/futuros.
3. Capacidade planejada por pessoa, uso percentual e indisponibilidades.
4. Última atividade por timeline vinculada a `personId`.
5. Telemetria administrativa de alertas passivos de atribuição.
6. Fallback financeiro honesto, sem inventar receita por pessoa.

## O que está disponível mas não é usado

1. Timeline individual por pessoa (`/persons/:id/timeline`).
2. Risk snapshots/histórico por pessoa (`/persons/:id/risk-history`).
3. Sinais avançados do `TemporalRiskService` por executor.
4. Relação financeira confiável via `Payment -> Charge -> ServiceOrder -> assignedToPersonId`.
5. Conversas WhatsApp por `assignedUserId` cruzável com `Person.userId`.
6. Clientes vinculados por O.S./agenda atribuída.
7. Estado operacional persistido em `Person.operationalState` e `operationalRiskScore`.
8. Dados de O.S. concluídas, tempo médio e taxa de conclusão.

## O que não existe

1. Contrato de Pessoas para clientes atendidos/ativos/em risco/sem resposta por responsável.
2. Contrato de Pessoas para conflitos de agenda por responsável.
3. Contrato de Pessoas para próximos compromissos detalhados por responsável.
4. Contrato financeiro por responsável com semântica declarada e recorte temporal.
5. Contrato WhatsApp por responsável baseado em `Person`, não apenas `User` ou cliente.
6. Contrato de governança por pessoa com intervenções, bloqueios, alertas e restrições.
7. Definição de produto para “cliente atendido”, “receita gerada pela pessoa” e “taxa de conclusão” por responsável.

## Fase 2 recomendada

Fase 2 deve ampliar o contrato sem mudar o comportamento visual de forma especulativa:

1. Enriquecer `people.operationalSummary` com blocos opcionais e auditáveis: `customers`, `appointments`, `serviceOrders`, `timeline` e `risk`, todos com recorte temporal explícito.
2. Consumir `/persons/:id/timeline` no detalhe da pessoa selecionada.
3. Consumir `/persons/:id/risk-history` ou expor resumo de risco individual no operational-summary.
4. Adicionar métricas de O.S. concluídas, atraso, tempo médio e taxa de conclusão com denominador explícito.
5. Adicionar clientes ativos/atendidos por responsável depois de definir semântica de “atendido”.

## Fase 3 recomendada

Fase 3 deve tratar integrações que exigem semântica mais forte e governança de produto:

1. Financeiro por pessoa com trilha de auditoria: receita recebida por O.S. atribuída, cobranças originadas e pagamentos relacionados, deixando claro que não mede comissão/autoria comercial.
2. WhatsApp por responsável: mapear `Person.userId -> WhatsAppConversation.assignedUserId`, mensagens, falhas e clientes aguardando resposta.
3. Governança por pessoa: intervenções, restrições, bloqueios e alertas com rastreabilidade.
4. Tendência de deterioração operacional por executor baseada em snapshots e eventos históricos.
5. Eventual recomendação/redistribuição assistida, ainda sem execução automática, se o produto aprovar.

## Nota de maturidade da Página Pessoas

**Nota: 6,5/10.**

A página já cumpre bem o núcleo da Fonte da Verdade Pessoas: mostra quem executa, carga operacional, atrasos de O.S., agenda, capacidade e disponibilidade, e evita inventar financeiro. A maturidade cai porque metade da arquitetura integrada do Nexo ainda não chega ao contrato da página: clientes, WhatsApp, financeiro, timeline individual, risk engine avançado e governança por pessoa existem total ou parcialmente no backend, mas não são consumidos/exibidos por Pessoas.

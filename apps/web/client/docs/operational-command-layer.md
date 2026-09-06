---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Camada operacional transversal do NexoGestão

## Objetivo

A camada operacional transversal transforma o Dashboard em uma mesa de comando única. Em vez de abrir com KPIs genéricos ou módulos isolados, ela responde primeiro:

1. qual é o estado da operação;
2. qual risco importa agora;
3. qual ação deve ser executada;
4. onde a cadeia Cliente → Agendamento → O.S. → Cobrança → Pagamento → Timeline → Risco/Governança está travando.

Essa camada não cria regra de negócio nova, não muda contrato de API e não inventa backend. Ela organiza leituras já disponíveis e mostra fallbacks explícitos quando algum dado não existe ou está indisponível.

## Configurações como Centro de Controle

Configurações usa a camada operacional de forma compacta e adaptada. A página é administrativa: deve explicar como a empresa está configurada, quais regras estão ativas, quais áreas precisam de configuração, quem tem acesso, quais integrações estão prontas e quais ajustes mudam o comportamento do sistema.

Evite repetir em Configurações os blocos completos de Estado, Risco, Próxima Melhor Ação, Fluxo Operacional e Timeline quando eles não gerarem uma decisão administrativa nova. OCL pesada continua mais apropriada para Dashboard, Governança e páginas operacionais; em Configurações, a leitura deve virar cards curtos, pendências compactas e CTAs de ajuste.

## Componentes canônicos

### `OperationalStateCard`

Mostra o estado atual da operação ou do contexto.

Use para exibir:

- nível operacional (`NORMAL`, `WARNING`, `RESTRICTED`, `SUSPENDED`);
- motivo principal;
- impacto operacional;
- CTA para detalhes quando houver página relacionada.

### `NextBestActionCard`

Padrão único para Próxima Melhor Ação no app.

Use para exibir:

- título da ação;
- entidade relacionada;
- motivo;
- impacto esperado;
- observação de segurança quando existir;
- CTA principal;
- CTA secundário opcional.

Regra: novas próximas ações não devem criar card visual local. Elas devem adaptar seus dados para este componente.

### `OperationalFlowCard`

Mostra a operação como cadeia viva, não como menu de módulos.

Etapas esperadas:

`Cliente → Agendamento → O.S. → Cobrança → Pagamento → Timeline → Risco/Governança`

Cada etapa deve informar:

- label;
- status visual;
- resumo curto;
- contagem ou valor quando existir;
- estado (`done`, `active`, `warning`, `blocked`, `idle`);
- link opcional para a página relacionada.

### `EntityTimelineCard`

Mostra a Timeline como prova oficial contextual.

Use para exibir:

- título e subtítulo;
- lista curta de eventos oficiais;
- tipo do evento;
- data/hora;
- entidade relacionada;
- ator/responsável quando existir;
- resumo legível;
- link para a Timeline completa.

A linguagem deve reforçar “últimos eventos oficiais” ou “prova operacional”.

## Regras de uso

- Usar tokens existentes do Nexo e manter compatibilidade light/dark.
- Não usar Flowbite como dependência.
- Não criar dark mode local.
- Não usar fundos escuros hardcoded em componentes internos.
- Não duplicar próxima ação local: adaptar para `NextBestActionCard`.
- Não criar timeline visual solta: usar `EntityTimelineCard` quando o objetivo for prova operacional.
- Não esconder risco apenas em Governança: risco relevante deve aparecer no Dashboard e nos contextos decisórios.
- Não alterar banco, backend ou contrato de API para usar esta camada.
- Quando dado não existir, mostrar fallback seguro e explícito, sem exemplos fictícios.

## Aplicação inicial

A primeira aplicação é no Dashboard principal (`ExecutiveDashboard`):

1. Estado da operação;
2. Maior risco / atenção imediata;
3. Próxima Melhor Ação;
4. Fluxo operacional transversal;
5. Prova operacional da Timeline;
6. Fila operacional;
7. KPIs como apoio, não como abertura decisória.

## Páginas alvo futuras

- Clientes;
- Financeiro;
- WhatsApp;
- Agendamentos;
- O.S.

Essas páginas devem adotar a camada gradualmente, sem refatoração global e sem criar padrões paralelos.

## Adoção em Clientes

A página de Clientes (`CustomersPage`) adota a camada operacional transversal no detalhe do cliente para funcionar como um dossiê operacional, não apenas como lista/cadastro. Ao selecionar um cliente, a leitura passa a abrir com resumo do relacionamento e, em seguida, com os componentes canônicos da Operational Command Layer.

### Como Clientes usa a camada

- `OperationalStateCard` resume o estado operacional do cliente selecionado, com motivo principal, impacto operacional e CTA para a etapa relacionada.
- `OperationalRiskCard` explicita o risco dominante ou a ausência de risco relevante sem criar bloco visual paralelo.
- `NextBestActionCard` substitui orientação local solta por uma próxima melhor ação canônica, sempre sem execução automática.
- `OperationalFlowCard` mostra a cadeia `Cliente → Agendamento → O.S. → Cobrança → Pagamento → Timeline → Risco/Governança` com estados por etapa.
- `EntityTimelineCard` apresenta os últimos eventos oficiais/contextuais como prova operacional do cliente.

### Dados reaproveitados

Clientes reaproveita exclusivamente dados já disponíveis na página e no workspace do cliente:

- cliente selecionado e dados cadastrais;
- agendamentos relacionados;
- ordens de serviço relacionadas;
- cobranças pendentes, vencidas e pagas;
- último pagamento inferido das cobranças retornadas;
- telefone/WhatsApp para ação assistida;
- timeline/eventos oficiais retornados pelo workspace;
- sinais já calculados de risco, pendência, O.S. aberta e ausência de movimentação recente.

### Fallbacks seguros

Quando não há endpoint específico de decisão, Clientes calcula fallback local com os dados já carregados:

1. cobrança vencida recomenda cobrar o cliente;
2. O.S. aberta ou atrasada recomenda acompanhar/abrir ordem de serviço;
3. agendamento sem confirmação ou futuro recomenda confirmar agenda;
4. ausência de movimentação recente recomenda enviar mensagem;
5. ausência de agenda futura recomenda criar novo agendamento;
6. sem pendências recomenda revisar histórico oficial.

Esses fallbacks são declarados no card de Próxima Melhor Ação e não executam nada automaticamente. Se a timeline não retornar eventos, `EntityTimelineCard` mostra fallback explícito e não cria histórico fictício.

### Diretriz para próximas páginas

Clientes agora serve como segunda prova do padrão operacional transversal depois do Dashboard: cada módulo deve adaptar seus dados existentes aos componentes canônicos, manter fallbacks explícitos e evitar criar cards paralelos de próxima ação, fluxo ou timeline. Novas páginas devem seguir o mesmo padrão sem alterar backend, banco, contratos de API ou regras de negócio apenas para adotar a camada.

## Adoção em Financeiro

A página de Financeiro (`FinancesPage`) é o centro operacional de conversão da execução em receita. Ela não tenta ser um ERP contábil pesado: a primeira leitura responde quanto já foi recebido, quanto ainda está a receber, o que venceu, o que está previsto, quem deve ser cobrado agora e qual risco financeiro existe com base somente nos dados carregados.

### Como Financeiro usa a camada

- `OperationalStateCard` abre a página com estado financeiro operacional (`NORMAL`, `WARNING` ou `RESTRICTED`) a partir de vencidas, valor vencido, pendências, vencimentos próximos, pagamentos recebidos e O.S. concluídas sem cobrança quando esse dado já está carregado.
- `OperationalRiskCard` explica o risco com valor vencido, quantidade de cobranças vencidas, maior/médio atraso calculado por `dueDate` e cobrança/cliente mais crítico.
- `NextBestActionCard` concentra a Próxima Melhor Ação financeira, sem execução automática: cobrar vencida, enviar link antes do vencimento, revisar recebimento, gerar cobrança para O.S. concluída sem cobrança ou revisar carteira.
- KPIs compactos e o bloco de saúde do caixa mostram recebido, a receber, vencido, previsto, dinheiro pendente, dinheiro em risco e gargalo cobrança → pagamento sem gráficos ou cards vazios.
- Alertas compactos destacam cobranças vencidas, pendentes, pagamentos sem registro e cobrança sem contato apenas quando a fonte retorna campo suficiente; quando não retorna, a tela declara fallback em vez de inferir automação ou falha.
- A carteira operacional lista cliente, valor, status, vencimento, dias de atraso e origem/O.S. quando disponível, com ações reais existentes: cobrar/WhatsApp contextual, enviar link via contexto existente, registrar pagamento, abrir cliente, abrir O.S. e ver detalhe.
- `EntityTimelineCard` substitui timeline visual solta por prova operacional financeira: usa eventos oficiais quando a Timeline retorna dados e, quando não retorna, exibe fallback contextual derivado de cobranças/pagamentos carregados, deixando claro que não substitui a Timeline oficial.

### Dados reaproveitados

Financeiro reaproveita apenas dados já disponíveis na página:

- cobranças retornadas por `finance.charges.list` e detalhe por `finance.charges.getById`;
- status, valor, vencimento e pagamentos vinculados à cobrança;
- clientes carregados para enriquecer nome e vínculo operacional;
- O.S. carregadas para indicar origem e detectar O.S. concluída sem cobrança;
- campos existentes de comunicação/WhatsApp somente como leitura ou CTA contextual já existente;
- eventos oficiais de Timeline por cliente e por O.S. quando retornados pelos endpoints já usados.

### Fallbacks seguros

- Se não há Timeline retornada, a página informa fallback contextual e não cria histórico fictício.
- Se a lista geral de pagamentos não está exposta, a leitura usa pagamentos vinculados ao detalhe da cobrança e sinaliza essa limitação.
- Se telemetria de WhatsApp/comunicação não vem no payload, Financeiro não inventa falha de envio; apenas mantém CTA contextual existente.
- `SUSPENDED` não é usado em Financeiro sem dado real que comprove suspensão.
- A Próxima Melhor Ação apenas orienta o operador; não envia mensagem, não registra pagamento e não altera cobrança automaticamente.

### Relação Execução → Cobrança → Pagamento → Receita

Financeiro trata cobrança como ponte direta entre operação concluída e caixa. O.S. concluída sem cobrança é receita operacional ainda não convertida. Cobrança vencida só vira atraso quando existe vencimento confiável, aumenta risco financeiro e deve ser priorizada por ação real do operador. Cobrança pendente próxima do vencimento fica em atenção preventiva. Cobrança paga sem pagamento vinculado vira revisão de recebimento para evitar divergência entre status financeiro e prova operacional. O detalhe financeiro permanece focado em cobrança, pagamento, histórico/timeline e comunicação existente.

### Congelamento de WhatsApp e próximas páginas

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não deve ser alterado, não há novo fluxo de comunicação e os CTAs continuam apenas navegando para o contexto já existente. Depois de Financeiro, as próximas páginas candidatas para adoção da Operational Command Layer são O.S. e Agendamentos.

## Adoção em Ordens de Serviço

A página de Ordens de Serviço (`ServiceOrdersPage`) adota a camada operacional transversal para transformar a O.S. em centro de execução operacional. A primeira leitura deixa de ser apenas lista, filtro e ação rápida: ao selecionar uma O.S., a página passa a responder o que está sendo executado, em que estado está, quem é responsável, qual risco existe, qual ação deve acontecer agora e como isso impacta cobrança, pagamento, Timeline e Governança.

### Como O.S. usa a camada operacional

- `OperationalStateCard` calcula o estado da O.S. (`NORMAL`, `WARNING` ou `RESTRICTED`) a partir de status, atraso, responsável, conclusão sem cobrança e cobrança vinculada vencida. `SUSPENDED` continua reservado para dado real de suspensão.
- `OperationalRiskCard` explica o risco dominante com motivo operacional: atraso, ausência de responsável, execução sem prazo, receita não capturada ou cobrança vencida vinculada. Quando não há bloqueio crítico, o card declara essa condição sem criar risco genérico.
- `NextBestActionCard` concentra a Próxima Melhor Ação da execução, sem execução automática: destravar execução atrasada, atribuir responsável, atualizar andamento/concluir serviço, gerar cobrança, cobrar cliente, revisar histórico de cancelada ou revisar detalhes.
- `OperationalFlowCard` mostra a cadeia `Cliente → Agendamento → O.S. → Cobrança → Pagamento → Timeline → Risco/Governança` com estados `done`, `active`, `warning`, `blocked` ou `idle` por etapa.
- `EntityTimelineCard` substitui a timeline local solta por prova operacional da execução: usa eventos oficiais da Timeline quando retornados e, quando não há eventos, mostra fallback contextual derivado apenas de datas reais da própria O.S. ou da cobrança vinculada.

### Dados reaproveitados

Ordens de Serviço reaproveita somente dados já carregados pela página:

- lista de O.S. retornada por `nexo.serviceOrders.list`;
- cliente vinculado carregado por `nexo.customers.list` ou embutido no payload da O.S.;
- agendamento vinculado carregado por `nexo.appointments.list`;
- cobrança vinculada carregada por `finance.charges.list` ou pelo `financialSummary.latestCharge` da O.S.;
- evidência de pagamento inferida do status `PAID` ou de pagamentos embutidos na cobrança quando retornados;
- responsável/assignee carregado pela própria O.S. ou por `people.list`;
- status, criação, início, prazo, conclusão, valor e descrição já existentes na O.S.;
- eventos oficiais da Timeline retornados por `nexo.timeline.listByServiceOrder`.

### Fallbacks seguros

- Se não houver O.S. selecionada, a camada mostra leitura agregada da carteira e orienta selecionar ou criar O.S.
- Se não houver Timeline oficial, `EntityTimelineCard` declara explicitamente que os eventos contextuais vêm de datas reais da O.S. e não substituem a Timeline oficial.
- Se não houver datas reais suficientes, a prova operacional informa ausência de histórico em vez de fabricar evento.
- Se não houver cobrança vinculada, a etapa de cobrança fica `idle` ou `blocked` apenas quando a O.S. já está concluída.
- Se não houver pagamento exposto, a etapa de pagamento depende da cobrança e usa apenas status `PAID` ou pagamentos embutidos quando existirem.
- `SUSPENDED` não é usado em O.S. sem dado real de suspensão.
- A Próxima Melhor Ação apenas orienta; iniciar, concluir, editar, gerar cobrança ou navegar continuam usando ações já existentes.

### Relação Cliente → Agendamento → O.S. → Cobrança → Pagamento

A O.S. passa a ser a ponte entre execução e dinheiro. Cliente confirma o contexto operacional; agendamento indica origem ou ausência de agenda; O.S. concentra status, responsável, prazo e conclusão; cobrança mostra se a execução já virou receita; pagamento indica se a cobrança fechou o ciclo financeiro. Quando alguma etapa falha, o fluxo sinaliza `warning` ou `blocked` para que o operador entenda onde a execução deixou de avançar.

### Timeline, Risco e Governança

A Timeline é tratada como prova oficial da execução. Atraso, ausência de responsável, conclusão sem cobrança e cobrança vencida elevam o risco operacional e alimentam a leitura de Governança. Quando a Timeline não retorna eventos, a página pode exibir até quatro eventos contextuais derivados de datas reais — criação, início, conclusão e cobrança gerada — sempre com aviso de que isso não substitui a Timeline oficial.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não deve ser alterado, não há novo fluxo de comunicação e os CTAs continuam apenas navegando para contextos já existentes. Depois de O.S., a próxima página candidata para adoção da Operational Command Layer é Agendamentos.

## Adoção em Agendamentos

A página de Agendamentos (`AppointmentsPage`) adota a camada operacional transversal para funcionar como controle de entrada operacional. A primeira leitura deixa de ser apenas agenda/lista de horários e passa a responder o que vai acontecer, quando, com quem, qual risco existe, qual ação deve acontecer agora e como o agendamento avança para O.S., cobrança, pagamento, Timeline e Governança.

### Como Agendamentos usa a camada operacional

- `OperationalStateCard` calcula o estado da entrada (`NORMAL`, `WARNING` ou `RESTRICTED`) a partir do agendamento em foco ou, quando não houver detalhe selecionado, da carteira carregada. A leitura considera atraso, no-show, conflito real por sobreposição, falta de confirmação, proximidade do horário, ausência de responsável, cancelamento e conclusão sem O.S. `SUSPENDED` não é usado sem dado real.
- `OperationalRiskCard` explica o risco dominante com motivo específico: atraso/no-show, conflito, falta de confirmação, ausência de responsável ou atendimento concluído sem O.S. Quando não há bloqueio crítico, o card declara a condição saudável sem inventar risco genérico.
- `NextBestActionCard` concentra a Próxima Melhor Ação de Agendamentos, sem execução automática: revisar atraso/no-show, confirmar agendamento, preparar atendimento, atribuir responsável, gerar O.S., revisar histórico de cancelado ou revisar agenda do dia.
- `OperationalFlowCard` mostra a cadeia `Cliente → Agendamento → O.S. → Cobrança → Pagamento → Timeline → Risco/Governança`, indicando onde a entrada já está concluída, ativa, em atenção, bloqueada ou ainda ociosa.
- `EntityTimelineCard` apresenta a prova operacional da agenda. Quando há eventos oficiais retornados, eles são exibidos como fonte principal; quando não há Timeline oficial carregada, a página mostra fallback explícito e pode listar até quatro eventos contextuais derivados apenas de datas reais do próprio agendamento ou da O.S. vinculada.

### Dados reaproveitados

Agendamentos reaproveita dados já disponíveis ou contratos já existentes no front-end:

- agendamentos retornados por `nexo.appointments.list`;
- cliente vinculado pelo payload do agendamento ou por `nexo.customers.list`;
- responsável/assignee por `assignedToPersonId`, `personId` e `people.list`;
- status, data/hora inicial, data/hora final, duração, criação, atualização e observações do agendamento;
- O.S. vinculada por `nexo.serviceOrders.list` via `appointmentId`;
- cobrança vinculada à O.S. por `finance.charges.list` ou `financialSummary.latestCharge`, quando existir;
- evidência de pagamento por status `PAID` ou pagamentos embutidos na cobrança, quando retornados;
- eventos oficiais da Timeline por cliente quando a página está em contexto de cliente.

### Fallbacks seguros

- Se não houver agendamento selecionado, a camada usa a carteira carregada para escolher o primeiro item acionável ou orienta criar/selecionar agendamento.
- Se não houver Timeline oficial carregada, o card informa explicitamente que eventos contextuais são derivados de datas reais e não substituem a Timeline completa.
- Se não houver O.S. vinculada, a etapa de O.S. fica `idle` antes da execução e `blocked` somente quando o agendamento já está concluído.
- Se não houver cobrança ou pagamento exposto pelo vínculo com O.S., as etapas financeiras ficam `idle` ou `blocked` apenas quando o ciclo já deveria ter avançado.
- Conflito de agenda só é sinalizado quando há datas suficientes e sobreposição real para o mesmo cliente ou responsável.
- A Próxima Melhor Ação apenas orienta. Confirmar, editar/remarcar, criar O.S. ou navegar continuam usando ações existentes.

### Relação Cliente → Agendamento → O.S. → Cobrança → Pagamento

Agendamentos fecha a entrada da operação. Cliente confirma o contexto; agendamento define quando e com quem o atendimento deve acontecer; O.S. transforma o horário em execução; cobrança transforma execução em receita; pagamento fecha o ciclo financeiro. O fluxo visual mostra gargalos quando a entrada está atrasada, sem confirmação, sem responsável, concluída sem O.S. ou sem evidência financeira depois da execução.

### Timeline, Risco e Governança

A Timeline é tratada como prova oficial da agenda. Atraso, no-show, falta de confirmação, conflito, ausência de responsável e conclusão sem O.S. elevam o risco operacional e alimentam a leitura de Governança. Quando a Timeline não retorna eventos, a página não cria histórico fictício: apenas deriva eventos de datas reais já presentes no agendamento e orienta abrir a Timeline completa para prova oficial.

### Congelamento de WhatsApp e próximas páginas candidatas

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e os CTAs existentes continuam apenas navegando para contextos já existentes. Depois de Agendamentos, as próximas páginas candidatas para adoção da Operational Command Layer são Timeline e Governança.

## Adoção em Timeline

A página de Timeline (`TimelinePage`) adota a Operational Command Layer para funcionar como camada de evidência operacional oficial. A primeira leitura deixa de ser somente um histórico visual e passa a responder qual evidência importa agora, qual risco ela revela, qual entidade foi afetada, quem registrou o evento e qual ação ou investigação deve acontecer depois.

### Como Timeline usa a camada operacional

- `OperationalStateCard` calcula o estado da evidência (`NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`) a partir dos eventos oficiais já carregados. A leitura considera criticidade, sinais financeiros, O.S., agendamentos, governança, risco, falhas reais de comunicação quando já existem no evento e ausência de evento recente. `SUSPENDED` só aparece quando metadados reais da Timeline indicam suspensão.
- `OperationalRiskCard` mostra o risco dominante baseado em evidência concreta do feed: cobrança vencida/pendente, O.S. atrasada ou travada, agendamento cancelado/no-show/atrasado, falha de comunicação já registrada ou evento de governança/risco. Quando não há risco dominante, o card declara ausência de evidência relevante em vez de criar risco genérico.
- `NextBestActionCard` concentra a Próxima Melhor Ação da Timeline sem execução automática: investigar evento crítico, abrir cobrança, abrir O.S., abrir agendamento, abrir governança ou revisar histórico recente.
- `OperationalFlowCard` mostra a cadeia `Evento → Timeline → Risco → Governança → Ação`, com estados `done`, `active`, `warning`, `blocked` ou `idle` conforme o carregamento do feed, a presença de risco e a existência de evidência de governança.
- `EntityTimelineCard` destaca “Eventos oficiais mais relevantes” com até quatro eventos reais normalizados a partir do recorte carregado. Não há criação de eventos fictícios.

### Dados reaproveitados

Timeline reaproveita somente dados já disponíveis na própria página e no contrato existente de `nexo.timeline.listByOrg`:

- eventos oficiais carregados no feed;
- tipo do evento por `action` ou `type`, incluindo aliases legados já normalizados;
- entidade por `customerId`, `serviceOrderId`, `appointmentId`, `chargeId` ou `metadata.entityType`;
- identificador da entidade por campos diretos ou `metadata.entityId`;
- ator/responsável por `personName`, `actorName` ou fallback explícito para `Sistema`;
- timestamp por `createdAt`;
- descrição, resumo, status e metadados relevantes (`operationalState`, `previousState`, `nextState`, `riskLevel`, `result`, `severity`, `reason`, `messageStatus`);
- filtros existentes de período, tipo, módulo, criticidade, cliente, entidade e responsável;
- rotas já existentes para cliente, O.S., financeiro, agendamento, governança, WhatsApp e dashboard.

### Fallbacks seguros

- Se não houver evento oficial no recorte, a camada informa que não há evidência real para calcular risco ou ação específica e orienta limpar filtros, revisar histórico ou abrir módulos principais.
- Se não houver risco dominante, `OperationalRiskCard` declara a ausência de sinais concretos sem inventar risco genérico.
- Se não houver evento recente, o estado pode ir para `WARNING` por silêncio operacional, deixando claro que a prova carregada pode estar incompleta.
- Se a Timeline falhar ao carregar, o fluxo marca a etapa de Timeline como `blocked` e preserva o estado de erro existente do feed.
- `EntityTimelineCard` usa apenas eventos retornados pelo feed. Quando a lista está vazia, o fallback canônico informa que o Nexo não cria histórico fictício.
- A Próxima Melhor Ação apenas orienta e navega. Nenhuma cobrança, O.S., governança ou comunicação é executada automaticamente.

### Papel da Timeline como prova oficial

Timeline passa a ser a memória auditável que conecta acontecimento, data/hora, ator, entidade, motivo, risco e próxima investigação. O feed continua preservado com filtros, paginação, seleção e detalhe do evento; a camada operacional apenas antecipa a leitura executiva para evidenciar o que exige atenção antes da lista completa.

### Relação Evento → Timeline → Risco → Governança → Ação

O evento é o fato registrado. A Timeline organiza esse fato como prova oficial. A camada de risco interpreta apenas sinais reais do evento. Governança entra quando há mudança de estado, risco explícito ou evidência restritiva. A ação final é uma orientação segura para abrir o contexto correto e investigar, nunca para executar automaticamente.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de WhatsApp e falhas de comunicação só são consideradas quando já aparecem como eventos reais na Timeline. Depois de Timeline, a próxima página candidata para adoção da Operational Command Layer é Governança.

## Adoção em Governança

A página de Governança (`GovernancePage`) adota a Operational Command Layer para fechar o ciclo `Evento → Timeline → Risco → Governança → Política → Ação`. A primeira leitura deixa de ser apenas relatório de estado, lista de alertas ou histórico de execuções: ela passa a responder qual estado operacional foi detectado, qual risco explica esse estado, qual decisão/intervenção existe e qual ação deve acontecer agora.

### Como Governança usa a camada operacional

- `OperationalStateCard` mostra o estado operacional governado (`NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`) com motivo principal, impacto no fluxo `Cliente → Agendamento → O.S. → Cobrança → Pagamento` e CTA para histórico/Timeline. `SUSPENDED` só é exibido quando o resumo ou a última execução retornam suspensão real.
- `OperationalRiskCard` explica o risco dominante a partir dos sinais concretos já carregados: cobranças vencidas, O.S. atrasadas, O.S. sem responsável, agendamentos pendentes no passado, score/alertas de governança e ausência de execução oficial recente.
- `NextBestActionCard` concentra a Próxima Melhor Ação canônica de Governança, sem execução automática: revisar intervenção crítica, analisar sinais de risco, revisar política aplicada, investigar evento crítico, abrir Financeiro, abrir O.S., abrir Agendamentos ou revisar histórico de governança.
- `OperationalFlowCard` mostra a cadeia `Evento → Timeline → Risco → Governança → Política → Ação`, indicando quando há evento detectado, prova/histórico real, risco governado, execução recente, política aplicada/pendente e ação orientada.
- `EntityTimelineCard` exibe “Últimas decisões oficiais de governança” com até quatro registros reais derivados de execuções de governança que tenham data válida. Quando não há eventos, o fallback canônico deixa claro que o Nexo não cria histórico fictício e orienta abrir a Timeline completa.

### Dados reaproveitados

Governança reaproveita somente dados e contratos já disponíveis na página:

- resumo de `governance.summary`, incluindo score, alertas, ações automáticas, restrições e metadados de políticas quando retornados;
- execuções de `governance.runs`, usadas como histórico real e prova operacional quando possuem datas válidas;
- cobranças vencidas de `finance.charges.list` para risco financeiro dominante;
- O.S. de `nexo.serviceOrders.list` para detectar atraso e ausência de responsável;
- agendamentos de `nexo.appointments.list` para detectar pendências no passado;
- status, estado, motivo, mensagem, ator, regra, política e datas já presentes nos payloads de resumo/execução.

### Fallbacks seguros

- Se não houver execução real de governança, a página sinaliza ausência de execução recente como um sinal médio e não cria evento artificial na prova operacional.
- Se a Timeline/prova não retornar registros, `EntityTimelineCard` usa o fallback explícito do componente canônico e orienta abrir a Timeline completa.
- Se não houver política aplicada ou pendente no resumo, a etapa `Política` fica `idle` e a seção de regras informa ausência de metadado retornado.
- Se não houver risco dominante, `OperationalRiskCard` declara risco governado sem sinal crítico em vez de inventar risco genérico.
- `SUSPENDED` permanece reservado para dado real de suspensão vindo de resumo ou execução; sinais críticos derivados restringem a operação, mas não criam suspensão fictícia.
- A Próxima Melhor Ação apenas navega para contextos existentes. Nenhuma política, cobrança, O.S., agenda ou comunicação é executada automaticamente.

### Relação Evento → Timeline → Risco → Governança → Política → Ação

Governança funciona como centro de decisão e intervenção: o evento nasce dos sinais operacionais; a Timeline/histórico fornece prova oficial quando retornada; o risco interpreta cobranças, execução, agenda e score; Governança consolida o estado; Política mostra regra aplicada ou pendente quando houver metadado; Ação orienta o operador para o próximo contexto seguro sem automatizar a intervenção.

### Congelamento de WhatsApp e próximas páginas candidatas

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e falhas de comunicação só devem entrar na leitura de Governança quando já existirem como dados reais. Depois de Governança, as próximas páginas candidatas para adoção da Operational Command Layer são Pessoas e Perfil.

## Adoção em Pessoas

A página de Pessoas (`PeoplePage`) adota a Operational Command Layer para transformar cadastro de usuários em controle de responsabilidade operacional. A primeira leitura passa a responder quem está executando, quem está sobrecarregado, quem está parado ou indisponível, quem está ligado a atrasos e qual intervenção segura deve acontecer agora.

### Como Pessoas usa a camada operacional

- `OperationalStateCard` mostra o estado da equipe ou da pessoa selecionada (`NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`) a partir de status ativo/inativo/suspenso, carga de O.S., carga de agendamentos, O.S. atrasadas, capacidade planejada, disponibilidade e última atividade quando retornada. `SUSPENDED` só é usado quando a pessoa já vem com status real `SUSPENDED`.
- `OperationalRiskCard` explica o risco dominante de responsabilidade com sinais concretos: pessoa inativa/suspensa com itens atribuídos, O.S. atrasadas por responsável, sobrecarga/capacidade excedida, agendamentos sob responsabilidade ou ausência de risco dominante.
- `NextBestActionCard` concentra a Próxima Melhor Ação canônica de Pessoas, sem execução automática: redistribuir responsabilidades, destravar execução, rebalancear carga, confirmar agenda, revisar disponibilidade ou revisar equipe.
- `OperationalFlowCard` mostra a cadeia `Pessoa → Agendamentos → O.S. → Cobranças/Financeiro → Timeline → Risco/Governança`, usando estados `done`, `active`, `warning`, `blocked` e `idle` conforme os dados de responsabilidade já carregados.
- `EntityTimelineCard` apresenta “Últimos eventos oficiais da pessoa” quando há pessoa selecionada ou “Prova operacional da responsabilidade” no agregado. Quando a Timeline oficial não está disponível na página, o card usa até quatro sinais contextuais derivados de dados reais e explicita que eles não substituem a Timeline completa.

### Dados reaproveitados

Pessoas reaproveita somente dados e contratos já disponíveis na própria página:

- resumo operacional de `people.operationalSummary`, incluindo pessoa, função/papel, status, O.S. abertas, O.S. atrasadas, agendamentos de hoje, próximos agendamentos, última atividade, carga, capacidade diária, uso percentual, notas operacionais e disponibilidade;
- exceções reais de disponibilidade de `people.listAvailabilityExceptions` para detalhe da pessoa selecionada;
- sinais agregados de atribuição de `analytics.assigneeWarningSummary` para administradores, incluindo contexto, tipo de alerta, exibições, confirmações e taxa de confirmação;
- filtros, busca, tabela, detalhe da pessoa, edição, criação e ações de navegação já existentes;
- rotas existentes para Agendamentos, O.S., Financeiro, Timeline e Governança.

### Fallbacks seguros

- Quando não há pessoa selecionada, a camada faz leitura agregada da equipe e escolhe o primeiro responsável acionável pelos sinais já carregados.
- Quando não há cobranças ou ações financeiras por responsável no payload da página, a etapa Financeiro fica `idle` e informa explicitamente que não recebeu dado financeiro por pessoa.
- Quando não há Timeline oficial retornada para Pessoas, `EntityTimelineCard` usa o fallback canônico; sinais contextuais são derivados apenas de última atividade, contagem real de O.S. atrasadas, agendamentos atribuídos e indisponibilidades registradas.
- Ausência de última atividade é tratada como sinal de revisão de disponibilidade quando há itens atribuídos, não como bloqueio automático.
- Ausência de itens sem responsável no contrato atual não é inventada; a página apenas orienta atribuição quando esse sinal existir em dados futuros.
- A Próxima Melhor Ação apenas orienta e navega. Nenhuma redistribuição, alteração de status, agenda, O.S., cobrança ou comunicação é executada automaticamente.

### Relação Pessoa → Agendamentos → O.S. → Financeiro → Timeline → Risco/Governança

Pessoa é o dono operacional. Agendamentos mostram a entrada sob responsabilidade. O.S. mostram execução e atrasos vinculados. Financeiro permanece como consequência da execução, mas só ganha leitura específica quando houver dado financeiro por responsável. Timeline é a prova oficial da responsabilidade; sinais contextuais em Pessoas servem somente para antecipar a investigação. Risco/Governança interpreta sobrecarga, atraso, indisponibilidade e status crítico como necessidade de intervenção segura.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e a ação “Confirmar agenda” apenas navega para Agendamentos. Depois de Pessoas, a próxima página candidata para adoção da Operational Command Layer é Perfil.

## Adoção em Perfil

A página de Perfil (`ProfilePage`) adota a Operational Command Layer para deixar de ser apenas uma tela de dados pessoais e preferências. A primeira leitura passa a responder quem é o usuário dentro da operação, qual papel ele exerce, quais pendências estão atribuídas a ele, qual risco individual existe e qual ação segura deve ser tomada agora.

### Como Perfil usa a camada operacional

- `OperationalStateCard` mostra o estado operacional individual (`NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`) a partir do status real do usuário, papel/função, permissões retornadas, O.S. atribuídas, agendamentos atribuídos, atrasos, carga pessoal e ausência de atividade recente quando há itens sob responsabilidade. `SUSPENDED` só é usado quando o payload do usuário já retorna suspensão real.
- `OperationalRiskCard` explica o risco dominante do usuário com sinais concretos: O.S. atrasadas atribuídas ao usuário, agendamentos pendentes no passado, sobrecarga pessoal, baixa atividade com itens atribuídos ou permissão insuficiente quando esse sinal já existe no payload. Quando não há sinal dominante, o card declara ausência de risco individual relevante em vez de criar risco genérico.
- `NextBestActionCard` concentra a Próxima Melhor Ação canônica de Perfil, sem execução automática: destravar minhas O.S., revisar minha agenda, revisar prioridades, atualizar andamento, solicitar apoio ou revisar minha operação.
- `OperationalFlowCard` mostra a cadeia `Perfil → Minhas tarefas → Agendamentos → O.S. → Financeiro → Timeline → Risco/Governança`, usando estados `done`, `active`, `warning`, `blocked` e `idle` conforme os dados individuais já carregados.
- `EntityTimelineCard` apresenta “Minha Timeline operacional” com eventos oficiais do usuário quando retornados. Se a Timeline individual não retornar eventos, usa apenas sinais contextuais derivados de O.S. e agendamentos reais atribuídos ao usuário, deixando claro que eles não substituem a Timeline oficial.

### Dados reaproveitados

Perfil reaproveita somente dados e contratos já disponíveis na própria página:

- usuário autenticado por `nexo.me`, incluindo nome, e-mail, papel/função, status, organização, permissões/papéis quando retornados e última atividade quando disponível;
- agendamentos existentes de `nexo.appointments.list`, filtrados por referências do usuário ou pessoa;
- O.S. existentes de `nexo.serviceOrders.list`, filtradas por referências do usuário ou pessoa;
- cobranças existentes de `finance.charges.list`, usadas apenas quando já há vínculo com o usuário para estimar impacto financeiro individual;
- eventos oficiais existentes de `nexo.timeline.listByOrg`, filtrados por ator, usuário, pessoa ou vínculo operacional;
- preferências locais já existentes de disponibilidade, notificações e preferência de trabalho;
- rotas existentes para O.S., Agendamentos, Financeiro, Timeline, Governança e Configurações.

### Fallbacks seguros

- Quando não há O.S., agenda, financeiro ou Timeline atribuídos ao usuário, as etapas correspondentes ficam `idle` e informam explicitamente que não receberam dado individual no recorte carregado.
- Quando não há dado financeiro atribuído ao usuário, Financeiro permanece `idle`; nenhum valor é inventado.
- Quando não há evento oficial individual, a Timeline operacional mostra o fallback canônico ou até quatro sinais contextuais derivados somente de dados reais de O.S. e agendamentos. Esses sinais são marcados como contexto e não substituem a Timeline oficial.
- Ausência de atividade recente só vira sinal de atenção quando há itens atribuídos ao usuário; não bloqueia automaticamente a operação.
- Permissão insuficiente só aparece quando o payload já indica necessidade de permissão sem alçada acionável retornada; a página não altera auth nem regras de permissão.
- A Próxima Melhor Ação apenas orienta e navega para módulos existentes. Nenhuma O.S., agenda, cobrança, governança, permissão ou comunicação é executada automaticamente.

### Relação Perfil → Tarefas → Agendamentos → O.S. → Timeline → Risco/Governança

Perfil identifica o responsável individual. Minhas tarefas agregam o que está sob responsabilidade do usuário. Agendamentos representam a entrada operacional pessoal. O.S. representam a execução e seus atrasos. Financeiro aparece apenas quando há cobrança paga atribuída ao usuário; caso contrário, permanece como consequência sem dado individual. Timeline é a prova oficial das ações do usuário. Risco/Governança interpreta atraso, sobrecarga, baixa atividade ou alçada insuficiente como necessidade de orientação segura.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e a Próxima Melhor Ação de Perfil não cria mensagens nem automações. Depois de Perfil, a próxima página candidata para adoção da Operational Command Layer é Configurações.

## Adoção em Configurações

A página de Configurações (`SettingsPage`) adota a Operational Command Layer para deixar de ser uma coleção técnica de toggles e funcionar como centro de controle do comportamento operacional do NexoGestão. A primeira leitura passa a responder como o sistema está configurado, qual regra afeta Agenda, O.S., Financeiro, Comunicação, Governança/Risco e Integrações, qual pendência exige atenção e qual ajuste administrativo deve ser feito agora.

### Como Configurações usa a camada operacional

- `OperationalStateCard` mostra o estado das configurações (`NORMAL`, `WARNING` ou `RESTRICTED`) a partir da completude da empresa, fuso horário, regras financeiras visíveis, padrão operacional, comunicação, governança/risco, permissões e integrações. `SUSPENDED` não é usado porque a página não recebe dado real de suspensão de configuração.
- `OperationalRiskCard` explica o risco dominante de configuração com motivo e impacto operacional: empresa incompleta, regra financeira ausente, operação sem padrão, comunicação sem canal/template confirmado, governança sem política visível, permissões frágeis ou integrações pendentes.
- `NextBestActionCard` segue a prioridade administrativa canônica sem executar nada automaticamente: completar configuração crítica, configurar regras financeiras, configurar fluxo operacional, configurar comunicação, revisar governança, revisar usuários e permissões ou revisar configurações quando a leitura está saudável.
- `OperationalFlowCard` mostra a cadeia `Empresa → Operação → Financeiro → Comunicação → Governança/Risco → Integrações → Sistema`, usando estados `done`, `active`, `warning`, `blocked` e `idle` conforme os sinais já carregados na página.
- `EntityTimelineCard` exibe “Últimas alterações de configuração” quando o payload de configurações retorna data real de atualização. Quando não há evento real, o fallback é explícito e informa que o Nexo não cria histórico fictício.

### Dados reaproveitados

Configurações reaproveita somente dados já disponíveis na própria página:

- configurações da organização retornadas por `nexo.settings.get`, incluindo nome, fuso horário, moeda, regras ou objetos de operação/governança quando presentes;
- usuários e papéis retornados por `nexo.invites.members`, usados para leitura de responsabilidade e permissões;
- readiness de integrações retornado por `integrations.readiness`, usado para Stripe/pagamentos e canal de comunicação já existente;
- estado local dos campos de empresa e fuso horário para indicar alterações não salvas sem alterar contratos;
- rotas existentes para Pessoas, O.S., Financeiro, WhatsApp, Governança e Timeline.

### Fallbacks seguros

- Se a configuração não retorna regra financeira, padrão operacional, política de governança ou template de comunicação, a página marca o bloco como pendente em vez de inventar uma regra.
- Se não há data real de alteração de configuração, `EntityTimelineCard` usa o fallback canônico e não fabrica histórico.
- Se não há membros ou papel administrativo claro, permissões entram como atenção, mas nenhuma permissão é criada ou alterada.
- Integrações são lidas apenas pelo readiness existente; ausência de Stripe ou comunicação conectada vira sinal administrativo, não bloqueio técnico novo.
- A Próxima Melhor Ação apenas orienta ou navega para páginas existentes. Nenhuma configuração, comunicação, automação, cobrança, permissão ou política é executada automaticamente.

### Relação Configurações → Operação → Financeiro → Comunicação → Governança/Risco

Configurações define a base administrativa que condiciona a operação. Empresa e Sistema estabilizam identidade e fuso; Operação orienta Agenda e O.S.; Financeiro define como execução vira cobrança; Comunicação indica se avisos e confirmações têm canal/template confirmado; Governança/Risco interpreta pendências e políticas visíveis; Integrações mostram se dependências externas sustentam o ciclo operacional. A camada explicita onde uma lacuna de configuração pode afetar a execução antes que o operador avance para os módulos transacionais.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e Configurações apenas lê readiness/navega para a rota existente quando necessário. Depois de Configurações, a próxima página candidata para adoção da Operational Command Layer é Billing.

## Adoção em Billing

A página de Billing (`BillingPage`) adota a Operational Command Layer para deixar de ser apenas uma tela de plano, checkout e histórico, e passar a funcionar como controle operacional da assinatura da empresa que usa o NexoGestão. A primeira leitura passa a responder qual é o plano atual, qual é o status da assinatura, quando ocorre a próxima cobrança, se existe falha de pagamento, se há risco de restrição de acesso e qual ação administrativa deve ser tomada agora.

### Billing não é Financeiro

Billing e Financeiro continuam separados:

- Financeiro trata o cliente da empresa pagando pelos serviços prestados por ela, incluindo cobranças, recebimentos e inadimplência operacional dos clientes.
- Billing trata a empresa pagando para usar o Nexo, incluindo plano contratado, assinatura SaaS, cobrança da plataforma, método de pagamento, faturas, limites do plano e risco de acesso ao próprio Nexo.

Essa separação evita misturar inadimplência de clientes com risco comercial da organização usuária dentro da plataforma.

### Como Billing usa a camada operacional

- `OperationalStateCard` mostra o estado da assinatura (`NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`) a partir de status real, falha ou vencimento de fatura, trial perto do fim, próxima cobrança próxima, método de pagamento ausente e uso próximo do limite quando esses dados existem.
- `OperationalRiskCard` explica o risco dominante de acesso/plano com motivo e impacto: pagamento falhou, assinatura `PAST_DUE`, fatura vencida, trial expirando, método ausente, limite próximo ou ausência de risco crítico.
- `NextBestActionCard` segue a prioridade administrativa de Billing sem executar nada automaticamente: atualizar pagamento, regularizar assinatura, escolher plano, adicionar método de pagamento, revisar plano ou revisar assinatura.
- `OperationalFlowCard` mostra a cadeia `Plano → Assinatura → Fatura → Pagamento → Acesso → Governança/Billing`, usando `done`, `active`, `warning`, `blocked` e `idle` conforme os sinais já retornados.
- `EntityTimelineCard` exibe “Histórico oficial de Billing” com faturas, pagamentos e eventos reais retornados pelo Billing. Quando não há eventos, o fallback canônico informa explicitamente que nenhum histórico fictício é criado.

### Dados reaproveitados

Billing reaproveita somente dados e ações já disponíveis na própria página:

- planos retornados por `billing.plans` para manter a leitura administrativa de plano;
- status da assinatura retornado por `billing.status`, incluindo plano, status, `currentPeriodEnd`, próxima cobrança, valor, método de pagamento e eventos quando retornados;
- limites e uso retornados por `billing.limits`, incluindo trial, plano, limites e percentuais de uso por entidade quando disponíveis;
- readiness de Stripe retornado por `integrations.readiness`, usado apenas para habilitar ou bloquear ações já existentes de checkout;
- mutations já existentes de checkout e cancelamento, preservadas nos blocos existentes e não acionadas automaticamente pela Próxima Melhor Ação;
- tabela existente de histórico, usada como prova detalhada de faturas, pagamentos e falhas quando a fonte de Billing retorna eventos.

### Fallbacks seguros

- Se a próxima cobrança não é retornada, a camada marca atenção por dado incompleto em vez de inventar data.
- Se o método de pagamento não é retornado em plano pago, a camada orienta revisão/adição de método sem criar meio de pagamento fictício.
- Se não há eventos de fatura ou pagamento, `EntityTimelineCard` e a tabela informam ausência de histórico retornado, sem fabricar fatura.
- `SUSPENDED` só é usado quando o status real retorna cancelamento ou suspensão/bloqueio compatível.
- Uso próximo do limite só aparece quando `billing.limits` retorna percentuais reais de uso; limites ilimitados não geram alerta artificial.
- A Próxima Melhor Ação apenas orienta e navega para a área de ações administrativas já existente. Ela não dispara pagamento, checkout, cancelamento, comunicação ou automação.

### Relação Plano → Assinatura → Fatura → Pagamento → Acesso

Plano define a capacidade contratada da organização. Assinatura indica se o contrato SaaS está ativo, em trial, atrasado, cancelado ou suspenso. Fatura representa a cobrança da plataforma e sua próxima data ou histórico real. Pagamento indica falha, ausência de método ou normalidade. Acesso traduz esses sinais em risco de bloqueio ou restrição. Governança/Billing consolida a prova administrativa para revisão da empresa dentro do Nexo.

### Congelamento de WhatsApp e próxima página candidata

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e Billing não cria mensagem, template, campanha ou automação. Depois de Billing, a próxima página candidata para adoção da Operational Command Layer é Calendário.

## Adoção em Calendário

A página de Calendário (`CalendarPage`) adota a Operational Command Layer para transformar a grade de eventos em leitura estratégica do tempo da operação. A primeira leitura passa a responder se a agenda está distribuída, se há conflitos, se algum responsável está sobrecarregado, se existem janelas vazias relevantes, quais eventos indicam impacto em O.S. e qual ajuste deve ser feito agora.

### Calendário não é Agendamentos

Calendário e Agendamentos continuam separados:

- Agendamentos é o controle operacional da entrada: confirmar, remarcar, abrir detalhe e conduzir o fluxo transacional do atendimento.
- Calendário é a visão estratégica do tempo: distribuição, conflito, sobrecarga, vazio, atraso e impacto temporal sobre O.S., execução, Timeline e Governança.

Essa separação evita transformar a tela de calendário em um segundo fluxo de agendamentos. A Operational Command Layer no Calendário orienta e navega; ela não executa confirmação, remarcação, comunicação ou automação automaticamente.

### Como Calendário usa a camada operacional

- `OperationalStateCard` mostra o estado do tempo operacional (`NORMAL`, `WARNING` ou `RESTRICTED`) a partir de conflitos por responsável, sobreposição de horário, excesso de eventos no mesmo recorte, atraso, agenda vazia demais, agendamentos sem confirmação e responsáveis não atribuídos. `SUSPENDED` não é usado sem dado real de suspensão.
- `OperationalRiskCard` explica o risco dominante do calendário com motivo e impacto: conflito entre atendimentos, responsável sobrecarregado, atraso de execução, agendamento sem confirmação, agenda vazia demais ou calendário saudável.
- `NextBestActionCard` segue a prioridade definida para Calendário sem acionar fluxo automático: resolver conflito de horário, rebalancear agenda, revisar agenda do dia, confirmar agendamento, preencher janela operacional ou revisar semana.
- `OperationalFlowCard` mostra a cadeia `Tempo → Agendamento → Responsável → O.S. → Execução → Timeline → Risco/Governança`, usando estados `done`, `active`, `warning`, `blocked` e `idle` conforme os sinais já lidos na página.
- `EntityTimelineCard` exibe “Prova operacional do tempo” usando eventos reais derivados dos agendamentos com datas reais. O subtítulo declara explicitamente que esse fallback não substitui a Timeline oficial.

### Dados reaproveitados

Calendário reaproveita somente dados e ações já disponíveis na própria página ou no payload já consumido pelo Calendário:

- agendamentos retornados por `nexo.appointments.list`, incluindo cliente, responsável, status, início, término, título, atualização e possíveis vínculos de O.S. quando retornados no payload;
- clientes retornados por `nexo.customers.list`, usados para filtro e identificação do evento;
- responsáveis retornados por `people.assignees`, usados para filtro, leitura de sobrecarga e explicação de conflito;
- filtros e modos persistidos de visão (`Dia`, `Semana`, `Mês`, equipe, serviço, status e cliente);
- links já existentes para Agendamentos, O.S., Cliente, Timeline e Governança;
- mutation existente de atualização de agendamento, preservada nas ações antigas da página, mas não acionada pela Próxima Melhor Ação da camada operacional.

### Fallbacks seguros

- Se o agendamento não retorna vínculo direto de O.S., a etapa de O.S. fica `idle` e a navegação usa o filtro por `appointmentId`; nenhum vínculo fictício é criado.
- Se não há Timeline oficial carregada no Calendário, a prova operacional usa apenas eventos derivados de datas reais dos agendamentos e informa que isso não substitui a Timeline oficial.
- Se um evento não tem `endsAt`, a detecção de conflito considera uma duração operacional padrão apenas para leitura de sobreposição, sem gravar ou alterar duração real.
- Se não há eventos no recorte filtrado, o estado informa vazio operacional em vez de criar agenda fictícia.
- `SUSPENDED` permanece reservado para dado real de suspensão e não é inferido no Calendário.
- A Próxima Melhor Ação apenas orienta/navega ou abre o modal já existente de novo agendamento para preencher janela; não confirma, remarca, envia mensagem ou cria automação sozinha.

### Relação Tempo → Agendamento → O.S. → Execução → Timeline → Risco/Governança

Tempo é a matéria-prima do Calendário: ele mostra onde a operação está concentrada, vazia ou em conflito. Agendamento materializa a entrada em uma janela real. Responsável indica distribuição de capacidade. O.S. mostra quando o evento passa a impactar execução. Execução traduz atrasos e sobrecarga em risco de entrega. Timeline deve registrar a prova oficial quando houver evento real. Risco/Governança interpreta os sinais de conflito, atraso, vazio e sobrecarga para orientar decisão antes que o problema vire falha operacional.

### Congelamento de WhatsApp e próxima etapa

WhatsApp permanece congelado nesta adoção: `WhatsAppPage.tsx` não foi alterado, não há novo fluxo de comunicação e Calendário não cria mensagem, template, campanha ou automação. A próxima etapa recomendada é uma auditoria final da Operational Command Layer para validar consistência entre Dashboard, Clientes, Agendamentos, O.S., Financeiro, Timeline, Governança, Pessoas, Perfil, Configurações, Billing e Calendário.

# Dashboard como Centro de Comando Operacional

## Objetivo

O `ExecutiveDashboard` é o cockpit diário do NexoGestão. Ele não deve atuar como home genérica, relatório de BI ou vitrine de KPIs: sua função é responder rapidamente como está a operação, o que está errado, qual é a próxima melhor ação e onde o fluxo está perdendo velocidade ou dinheiro.

## Estrutura final

1. **Header Operacional** — título `Operação hoje`, período atual, estado `NORMAL`, `WARNING`, `RESTRICTED` ou `SUSPENDED`, quantidade de riscos críticos e gargalo principal quando calculável.
2. **Bloco compacto de estado + prova** — substitui os antigos cards altos de estado/maior risco/prova por uma leitura executiva curta: estado operacional, mini-métricas reais (O.S. atrasadas, cobranças vencidas, riscos críticos e gargalo), motivo principal, impacto e CTA real para o módulo responsável, ao lado de até 3 eventos oficiais humanizados com CTA para a Timeline.
3. **Atenção Imediata** — painel de incidentes com até 5 riscos ordenados por severidade/impacto, exibindo severidade, título curto, número principal quando a fonte retornar, impacto em uma linha e CTA real; fica na primeira dobra e evita repetir “Motivo”/“Impacto” como relatório.
4. **Próxima Melhor Ação** — sinal do endpoint existente de next-best-action ou fallback seguro baseado em alertas reais já carregados, em card com valor, prazo ou status em destaque, entidade visível, motivo, impacto esperado, segurança e CTA principal.
5. **KPIs Operacionais** — indicadores compactos com microcontexto e CTA para o módulo dono; valores zerados continuam explícitos, mas recebem microcopy humana como “Sem pagamentos registrados no período”.
6. **Fluxo Operacional** — pipeline visual Cliente → Agendamento → O.S. → Cobrança → Pagamento, com conectores, estado por etapa, destaque de gargalo e CTAs preservados; Timeline e Risco/Governança ficam como chips auxiliares de prova/supervisão.
7. **Radar Operacional / Pulso da Operação** — resumo executivo dos quatro sinais (Prioridade, Capacidade, Contato e Caixa), com surface levemente diferenciado e comparações históricas quando a API entregar base; aparece antes dos incidentes para ganhar visibilidade sem competir com Atenção/NBA.
8. **Incidentes Operacionais** — até 10 itens acionáveis da fila transversal retornada pelo dashboard alerts, apresentados como incidentes com severidade, entidade, contexto, status/prazo, responsável discreto e CTA real, sem cabeçalho de tabela. Responsável ausente aparece como `—` discreto e nota agregada no rodapé.
9. **Acessos Rápidos Contextuais** — atalhos secundários para os módulos operacionais.

## Ajustes finais da Sprint Dashboard Premium Final

- **Estado Operacional enriquecido:** mantém a leitura compacta, reduz espaço morto e usa mini-métricas derivadas dos sinais já carregados: O.S. atrasadas, cobranças vencidas, riscos críticos e gargalo calculável. Quando não há sinal, usa `0`, `sem gargalo` ou fallback honesto, sem criar dado novo.
- **Prova Operacional humanizada final:** eventos técnicos da Timeline são traduzidos no Dashboard para títulos e resumos de negócio, como `Cobrança não enviada` / `Lembrete de cobrança bloqueado`, `Follow-up não executado` / `Ação de cobrança não foi concluída`, `Pagamento recebido` / `Pagamento registrado na operação`, `Cobrança criada` / `Nova cobrança registrada`, `O.S. concluída` / `Serviço finalizado` e `Agendamento confirmado` / `Cliente confirmado na agenda`. O fallback apenas transforma o tipo oficial em texto legível, sem exibir payload bruto longo ou eventType técnico cru quando houver tradução.
- **Tendências honestas:** KPIs e Radar exibem microtendências somente quando `metrics.comparison` entregar base. Quando a fonte não trouxer comparação, a UI declara `Sem base histórica suficiente`; não há cálculo novo complexo, gráfico ou histórico inventado.
- **Fluxo como pipeline:** o fluxo principal fica restrito à cadeia Cliente → Agendamento → O.S. → Cobrança → Pagamento, com setas/conectores, estados visuais e destaque em gargalos. Timeline e Risco/Governança continuam acessíveis como prova e supervisão, mas não competem com o fluxo principal.
- **Radar como inteligência operacional:** o pulso permanece antes dos incidentes, mantém quatro sinais fixos (Prioridade, Capacidade, Contato e Caixa), ganha ícones/chips/surface mais presentes e destaca a palavra-chave de cada sinal sem virar BI nem aumentar demais a altura.
- **NBA com CTA dominante:** a Próxima Melhor Ação destaca valor/status/entidade como decisão principal do dia, reforça o CTA primário e preserva motivo, impacto esperado, segurança, fallback seguro e botão secundário de retry quando existir.
- **Incidentes com contexto temporal:** a fila mantém até 10 itens sem aparência de tabela e mostra contexto mais acionável quando a fonte permitir, como `Vencida há N dias`, `Prazo operacional vencido`, valor pendente e responsável `—` discreto quando ausente, sem inventar prazo, valor ou responsável.

## Fontes usadas

- `trpc.dashboard.kpis`: métricas de clientes, O.S., financeiro, comparações, WhatsApp Signals e governança quando retornados pelo BFF atual.
- `trpc.dashboard.alerts`: O.S. atrasadas, cobranças vencidas, serviços concluídos sem cobrança, agenda/serviços do dia, clientes com pendência e `operationalQueue`.
- `/internal/operational-signals?limit=8`: sinais de risco operacionais existentes.
- `/internal/operational-signals/next-best-action`: próxima melhor ação real do motor operacional existente.
- `trpc.nexo.timeline.listByOrg`: prova operacional recente.
- `trpc.nexo.whatsapp.listPendingApprovals`: aprovações WhatsApp existentes, sem alterar a `WhatsAppPage`.

## Regras de fallback honesto

- Sem prazo válido, o dashboard mostra `Prazo não informado` e não calcula atraso.
- Sem responsável no payload, a fila mostra `—` na linha com `title`/`aria-label` de `Responsável não informado` e uma nota agregada quando houver muitos itens sem responsável.
- Sem histórico de comparação, o pulso mostra que a base histórica ainda está em formação.
- Sem Timeline ou erro na leitura, a interface não cria prova operacional artificial; o bloco compacto mostra fallback curto e direciona para a Timeline completa.
- Sem governança/risk explícito, o header declara que o estado operacional não foi retornado pela fonte atual e deriva nível apenas de alertas/sinais carregados.
- Sem status WhatsApp, o dashboard não afirma ausência de resposta; só usa `whatsappSignals` ou itens da `operationalQueue` quando retornados.
- Sem valor financeiro, o dashboard não calcula impacto monetário; Atenção Imediata e NBA destacam contagem, prazo, status ou entidade disponível e direcionam para validação no módulo dono.
- Sem `entityId` específico, o CTA abre o módulo responsável em vez de criar link de detalhe fictício.

## CTAs permitidos e preservados

Os CTAs levam para módulos existentes: O.S., Financeiro, Agendamentos, WhatsApp, Timeline, Governança e Clientes. O resumo de estado usa o CTA do maior risco quando há risco real; sem risco, abre Governança. Eles apenas navegam para contexto real; não disparam cobrança, WhatsApp, automação ou alteração de status automática.

## Diferença para páginas específicas

O Dashboard prioriza e roteia decisões transversais. Clientes, Agendamentos, O.S., Financeiro, WhatsApp, Timeline e Governança continuam responsáveis por execução detalhada, filtros profundos, edição, automações existentes e histórico completo. Páginas específicas não devem duplicar o cockpit completo; devem receber o usuário já orientado pelo contexto do Dashboard.

## Limites preservados

Esta etapa não altera backend, API, Prisma, rotas, contratos multi-tenant, payloads, endpoints, fontes de dados existentes, segurança multi-tenant, lógica de automação ou `WhatsAppPage`. Lacunas de dados devem ser tratadas como gaps futuros de BFF/API, não como mock no frontend.

## Gaps futuros identificados

- Estado operacional canônico de governança/risk nem sempre aparece no contrato do `dashboard.kpis`.
- Conversões reais entre etapas do fluxo ainda dependem de payloads mais ricos; hoje o cockpit só aponta gargalos quando há alertas concretos.
- Responsável, prazo detalhado e entityId nem sempre vêm na `operationalQueue`; o dashboard usa fallback discreto, nota agregada e CTA para módulo nesses casos.
- Tendências só aparecem quando `metrics.comparison` retorna percentuais; sem histórico suficiente, a UI declara a limitação.

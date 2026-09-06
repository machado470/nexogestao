# Nexo Operating System UI Direction

A imagem aprovada em 4 partes é referência de direção visual e estrutural, não contrato literal. O Nexo deve traduzir a intenção para componentes reais do produto, preservando a identidade operacional e evitando copiar pixels, Flowbite, templates SaaS ou padrões genéricos.

## Conceito central

**Decisão → Fluxo → Execução → Auditoria**

O front interno deve parecer um sistema operacional para empresas de serviço: abre com prioridades, mostra o fluxo completo, permite executar ações reais e sustenta cada leitura com prova operacional e governança.

## Quadrantes de referência

1. **Centro de Prioridades**  
   Dashboard deve abrir com estado, dinheiro em risco, gargalo e próxima ação.

2. **Fluxo Operacional**  
   Cliente → Agendamento → O.S. → Cobrança → Pagamento, com gargalo, conversão e CTA.

3. **Centro Operacional do Cliente**  
   Clientes deve ser memória viva da operação, não cadastro.

4. **Timeline + Governança + Risco**  
   Timeline prova o que aconteceu; Governança explica o que o sistema decidiu.

## Regras visuais

- Navy/charcoal, bordas sutis e profundidade leve formam a base premium.
- Laranja é reservado para CTA primário, ação, gargalo, warning e risco operacional.
- Verde indica saudável/sucesso; vermelho indica crítico real; azul/cinza comunica informação neutra.
- Labels devem ser curtos, em uppercase, com títulos claros e microcopy operacional.
- Não usar laranja decorativo, excesso de glow, charts inúteis, cards vazios altos, sombras exageradas ou fundo preto puro.

## Regras de produto

- Não transformar o Nexo em SaaS genérico.
- Não copiar Flowbite, templates externos ou catálogo visual.
- Não criar mock, automação falsa ou dado inventado.
- Usar somente dados já carregados pela página; fallback deve declarar ausência de sinal retornado.
- Timeline embutida não é log técnico: deve ser prova oficial humanizada, sem payload bruto, IDs internos ou `eventType` cru.
- Governança embutida não é alerta passivo: deve explicar estado, motivo, impacto, decisão do sistema, próxima ação e CTA real.

## Componentes internos obrigatórios nesta direção

- `AppPageShell`
- `AppPageHeader` / `AppOperationalHeader`
- `AppSectionBlock` / `AppSectionCard`
- `AppStatCard`
- `AppStatusBadge`
- `OperationalCommandLayer`
- `NexoPriorityPanel`
- `NexoOperationalPipeline`
- `NexoEvidenceTimeline`
- `NexoGovernanceDecisionCard`
- `NexoIncidentList`
- `NexoExecutiveMetric`

## Páginas impactadas nesta fase

- `ExecutiveDashboard`: centro diário de prioridades, dinheiro em risco, gargalo, NBA dominante, pipeline e prova compacta.
- `CustomersPage`: centro operacional do cliente, barra operacional compacta, pipeline protagonista, resumo condensado e Timeline humanizada.

## Nota de refinamento — Clientes como Centro Operacional do Cliente

- `CustomersPage` agora abre o detalhe selecionado com um **Hero Executivo do Cliente** compacto, focado em status, sinal principal, última interação, próxima ação, mini-métricas e CTAs reais.
- Estado operacional e maior risco foram consolidados em **Decisão do sistema**, com motivo, impacto, decisão derivada com segurança, próxima ação sugerida e CTA real.
- O pipeline do cliente mantém o fluxo **Cliente → Agendamento → O.S. → Cobrança → Pagamento** sem exibir cadastro bruto, telefone ou e-mail nas etapas.
- O resumo foi unificado em **Painel operacional do cliente**, agrupando Financeiro, Execução, Agenda, Comunicação e Governança com fallbacks curtos e honestos.
- A Timeline embutida em Clientes usa linguagem de negócio para eventos reconhecíveis e mantém fallback apenas quando o tipo não é reconhecido.
- WhatsApp inline continua removido/condensado: Clientes aponta para a ação real no WhatsApp completo, sem textarea duplicado no detalhe.

## Polimento final premium — Clientes

- O Hero Executivo do Cliente deve funcionar como painel de comando compacto/agressivo: nome dominante, badge forte de status/sinal, próxima ação, última interação discreta, mini-métricas densas e CTAs reais sem promover telefone/e-mail a informação principal.
- A Decisão do sistema deve parecer uma decisão operacional explícita: nível visual forte, motivo, impacto, decisão e CTA em uma composição curta, sem microcopy redundante e sem duplicar a NBA.
- A Próxima Melhor Ação em Clientes deve ser compacta: título curto, motivo e impacto diretos, nota de segurança em linha discreta e botões reais sem automação implícita.
- O Painel operacional do cliente deve usar mini-cards visuais com título, valor dominante e microcontexto para Financeiro, Execução, Agenda, Comunicação e Governança, mantendo ausência de dados explícita.
- Em Clientes, o pipeline deve evitar duplicação visual: o fluxo principal Cliente → Agendamento → O.S. → Cobrança → Pagamento permanece, enquanto chips auxiliares de Timeline e Risco/Governança não devem ser exibidos quando essas leituras aparecem como seções próprias.
- A Timeline embutida deve combinar eventos humanizados com ícones semânticos de mensagem, agenda, O.S., cobrança, pagamento ou evento neutro, sem vazar `eventType`, UUID ou metadata técnica.
- A Carteira operacional deve se aproximar de um command center: prioridade visual, status/sinal, próxima ação, financeiro, CTA real e menu secundário, preservando filtros, paginação e ações existentes.

## Ajuste final de hierarquia — Clientes com cliente selecionado

- Em Clientes, quando há cliente selecionado, o **cliente selecionado domina a experiência**: a leitura contextual sobe para logo após o header e passa a orientar decisão, pipeline, execução e auditoria antes da carteira.
- A **Carteira operacional vira apoio** quando existe seleção: continua disponível com filtros, ações, paginação e seleção visual, mas passa a funcionar como “outros clientes da carteira” para troca de contexto, não como protagonista da primeira dobra.
- **Decisão + Próxima Melhor Ação** viram um bloco único em Clientes: o mesmo card explica estado, motivo, impacto, decisão, ação recomendada, CTA principal, CTA secundário quando existir e nota de segurança discreta.
- O **Hero Executivo do Cliente** sobe para a primeira dobra e deve mostrar nome dominante, status/risco, sinal principal, última interação, próxima ação, mini-métricas e CTAs reais, mantendo telefone/e-mail como informação discreta.
- O **Painel Operacional do Cliente** vira mini-dashboard visual com valores dominantes para Saúde do cliente, Financeiro, Execução, Agenda e Comunicação, sempre usando dados carregados e fallback honesto, sem gráfico ou score inventado.

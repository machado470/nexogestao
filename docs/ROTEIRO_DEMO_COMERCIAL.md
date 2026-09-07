# Roteiro de Demo Comercial — NexoGestao (estado atual)

## Premissas desta demo
- Baseado **exatamente** no fluxo implementado hoje no frontend.
- Sem prometer automações ocultas ou telas fora do menu oficial.
- Fluxo oficial usado: **Dashboard → Clientes → Agendamentos → Ordens de Serviço → Financeiro → WhatsApp → Timeline → Governança → Configurações**.

---

## 1) Roteiro comercial (5 a 7 min) por etapas

### Etapa 0 — Abertura (20–30s)
**Tela:** Dashboard Executivo (`/executive-dashboard`)

**O que mostrar**
- Cards de visão executiva (clientes, ordens, receita, risco/atrasos).
- Blocos de status de O.S. e cobranças.
- Texto que já reforça o fluxo oficial do produto.

**O que clicar**
- Apenas destacar visualmente o menu lateral no fluxo principal.

**O que falar (simples e comercial)**
- “O NexoGestao organiza a operação inteira em um único fluxo: da entrada do cliente até cobrança, comunicação e governança.”
- “Em poucos minutos você vai ver como isso reduz retrabalho e dá clareza do que está pendente.”

---

### Etapa 1 — Clientes (45–60s)
**Tela:** Clientes (`/customers`)

**O que mostrar**
- KPIs de base (total, ativos, inativos).
- Lista de clientes e botão de abertura de workspace do cliente.
- Workspace com blocos de agendamentos, O.S., cobranças e timeline recente (quando existe cliente selecionado).

**O que clicar**
1. Menu **Clientes**.
2. Em um cliente: **Workspace / abrir contexto**.
3. No workspace, usar links de contexto (Agendamentos, O.S., Financeiro, Timeline) para mostrar navegação conectada.

**O que falar**
- “Aqui começa o controle: cada cliente vira um workspace com histórico operacional e financeiro.”
- “Não é só cadastro. É contexto pronto para executar, cobrar e acompanhar.”

---

### Etapa 2 — Agendamentos (45–60s)
**Tela:** Agendamentos (`/appointments`)

**O que mostrar**
- Funil de status (agendado, confirmado, concluído, no-show, cancelado).
- Leitura de “próxima ação” por agendamento.
- Botões contextuais para cliente, O.S., financeiro e WhatsApp.

**O que clicar**
1. Menu **Agendamentos**.
2. Selecionar um item da lista.
3. Clicar em uma ação contextual (ex.: abrir O.S. vinculada ou abrir WhatsApp do contexto).

**O que falar**
- “Aqui sua agenda deixa de ser passiva e passa a orientar execução.”
- “Cada agendamento já aponta a próxima ação comercial e operacional.”

---

### Etapa 3 — Ordens de Serviço (60–75s)
**Tela:** Ordens de Serviço (`/service-orders`)

**O que mostrar**
- KPIs da fila operacional e urgências.
- Filtros financeiros (sem cobrança, pendente, paga, vencida etc.).
- Card da O.S. + painel de detalhe operacional.
- Atalho de conversa (WhatsApp) quando há telefone.

**O que clicar**
1. Menu **Ordens de Serviço**.
2. Selecionar uma O.S. para abrir painel lateral/detalhe.
3. Mostrar filtro financeiro e botão de WhatsApp da O.S. (se disponível).

**O que falar**
- “Este é o coração da execução.”
- “Aqui você vê o que está rodando, o que está travado e o que já deveria virar cobrança.”

---

### Etapa 4 — Financeiro (45–60s)
**Tela:** Financeiro (`/finances`)

**O que mostrar**
- Gráfico/visão consolidada (quando sem escopo específico).
- Lista de cobranças com status.
- Fluxo de registrar pagamento e refletir situação de cobrança.

**O que clicar**
1. Menu **Financeiro**.
2. Abrir uma cobrança (se houver) e mostrar status.
3. Mostrar botão/ação de pagamento (quando aplicável no item).

**O que falar**
- “No NexoGestao, cobrança nasce conectada à execução.”
- “Você enxerga pendência, recebido e vencido sem separar em planilhas.”

---

### Etapa 5 — WhatsApp (35–50s)
**Tela:** WhatsApp (`/whatsapp`)

**O que mostrar**
- Contexto da conversa (cliente, O.S. ou cobrança).
- Mensagem sugerida conforme contexto.
- Histórico da conversa e envio no mesmo fluxo.

**O que clicar**
1. Menu **WhatsApp** (idealmente vindo por link contextual de O.S./Financeiro).
2. Mostrar bloco “contexto atual”.
3. Mostrar campo de mensagem e botão de envio.

**O que falar**
- “A comunicação já abre com contexto do caso, então a equipe responde com clareza.”
- “Isso reduz ruído e evita mensagem solta sem histórico operacional.”

---

### Etapa 6 — Timeline (55–70s)
**Tela:** Timeline (`/timeline`)

**O que mostrar**
- Linha cronológica completa com filtros por escopo (clientes, agendamentos, execução, financeiro, risco, governança).
- Próxima leitura/ação por evento.
- Links de navegação contextual para voltar ao ponto operacional.

**O que clicar**
1. Menu **Timeline**.
2. Selecionar cliente no filtro.
3. Aplicar um filtro de escopo (ex.: Financeiro).
4. Abrir link primário de um evento.

**O que falar**
- “Aqui fica a rastreabilidade ponta a ponta.”
- “Você consegue provar o que aconteceu, quando aconteceu e qual o próximo passo.”

---

### Etapa 7 — Governança (35–50s)
**Tela:** Governança (`/governance`)

**O que mostrar**
- Score e nível de risco institucional.
- Histórico de leituras de governança.
- Relação com timeline e riscos operacionais.

**O que clicar**
1. Menu **Governança**.
2. Mostrar score/nível.
3. Mostrar botão para abrir timeline (se quiser reforçar conexão).

**O que falar**
- “A operação não fica só no ‘apagar incêndio’.”
- “Aqui você ganha visão de controle e consegue supervisionar risco de forma contínua.”

---

### Etapa 8 — Configurações + Fechamento (25–40s)
**Tela:** Configurações (`/settings`)

**O que mostrar**
- Nome da organização, timezone e moeda.
- Mensagem de fechamento: base institucional única para operação + financeiro + governança.

**O que clicar**
1. Menu **Configurações**.
2. Mostrar os três campos e botão de salvar (sem necessidade de alterar dados na demo).

**O que falar**
- “O fechamento do fluxo é a padronização institucional.”
- “Com isso, a operação inteira roda com o mesmo contexto, sem ilhas de informação.”

---

## 2) Narrativa de valor (sem linguagem técnica)

### Mensagem central
“**NexoGestao organiza o dia a dia da empresa de serviços do primeiro contato até a cobrança e o acompanhamento, com histórico confiável para gestão.**”

### Como conectar os pilares
- **Organização operacional:** clientes e agenda deixam claro quem é atendido e em qual etapa está.
- **Execução:** a O.S. vira o hub da entrega real, com prioridade e próxima ação.
- **Cobrança:** financeiro conectado à execução, mostrando pendências e recebimentos no mesmo fluxo.
- **Comunicação com cliente:** WhatsApp contextual, sem perder histórico do caso.
- **Rastreabilidade:** timeline cronológica para evidência e leitura de causa/efeito.
- **Supervisão/governança:** camada de risco e controle para gestão acompanhar qualidade operacional.

---

## 3) Roteiro curto de fala (frases prontas)

- **Dashboard:** “Em 30 segundos você já vê saúde da operação, execução e caixa.”
- **Clientes:** “Cada cliente vira um workspace de trabalho, não apenas um cadastro.”
- **Agendamentos:** “A agenda já orienta decisão: confirmar, executar, retomar ou cobrar.”
- **Ordens de Serviço:** “Aqui está o centro da operação: o que fazer agora e o que está parado.”
- **Financeiro:** “Cobrança e recebimento aparecem ligados à entrega, sem planilha paralela.”
- **WhatsApp:** “A conversa já abre com contexto, então a equipe fala certo na primeira mensagem.”
- **Timeline:** “Tudo fica rastreável: evento, data, impacto e próximo passo.”
- **Governança:** “Além de executar, você supervisiona risco e consistência da operação.”
- **Configurações (fecho):** “É um fluxo único para operar melhor, cobrar melhor e decidir melhor.”

---

## 4) Objeções previsíveis (respostas comerciais e honestas)

### “Isso serve para qual tipo de empresa?”
“Serve para operações de serviços com agenda, execução e cobrança recorrente ou por ordem. Ex.: manutenção, assistência técnica, serviços de campo, clínicas e operações com atendimento em etapas.”

### “Isso substitui WhatsApp e planilha?”
“Ele não tenta ‘matar’ o WhatsApp: ele organiza o uso do WhatsApp com contexto e histórico operacional. E reduz fortemente dependência de planilhas ao centralizar operação, cobrança e rastreabilidade.”

### “Como começo a usar?”
“Começa pelo fluxo básico: clientes → agendamentos → O.S. → cobrança. Em poucos registros já aparece timeline e leitura de governança.”

### “Isso já está pronto?”
“Sim, o fluxo principal está navegável e integrado no frontend atual. O nível de valor percebido na demo depende da qualidade dos dados carregados no ambiente.”

### “Como funciona cobrança e acompanhamento?”
“A cobrança nasce conectada à O.S.; no financeiro você acompanha status (pendente, paga, vencida) e na timeline enxerga o histórico e a próxima ação.”

---

## 5) Lacunas reais da demo atual (e como contornar sem mentir)

### Dependências de seed/dados
- Várias telas ficam muito mais fortes com dados reais (clientes, agendamentos, O.S., cobranças, mensagens).
- O frontend já prevê cenário de demo com CTA “Gerar ambiente de demonstração”.

### O que pode ficar estranho com pouco dado
- Dashboard com blocos vazios.
- Timeline sem eventos ou sem cliente selecionável.
- WhatsApp aberto sem contexto (sem `customerId`) mostra estado vazio.
- Governança sem histórico pode parecer “fraco” se não houver eventos anteriores.

### Como contornar na apresentação
- Abrir dizendo: “vou mostrar o fluxo real já implementado e, onde houver poucos dados, uso os estados de operação inicial do produto.”
- Se necessário, acionar **Gerar ambiente de demonstração** antes/início da reunião para popular o ciclo completo.
- Quando um bloco estiver vazio, vender a lógica de progressão: “este bloco acende automaticamente quando o fluxo anterior é executado.”

---

## 6) Entrega final

### 6.1 Versão resumida (3 minutos)
1. **Dashboard (30s):** visão geral + promessa de fluxo único.
2. **Clientes (30s):** workspace de cliente.
3. **Agendamentos (30s):** próxima ação operacional.
4. **Ordens de Serviço (45s):** fila + prioridade + detalhe.
5. **Financeiro (30s):** pendência/recebido/vencido.
6. **Timeline (30s):** rastreabilidade.
7. **Governança + Configurações (15s):** supervisão e padronização.

**Fecho (10s):** “NexoGestao entrega clareza operacional do começo ao fim, com cobrança e comunicação no mesmo fluxo.”

### 6.2 Versão ideal (7 minutos)
1. Dashboard — 40s
2. Clientes — 55s
3. Agendamentos — 55s
4. Ordens de Serviço — 75s
5. Financeiro — 55s
6. WhatsApp — 45s
7. Timeline — 70s
8. Governança — 45s
9. Configurações + fechamento — 40s

### 6.3 Melhor caminho de navegação (estado atual)
`/executive-dashboard` → `/customers` → `/appointments` → `/service-orders` → `/finances` → `/whatsapp` (ideal por deep-link contextual) → `/timeline` → `/governance` → `/settings`

---

## Checklist pré-demo (rápido)
- Confirmar login e permissões para todas as rotas do fluxo.
- Validar que existe ao menos 1 cliente com trilha mínima (agendamento + O.S. + cobrança).
- Deixar aberto um caso com contexto para salto rápido a WhatsApp e Timeline.
- Preparar frase de transparência para estados vazios (“estágio inicial sem dados suficientes ainda”).

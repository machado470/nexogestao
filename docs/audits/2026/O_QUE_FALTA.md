# O QUE FALTA NO NexoGestão
Auditoria funcional real para fechamento de produto

Atualização: 20/03/2026  
Status: revisão orientada a execução  
Objetivo: manter visível apenas o que ainda impede o NexoGestão de operar como produto coerente, confiável, legível e vendável

Legenda

[x] existe e está funcional como base real  
[~] existe, funciona, mas ainda precisa polimento, exposição melhor ou fechamento mais confortável  
[ ] ainda falta construir ou fechar de verdade

---

## 1. CONTEXTO

O NexoGestão já tem base arquitetural forte e o fluxo estrutural oficial continua sendo:

cliente  
→ agendamento  
→ ordem de serviço  
→ execução  
→ cobrança  
→ pagamento  
→ timeline  
→ risco  
→ governança

Esse fluxo continua correto e alinhado com a arquitetura oficial do sistema.

Mas a leitura prática agora mudou.

O problema principal do produto já não é mais:

- falta de módulo central
- falta de backend
- falta de estrutura
- falta de fluxo-base

O problema agora é outro:

o sistema já funciona mais do que parece funcionar.

Hoje o trabalho real é:

- endurecer fluxo
- reduzir atrito
- aumentar rastreabilidade visível
- melhorar leitura por entidade
- transformar capacidade real em percepção clara de produto pronto
- eliminar redundância entre páginas parecidas
- fazer a O.S. virar o hub operacional real do sistema

Em termos práticos:

- o núcleo operacional já conecta agenda, O.S., cobrança e pagamento
- o frontend já cobre parte importante da operação real
- várias páginas críticas deixaram de ser casca
- o backend já faz mais do que o produto ainda comunica
- a experiência ainda depende demais de o usuário entender sozinho

Ou seja:

o NexoGestão já tem motor  
e agora precisa de:

- nitidez
- costura entre telas
- contexto
- conforto operacional
- prova visual de confiabilidade

---

## 2. RESUMO EXECUTIVO

### Estado atual

A base técnica está sólida.

O sistema já possui, em funcionamento real:

- autenticação
- RBAC
- onboarding
- clientes
- agendamentos
- ordens de serviço
- execução operacional
- cobrança
- pagamento
- timeline
- governança
- WhatsApp
- despesas
- dashboard operacional
- workflow operacional
- páginas administrativas relevantes com base real

O backend já sustenta produto real.  
O frontend já deixou de ser casca.  
Os fluxos centrais já existem de verdade.

### Diagnóstico direto

O NexoGestão hoje não sofre mais de “não existe”.

Ele sofre principalmente de seis tipos de dívida:

- acabamento de UX
- rastreabilidade mais visível
- explicação melhor do que o sistema faz
- coerência mais clara entre módulos administrativos e operacionais
- redundância entre páginas que resolvem quase a mesma coisa
- subexposição do backend rico já existente

### Tradução honesta

Antes:

o risco era parecer só projeto

Agora:

o risco é ter produto forte por dentro e ainda parecer menos maduro do que realmente já está

### Conclusão da revisão atual

O núcleo principal está fechado estruturalmente.

O que falta agora é fechar melhor a experiência percebida.

Menos construção de novos blocos.  
Mais:

- acabamento
- visibilidade
- explicação
- confiabilidade percebida
- redução de atrito
- centralização do fluxo em entidades mais claras

---

## 3. PLACAR FUNCIONAL ATUAL

### VERDE

[x] Ordens de Serviço  
[x] Financeiro core  
[x] Agendamentos  
[x] Timeline base  
[x] Dashboard Operacional  
[x] Workflow Operacional  
[x] Governança base  
[x] Despesas  
[x] Clientes com workspace operacional  
[x] Onboarding funcional

### VERDE / AMARELO FORTE

[~] WhatsApp  
[~] Configurações  
[~] Pessoas  
[~] Lançamentos  
[~] Notas Fiscais / Faturas  
[~] Referências  
[~] Timeline por entidade  
[~] Financeiro com leitura consolidada por cliente  
[~] Dashboard Executivo

### FALTAS REAIS AINDA ABERTAS

[ ] Audit UI administrativa  
[~] Evidências / anexos em O.S.  
[~] Risco explicado de forma legível  
[~] Notificações realmente operacionais  
[~] Agenda madura o suficiente para operação sem atrito  
[~] O.S. como hub operacional completo  
[~] Coerência final entre páginas de operação

### AINDA NÃO É FOCO DE EXPANSÃO

[ ] Billing SaaS avançado  
[ ] Plans / subscriptions expostos comercialmente  
[ ] Reports executivos profundos  
[ ] Analytics avançado  
[ ] Inteligência preditiva  
[ ] Integrações externas demais  
[ ] Automações mega configuráveis

---

## 4. O QUE JÁ ESTÁ FECHADO DE VERDADE

### 4.1 Fluxo operacional central

Status: [x] estruturalmente fechado  
Status percebido: [~] ainda precisa mais clareza e conforto

Hoje já existe base real para sustentar:

cliente  
→ agendamento  
→ ordem de serviço  
→ execução  
→ cobrança  
→ pagamento  
→ timeline  
→ risco  
→ governança

Já está funcional como fluxo real:

- criação e gestão de cliente
- criação e gestão de agendamento
- criação e gestão de ordem de serviço
- início e conclusão de execução
- geração de cobrança
- pagamento e fechamento financeiro principal
- eventos em timeline
- leitura operacional via dashboard
- leitura operacional via workflow
- governança e alertas visíveis no frontend

O que ainda falta nesse fluxo:

- explicar melhor no produto o que aconteceu entre etapas
- reduzir atrito de UX
- aumentar rastreabilidade visível
- melhorar leitura por entidade
- deixar risco e governança menos caixa preta
- fazer o usuário sentir o fluxo sem precisar interpretar demais

### 4.2 Clientes

Status: [x]

Clientes já deixou de ser listagem simples.

Já funciona:

- listagem real
- criação
- edição
- status ativo/inativo
- abertura de workspace lateral
- leitura consolidada de agendamentos
- leitura de O.S.
- leitura de cobranças
- leitura de timeline por cliente

O que ainda falta:

- timeline por cliente mais forte
- CTAs operacionais mais diretos dentro do workspace
- criar O.S. / cobrança / agendamento a partir do cliente
- leitura mais executiva de inadimplência e histórico operacional
- menos cara de painel e mais cara de entidade central

### 4.3 Agendamentos

Status: [x]

Já funciona:

- criação
- listagem
- confirmação
- cancelamento
- no-show
- integração com cliente
- visão no fluxo operacional
- integração parcial com timeline e comunicação
- calendário operacional real
- leitura por status
- foco por deep-link
- remarcação operacional via calendário

O que ainda falta:

- remarcação mais explícita para o usuário comum
- calendário ainda mais forte
- melhor leitura de disponibilidade
- conflitos de agenda mais maduros
- lembretes mais confiáveis

Agendamento já saiu do status de registro simples.  
Agora precisa virar agenda operacional madura.

### 4.4 Service Orders

Status: [x]

Ordem de serviço já é unidade operacional real.

Já funciona:

- criação
- listagem
- atualização
- início de execução
- conclusão
- leitura operacional
- integração com financeiro
- integração com timeline
- integração com alertas
- resumo financeiro no fluxo
- filtros e foco por deep-link
- expansão com histórico
- leitura de execução vinculada
- exibição de anexos quando existirem

O que ainda falta:

- evidências realmente completas e utilizáveis
- fechamento operacional mais rico
- checklists mais fortes
- explicação melhor no UI
- contexto histórico mais robusto por O.S.
- timeline visual mais inevitável
- transformar a O.S. no hub real do fluxo

Aqui está um dos faltantes mais sérios:

sem evidência, a execução existe  
com evidência forte, ela vira operação auditável de verdade

E mais:

sem timeline clara, a O.S. ainda parece registro  
com timeline clara, ela vira centro de operação

### 4.5 Financeiro core

Status: [x]

O módulo financeiro principal já é real.

Já funciona:

- criação de cobrança
- listagem
- integração com O.S.
- pagamento
- fechamento pós-pagamento
- leitura operacional no dashboard
- leitura no workflow
- pendências e vencidos aparecendo
- ações rápidas de checkout
- registro manual de pagamento
- destaque de cobrança por deep-link

O que ainda falta:

- visão mais forte por cliente
- leitura melhor de vencidos
- costura mais clara entre:
  - cobrança
  - pagamento
  - lançamento
  - fatura
  - despesa
- histórico financeiro mais narrado
- timeline por cobrança

Hoje o financeiro já existe.  
O problema não é falta de motor.  
É clareza e separação mental melhor para o usuário.

### 4.6 Dashboard Operacional

Status: [x]

Hoje já existe leitura diária real de:

- agendamentos do dia
- O.S. do dia
- ordens aguardando ação
- ordens em execução
- ordens concluídas
- cobranças pendentes
- alertas operacionais
- leitura rápida do ciclo

Além disso:

- execução pode ser iniciada
- execução pode ser concluída
- cobrança pode abrir checkout
- pagamento pode ser registrado

O dashboard já tem função real de operação.  
Não é mais tela enfeitada para demo.

O que ainda falta:

- reduzir sobreposição com o Workflow Operacional
- melhorar navegação cruzada por item
- mostrar melhor o porquê dos gargalos
- transformar alertas em ações mais contextualizadas

### 4.7 Workflow Operacional

Status: [x]

A página já:

- mostra ordens abertas
- mostra cobranças pendentes
- mostra cobranças vencidas
- mostra O.S. concluídas sem cobrança
- aciona checkout
- registra pagamento
- consome alertas reais

Gap restante:

- polimento visual
- contexto melhor por item
- CTAs adicionais por entidade
- navegação cruzada mais forte
- definição mais clara do papel dela versus dashboard operacional

Hoje ela já funciona.  
Mas existe risco de redundância com o dashboard operacional.

### 4.8 WhatsApp

Status: [~]

Já funciona:

- envio manual
- disparos automáticos em partes do fluxo
- página dedicada
- comunicação visível
- suporte ao fluxo comercial e operacional

O que ainda falta:

- templates mais padronizados
- status de entrega mais confiável
- retry mais visível
- histórico mais forte por entidade
- timeline mais completa por mensagem

O canal já existe no produto.  
Mas ainda não está liso o suficiente para ser considerado verde pleno.

### 4.9 Governança

Status: [x] base funcional  
Maturidade percebida: [~]

Já funciona:

- base backend real
- página dedicada
- execução visível
- score e leitura institucional
- leitura de ações corretivas
- conexão estrutural com risco e alertas
- histórico de execuções

O que ainda falta:

- explicar melhor decisões
- leitura administrativa mais confortável
- navegação cruzada com timeline e risco
- políticas mais visíveis
- histórico mais humano de leitura

Governança já entrou no produto.  
O que falta é ela parar de parecer módulo técnico sofisticado e começar a parecer controle claro da operação.

### 4.10 Timeline

Status: [x]

Já funciona:

- página dedicada
- histórico operacional
- integração com várias entidades
- filtros básicos

O que ainda falta:

- visão mais forte por O.S.
- visão financeira melhor
- filtros por tipo
- filtros por severidade
- garantia de cobertura total dos eventos críticos
- diferença mais clara entre timeline e auditoria

Timeline já é parte funcional do produto.  
Agora precisa virar leitura inevitável, não só leitura possível.

### 4.11 Despesas

Status: [x]

Despesas já deixou de ser buraco primário.

Já funciona:

- listagem real
- summary
- create
- delete
- feedback de ação
- estados de loading/erro
- leitura administrativa consistente

O que ainda falta:

- costura mais clara com lançamentos
- leitura consolidada com financeiro
- explicação melhor dentro do ecossistema financeiro

### 4.12 Onboarding

Status: [x]

Já funciona:

- fluxo guiado
- persistência de progresso
- criação inicial de empresa
- primeiro cliente
- primeiro agendamento
- primeira O.S.
- primeira cobrança
- encerramento do onboarding

O que ainda falta:

- fechar melhor o pós-onboarding
- conduzir o usuário para o fluxo real seguinte
- apresentar melhor o que foi criado
- conectar onboarding com operação diária de forma mais natural

### 4.13 Dashboard Executivo

Status: [~]

Já entrega:

- KPIs consolidados
- receita por período
- crescimento de clientes
- status de ordens
- status de cobranças
- métricas executivas base

O que ainda falta para virar verde pleno:

- refinamento visual
- leitura mais estratégica por persona
- narrativa mais executiva
- menos cara de lista e mais cara de cockpit

---

## 5. MÓDULOS QUE AINDA PEDEM MAIS UMA PASSADA

### 5.1 Configurações

Status: [~]

Já entrega:

- leitura de configurações reais da organização
- edição básica
- feedback de save
- tipagem e normalização melhores
- membersCount e plano atual visíveis

O que falta para virar verde total:

- expor ação real de segurança
- ou simplificar a tela para mostrar só o que é realmente configurável
- tratar melhor plano / assinatura / gestão comercial
- remover qualquer promessa visual que ainda não tenha ação real

### 5.2 Pessoas

Status: [~]

Já entrega:

- listagem real
- create
- edit
- deactivate
- visão de estado operacional
- vínculo com usuário visível
- leitura de risco
- feedback melhor de ação e carregamento

O que falta para virar verde total:

- filtro e busca
- paginação se crescer
- detalhe mais forte por pessoa
- vínculo explícito pessoa ↔ usuário
- contexto histórico / timeline por pessoa

### 5.3 Lançamentos

Status: [~]

Já entrega:

- listagem real
- resumo
- criação manual
- filtro por tipo
- filtro por período
- paginação
- leitura melhor de categoria / conta / data

O que falta para virar verde total:

- edição
- exclusão
- origem do lançamento visível
- vínculo explícito com financeiro sistêmico
- diferença mais clara entre lançamento manual e evento financeiro nativo do sistema

### 5.4 Notas Fiscais / Faturas

Status: [~]

Já entrega:

- listagem
- summary
- create
- update de status controlado
- delete com regra
- filtro por texto
- filtro por status
- leitura documental explícita
- feedback visual melhor nas ações
- loading por item em update/delete
- fluxo mais coeso

O que falta para virar verde total:

- UX mais elegante
- vínculo mais claro com cliente e cobrança
- leitura melhor para operação administrativa
- refinamento do create inline
- costura mais clara com financeiro principal

### 5.5 Referências

Status: [~]

Já entrega:

- listagem
- summary
- leitura melhor de estado
- UX mais confiável do que antes

O que falta:

- esclarecer o peso do módulo dentro do produto
- acabamento final
- decidir se ele é core de operação ou apoio comercial

---

## 6. O QUE AINDA FALTA DE VERDADE

Agora sim: só o que continua faltando de forma honesta.

### 6.1 Audit UI administrativa

Status: [ ]

A auditoria já existe no backend e em vários fluxos.  
O que falta é uma interface administrativa decente para consulta.

Falta:

- página de auditoria
- filtros
- leitura por entidade
- leitura por usuário
- separação clara entre timeline e audit
- navegação útil para investigação real

Isso merece prioridade alta.  
Sem isso, o produto perde parte do próprio diferencial de rastreabilidade.

### 6.2 Evidências / anexos no fechamento operacional

Status: [~]

A base já começou a aparecer, mas ainda não fechou de verdade.

Falta:

- upload real confiável
- fotos
- PDFs
- evidências operacionais úteis
- fechamento com contexto mais rico
- persistência e leitura realmente confiáveis

Isso continua sendo um dos itens que mais aumentam cara de produto pronto.

### 6.3 Risco mais visível e explicável

Status: [~]

Risco já existe e reage a eventos reais.

Mas ainda falta deixá-lo inteligível.

Falta:

- explicar por que o score mudou
- histórico visual por cliente / pessoa
- impacto operacional mais explícito
- transparência mínima do cálculo no produto

Hoje risco existe mais como motor do que como linguagem de produto.

### 6.4 Notificações mais maduras

Status: [~]

Existe base, mas ainda falta virar centro operacional de verdade.

Falta:

- priorização por severidade
- leitura e arquivamento melhores
- agrupamento mais útil
- ligação mais visível com governança, financeiro e operação

### 6.5 Agenda mais madura

Status: [~]

Agendamento já existe.  
O que falta é elevar a ergonomia.

Falta:

- remarcação mais explícita
- melhor gestão de conflitos
- disponibilidade real
- lembretes mais confiáveis
- leitura mais confortável do calendário

### 6.6 Frontend explorar melhor o backend rico

Status: [~]

Continua verdadeiro:

o backend já faz mais do que o frontend comunica.

Áreas ainda subexpostas:

- audit
- risk
- notifications
- reports
- automation
- billing / plans / subscriptions
- pending / exceptions / corrective actions

O risco aqui não é falta de motor.  
É percepção baixa de um motor que já existe.

### 6.7 Redundância operacional entre páginas

Status: [~]

Hoje já existe valor real em:

- Dashboard Operacional
- Workflow Operacional
- Service Orders
- Financeiro

Mas ainda existe uma sobreposição parcial de leitura e ação.

Falta:

- definir papel exato de cada tela
- evitar repetição de informação sem contexto novo
- decidir onde cada ação principal deve morar
- reduzir sensação de a mesma coisa em mais de um lugar

### 6.8 O.S. como hub operacional completo

Status: [~]

A O.S. já é a entidade mais próxima do coração da operação.

Mas ainda falta ela virar o centro inequívoco do sistema.

Falta:

- timeline visual ainda mais forte
- visão clara de execução → cobrança → pagamento
- evidências realmente utilizáveis
- ações contextuais mais inteligentes
- histórico consolidado por entidade

Quando isso estiver fechado, o produto sobe de nível.

---

## 7. NOVA ORDEM REAL DE PRIORIDADE

### P0 — endurecimento final do produto vendável

- audit UI administrativa
- evidências e anexos confiáveis em O.S.
- risco explicado
- agenda mais madura
- notificações mais operacionais
- coerência final entre módulos administrativos e operacionais
- O.S. como hub operacional real

### P1 — polimento de conforto e leitura

- filtro e busca melhores
- UX mais consistente
- leitura por entidade
- navegação cruzada melhor
- páginas mais explicativas
- WhatsApp mais rastreável e confiável
- reduzir redundância entre páginas de operação
- refinar dashboard executivo

### P2 — expansão lateral

Segurar por enquanto:

- analytics sofisticado
- automação mega configurável
- integrações demais
- múltiplos canais além do WhatsApp
- inteligência preditiva

Foguete de Marte de novo não.

---

## 8. CHECKLIST EXECUTÁVEL ATUALIZADO

### Fluxo central

[x] cliente sustenta agenda / O.S. / cobrança  
[x] agendamento cria, confirma e cancela  
[x] O.S. cria, executa e conclui  
[x] cobrança nasce e aparece no fluxo  
[x] pagamento fecha parte central do ciclo  
[x] timeline participa do fluxo  
[~] risco recalcula, mas precisa explicação melhor  
[x] governança aparece de forma real  
[x] workflow operacional fecha leitura do fluxo  
[x] dashboard operacional fecha leitura diária da operação

### Auth

[x] login  
[x] registro  
[x] sessão  
[x] logout  
[~] forgot password  
[~] reset password  
[x] proteção de rota  
[x] permissões por role no frontend

### Customers

[x] listagem  
[x] criação  
[x] edição  
[x] workspace operacional  
[~] timeline por cliente mais forte  
[~] CTAs operacionais mais fortes por cliente  
[~] histórico de contato com base real melhorada

### Appointments

[x] criação  
[x] confirmação  
[~] remarcação explícita  
[x] cancelamento  
[~] lembrete  
[x] vínculo com cliente  
[~] disponibilidade e conflito de agenda  
[x] calendário operacional base

### Service Orders

[x] criação  
[x] atualização de status  
[x] início de execução  
[x] conclusão  
[x] vínculo estrutural com cobrança  
[x] leitura operacional  
[~] anexos / evidências base  
[~] timeline visual da O.S.  
[~] hub operacional completo

### Financeiro core

[x] criação de cobrança  
[x] listagem  
[x] pagamento  
[x] leitura operacional no dashboard / workflow  
[~] vencidos mais maduros  
[~] comunicação financeira melhor  
[~] visão consolidada por cliente  
[~] timeline por cobrança

### WhatsApp

[x] envio manual  
[x] envio automático por eventos  
[~] templates  
[~] status de entrega  
[~] retry  
[~] rastreabilidade mais forte na timeline

### Administrativo

[~] settings  
[~] people  
[~] launches  
[~] invoices / faturas  
[ ] audit UI  
[~] notifications mais maduras  
[~] referrals  
[x] expenses com fluxo administrativo consistente  
[~] executive dashboard com acabamento final

---

## 9. CRITÉRIO DE PRONTO AGORA

### Produto pronto para operar

Quando:

- o fluxo central fecha sem tropeço
- o admin entende o que aconteceu
- o operacional consegue agir sem caça ao tesouro
- o financeiro não fica descolado da operação
- a comunicação fica rastreável
- risco e governança deixam de parecer caixa preta
- a O.S. mostra o ciclo operacional com clareza

### Produto pronto para vender sem susto

Quando, além do acima:

- auditoria administrativa estiver visível
- agenda estiver mais madura
- execução tiver evidências e anexos confiáveis
- módulos administrativos restantes virarem verde pleno
- UX estiver menos técnica e mais inevitável
- as páginas de operação tiverem papéis claros e não redundantes

---

## 10. FRASE-GUIA NOVA

O NexoGestão já não precisa provar que consegue existir.

Agora ele precisa provar que consegue fechar operação com clareza, confiança e zero cara de remendo.

Menos módulo novo.  
Mais nitidez.

Menos “tem backend pra isso”.  
Mais “o usuário viu, entendeu e usou até o fim”.

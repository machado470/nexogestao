---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Agendamentos como centro operacional de entrada da execução

A página **Agendamentos** é a entrada operacional do tempo no Nexo Operating System. Ela não deve parecer calendário genérico nem lista administrativa: sua função é decidir o que fazer agora, preparar atendimento, reduzir no-show e conectar o ciclo **Cliente → Agendamento → O.S. → Cobrança → Pagamento** usando somente dados já carregados pelo frontend.

## Direção operacional

Quando há um agendamento em foco, a ordem da experiência deve privilegiar execução e manter o **Hero Executivo** como primeiro elemento operacional imediatamente abaixo do cabeçalho da página:

1. **Hero Executivo do Agendamento** domina a primeira dobra com cliente em hierarquia máxima, status/sinal principal fortes, data/hora/duração evidentes e contexto/responsável como apoio. A busca, chips e filtros assumem papel secundário e não devem competir com o agendamento selecionado.
2. **Decisão e próxima ação** é o cérebro operacional: bloco único, visualmente mais forte que cards comuns, reunindo estado operacional, maior risco, motivo, impacto, ação recomendada, CTA principal/secundário e nota de segurança.
3. **Preparação da execução** aparece entre decisão e Timeline como checklist compacto de prontidão usando somente dados já carregados: cliente, confirmação, responsável, O.S., cobrança, evidência/Timeline e WhatsApp.
4. **Timeline/prova operacional** humanizada aparece antes do pipeline: a Timeline é evidência operacional, sustenta auditoria e prova o que aconteceu antes da leitura do fluxo.
5. **Pipeline principal limpo** permanece limitado a Cliente, Agendamento, O.S., Cobrança e Pagamento, com quebra responsiva e linguagem humana.
6. **Resumo operacional** é apoio compacto, não dashboard secundário, mantendo Hoje, Confirmados, Não confirmados, Atrasados e Concluídos em métricas baixas e acionáveis.
7. **Radar operacional** é alerta auxiliar discreto: incidentes compactos com cliente, horário, problema, próxima ação curta e CTA “Resolver”, mantendo fallback honesto quando a fonte não entrega resposta do cliente.
8. **Carteira operacional** é navegação secundária depois do detalhe, da prova e do radar, em linhas/cards horizontais selecionáveis com altura dinâmica: adapta-se a poucos registros e só cria scroll interno quando houver muitos itens.

## Responsabilidade dos CTAs

Os botões devem apontar para fluxos reais já existentes, sem duplicar a mesma responsabilidade em vários blocos:

- **Hero:** abrir agendamento, remarcar/editar, abrir/criar O.S., WhatsApp e abrir cliente — apenas CTAs reais e principais.
- **Decisão:** executar a ação recomendada e, quando existir, oferecer uma ação secundária complementar sem repetir a fileira completa do Hero.
- **Preparação da execução:** CTAs pequenos somente quando houver fluxo real já existente, como abrir cliente, confirmar, editar responsável, abrir/criar O.S., financeiro, Timeline ou WhatsApp.
- **Pipeline:** abrir cliente, abrir/criar O.S. e abrir financeiro conforme a etapa operacional.
- **Radar operacional:** resolver incidente do item crítico.
- **Carteira:** selecionar item, confirmar/cancelar, iniciar atendimento, editar/remarcar, abrir cliente, WhatsApp contextual e O.S. quando aplicável.

## Pipeline e linguagem humana

- O fluxo principal deve permanecer **Cliente → Agendamento → O.S. → Cobrança → Pagamento**.
- Timeline, risco e governança podem aparecer como prova, chips auxiliares ou texto contextual, mas não como etapas principais do pipeline.
- O pipeline nunca deve exibir estados internos, enums crus, `eventType`, UUIDs, hashes, slugs técnicos ou identificadores como conteúdo para operadores.
- Estados técnicos devem ser traduzidos para linguagem humana. Exemplos obrigatórios:
  - `IN_PROGRESS` → “Em execução”.
  - `PENDING` → “Pendente” ou “Cobrança pendente”, conforme o contexto.
  - `COMPLETED`/`DONE` → “Concluído”/“Concluída”.
  - `FAILED` → “Falhou”.
  - `CANCELLED`/`CANCELED` → “Cancelado”.
  - `PROCESSING` → “Em processamento” ou “Em execução”, conforme o contexto.
- Exemplos de semântica operacional esperada:
  - Cliente: “Cliente vinculado”.
  - Agendamento: “Confirmado”, “Sem confirmação” ou “Atrasado”.
  - O.S.: “Sem O.S.”, “O.S. aberta”, “Em execução” ou “Concluída”.
  - Cobrança: “Sem cobrança”, “Cobrança pendente”, “Cobrança vencida” ou “Cobrança paga”.
  - Pagamento: “Aguardando pagamento” ou “Pagamento recebido”.

## Timeline, radar e carteira

- **Timeline é evidência operacional:** deve vir antes do pipeline, do resumo, do radar e da carteira, apresentando eventos humanizados derivados de dados reais ou retornados pela fonte oficial.
- **Carteira é navegação secundária:** lista e filtros ajudam a trocar o foco, mas não podem dominar quando há agendamento selecionado; sua altura deve acompanhar o conteúdo e evitar espaço morto com 1 ou 2 registros.
- **Radar operacional é compacto:** deve manter apenas cliente, horário, problema, próxima ação curta e CTA “Resolver”, com baixa altura, menor padding e menor peso visual para não competir com o Hero.
- **Nenhum identificador técnico pode aparecer para operadores:** IDs, UUIDs, hashes, slugs internos, metadata bruta, status internos e enums crus são vazamentos de backend.

## Limites intencionais

- Sem backend novo.
- Sem alteração de API, Prisma, rotas, contratos, payloads ou segurança multi-tenant.
- Sem alteração da WhatsAppPage.
- Sem automação falsa: a tela pode orientar e abrir fluxos existentes, mas não deve prometer envio automático, confirmação automática ou cobrança automática.
- Sem dados inventados: quando a fonte não entrega resposta do cliente, conflito ou timeline oficial, a interface deve declarar o limite de forma honesta.
- Sem inferir atraso sem data válida e sem afirmar conflito sem início/fim e mesmo cliente ou responsável nos dados carregados.

## Critérios visuais

- Manter tokens do Nexo e compatibilidade dark/light.
- Não adicionar Flowbite como dependência.
- Usar laranja apenas para CTA, gargalo, risco ou ação.
- Evitar cards gigantes vazios e reduzir altura morta.
- Dropdowns como **Mais filtros** devem ter camada acima de carteira, tabelas, cards e timeline, sem clipping por overflow ou stacking context inferior.
- Lista operacional deve apoiar a decisão quando há seleção, não competir com o detalhe executivo.

## Polimento premium final

- O Hero deve transmitir “estou dentro deste agendamento”, não apenas “detalhe aberto”.
- A Decisão é bloco de comando: precisa deixar claro “é isso que deve ser feito agora”, com CTA principal dominante, orientação vertical e sem voltar a ser separada em cards antigos.
- Preparação da execução é checklist, não automação: nenhum item pode prometer envio, cobrança ou confirmação automática.
- O Pipeline deve continuar sem Timeline, Risco ou Governança como etapas principais.
- A Timeline é a prova operacional e deve aparecer antes do pipeline; quando não houver retorno oficial, o fallback precisa declarar que usa apenas datas reais do agendamento.
- O Radar não compete com a Timeline nem com a Decisão; sua função é alerta auxiliar de leitura rápida.
- A Carteira é troca de foco e navegação secundária, não tabela/backoffice; filtros, paginação, menu secundário e seleção visual devem permanecer, com scroll interno apenas quando houver muitos registros.
- Permanecem preservados backend, API, Prisma, rotas, contratos, payloads, segurança multi-tenant, WhatsAppPage, automações, mocks e seeds.

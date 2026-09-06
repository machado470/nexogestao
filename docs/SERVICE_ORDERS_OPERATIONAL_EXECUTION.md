---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Ordens de Serviço como execução operacional

A página de Ordens de Serviço do NexoGestão deve ser lida como o centro real de execução da operação, não como um cadastro. A tela organiza a carteira para responder rapidamente: qual serviço precisa andar, quem é responsável, qual prazo está em risco, qual O.S. está concluída sem cobrança e qual ação existente deve ser executada agora.

## Papel no fluxo de receita

O.S. é a ponte operacional entre cliente, agenda e financeiro. Quando a execução é concluída, ela deve virar cobrança rastreável sempre que houver valor e contrato existente para geração de cobrança. Por isso, a tela destaca O.S. concluídas sem cobrança como alerta de receita não capturada.

## Dados e limites preservados

- A página usa as fontes já existentes de O.S., clientes, agendamentos, pessoas, cobranças e Timeline.
- Nenhuma rota, contrato de API, Prisma ou regra multi-tenant foi alterada.
- WhatsAppPage não foi modificada; a O.S. apenas navega para o fluxo já existente quando há cliente e O.S. válidos.
- A tela não inventa automação: iniciar, concluir, gerar cobrança, editar, abrir detalhe, abrir cliente, financeiro, Timeline e WhatsApp são ações conectadas a fluxos existentes.
- Atraso só é exibido quando há prazo retornado. Sem prazo vira estado explícito, não atraso inferido.
- Responsável e cobrança só são exibidos quando retornados pelas fontes carregadas; ausências são mostradas como ausência de dado operacional.

## Estrutura atual da tela

1. Header operacional compacto com volume, atrasos, O.S. sem cobrança e O.S. paradas sem prazo.
2. Próxima melhor ação compacta, orientativa e acionada por botões existentes.
3. Alertas compactos para atrasadas, paradas sem prazo, sem responsável e concluídas sem cobrança.
4. Cards compactos de saúde da execução.
5. Lista operacional com número, cliente, serviço, status, responsável, prazo, atraso e valor quando disponível.
6. Detalhe de O.S. com execução, comunicação/navegação, histórico e financeiro.
7. Fallback honesto quando a Timeline oficial não retorna eventos: datas reais da O.S. podem ser exibidas como contexto, sem substituir a Timeline oficial.

## Direção Nexo Operating System UI — polimento final

A página `/service-orders` deve funcionar como centro operacional de execução, com hierarquia clara:

1. **Hero como contexto** — o Hero apresenta cliente, serviço, status, responsável, prazo, atraso, valor, sinal principal e CTAs reais. Ele usa superfície e borda neutras para contextualizar sem competir com o comando principal. Quando houver código humano da O.S., ele pode aparecer; UUIDs, hashes e IDs técnicos não devem ser exibidos no título, subtítulo ou resumo do operador.
2. **Decisão como comando** — o bloco “Decisão e Próxima Ação” é dominante, usa o padrão `FAÇA AGORA: [ação]` e concentra estado operacional, maior risco, motivo, impacto, nota de segurança e CTA principal/secundário. O CTA principal deve ser visualmente mais forte que os demais.
3. **Preparação como checklist** — o checklist usa apenas dados já carregados: cliente vinculado, responsável, agendamento, execução, cobrança, Timeline e WhatsApp. Cada item mostra status humano e só exibe CTA pequeno quando existe ação real conectada.
4. **Timeline como prova** — a Timeline traduz eventos técnicos para linguagem de negócio, como “Cobrança criada”, “Cobrança vinculada”, “Execução concluída” e “O.S. concluída”. O fallback é “Evento operacional registrado”. Entidades relacionadas devem ser humanas: cliente, O.S. ou cobrança, nunca ID cru.
5. **Pipeline como leitura de fluxo** — o fluxo principal permanece `Cliente → Agendamento → O.S. → Execução → Cobrança → Pagamento`, com estados humanos como “Sem agendamento vinculado”, “Execução concluída”, “Cobrança pendente” e “Aguardando pagamento”. IDs técnicos devem ser sanitizados ou ocultados.
6. **Saúde, Radar e Carteira como apoio** — Saúde operacional é métrica densa e baixa; Radar é compacto, com cliente, problema, próxima ação e CTA “Resolver”; Carteira é seção de apoio com linhas densas contendo cliente, serviço, status/sinal, responsável, prazo e ação principal.
7. **Detalhe como cockpit operacional** — o detalhe substitui blocos administrativos por mini-cards de Cliente, Execução, Financeiro, Agendamento e Governança/Timeline. Quando faltar dado, o fallback deve ser honesto e curto.
8. **Linguagem permitida** — a UI não deve vazar `eventType`, UUID, hash, ID interno de O.S. ou cobrança, nem termos brutos de backend. Botões bloqueados precisam explicar o motivo via `title`, `aria-label` ou microcopy discreta.

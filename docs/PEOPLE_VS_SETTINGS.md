---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Pessoas vs. Configurações

## Pessoas

A página **Pessoas** é o centro de execução da equipe operacional. Ela deve mostrar quem está responsável pela operação e quais sinais reais chegaram pela fonte `people.operationalSummary`:

- nome, função e status operacional da pessoa;
- carga atual de O.S. e agenda;
- O.S. e agendamentos atribuídos;
- atrasos vinculados a responsáveis;
- indisponibilidades temporárias e sinais de risco quando a fonte entregar esses dados;
- ações reais já existentes, como abrir O.S., abrir agendamentos, editar pessoa e registrar indisponibilidade.

A página não deve inferir dados ausentes, automatizar redistribuições nem substituir uma tela de administração de usuários.

## Configurações

A área **Configurações** concentra comportamento do sistema e administração. É o local correto para revisar controles administrativos, permissões, papéis de usuário, empresa, integrações e preferências globais.

## Regra de produto

- Use **Pessoas** para responder: “quem executa, qual é a carga e onde há risco operacional?”
- Use **Configurações** para responder: “quem pode acessar, com qual papel e quais parâmetros controlam o sistema?”

Essa separação evita duplicar Configurações dentro de Pessoas e mantém Pessoas como uma página de execução multi-tenant baseada em fontes operacionais existentes.

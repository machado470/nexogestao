# Validação operacional do ambiente piloto — 2026-09-03

## Escopo e veredito

Esta auditoria cobre o fluxo Cliente → Agendamento → Ordem de Serviço → Execução → Cobrança → Pagamento → Timeline → Dashboard, sem substituir contratos oficiais por mocks e sem mover regras operacionais para o navegador.

**Veredito:** os contratos e serviços relevantes passam nos testes unitários/de contrato, e existe um teste de integração canônico que percorre as mutações do fluxo. A execução real contra a infraestrutura piloto, o login pela aplicação e o reflexo no Dashboard são **não comprovados neste ambiente**, pois o procedimento oficial interrompeu antes de iniciar Postgres/Redis: o binário `docker` não está instalado.

## Estado inspecionado

- Branch: `work`.
- HEAD inicial: `26eb2f79b6c42f8ae9ebdf690d85f9f18b332d03`.
- Árvore inicial: limpa.
- Monorepo pnpm com `apps/api`, `apps/web` e `packages/common`.
- Versões observadas: Node `v20.20.2`, pnpm `10.30.3`; o manifesto fixa pnpm `10.30.3` e Prisma `5.22.0`.
- Infra oficial: `docker-compose.yml`, Postgres 15 em `5432`, Redis 7 em `6379`, API em `3000` e Web/BFF em `3010`.
- Prisma: schema raiz em `prisma/schema.prisma`, 64 diretórios de migrations e seed selecionada por `SEED_MODE` (piloto por padrão).
- Inicialização oficial: `pnpm dev:full` / `scripts/dev-full.sh`; reset reproduzível: `pnpm dev:reset`.

## Ambiente piloto e autenticação

O seed piloto cria ou atualiza a organização `Serviços Viva - Ambiente Piloto` (`pilot-servicos-viva`), uma assinatura Business e três usuários:

| Perfil piloto | Papel persistido | Login padrão |
| --- | --- | --- |
| Admin | `ADMIN` | `admin.piloto@nexogestao.local` / `Admin123!` |
| Operação | `STAFF` | `operador.piloto@nexogestao.local` / `Piloto@Operador123` |
| Financeiro | `MANAGER` | `financeiro.piloto@nexogestao.local` / `Piloto@Finance123` |

Os nomes funcionais OPERADOR/FINANCEIRO usados em alguns guards não são os valores persistidos pelo seed; o piloto efetivamente usa STAFF/MANAGER nas rotas operacionais. Isso deve ser tratado como diferença de nomenclatura, não como autorização adicional no frontend.

O login passa por `POST /auth/login`; o BFF grava o cookie `nexo_token`. O bootstrap consulta `/v1/me`, e contexto autenticado só é produzido após essa resposta validar o usuário e a organização. Falha/indisponibilidade de `/me` remove ou recusa a sessão, sem fallback baseado somente no token. O `orgId` vem do JWT/sessão e os testes de contrato rejeitam tenant fornecido pelo navegador.

## Determinismo do seed

O conjunto principal declara 10 clientes (seis gerais e quatro cenários WhatsApp), seis agendamentos principais e seis ordens de serviço. Também cria cenários financeiros, mensagens, despesas, lançamentos, governança e Timeline com operações de upsert/busca por chaves de negócio.

As datas são relativas ao dia da execução. Isso é intencional para manter Dashboard e filas temporalmente úteis, mas revelou um defeito: a chave dos seis agendamentos principais incluía o minuto da data relativa. Reexecutar o seed em outro dia produzia chaves novas e podia duplicar agendamentos, deslocar janelas por conflito e alterar contagens do Dashboard.

A correção mínima torna a chave estável por organização e cenário. A busca também reconhece a chave legada com data, atualiza o registro mais antigo de maneira determinística e migra sua chave. Assim, novas reaplicações atualizam as datas relativas sem criar outro registro. Bancos já contaminados com mais de uma duplicata histórica precisam de auditoria/limpeza explícita; o seed não apaga dados para ocultar esse estado.

## Evidências por etapa

| Etapa | Evidência disponível | Situação neste ambiente |
| --- | --- | --- |
| Cliente | serviços, controllers e teste canônico criam/listam com isolamento de tenant | Contrato testado; execução real não comprovada |
| Agendamento | criação, atribuição, confirmação e isolamento no teste canônico | Contrato testado; execução real não comprovada |
| O.S. | criação vinculada ao agendamento e transição para `IN_PROGRESS` | Contrato testado; execução real não comprovada |
| Execução | `/executions/start` e `/executions/:id/complete`, finalizando em `DONE` | Contrato testado; execução real não comprovada |
| Cobrança | criação vinculada à O.S., com envelope autoritativo | Contrato testado; execução real não comprovada |
| Pagamento | valor exato, idempotência, concorrência e transição para `PAID` | Contrato testado; execução real não comprovada |
| Timeline | evento único `PAYMENT_RECEIVED` e isolamento | Contrato testado; persistência real não comprovada |
| Risco/governança | recálculo e contratos de estado/sinais cobertos | Contrato testado; execução real não comprovada |
| Dashboard | KPIs, alertas, pipeline, estado, sinais e próxima ação validam payload interno | Contrato testado; reflexo pós-mudança real não comprovado |

Os testes do BFF confirmam: envelope Nest aceito e desembrulhado antes do Zod; payload inválido rejeitado; envelope de erro não promovido a sucesso; zeros preservados; falhas upstream não viram listas/objetos vazios; seções do Dashboard possuem queries e estados de falha independentes.

## Bloqueios e riscos

1. **Bloqueio ambiental:** `docker` ausente. Causa raiz externa ao repositório; impede Postgres, Redis, migrations, seed, API, BFF, Web, health checks, login e teste de integração real.
2. **Seed não idempotente entre dias:** chave temporal dos agendamentos. Causa raiz corrigida neste change set com chave de cenário estável e compatibilidade de migração.
3. **Possível passivo em volumes existentes:** mais de uma execução antiga pode já ter duplicado linhas. Não comprovado no ambiente atual e deliberadamente não apagado automaticamente.
4. **Teste canônico usa JWT assinado diretamente:** comprova guards/tenant e fluxo da API, mas não substitui uma prova de login real pelo BFF/browser.
5. **Risco de regressão da correção:** baixo e concentrado no seed de desenvolvimento. A seleção é limitada por `orgId`, cliente e prefixo específico; ordenar pelo registro mais antigo torna a reconciliação previsível.

## Procedimento para concluir a prova real

Em host com Docker disponível:

```bash
pnpm dev:reset
pnpm dev:health
RUN_REAL_INTEGRATION=true JWT_SECRET=change-me-change-me pnpm --filter ./apps/api test -- test/integration/canonical-operational-workflow.spec.ts
```

Depois, entrar em `http://localhost:3010` com o admin piloto e repetir o cenário pela UI/API oficial, registrando IDs e snapshots dos contratos do Dashboard antes/depois. Reexecutar `NEXO_DEV_SEED=1 pnpm dev:full` em dias distintos (ou com relógio controlado) e confirmar que os seis cenários principais permanecem seis. Até esses passos ocorrerem, o fluxo real completo e a interface permanecem **não comprovados**.

## Próximo passo recomendado

Disponibilizar Docker no executor e executar imediatamente o procedimento acima. Se o volume já existia antes desta correção, primeiro contar agendamentos com chave `pilot:<orgId>:appointment:<cenario>:%`; qualquer cenário com mais de uma linha exige uma migração de dados revisada, nunca exclusão silenciosa pelo seed.

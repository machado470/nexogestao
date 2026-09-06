---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# DEV_RULES

Regras obrigatórias para o boot local do NexoGestao.

1. Não adicionar novos scripts de desenvolvimento sem necessidade real.
2. Não adicionar novas flags de boot sem revisão técnica formal.
3. Não aumentar a complexidade do boot local com fallback oculto ou auto-decisões.
4. O fluxo local deve priorizar simplicidade, previsibilidade e estabilidade.
5. `scripts/dev-full.sh` é estável: apenas correções críticas futuras.
6. Integrações opcionais nunca podem bloquear o boot local e devem logar como `[OPTIONAL]`.

## Boot local suportado

- Use `pnpm dev:full` para subir o ambiente local completo.
- O script sobe somente `postgres` e `redis` pelo Docker Compose; a API e a WEB rodam via `pnpm` na máquina local.
- O container `nexogestao_api` não faz parte do fluxo `dev:full`.
- Se houver conflito nas portas 3000/3010 causado por processo antigo claramente pertencente a este repositório, `pnpm dev:full` encerra esse processo automaticamente e reinicia o ambiente local.
- A validação segura de pertencimento exige `cwd` dentro do repositório ou comando contendo caminho absoluto dentro do repositório; strings genéricas como `apps/api` ou `apps/web` não bastam.
- Processos externos nas portas da API/WEB, containers externos ou casos ambíguos não devem ser encerrados automaticamente; rode `pnpm dev:ports` para diagnosticar e libere a porta manualmente ou ajuste `API_PORT/WEB_PORT`.
- Para desabilitar a limpeza automática segura, rode exatamente: `NEXO_DEV_KILL_PORTS=0 pnpm dev:full`.
- A variável antiga `NEXO_KILL_STALE_DEV_PROCESSES=1` continua aceita por compatibilidade quando `NEXO_DEV_KILL_PORTS` não estiver definida.
- Para recriar a infraestrutura local, rode `pnpm dev:reset`; ele usa `NEXO_DEV_RESET=1 NEXO_DEV_KILL_PORTS=1 ./scripts/dev-full.sh`.

## Seed local de desenvolvimento

- Por padrão, `pnpm dev:full` verifica o banco local depois das migrations e prepara um ambiente utilizável automaticamente quando não há usuários.
- Se a tabela `User` estiver vazia e `NEXO_DEV_SEED=0` não tiver sido passado na linha de comando, o script roda seed automaticamente em modo piloto.
- Variáveis passadas na linha de comando têm precedência sobre `.env`; portanto `NEXO_DEV_SEED=1 pnpm dev:full` habilita o seed mesmo que o `.env` tenha `NEXO_DEV_SEED=0`.
- `NEXO_DEV_SEED=1 pnpm dev:full` força o seed idempotente, mesmo quando já existem usuários.
- `NEXO_DEV_SEED=0 pnpm dev:full` desabilita explicitamente o seed automático; se o banco estiver vazio, o login não estará disponível.
- O modo padrão do seed Prisma/dev local é `pilot` (`SEED_MODE=pilot`); use `SEED_MODE=basic` apenas quando quiser o usuário básico legado.
- Credenciais locais padrão do seed piloto:
  - Admin: `admin.piloto@nexogestao.local` / `Admin123!`
  - Operação: `operador.piloto@nexogestao.local` / `Piloto@Operador123`
  - Financeiro: `financeiro.piloto@nexogestao.local` / `Piloto@Finance123`
- Credencial do seed básico (`SEED_MODE=basic`): `admin@nexogestao.local` / `123456`.
- O `dev:full` imprime as credenciais piloto/básicas relevantes após seed automático, seed forçado ou quando o banco já está populado, sem alterar dados nesse último caso.
- Essas credenciais são somente para desenvolvimento local/piloto e não devem ser usadas em produção.

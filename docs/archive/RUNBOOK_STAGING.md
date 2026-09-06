
# Runbook do Ambiente de Staging (NexoGestão)

Este documento fornece instruções para operações comuns de manutenção e diagnóstico no ambiente de *staging*.

Todos os comandos devem ser executados a partir do diretório raiz do projeto no servidor de deploy.

## 1. Gerenciamento dos Serviços

O ambiente é gerenciado com `docker-compose` usando o arquivo de configuração de staging.

### Ver Status dos Serviços

Para ver quais contêineres estão rodando e seu status:

```bash
docker-compose -f docker-compose.staging.yml ps
```

### Reiniciar Serviços

Para reiniciar todos os serviços:

```bash
docker-compose -f docker-compose.staging.yml restart
```

Para reiniciar um serviço específico (ex: `api`):

```bash
docker-compose -f docker-compose.staging.yml restart api
```

### Parar Todos os Serviços

Para parar todos os serviços sem remover os contêineres:

```bash
docker-compose -f docker-compose.staging.yml stop
```

### Parar e Remover os Contêineres

Para parar e remover os contêineres (útil para forçar uma recriação completa no próximo deploy):

```bash
docker-compose -f docker-compose.staging.yml down
```

## 2. Visualização de Logs

Logs são essenciais para diagnosticar problemas.

### Ver Logs em Tempo Real

Para ver os logs de todos os serviços em tempo real:

```bash
docker-compose -f docker-compose.staging.yml logs -f
```

Para seguir os logs de um serviço específico (ex: `api`):

```bash
docker-compose -f docker-compose.staging.yml logs -f api
```

Use `Ctrl+C` para parar de seguir os logs.

## 3. Operações de Banco de Dados

As operações de banco de dados, como migrations, são executadas dentro do contêiner da `api`.

### Aplicar Migrations

O ambiente está configurado com `AUTO_MIGRATE=1`, então as migrations são aplicadas automaticamente quando a API inicia. Para aplicar migrations manualmente (por exemplo, após um `git pull` sem reiniciar o serviço):

```bash
docker-compose -f docker-compose.staging.yml exec api pnpm run prisma:migrate:deploy
```

### Verificar Status das Migrations

Para ver o status das migrations e se há alguma pendente:

```bash
docker-compose -f docker-compose.staging.yml exec api pnpm run prisma:migrate:status
```

### Rollback de Migrations

**O Prisma não suporta um comando de "rollback" direto em ambientes de produção (`migrate deploy`).** O processo de rollback deve ser tratado com cuidado:

1.  **Estratégia Recomendada**: Crie uma nova migration que reverta as alterações da migration anterior (ex: `DROP TABLE`, `ALTER COLUMN`, etc.) e faça o deploy dela.
2.  **Emergência**: Restaure um backup do banco de dados para um estado anterior à migration problemática.

### Acessar o Banco de Dados Diretamente

Para se conectar ao psql dentro do contêiner do Postgres:

```bash
docker-compose -f docker-compose.staging.yml exec postgres psql -U <user> -d <db_name>

# Exemplo com valores padrão:
docker-compose -f docker-compose.staging.yml exec postgres psql -U postgres -d nexogestao_staging
```

## 4. Executando Comandos e Scripts

### Abrir um Shell no Contêiner

Para abrir um shell interativo dentro de um contêiner (ex: `api`) para depuração:

```bash
docker-compose -f docker-compose.staging.yml exec api /bin/sh
```

### Executar um Comando Único

Para executar um comando específico dentro de um contêiner:

```bash
# Exemplo: Rodar o seeder de demonstração manualmente
docker-compose -f docker-compose.staging.yml exec api pnpm run prisma:seed
```

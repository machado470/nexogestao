# Guia de Deploy de Produção

Este guia detalha o processo de deploy do NexoGestão em um ambiente de produção, utilizando os scripts e configurações atualizados para garantir um processo robusto e idempotente.

## 1. Pré-requisitos

-   Um servidor Linux (Ubuntu 22.04 LTS recomendado) com acesso `root`/`sudo`.
-   **Docker** e **Docker Compose** instalados.
-   **Git** instalado.
-   Um **domínio** configurado para apontar para o IP do seu servidor (ex: `seudominio.com.br`).
-   Portas `80` e `443` abertas no firewall do servidor.

## 2. Configuração Inicial

1.  **Clonar o Repositório**:

    ```bash
    git clone https://github.com/machado470/NexoGestao.git
    cd NexoGestao
    ```

2.  **Configurar Variáveis de Ambiente**:

    Copie o arquivo de exemplo `.env.prod.example` para `.env.prod` e preencha **TODAS** as variáveis. Este arquivo contém configurações críticas para o ambiente de produção, incluindo credenciais de banco de dados, chaves de API e domínios.

    ```bash
    cp .env.prod.example .env.prod
    nano .env.prod
    ```

    **Variáveis Críticas a Preencher**:
    -   `DOMAIN`: Seu domínio principal (ex: `seudominio.com.br`).
    -   `EMAIL`: E-mail para registro do certificado Let's Encrypt.
    -   `POSTGRES_PASSWORD`: Senha forte para o banco de dados PostgreSQL.
    -   `REDIS_PASSWORD`: Senha forte para o Redis.
    -   `JWT_SECRET`: Uma string aleatória e longa (64+ caracteres) para segurança JWT.
    -   `STRIPE_SECRET_KEY`: Sua chave secreta do Stripe (modo *live*).
    -   `STRIPE_WEBHOOK_SECRET`: O segredo do webhook do Stripe.
    -   `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`: IDs dos planos no Stripe.
    -   `SENTRY_DSN_API`, `VITE_SENTRY_DSN`: DSNs dos projetos Sentry para backend e frontend.
    -   `RESEND_API_KEY`: Chave de API do Resend para envio de e-mails.

## 3. Executando o Deploy de Produção

O deploy é gerenciado por um script idempotente que automatiza a construção das imagens Docker, a configuração SSL e a inicialização dos serviços.

1.  **Executar o Script de Deploy**:

    ```bash
    ./dev/deploy-prod.sh
    ```

    Este script irá:
    -   Validar as dependências (Docker, Docker Compose, curl).
    -   Carregar as variáveis do `.env.prod`.
    -   Gerar ou renovar certificados SSL via Let's Encrypt para `seudominio.com.br`, `app.seudominio.com.br` e `api.seudominio.com.br` (se `DOMAIN` e `EMAIL` estiverem configurados). Caso contrário, gerará um certificado *self-signed* para desenvolvimento.
    -   Construir as imagens Docker e iniciar os contêineres (`api`, `web`, `postgres`, `redis`, `nginx`).
    -   Aguardar o banco de dados e a API ficarem saudáveis.
    -   Aplicar as migrações do Prisma.
    -   Executar um *smoke test* básico para verificar a funcionalidade.

2.  **Verificar os Logs**:

    Monitore os logs para garantir que todos os serviços iniciaram sem erros:

    ```bash
    docker compose -f docker-compose.prod.yml logs -f
    ```

## 4. Configuração de Backup

Um script de backup diário com rotação de 7 dias está disponível e pode ser configurado via cron.

1.  **Instalar o Cron Job de Backup**:

    Como usuário `root`, copie o arquivo de cron para o diretório `/etc/cron.d/`:

    ```bash
    sudo cp /home/ubuntu/NexoGestao/infra/cron/nexogestao-backup.cron /etc/cron.d/nexogestao-backup
    sudo chmod 644 /etc/cron.d/nexogestao-backup
    ```

    O script `run-backup.sh` fará o dump do banco de dados PostgreSQL, compactará e armazenará em `/var/backups/nexogestao/`. Backups com mais de 7 dias serão automaticamente removidos. Se as variáveis `BACKUP_S3_BUCKET` e `BACKUP_S3_REGION` estiverem configuradas no `.env.prod`, o backup também será enviado para o S3.

## 5. Manutenção e Atualizações

-   **Atualizar a Aplicação**: Para aplicar novas atualizações de código, puxe as mudanças do Git e execute o script de deploy novamente. Ele é idempotente e garantirá que a aplicação seja atualizada sem interrupções.

    ```bash
    git pull origin main
    ./dev/deploy-prod.sh
    ```

-   **Smoke Test Manual**: Para verificar a saúde da aplicação a qualquer momento, execute o script de smoke test:

    ```bash
    ./dev/smoke-prod.sh
    ```

    Você pode passar as URLs base da API e do Web, e credenciais de admin, se necessário:

    ```bash
    API_BASE=https://api.seudominio.com.br WEB_BASE=https://app.seudominio.com.br ADMIN_EMAIL=seu-admin@email.com ADMIN_PASSWORD=SuaSenhaForte ./dev/smoke-prod.sh
    ```

## 6. Acesso à Aplicação

Após o deploy bem-sucedido, acesse `https://app.seudominio.com.br` e `https://api.seudominio.com.br` no seu navegador ou via ferramentas de API. A aplicação deve estar online e funcionando.

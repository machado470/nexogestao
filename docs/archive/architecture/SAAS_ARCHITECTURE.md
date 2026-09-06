# Arquitetura SaaS do NexoGestão

Este documento descreve a arquitetura de produção do NexoGestão, projetada para ser uma plataforma SaaS (Software as a Service) robusta, escalável e segura.

## 1. Visão Geral

A arquitetura é baseada em um monorepo gerenciado com `pnpm workspaces`, contendo três componentes principais:

- **`api`**: Backend NestJS (Node.js) responsável pela lógica de negócio, autenticação, acesso ao banco de dados e integrações.
- **`web`**: Frontend React (Vite) que consome a API e fornece a interface do usuário.
- **`infra`**: Configurações de infraestrutura, incluindo Docker, Nginx e scripts de automação.

## 2. Componentes e Tecnologias

| Componente | Tecnologia Principal | Descrição |
| :--- | :--- | :--- |
| **Backend** | NestJS, TypeScript | Framework Node.js para a API, com sistema de módulos, injeção de dependência e arquitetura escalável. |
| **Frontend** | React, TypeScript, Vite | Biblioteca para construção de interfaces de usuário, com build rápido e moderno. |
| **Banco de Dados** | PostgreSQL | Banco de dados relacional para persistência dos dados da aplicação. |
| **Cache** | Redis | Armazenamento em memória para cache de sessões, rate limiting e jobs. |
| **ORM** | Prisma | ORM (Object-Relational Mapper) para interagir com o PostgreSQL de forma segura e tipada. |
| **Containerização** | Docker, Docker Compose | Empacotamento da aplicação e suas dependências em contêineres para consistência entre ambientes. |
| **Reverse Proxy** | Nginx | Servidor web para roteamento de tráfego, terminação SSL/TLS e balanceamento de carga. |
| **Autenticação** | JWT (JSON Web Tokens) | Padrão para criação de tokens de acesso que permitem a autenticação de usuários. |
| **Billing** | Stripe | Gateway de pagamento para gerenciamento de assinaturas, planos e cobranças. |
| **Monitoramento** | Sentry | Plataforma para monitoramento de erros e performance em tempo real (backend e frontend). |
| **Analytics** | Banco de dados interno | Tabela `UsageMetric` para registrar eventos de uso do produto para análise interna. |

## 3. Fluxo de Requisição

1. O **usuário** acessa o domínio `app.nexogestao.com.br`.
2. O **Nginx** recebe a requisição na porta 443 (HTTPS).
3. O Nginx atua como **reverse proxy**:
    - Requisições para `/api/*` são encaminhadas para o contêiner da **API NestJS**.
    - Todas as outras requisições são encaminhadas para o contêiner do **Frontend React**.
4. A **API NestJS** processa a requisição:
    - Valida o token JWT.
    - Interage com o **PostgreSQL** (via Prisma) e **Redis**.
    - Retorna a resposta para o Nginx.
5. O **Nginx** retorna a resposta final para o usuário.

## 4. Estrutura de Diretórios (Simplificada)

```
/home/ubuntu/NexoGestao
├── apps
│   ├── api/            # Backend NestJS
│   └── web/            # Frontend React
├── docs/               # Documentação do projeto
├── infra/
│   ├── cron/           # Configurações de cron jobs
│   └── nginx/          # Configurações do Nginx
├── prisma/             # Schema e migrações do banco de dados
├── scripts/            # Scripts de automação (backup, smoke test)
├── docker-compose.yml
├── docker-compose.prod.yml
└── package.json
```

## 5. Segurança

- **HTTPS**: Todo o tráfego é criptografado com SSL/TLS (certificados via Let's Encrypt).
- **Headers de Segurança**: Nginx configurado com headers como `Strict-Transport-Security`, `X-Frame-Options` e `X-XSS-Protection`.
- **CORS**: Configuração restritiva de Cross-Origin Resource Sharing na API.
- **Rate Limiting**: Proteção contra ataques de força bruta e abuso de API, implementada tanto no Nginx quanto na API NestJS.
- **Variáveis de Ambiente**: Dados sensíveis (chaves de API, senhas) são gerenciados através de variáveis de ambiente e nunca são commitados no código.

## 6. Escalabilidade

- **Horizontal**: A arquitetura baseada em contêineres permite escalar os serviços `api` e `web` horizontalmente, adicionando mais réplicas conforme a necessidade.
- **Vertical**: Os recursos (CPU, memória) dos contêineres e do servidor podem ser aumentados.
- **Banco de Dados**: O PostgreSQL pode ser escalado utilizando réplicas de leitura ou migrando para um serviço gerenciado (ex: Amazon RDS, Google Cloud SQL).

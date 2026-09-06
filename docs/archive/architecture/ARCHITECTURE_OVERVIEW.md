# Visão Geral da Arquitetura - NexoGestão

## 1. Introdução

Este documento fornece uma visão geral da arquitetura de software do sistema NexoGestão. O objetivo é descrever os principais componentes, suas interações e as tecnologias utilizadas, servindo como um guia para desenvolvedores e mantenedores do projeto.

O NexoGestão é projetado como um Software as a Service (SaaS) multi-tenant, focado em gestão de ordens de serviço, finanças e relacionamento com o cliente para pequenas e médias empresas.

## 2. Arquitetura Monorepo

O projeto utiliza uma estrutura de monorepo, gerenciada pelo `pnpm workspaces`. Esta abordagem centraliza todos os pacotes e aplicações do sistema em um único repositório, facilitando o compartilhamento de código, a padronização e a gestão de dependências.

### Estrutura de Diretórios Principal

```
/NexoGestao
├── apps/
│   ├── api/         # Backend (NestJS API)
│   └── web/         # Frontend (React/Vite) e BFF (tRPC)
├── packages/
│   ├── config/      # Configurações compartilhadas (ESLint, TSConfig)
│   └── ui/          # Componentes de UI compartilhados (Storybook)
├── prisma/          # Schema e migrations do banco de dados
└── docs/            # Documentação do projeto
```

## 3. Componentes da Arquitetura

O sistema é composto por três componentes principais que trabalham em conjunto: o **Backend (API)**, o **Backend-for-Frontend (BFF)** e o **Frontend (Web App)**.

![Diagrama de Arquitetura](https://i.imgur.com/example.png)  <!-- Placeholder para um diagrama futuro -->

### 3.1. Backend API (`apps/api`)

O coração do sistema, responsável por toda a lógica de negócio, processamento de dados e segurança.

- **Tecnologia**: **NestJS** (framework Node.js)
- **Linguagem**: **TypeScript**
- **Banco de Dados**: **PostgreSQL**
- **ORM**: **Prisma**
- **Autenticação**: JWT (JSON Web Tokens)

#### Responsabilidades:

- **Gestão de Dados**: Interface com o banco de dados através do Prisma para todas as operações CRUD (Create, Read, Update, Delete).
- **Lógica de Negócio**: Implementação das regras de domínio, como transições de status de faturas, validações de despesas e garantia de multi-tenancy.
- **Segurança**: Proteção de endpoints com guards, validação de permissões (roles) e garantia de isolamento de dados entre organizações (`orgId`).
- **API RESTful**: Exposição de endpoints REST para consumo pelo BFF.
- **Observabilidade**: Geração de logs estruturados, tratamento global de exceções e rastreabilidade de requisições via `requestId`.

### 3.2. Backend-for-Frontend (BFF) (`apps/web/server`)

Atua como uma camada intermediária otimizada para o frontend, simplificando a comunicação com a API principal e agregando dados conforme necessário.

- **Tecnologia**: **tRPC** (framework para APIs com type-safety)
- **Linguagem**: **TypeScript**

#### Responsabilidades:

- **Proxy Inteligente**: Atua como um proxy para a API NestJS, encaminhando requisições e respostas.
- **Type Safety End-to-End**: A principal vantagem do tRPC é fornecer segurança de tipos entre o frontend e o backend. Os tipos definidos nos routers do tRPC são automaticamente inferidos no cliente React, eliminando uma classe inteira de erros de integração.
- **Agregação de Dados**: Pode ser usado para combinar chamadas a múltiplos endpoints da API em uma única resposta para o frontend, otimizando o carregamento de páginas.

### 3.3. Frontend (`apps/web/client`)

A interface com o usuário, construída como uma Single-Page Application (SPA).

- **Tecnologia**: **React** (com Hooks)
- **Build Tool**: **Vite**
- **Linguagem**: **TypeScript**
- **Comunicação com BFF**: **tRPC Client** e **React Query** para data fetching, caching e state management.
- **Estilização**: **Tailwind CSS** e componentes da biblioteca `ui`.

#### Responsabilidades:

- **Interface do Usuário**: Renderização de todas as páginas, componentes e interações visuais.
- **Gestão de Estado**: Utiliza o React Query para gerenciar o estado do servidor (dados vindos da API) e o `useState`/`useContext` para o estado local da UI.
- **Interação com o BFF**: Realiza chamadas aos procedimentos do tRPC para buscar e modificar dados, aproveitando a segurança de tipos para evitar erros.

## 4. Fluxo de Dados e Multi-Tenancy

O **multi-tenancy** é a espinha dorsal do sistema, garantindo que os dados de uma organização (`orgId`) sejam estritamente isolados das outras.

1.  O usuário faz login e recebe um **JWT** contendo seu `userId` e `orgId`.
2.  O **Frontend** envia este token em todas as requisições ao **BFF**.
3.  O **BFF** repassa a requisição (incluindo o token) para a **API NestJS**.
4.  Na API, um `JwtAuthGuard` valida o token e extrai as informações do usuário, incluindo o `orgId`.
5.  **Todos os services da API** utilizam o `orgId` extraído do token para filtrar **todas as queries** ao banco de dados, inserindo a cláusula `where: { orgId: ... }`.

Este mecanismo, auditado e corrigido, previne qualquer possibilidade de um usuário de uma organização acessar dados de outra.

## 5. Testes e Qualidade

- **Testes Unitários e de Integração**: Utiliza-se **Jest** para testar os services e controllers da API. Os testes de integração validam os fluxos de negócio completos em um ambiente controlado (com mock do Prisma).
- **Análise Estática**: **ESLint** e **Prettier** são usados para garantir a consistência e a qualidade do código em todo o monorepo.
- **Type Checking**: O **TypeScript** é configurado em modo `strict` para maximizar a segurança de tipos.
- **Smoke Tests**: Um script de smoke test (`scripts/smoke-e2e.sh`) valida o fluxo end-to-end em um ambiente real ou de staging, garantindo a saúde operacional da aplicação.

# Auditoria completa: landing + auth + navegação

Data da auditoria: **2026-04-08**
Escopo: front-end (`apps/web/client`), BFF web (`apps/web/server`) e auth API (`apps/api/src/auth`).

## Metodologia

- Revisão estática dos fluxos de rota pública/protegida.
- Revisão de implementação de auth (registro, login, OAuth Google, reset).
- Validação de navegação (redirecionamentos e proteções).
- Execução de testes automatizados focados em sessão/segurança no app web.

## 1) Landing page

### Resultado geral

**Parcialmente aprovada**: CTAs principais funcionam, mas há um ponto quebrado no cookie banner.

### Evidências

- CTAs da landing possuem ação válida para navegação (`/login`, `/register`) e âncoras internas (`#fluxo`, `#beneficios`, `#faq`).
- Termos e privacidade na landing disparam modal (`TermsModal`) por ação de botão.
- Banner de consentimento existe, mas tenta postar em endpoint não implementado no BFF.

### Bugs / gaps encontrados

1. **Endpoint de consentimento inexistente**
   - O componente chama `fetch('/api/consent')`, mas não há rota correspondente no servidor web.
   - Impacto: falha silenciosa no registro de consentimento (LGPD), sem persistência no backend.
   - Severidade: **Alta** (compliance e rastreabilidade).

2. **Erro silencioso no consentimento**
   - Falha do `fetch` é apenas logada no console (`console.error`) e a UI fecha normalmente.
   - Impacto: usuário acredita que consentimento foi salvo quando não foi.
   - Severidade: **Média**.

## 2) Auth

### 2.1 Signup (criação user + person)

**Aprovado**

- Registro cria organização + usuário + `person` em transação única.
- Também aplica normalização de e-mail e validações básicas.

### 2.2 Login (cookie + `/me`)

**Aprovado**

- Login via BFF pega token de `/auth/login` e grava cookie de sessão.
- Sessão é validada por `session.me` chamando `/me` com token.
- Logout limpa cookies de sessão conhecidos.

### 2.3 Google login (sem duplicação)

**Aprovado com ressalva operacional**

- Fluxo evita duplicação por e-mail: busca usuário por e-mail e só cria quando não existe.
- Se usuário existir sem `person`, cria vínculo `person`.
- Ressalva: sem testes automatizados dedicados ao fluxo OAuth no repositório (risco de regressão futura).

### 2.4 Reset password

**Aprovado**

- Existem rotas/fluxos para `forgotPassword` e `resetPassword` no BFF e telas dedicadas no front.

## 3) Navegação

### 3.1 Landing → login → painel

**Aprovado (por implementação)**

- Rotas públicas estão definidas (`/`, `/login`, `/register`, etc.).
- Após autenticação, há redirecionamento para `redirectTo` ou `/executive-dashboard`.

### 3.2 Painel → logout → login

**Aprovado**

- Botão “Sair” dispara `logout`, limpa cache/sessão e redireciona para `/login`.
- Há fallback de timeout para evitar travamento no logout.

### 3.3 Acesso direto protegido

**Aprovado**

- `ProtectedRoute` bloqueia acesso sem sessão e redireciona para login com `redirect` seguro.
- Também valida status de onboarding e permissões por rota.

## 4) Problemas detectados (consolidado)

## Bugs encontrados

- [Alta] `ConsentBanner` envia para `/api/consent` sem rota implementada.
- [Média] Falha de consentimento é silenciosa para o usuário final.

## Pontos quebrados

- Persistência de consentimento LGPD no backend web está quebrada.

## Riscos de UX/robustez

- Possível percepção de sucesso falso no consent banner.
- Ausência de teste automatizado específico para OAuth callback + anti-duplicação.

## 5) Melhorias recomendadas

1. **Implementar endpoint `/api/consent` no BFF**
   - Persistir preferências por usuário/sessão/IP (conforme política).
   - Retornar status explícito para a UI.

2. **Feedback explícito no banner de consentimento**
   - Exibir toast/erro quando gravação falhar.
   - Não fechar banner automaticamente em falha de persistência (ou deixar claro modo offline).

3. **Adicionar testes de integração de auth**
   - Casos mínimos:
     - register cria `user` + `person`.
     - login cria cookie e `session.me` resolve dados.
     - OAuth Google não duplica usuário por e-mail.
     - reset password com token válido/inválido.

4. **Checklist de regressão de navegação**
   - Verificação automática de rotas públicas/protegidas e redirecionamentos esperados.

## Evidências de testes executados

- `pnpm --filter ./apps/web exec vitest run server/auth.logout.test.ts server/security.test.ts`
  - Resultado: **18 testes passando**.

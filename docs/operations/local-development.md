---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Desenvolvimento local

## Preparação

Requer Node.js 20+, PNPM 10.30.3 e Docker Compose. Na raiz do repositório:

```bash
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` executa `scripts/dev-full.sh`, que prepara o workspace e coordena os serviços locais. Use `pnpm dev:reset` quando for necessário reiniciar o estado gerenciado pelo script.

## Operação

```bash
pnpm dev:infra
pnpm dev:doctor
pnpm dev:ports
pnpm dev:health
pnpm dev:logs
```

Para iniciar camadas separadamente, use `pnpm dev:api`, `pnpm dev:web` ou os scripts específicos declarados no `package.json`.

## Qualidade

```bash
pnpm prisma:check
pnpm -r typecheck
pnpm lint
pnpm test
pnpm build
```

Variáveis e segredos locais devem partir de `.env.example`; arquivos `.env` reais não devem ser versionados.

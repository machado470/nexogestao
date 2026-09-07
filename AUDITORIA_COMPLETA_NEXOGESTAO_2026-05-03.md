# Auditoria Completa NexoGestão — 2026-05-03

## 1. Resumo executivo
**Classificação:** **instável**.

O repositório instala dependências sem erro de lockfile (confirmado), porém o sistema não fecha ciclo de build/execução por falhas críticas no pacote API (módulos ausentes em TypeScript) e por indisponibilidade de Docker no ambiente para `pnpm dev:full`. Sem stack de runtime (Postgres/Redis/API) ativa, os fluxos E2E completos ficam majoritariamente não validados.

## 2. Resultado dos comandos
| Comando | Status | Evidência resumida |
|---|---|---|
| `pnpm install` | ✅ OK | Lockfile atualizado, sem `ERR_PNPM_OUTDATED_LOCKFILE` |
| `pnpm -s build` | ❌ Falhou | `TS2307` para `@opentelemetry/*` e `@bull-board/*` em `apps/api/src/...` |
| `pnpm -s typecheck` | ❌ Falhou | Script inexistente na raiz (`Command "typecheck" not found`) |
| `pnpm typecheck` | ❌ Falhou | Mesmo erro (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`) |
| `pnpm -s lint` | ✅ OK | Lint executado no web sem inconsistências |
| `pnpm test` | ❌ Falhou | `turbo` sem task `test` definida |
| `pnpm --filter @nexogestao/api prisma validate` | ❌ Falhou | `P1012` por `DATABASE_URL` ausente |
| `pnpm --filter @nexogestao/api prisma generate` | ✅ OK | Prisma Client gerado |
| `pnpm dev:full` | ❌ Falhou | Script aborta: Docker indisponível |
| `curl http://127.0.0.1:3000/health` | ❌ Falhou | conexão recusada (API não subiu) |

## 3. Problemas críticos P0

### P0-001
- **Prioridade:** P0
- **Área:** Build/API NestJS
- **Arquivo(s):** `apps/api/src/common/middleware/request-logger.middleware.ts`, `apps/api/src/queue/queue-board.module.ts`, `apps/api/src/tracing.ts`
- **Sintoma:** `pnpm -s build` falha com `TS2307` para módulos `@opentelemetry/*` e `@bull-board/*`.
- **Causa provável:** dependências não resolvidas no workspace/API (referenciadas no código e ausentes na árvore efetiva de pacotes).
- **Impacto:** API não compila; bloqueia boot integrado e validações funcionais.
- **Como reproduzir:** `pnpm -s build`.
- **Correção recomendada:** alinhar `apps/api/package.json` + lockfile com imports reais; validar resolução no `tsconfig` e reinstalar workspace.
- **Risco se ignorar:** bloqueio contínuo do pipeline e de qualquer deploy.

### P0-002
- **Prioridade:** P0
- **Área:** Infra/Boot local
- **Arquivo(s):** `scripts/dev-full.sh`
- **Sintoma:** `pnpm dev:full` aborta com erro explícito de Docker indisponível.
- **Causa provável:** dependência obrigatória de Docker Desktop/engine para Postgres/Redis não atendida no ambiente atual.
- **Impacto:** sem stack backend real, sem validar login, sessão, `/me` e fluxo operacional ponta a ponta.
- **Como reproduzir:** `pnpm dev:full`.
- **Correção recomendada:** garantir Docker operacional (engine + integração WSL quando aplicável) e rerodar bootstrap.
- **Risco se ignorar:** ambiente de desenvolvimento não reproduz produção/staging.

### P0-003
- **Prioridade:** P0
- **Área:** Prisma/Configuração
- **Arquivo(s):** `prisma/schema.prisma`
- **Sintoma:** `prisma validate` falha com `P1012` (`DATABASE_URL` ausente).
- **Causa provável:** variáveis de ambiente obrigatórias não carregadas no contexto do comando isolado.
- **Impacto:** validação de schema e parte da cadeia de migration/seed ficam bloqueadas.
- **Como reproduzir:** `pnpm --filter @nexogestao/api prisma validate`.
- **Correção recomendada:** padronizar carregamento de `.env` no CLI Prisma (script wrapper/env loader) e documentar pré-requisitos.
- **Risco se ignorar:** quebras intermitentes em CI/CD e onboarding.

## 4. Problemas P1

### P1-001
- **Área:** Qualidade/Automação
- **Arquivo(s):** `package.json` (raiz/turbo)
- **Sintoma:** `pnpm test` falha: task `test` inexistente no turbo.
- **Impacto:** sem suíte única de regressão automatizada do monorepo.

### P1-002
- **Área:** Governança técnica
- **Arquivo(s):** múltiplos serviços/controladores API
- **Sintoma:** uso extensivo de `any` em pontos sensíveis (`@Req() req: any`, filtros dinâmicos etc.).
- **Impacto:** redução de segurança de tipos, maior risco de regressão silenciosa.

## 5. Problemas P2
- Dependência de provider mock no ecossistema WhatsApp/seeds (`provider default/mock-provider`) sem trilha explícita de hardening para ambiente real.
- Warning de `pnpm` sobre build scripts ignorados (`xxhash`) potencialmente divergindo runtime esperado.
- Ausência de evidência operacional nesta execução para validar UX dinâmica (tema, modais, dropdowns, toasts, overlays) por falta de boot completo.

## 6. Problemas P3
- Dívida técnica de comentários/blocos desativados em fila (`queue.service.ts`), com indício de caminhos parcialmente implementados.
- Superfície ampla de testes com mocks locais em vez de integração real em vários domínios.

## 7. Gaps por módulo
- **Infra:** bloqueado por Docker indisponível no ambiente atual.
- **Backend:** build quebrando por imports não resolvidos.
- **Prisma:** `generate` OK; `validate` bloqueado por env.
- **BFF/tRPC:** não validado em runtime (sem stack ativa).
- **Frontend:** build do web OK; validação funcional dinâmica não concluída sem backend.
- **Dashboard/Clientes/Agendamentos/O.S./Financeiro/WhatsApp/Timeline/Governança/Calendário/Pessoas/Perfil/Configurações/Planos-Billing:** **não validados em execução completa** nesta rodada por bloqueios P0.

## 8. Inconsistências frontend/backend
**Status:** validação parcial (estática). Sem runtime completo, não foi possível fechar matriz total de contratos reais em tráfego.

Achados iniciais:
- risco de divergência de contratos por uso excessivo de `any` no backend;
- ausência de verificação live de payloads e enums entre frontend e API.

## 9. Fluxos E2E
| Fluxo | Status | Motivo | Evidência | Próxima ação |
|---|---|---|---|---|
| Login → sessão → `/me` | não validado | API indisponível | `dev:full` falhou / health down | subir Docker + API e retestar |
| Criar cliente | não validado | idem | idem | retestar com stack ativa |
| Cliente → agendamento | não validado | idem | idem | retestar |
| Agendamento → O.S. | não validado | idem | idem | retestar |
| O.S. → conclusão | não validado | idem | idem | retestar |
| O.S. concluída → cobrança | não validado | idem | idem | retestar |
| Cobrança → pagamento | não validado | idem | idem | retestar |
| Pagamento → timeline | não validado | idem | idem | retestar |
| Cobrança vencida → risco | não validado | idem | idem | retestar |
| Risco → governança | não validado | idem | idem | retestar |
| WhatsApp por `customerId` | não validado | idem | idem | retestar |
| WhatsApp por `chargeId` | não validado | idem | idem | retestar |
| WhatsApp por `appointmentId` | não validado | idem | idem | retestar |
| WhatsApp por `serviceOrderId` | não validado | idem | idem | retestar |
| Cliente sem telefone | não validado | idem | idem | retestar |
| Cliente sem conversa | não validado | idem | idem | retestar |
| Filtros/busca/paginação | parcial | análise estática apenas | código existe, sem runtime | validar via UI/API |
| Tema claro/escuro | não validado | sem frontend conectado ao backend em fluxo real | build apenas | validar visualmente |
| Modais/dropdowns/toasts/overlays | não validado | sem sessão funcional | build apenas | validar manual/E2E |
| Refresh/logout | não validado | sem login funcional | API down | retestar |

## 10. Problemas visuais e UX
**Não validado em execução real** nesta rodada por indisponibilidade de stack completa. Requer inspeção manual com ambiente ativo e roteiro de telas.

## 11. Mocks, legado e código morto
- Seeds com uso de provider mock e cenários simulados de falha (`prisma/seed-pilot.ts`, migration WhatsApp com default `mock`).
- Testes de integração com alta presença de mocks de Prisma/serviços, reduzindo confiança E2E real.
- Trechos comentados/inativos em `apps/api/src/queue/queue.service.ts` sugerem legado parcial.

## 12. Plano de correção recomendado
- **Fase 1 — destravar boot/build:** corrigir dependências faltantes API (`@opentelemetry/*`, `@bull-board/*`), estabilizar `dev:full` com Docker.
- **Fase 2 — contratos frontend/backend:** remover `any` crítico, introduzir DTO/contracts tipados ponta a ponta.
- **Fase 3 — fluxo operacional principal:** executar roteiro Cliente→Governança em ambiente com DB limpo + seed controlada.
- **Fase 4 — WhatsApp/Financeiro/Timeline/Risco/Governança:** validar IDs relacionais, estados e side-effects de timeline.
- **Fase 5 — UI/UX e design system:** auditoria visual dedicada (tema, overlays, consistência de ações).
- **Fase 6 — hardening e testes:** padronizar `test` no turbo, aumentar integração real (menos mock), gates de CI para build/type/lint/test/prisma.

## 13. Checklist final
- Instalação/lockfile: **auditado + validado**
- Build monorepo: **auditado + bloqueado (P0)**
- Lint: **auditado + validado**
- Typecheck raiz: **auditado + bloqueado (script inexistente)**
- Testes: **auditado + bloqueado (task ausente)**
- Prisma validate: **auditado + bloqueado (env)**
- Prisma generate: **auditado + validado**
- Boot full stack: **auditado + bloqueado (Docker)**
- Healthcheck API: **auditado + bloqueado**
- Fluxos E2E de negócio: **auditado + não validado por bloqueio de ambiente**

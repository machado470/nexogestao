# Validação manual guiada WhatsApp — 2026-04-28

## Escopo solicitado
Validação manual no navegador dos cenários de `/whatsapp` com seed piloto, incluindo evidências de Console/Network, payloads de envio e criação de conversa.

## Execução realizada neste ambiente

### 1) Tentativa de subir infraestrutura local
Comando executado:

```bash
pnpm dev:infra
```

Resultado:
- Falhou porque o binário `docker` não existe no ambiente de execução.
- Sem Postgres/Redis local não foi possível subir API/Web com dados seed para validação interativa no navegador.

Erro:

```text
sh: 1: docker: not found
```

### 2) Verificação de build (sanidade de compilação)
Comando executado:

```bash
pnpm -s build
```

Resultado:
- Build finalizado com sucesso para `@nexogestao/web`, `@nexogestao/api` e `@nexogestao/common`.
- Confirma apenas integridade de compilação; não substitui validação manual em browser.

## Status dos cenários funcionais solicitados

> **Todos os cenários ficaram bloqueados neste ambiente** por indisponibilidade de Docker (infra) e ausência de sessão real de navegador conectada ao app rodando com seed.

- [ ] 1. `/whatsapp`
- [ ] 2. `/whatsapp?customerId=<com telefone e sem conversa>`
- [ ] 3. `/whatsapp?customerId=<sem telefone>`
- [ ] 4. `/whatsapp?customerId=<id>&chargeId=<chargeId>`
- [ ] 5. `/whatsapp?customerId=<id>&appointmentId=<appointmentId>`
- [ ] 6. `/whatsapp?customerId=<id>&serviceOrderId=<serviceOrderId>`
- [ ] 7. Conversa existente
- [ ] 8. Filtros/busca

## Evidências coletadas

- Print de tela: **não coletado** (sem app em execução navegável).
- Console errors: **não coletado** (sem sessão de browser).
- Network != 2xx: **não coletado** (sem sessão de browser).
- Payload `sendMessage/sendTemplate`: **não coletado** (sem fluxo interativo).
- Resposta API de criação de conversa: **não coletado** (sem execução dos fluxos no browser).

## Próxima ação recomendada para concluir a validação solicitada

Em um ambiente com Docker + navegador:

1. `pnpm dev:infra`
2. `NEXO_DEV_SEED=1 pnpm dev:full` (ou fluxo equivalente garantindo seed piloto)
3. Login com `admin.piloto@nexogestao.local`
4. Executar os 8 cenários com captura de:
   - Screenshot de cada cenário principal.
   - Console errors/warnings.
   - Requests de Network (especialmente não-2xx).
   - Payloads de `sendMessage`/`sendTemplate`.
   - Resposta da API ao criar conversa real.


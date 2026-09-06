# Timeline como prova oficial da operação

A Timeline é o **Centro de Evidências Operacionais** do NexoGestão. Ela apresenta fatos persistidos pela API; não é feed social, motor de risco ou substituto do `AuditEvent` técnico.

## Autoridade do contrato de leitura

O `TimelineService` aplica o tenant recebido do `@Org()` autenticado. O presenter da API cria o contrato público e é a única camada autorizada a:

- normalizar aliases históricos para `eventType` canônico;
- expor o vínculo de entidade persistido e seu alvo de navegação;
- selecionar metadata primitiva explicitamente permitida;
- encaminhar módulo, severidade, título, consequência e recomendação apenas quando esses valores foram oficialmente produzidos.

O contrato público não expõe `orgId`, IDs de autenticação, `requestId`, payloads aninhados ou segredos. O BFF autentica, valida `limit`, `action` e `cursor`, e encaminha a resposta sem reconstruir decisões.

## Limite do frontend

O navegador formata o instante, traduz tipos canônicos conhecidos e filtra valores oficiais do recorte carregado. Ele não examina `action`, descrição ou metadata para deduzir módulo, severidade, risco, consequência ou recomendação; não normaliza aliases; não usa relógio local para declarar estado operacional; e não envia `orgId` ou `role`.

Eventos desconhecidos aparecem como **Evento não classificado**. Campos ausentes aparecem como **Não informado**, **Não classificado** ou **Não disponível**. Ausência de eventos nunca significa estado saudável.

## Navegação e indisponibilidade

CTAs só são exibidos quando a API fornece entidade persistida com `id` e `href`. Eles apenas navegam e não executam automações. Falha da Timeline mantém a identidade autenticada visível, apresenta indisponibilidade parcial e oferece retry.

## Metadata segura

A API usa allowlist de chaves escalares. A metadata é secundária, recolhida em detalhe técnico, e nunca participa de classificação no cliente.

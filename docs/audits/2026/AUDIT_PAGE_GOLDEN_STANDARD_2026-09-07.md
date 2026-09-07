# Auditoria da página Auditoria — golden standard (2026-09-07)

## Baseline e diagnóstico

- Baseline real deste clone: `508ba415`, merge que contém a auditoria transversal equivalente em `5c4c597f chore(web): audit golden standard frontend`. O hash informado `750e231d` não existe neste clone; `e04862b4` existe e é o merge imediatamente anterior.
- A implementação anterior de `/audit` usava diretamente `Card`, `Table`, `Dialog`, `Input`, `Empty` e skeleton manual. Também criava um recorte local de “últimas 24h” com `Date.now`, mostrava rankings de ação/ator e despejava `metadata` como JSON bruto.

## Fonte e contrato preservados

- A rota real é `/audit`, carregada por `AuditRoute`, restrita no cliente a `ADMIN`.
- A lista usa `trpc.audit.listEvents` → BFF `GET /audit/events` → API `GET /v1/audit/events`. O input Zod admite `page`, `limit`, `entityType`, `entityId`, `action`, `actorPersonId`, `from` e `to`; a tela mantém apenas período, ação e ator, que já eram filtros legítimos.
- A listagem retorna `data` e paginação oficial `{ page, limit, total, pages }`. A API isola pelo `orgId` obtido de `@Org()`, ordena por `createdAt desc` e limita a página; o frontend não envia `orgId`, não reordena e não fabrica total.
- O resumo usa `trpc.audit.getSummary` → `GET /audit/summary` e fornece `total`, `byAction` e `byActor`. A tela usa somente o total factual do recorte e não transforma agregados em ranking ou decisão.
- Campos disponíveis na listagem: IDs do evento/organização/ator/entidade, nome do ator, ação, tipo da entidade, contexto, timestamp e metadata. Não existe origem dedicada no DTO atual.
- A API possui `GET /audit/events/:eventId`, mas o BFF não oferece query de detalhe. Por isso o detalhe continua usando exclusivamente o registro oficial já carregado, sem ampliar contrato.

## Composição e responsabilidade

- A página agora usa `AppPageShell`, `AppOperationalHeader`, `AppContextChip`, `AppFiltersBar`, `AppField`, `AppInput`, `AppFormActions`, `AppSectionBlock`, `AppDataTable`, `AppPagination`, `AppLoadingState`, `AppEmptyState`, `AppAlert` e `BaseModal`.
- O conteúdo é uma tabela densa de investigação, não feed nem coleção de cards. A tabela preserva a ordem da API e mantém a ação “Examinar” acessível por teclado.
- Auditoria não foi fundida à Timeline: Timeline continua sendo histórico operacional contextual; Auditoria continua na fonte administrativa própria, com IDs e evidência de rastreabilidade.

## Evidência e segurança

- Autenticação, role `ADMIN`, guards `JwtAuthGuard`/`RolesGuard` e tenant de `@Org()` permanecem intactos. Nenhum `orgId` arbitrário, autorização de backend ou destino de entidade foi adicionado.
- O modal apresenta os campos oficiais do registro e apenas pares primitivos de metadata. Chaves com aparência de token, secret, senha, credencial, authorization, cookie ou API key são omitidas; objetos técnicos aninhados deixam de ser despejados como JSON. O payload integral não é exposto porque o contrato não classifica sua sensibilidade.

## Estados, acessibilidade e responsividade

- Loading, erro, vazio absoluto e vazio por filtro são distintos. Retry refaz lista e resumo sem limpar o recorte; falha de resumo não é convertida em lista vazia.
- Os filtros possuem `label`, `htmlFor` e `id`; a tabela usa `thead`, `tbody`, `th scope=col`; botões têm nomes; o modal canônico gerencia foco, retorno de foco e Escape.
- Os filtros empilham e passam a duas/quatro colunas conforme viewport. A tabela tem overflow canônico e largura mínima, IDs quebram, a ação continua alcançável e o modal limita altura e rola em viewport estreita.
- Superfícies, bordas, texto, backdrop e modal usam tokens do sistema; não foi criado tratamento light/dark específico da página.

## Limitações e conceitos não fabricados

- O contrato não fornece origem dedicada, labels humanas para todas as ações, links oficiais de entidade nem schema discriminado para metadata; esses elementos não foram inventados.
- Não foram criados severity, prioridade, score, risco, health, recomendação, próxima ação ou ordenação local. O ranking e o recorte calculado de 24 horas da implementação anterior foram removidos.

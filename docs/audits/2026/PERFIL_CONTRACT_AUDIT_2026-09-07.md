# Auditoria contratual da página Perfil — 2026-09-07

## Escopo e implementação anterior

A página `/profile` combinava a identidade da sessão com o resumo completo da equipe e apresentava fila, listas de O.S. e agendamentos, timeline, performance e atribuição financeira. Também convertia `recommendedActionTarget` em rotas no cliente. A migração reduz a tela à identidade individual e ao contexto operacional curto que as fontes atuais conseguem sustentar, sem duplicar Pessoas, Timeline ou Dashboard.

## Fontes e contratos reais

### Identidade factual

- Query tRPC: `auth.me` (sem input), protegida pela sessão do BFF.
- Endpoint API: `GET /me`, protegido por `JwtAuthGuard`.
- Origem: usuário autenticado, vínculo opcional com `Person` e organização obtida do `orgId` do token. O endpoint rejeita divergência entre a organização do usuário persistido e a organização da sessão.
- Campos usados pelo Perfil: nome da pessoa quando disponível, e-mail, role, estado ativo, `personId` e nome da organização.
- O BFF normaliza o envelope de `/me`; não há schema Zod de output nem DTO específico de Perfil.

O payload de `/me` também contém blocos genéricos `operational`, `pending`, `assignments`, `redirect` e onboarding. Eles não são usados pelo Perfil. Em particular, o bloco `operational` atualmente é estático no endpoint e, portanto, não é tratado como estado operacional individual.

### Informação e decisão operacional oficiais

- Query tRPC: `people.operationalSummary` (sem input).
- Endpoint API: `GET /people/operational-summary`, tenant-scoped pelo `orgId` extraído da autenticação e atualmente autorizado apenas para `ADMIN`.
- Schema Zod no BFF: `peopleOperationalSummarySchema` e schemas aninhados em `apps/web/server/routers/people.ts`.
- A associação ao usuário corrente é factual: o `personId` retornado por `/me` localiza o item de mesmo `personId` no array oficial.
- Campos apresentados: status, estado operacional, prioridade, disponibilidade, estado de carga, contadores oficiais de O.S./agenda, textos de resumo/risco, última atividade, recomendação, motivo, destino, capacidades diárias, percentuais de uso, estado e observação de carga.

A página não recalcula esses valores, não reclassifica prioridade/risco e não converte o destino recomendado em CTA ou rota. Quando a recomendação está ausente, a interface declara a ausência em vez de inferir que a operação está saudável. Como o endpoint de People é restrito a `ADMIN`, uma falha ou negação nessa fonte degrada somente o contexto operacional; a identidade continua disponível.

## Edição e persistência

Não existe query, mutation, endpoint ou DTO específico para editar o perfil autenticado. A mutation `people.update` e o endpoint `PATCH /people/:id` são administrativos, aceitam um ID e pertencem à gestão de Pessoas. Eles não foram reutilizados no Perfil. Nome, e-mail, role e organização permanecem somente leitura; não há seletor de role, payload de `orgId`, persistência em storage do navegador nem edição local falsa.

## Classificação dos dados auditados

- **A — identidade factual:** conta, pessoa vinculada, e-mail, role, estado ativo e organização de `/me`.
- **B — informação operacional oficial:** status, disponibilidade, carga, capacidade, atividade e contadores do resumo de People.
- **C — configuração pessoal persistida:** nenhuma encontrada.
- **D — estado de interface:** loading, fetching, erro e ação de atualizar as duas queries.
- **E — decisão operacional oficial:** prioridade, estado, recomendação, motivo, destino e texto de risco retornados por People.
- **F — inferência client-side removida:** fallback textual de decisão, mapeamento de destino para rota e destaque do primeiro evento da timeline.
- **G — não suportado na composição final:** edição de conta, senha/foto, permissões editáveis, preferências pessoais, “Minhas O.S.”, lista de agendamentos, timeline individual navegável, performance e impacto financeiro no Perfil.

Embora o resumo administrativo de People contenha listas e métricas adicionais, elas não compõem um endpoint próprio de Perfil e foram omitidas para evitar que esta tela replique Pessoas, Timeline, Dashboard ou Financeiro. Nenhuma seção vazia foi criada para esses conceitos.

## Composição resultante

1. header com identidade factual e chips oficiais;
2. identidade somente leitura, com estados próprios de loading, erro e resposta vazia;
3. contexto operacional oficial curto, com indisponibilidade independente;
4. capacidade profissional somente quando o item individual é retornado.

São reutilizados `AppPageShell`, `AppOperationalHeader`, `AppSectionBlock`, `AppStatusBadge`, `AppAlert`, `AppField`, `AppFieldGroup`, `AppInput` e os estados canônicos de página. Os layouts usam wrapping, grids progressivos, `min-w-0` e quebra de palavras para preservar leitura em viewports estreitas.

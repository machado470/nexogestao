# Análise de Falhas - NexoGestão SaaS

## Estado Atual

O front-end foi consolidado para usar `AuthContext` como fonte única de autenticação.
O hook legado `client/src/_core/hooks/useAuth.ts` foi removido.
As rotas principais do app estão protegidas em `client/src/App.tsx`.

## Falhas Identificadas

### 1. **Router `auth.ts` vazio e desnecessário**
- **Arquivo**: `server/routers/auth.ts`
- **Problema**: Arquivo existia sem procedimentos e sem uso real
- **Impacto**: Poluição arquitetural e confusão sobre a fonte real da autenticação
- **Ação recomendada**: Remover o arquivo se não houver referências restantes

### 2. **Camada `lib/api.ts` ainda coexistindo com hooks tRPC**
- **Arquivo**: `client/src/lib/api.ts`
- **Problema**: Parte do front usa `trpc.*` diretamente e parte ainda usa `api.ts`
- **Impacto**: Duplica padrões de acesso a dados e pode dificultar invalidação de cache, manutenção e padronização
- **Ação recomendada**: Manter como compatibilidade temporária ou migrar gradualmente para hooks tRPC consistentes

### 3. **`WhatsAppPage.tsx` ainda usa estado derivado sensível**
- **Arquivo**: `client/src/pages/WhatsAppPage.tsx`
- **Problema**: A tela foi melhorada, mas continua dependente de estrutura manual de conversas e mensagens
- **Impacto**: Pode exigir nova refatoração para evitar complexidade crescente
- **Ação recomendada**: Evoluir para modelo com dados normalizados ou hooks dedicados

### 4. **Arquivo morto removido: `useNexoGestao.ts`**
- **Arquivo**: `client/src/hooks/useNexoGestao.ts`
- **Problema anterior**: Chamava funções inexistentes como `api.getAdminOverview()`
- **Impacto anterior**: Código morto e quebrado aumentava ruído técnico
- **Ação aplicada**: Arquivo removido

### 5. **`Home.tsx` parece tela legado**
- **Arquivo**: `client/src/pages/Home.tsx`
- **Problema**: Estrutura, navegação e conteúdo parecem representar uma fase anterior do projeto
- **Impacto**: Pode confundir o fluxo principal do produto e duplicar comportamentos já cobertos por outras telas
- **Ação recomendada**: Avaliar se a tela ainda deve existir ou ser consolidada com o dashboard principal

### 6. **`app_session_id` aparenta ser legado**
- **Arquivo**: `shared/const.ts` e `server/routers.ts`
- **Problema**: O cookie principal atual da autenticação web é `nexo_token`, enquanto `app_session_id` parece resquício antigo ainda limpo no logout
- **Impacto**: Ambiguidade sobre o mecanismo oficial de sessão
- **Ação recomendada**: Confirmar se ainda existe uso real; remover se for apenas compatibilidade obsoleta

### 7. **Procedimentos privados no proxy ainda usam `publicProcedure`**
- **Arquivo**: `server/routers/nexo-proxy.ts`
- **Problema**: Muitas rotas autenticadas ainda são declaradas como públicas e dependem da API downstream para rejeitar acesso
- **Impacto**: Semântica fraca no BFF e menor clareza de segurança
- **Ação recomendada**: Migrar progressivamente rotas privadas para `protectedProcedure`

### 8. **Documento de falhas precisava atualização**
- **Arquivo**: `apps/web/FALHAS_ENCONTRADAS.md`
- **Problema anterior**: Referências ao hook antigo, auth router e ausência de proteção de rotas estavam desatualizadas
- **Impacto anterior**: Diagnóstico incorreto e risco de decisões erradas
- **Ação aplicada**: Atualizar o documento para refletir o estado atual

## Prioridade Atual de Correção

1. **ALTA**: Revisar `nexo-proxy.ts` e trocar rotas autenticadas para `protectedProcedure`
2. **ALTA**: Definir o destino de `lib/api.ts` como compat layer ou migrar gradualmente para hooks tRPC
3. **MÉDIA**: Revisar `WhatsAppPage.tsx` para futura simplificação estrutural
4. **MÉDIA**: Decidir se `Home.tsx` permanece no produto
5. **MÉDIA**: Confirmar se `app_session_id` ainda tem uso real
6. **BAIXA**: Limpeza adicional de documentação e arquivos residuais

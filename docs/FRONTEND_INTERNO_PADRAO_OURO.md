---
status: current
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Padrão-ouro do frontend interno

O Executive Dashboard ratifica a fórmula visual das páginas operacionais. Este
guia orienta as próximas migrações; ele não autoriza refatorações globais nem a
criação de uma nova família de componentes.

## Fórmula Nexo

```text
AppPageShell
└─ AppOperationalHeader (estado e contexto atuais)
   └─ camada de decisão (atenção → próxima melhor ação)
      └─ indicadores de apoio
         └─ fluxo e lista operacional
            └─ pulso, evidência e governança
               └─ navegação contextual secundária
```

1. **Decisão antes de medição.** Atenção tem o maior peso espacial e precede a
   próxima melhor ação; ambas precedem KPIs. KPI contextualiza, mas não decide.
2. **Execução antes de exploração.** Fluxo mantém a sequência oficial e a fila
   mantém a ordenação recebida. Evidência, governança e atalhos vêm depois.
3. **Conceitos não se misturam.** Pulso interpreta tendência; evidência prova
   fatos; governança explica estado/decisão oficial; timeline registra histórico.

## Anatomia e densidade

- Usar `AppPageShell`, `AppOperationalHeader` e `AppSectionBlock`. Nas áreas de
  decisão e contexto, preferir os componentes Nexo já existentes
  (`NexoPriorityPanel`, `NexoExecutiveMetric`, `NexoOperationalPipeline`,
  `NexoEvidenceTimeline` e `NexoGovernanceDecisionCard`).
- Adotar o `compact` de `AppSectionBlock` no cockpit: espaçamento vertical curto
  e consistente, padding responsivo e `rounded-xl` já definidos pelas fachadas.
  Não repetir radius, sombra ou cor arbitrários na página.
- Tratar uma coleção de KPIs como uma superfície contínua com divisões discretas.
  Valores podem quebrar linha sem comprimir label, contexto ou CTA.
- O CTA primário permanece visível no painel/linha que executa a decisão. Ações
  secundárias podem ser links ou row actions, mas não podem esconder o próximo
  passo principal em dropdown.
- Usar `AppStatusBadge` somente para estado, severidade ou status canônico. Não
  usar badge como decoração, filtro ou substituto de texto explicativo.

## Estados e autoridade

- Backend/BFF são a autoridade de risco, prioridade, severidade, estado, atraso,
  ranking, gargalo, recomendação, próxima ação, ordem e destino. O frontend só
  formata e navega; é proibido criar score ou motor de decisão client-side.
- `0` retornado é valor legítimo. Ausência, erro e loading nunca viram zero.
- Loading, erro e vazio pertencem à menor seção afetada, usando
  `AppPageLoadingState`, `AppPageErrorState` e `AppPageEmptyState`. Falha parcial
  mantém todas as fontes válidas visíveis, identifica a fonte indisponível e
  oferece retry sem fabricar estado saudável. Estado de página inteira é apenas
  para loading/erro de todas as fontes essenciais.

## Responsividade e acessibilidade

- Começar em 360 px com uma coluna e `min-w-0`; empilhar atenção antes de NBA.
  Em tablet, preservar essa ordem. Só dividir decisão e pipeline quando houver
  largura útil, considerando sidebar expandida ou recolhida.
- CTAs devem caber na viewport, textos longos devem quebrar ou truncar apenas
  quando o detalhe continuar disponível, e regiões densas podem rolar
  verticalmente sem introduzir overflow horizontal na página.
- Usar `Button` e primitives atuais para foco e teclado. Botões só com ícone
  exigem `aria-label`; headings seguem a hierarquia da página; contraste usa
  exclusivamente tokens semânticos existentes.

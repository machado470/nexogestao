# Relatório de Gaps: Backend vs. Frontend (NexoGestão)

**Data da Análise:** 04/03/2026  
**Autor:** Manus AI  
**Status:** Análise de Integração Concluída

---

## 1. Visão Geral
Esta análise comparou a estrutura de roteamento e chamadas de API do **Frontend (Web)** com os controladores e serviços disponíveis no **Backend (API)**. O objetivo foi identificar funcionalidades que o frontend tenta consumir mas que não estão implementadas ou expostas corretamente no backend.

---

## 2. Gaps Críticos de Funcionalidade
A tabela abaixo resume os principais endpoints e funcionalidades que estão presentes no frontend (via tRPC proxy ou chamadas diretas) mas que faltam no backend.

| Área | Funcionalidade no Frontend | Status no Backend | Impacto |
| :--- | :--- | :--- | :--- |
| **Financeiro Avançado** | Processamento Stripe, Planos de Pagamento, Fluxo de Caixa, NF-e | **Não Implementado** | Bloqueia monetização e gestão financeira real. |
| **Inteligência Artificial** | Chat com IA, Geração de Relatórios, Sugestão de Ações | **Falta Controller/Service** | O frontend tem a lógica de prompt, mas não há ponte no backend. |
| **Gestão de Pessoas** | CRUD completo de colaboradores (Pessoas) | **Incompleto** | O backend tem `PeopleController`, mas faltam endpoints de deleção e estatísticas. |
| **Dashboard** | KPIs consolidados (Receita, Agendamentos, Clientes) | **Divergente** | O frontend usa lógica local no tRPC; o backend tem `AdminOverview` com dados diferentes. |
| **Notificações** | Histórico de mensagens WhatsApp e E-mail | **Incompleto** | O backend tem o serviço de WhatsApp, mas não expõe histórico para o frontend. |

---

## 3. Detalhamento Técnico por Módulo

### 3.1 Módulo Financeiro (`finance-advanced.ts`)
O frontend possui um router dedicado para operações complexas que não encontram correspondência no `FinanceController` do NestJS:
- **Stripe Integration:** Faltam webhooks e endpoints de criação de sessão de checkout.
- **Invoices (NF-e):** O frontend espera gerar e listar notas fiscais, mas o backend só lida com "Cobranças" (`Charges`).
- **Cash Flow:** O backend fornece um overview básico, mas não o fluxo de caixa detalhado por período solicitado pelo frontend.

### 3.2 Módulo de IA (`ai.ts`)
O frontend tenta utilizar um serviço de IA (`invokeLLM`) que parece estar configurado apenas no lado do servidor do frontend (Next.js/tRPC). Para uma arquitetura robusta:
- O backend NestJS deveria centralizar as chamadas de IA para auditoria e controle de custos.
- **Gaps:** Faltam os serviços de integração com OpenAI/Anthropic no backend.

### 3.3 Módulo de Pessoas e Colaboradores (`people.ts`)
Embora o backend tenha um `PeopleController`, há discrepâncias:
- **Estatísticas:** O frontend solicita distribuição por cargo (`roleDistribution`) e departamento, lógica que está sendo feita no frontend mas deveria vir do backend para performance.
- **CRUD:** O frontend implementa `delete` e `update` complexos que precisam de validação de regras de negócio no `PeopleService`.

---

## 4. Inconsistências de Contrato (Data Gaps)
Alguns campos esperados pelo frontend não são retornados pelo backend atual:

| Objeto | Campo no Frontend | Presença no Backend | Observação |
| :--- | :--- | :--- | :--- |
| **Customer** | `active`, `lastContact` | Parcial | O backend não rastreia o "último contato" automaticamente. |
| **Appointment** | `DONE`, `SCHEDULED` | Sim | Enums estão sincronizados, mas a lógica de conclusão automática falta. |
| **Charge** | `paidDate`, `overdue` | Parcial | A marcação de `overdue` (atrasado) precisa de um job recorrente no backend. |

---

## 5. Recomendações de Implementação

1. **Prioridade 1 (Monetização):** Implementar o `StripeService` no backend e expor os endpoints de planos de pagamento.
2. **Prioridade 2 (IA):** Migrar a lógica de `ai.ts` do frontend para um `AiService` no NestJS.
3. **Prioridade 3 (Consistência):** Unificar a lógica de KPIs do Dashboard no backend para garantir que o frontend apenas exiba os dados processados.

---

## Referências
- [1] `apps/web/server/routers/nexo-proxy.ts` - Mapeamento de proxy para API.
- [2] `apps/api/src/finance/finance.controller.ts` - Implementação atual de finanças.
- [3] `apps/web/server/routers/finance-advanced.ts` - Funcionalidades financeiras desejadas.
- [4] `apps/api/src/admin/admin-overview.service.ts` - Lógica atual de dashboard no backend.

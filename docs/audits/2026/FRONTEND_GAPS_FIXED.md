# Auditoria de Produto NexoGestão - Gaps Identificados e Status

Este documento detalha a auditoria realizada no projeto NexoGestão, identificando os componentes funcionais, os stubs/mocks restantes e as melhorias necessárias para o polimento de SaaS.

## 1. Auditoria de Integração (Front-End → Back-End)

A arquitetura utiliza um padrão BFF (Backend-for-Frontend) com tRPC em `apps/web/server` que atua como proxy para a API NestJS em `apps/api`.

| Módulo | Status de Integração | Observação |
| :--- | :--- | :--- |
| **Autenticação** | ✅ Funcional | Integrado com `/auth/login` e `/me`. |
| **Clientes** | ✅ Funcional | CRUD completo integrado com a API NestJS. |
| **Agendamentos** | ⚠️ Parcial | CRUD básico funcional, mas falta a **Visão de Calendário**. |
| **Ordens de Serviço** | ✅ Funcional | CRUD completo integrado. Falta upload de anexos. |
| **Financeiro** | ⚠️ Parcial | Listagem de cobranças funcional. Falta CRUD de despesas e faturas no front. |
| **Pessoas** | ✅ Funcional | Gestão de colaboradores integrada. |
| **Dashboard** | ✅ Funcional | Métricas reais vindas da API NestJS. |
| **Onboarding** | ✅ Funcional | Fluxo de primeiro acesso integrado. |

## 2. Gaps Identificados (O que falta implementar)

### A) Landing + Onboarding
- [ ] **Landing Page**: Adicionar CTAs reais para Trial e redirecionamentos de Login/Register.
- [ ] **Seed Demo**: Implementar botão "Popular Demo" no dashboard (apenas para ADMIN) chamando o script de seed da API.

### B) Calendário (Essencial)
- [ ] **Componente de Calendário**: Criar `Calendar.tsx` usando `react-day-picker` ou `fullcalendar`.
- [ ] **Integração**: Conectar o calendário aos endpoints `/appointments` e `/service-orders`.
- [ ] **Interatividade**: Implementar Drag & Drop e criação de eventos via clique.

### C) UX/Produto
- [ ] **Loading Skeletons**: Implementar em todas as tabelas e cards de dashboard.
- [ ] **Empty States**: Adicionar ilustrações e CTAs claros quando não houver dados.
- [ ] **RBAC na UI**: Esconder botões de ação (Editar/Excluir) baseados na role do usuário (ex: VIEWER).

### D) Tecnologia de Mercado
- [ ] **Upload de Arquivos**: Implementar anexo de fotos/PDFs em Service Orders.
- [ ] **Exportação CSV**: Adicionar botões de exportação nas tabelas de Clientes e Finanças.
- [ ] **Configurações**: Criar `SettingsPage.tsx` para editar dados da organização (Timezone, Moeda).
- [ ] **Notificações**: Implementar o badge real no sino de notificações conectado ao banco.

## 3. Qualidade e Entrega
- [x] Auditoria completa realizada.
- [x] Mapeamento de rotas BFF vs API NestJS concluído.
- [x] Identificação de stubs no frontend.

---
**Data da Auditoria:** 05 de Março de 2026
**Status:** Pronto para implementação dos gaps.

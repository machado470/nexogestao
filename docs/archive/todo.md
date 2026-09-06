# NexoGestão SaaS Platform - TODO

## Completed Features
- [x] Landing page with hero section, features, and CTA buttons
- [x] Authentication system (register/login) using tRPC
- [x] Local database (MySQL) with organizations and accounts tables
- [x] Dashboard with sidebar navigation, dark/light theme toggle
- [x] Database migrations for organizations and accounts
- [x] AuthContext with tRPC integration
- [x] Create Customer Modal component
- [x] Create Appointment Modal component
- [x] Create Service Order Modal component
- [x] Integrated modals into Dashboard
- [x] Unit tests for CRUD operations (customers, appointments, service orders)
- [x] Fixed logout test (session.logout instead of auth.logout)
- [x] Implemented bcrypt for password hashing
- [x] Added email and phone validation in forms
- [x] Fixed imports in Dashboard (useAuth hook)
- [x] Verified database schema synchronization

## Fase 1: Tabelas de Dados (CONCLUÍDA)
- [x] Criar componente DataTable reutilizável
- [x] Criar página CustomersPage com tabela de clientes
- [x] Criar página AppointmentsPage com tabela de agendamentos
- [x] Criar página ServiceOrdersPage com tabela de ordens de serviço
- [x] Integrar rotas no App.tsx
- [x] Adicionar navegação no Dashboard para as novas páginas
- [x] Implementar busca e filtro nas tabelas
- [x] Implementar ordenação nas colunas
- [x] Adicionar estatísticas nas páginas de dados

## Fase 2: CRUD Completo (CONCLUIDA)
- [x] Criar endpoints UPDATE no backend
- [x] Criar endpoints DELETE no backend
- [x] Criar endpoints getById no backend
- [x] Implementar EditCustomerModal no frontend
- [x] Implementar ConfirmDeleteModal reutilizavel
- [x] Integrar edicao e exclusao na CustomersPage
- [x] Atualizar DataTable com acoes de edicao/exclusao
- [x] Testes passando (5/5)

## Fase 3: Finanças (CONCLUIDA)
- [x] Criar schema de charges/cobranças
- [x] Criar endpoints CRUD de charges (create, list, getById, update, delete)
- [x] Criar endpoints de estatísticas (stats, revenueByMonth)
- [x] Implementar página de Finanças com tabela de charges
- [x] Adicionar gráficos de receita com Recharts (BarChart, PieChart)
- [x] Criar CreateChargeModal
- [x] Criar EditChargeModal
- [x] Integrar rota /finances no App.tsx
- [x] Adicionar link de finanças no menu do Dashboard

## Fase 4: Pessoas (CONCLUIDA)
- [x] Criar schema de pessoas/colaboradores com roles (admin, manager, collaborator, viewer)
- [x] Criar endpoints CRUD de pessoas (create, list, getById, update, delete)
- [x] Criar endpoints de estatísticas (stats, roleDistribution, departmentDistribution)
- [x] Implementar página de Pessoas com tabela e gráficos
- [x] Criar CreatePersonModal
- [x] Criar EditPersonModal
- [x] Integrar rota /people no App.tsx
- [x] Adicionar link de Pessoas no menu do Dashboard
- [x] Implementar controle de acesso por função (role-based access control)
- [x] Todos os 5 testes continuam passando

## Fase 5: Governança (CONCLUIDA)
- [x] Criar schema de governança com riskScore, riskLevel, complianceStatus
- [x] Criar endpoints CRUD de governança (create, list, getById, update, delete)
- [x] Implementar autoScore com análise inteligente de risco
- [x] Criar endpoints de estatísticas (riskSummary, riskDistribution, complianceDistribution)
- [x] Implementar página de Governança com:
  - 4 cards de resumo (Score Médio, Críticos, Altos, Conformes)
  - Gráfico de pizza de distribuição de risco
  - Gráfico de pizza de distribuição de conformidade
  - Tabela completa com busca e filtro
  - Seção de alertas de risco
- [x] Integrar rota /governance no App.tsx
- [x] Adicionar link de Governança no menu do Dashboard
- [x] Todos os 5 testes continuam passando

## Fase 6: Dashboard Executivo (CONCLUIDA)
- [x] Criar router de dashboard com endpoints de KPIs
- [x] Implementar endpoints de tendências de receita (12 meses)
- [x] Implementar endpoints de distribuição de agendamentos
- [x] Implementar endpoints de distribuição de cobranças
- [x] Implementar endpoints de métricas de performance
- [x] Criar página ExecutiveDashboard com:
  - 5 cards de KPIs principais (Clientes, Agendamentos, Ordens, Receita, Risco)
  - Gráfico de linha (LineChart) de tendência de receita
  - Gráfico de pizza (PieChart) de distribuição de agendamentos
  - Gráfico de pizza (PieChart) de distribuição de cobranças
  - Seção de métricas de performance com barras de progresso
  - Seção de análise de receita com breakdown
- [x] Integrar rota /executive-dashboard no App.tsx
- [x] Atualizar menu do Dashboard para apontar para dashboard executivo
- [x] Todos os 5 testes continuam passando

## Fase 7: Paginação (CONCLUIDA)
- [x] Criar componente Pagination reutilizável
- [x] Adicionar suporte de paginação no backend (page, limit)
- [x] Integrar paginação em CustomersPage
- [x] Integrar paginação em AppointmentsPage
- [x] Integrar paginação em ServiceOrdersPage
- [x] Integrar paginação em FinancesPage
- [x] Todos os 5 testes continuam passando

## Fase 8: Rastreamento de Contatos e Endereço
- [ ] Expandir schema de customers com campos de endereço (rua, número, complemento, CEP, cidade, estado)
- [ ] Criar tabela de contact_history para rastreamento de contatos
- [ ] Criar endpoints para listar histórico de contatos
- [ ] Atualizar CreateCustomerModal com campos de endereço
- [ ] Atualizar EditCustomerModal com campos de endereço
- [ ] Criar componente de histórico de contatos na página de clientes

## Fase 9: Funções do Nexo Agent (WhatsApp)
- [ ] Verificar endpoints de WhatsApp disponíveis no backend
- [ ] Implementar envio de mensagens via WhatsApp
- [ ] Implementar templates de mensagens
- [ ] Criar interface para enviar mensagens aos clientes
- [ ] Integrar notificações de mensagens recebidas

## Fase 10: Correção de Bugs
- [ ] Corrigir erro de carregamento ao sair do perfil
- [ ] Investigar logs de erro
- [ ] Testar fluxo completo de navegação

## Próximas Melhorias
- [ ] Email verification and password recovery
- [ ] Real-time notifications system
- [ ] Export data to PDF/Excel
- [ ] User profile management
- [ ] Organization settings and customization
- [ ] Audit logs for all operations
- [ ] API rate limiting and security

## Database Schema Status
- [x] organizations table
- [x] accounts table
- [x] customers table
- [x] appointments table
- [x] service_orders table
- [ ] charges table
- [ ] payments table
- [ ] people table
- [ ] risk_snapshots table

## Testing Status
- [x] CRUD operations tests (customers, appointments, service orders)
- [ ] Modal component tests
- [ ] Form validation tests
- [ ] Authentication flow tests
- [ ] Integration tests for dashboard

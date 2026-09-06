# =========================
# NEXOGESTAO — COMMANDO MASTER (PARA AGENT)
# Cole isso no Agent e siga à risca.
# =========================

Você é meu Agente de Engenharia/Produto do projeto NexoGestão (monorepo apps/api + apps/web).
Meta: manter a identidade do produto, fechar o MVP v1 com disciplina, e corrigir o gargalo atual (Docker volume + enforcement).

------------------------------------------------------------
0) LEIS DO UNIVERSO (NÃO NEGOCIÁVEIS)
------------------------------------------------------------
- Backend é autoridade absoluta. Frontend nunca “decide” regra crítica. (estado/risco/transição) :contentReference[oaicite:5]{index=5}
- Nada acontece fora do fluxo canônico: Cliente → Agenda → OS → Execução → Financeiro → Comunicação → Histórico → Risco. :contentReference[oaicite:6]{index=6}
- Multi-tenant blindado: toda entidade operacional tem organizationId e toda query filtra tenant. Falha = falha crítica. :contentReference[oaicite:7]{index=7} :contentReference[oaicite:8]{index=8}
- Idempotência obrigatória: seed, jobs, mensagens WhatsApp, reprocessamentos. Nunca duplicar silenciosamente. :contentReference[oaicite:9]{index=9}
- Toda ação relevante gera histórico: AuditEvent (técnico) + TimelineEvent (humano). Se não gera histórico, é bug conceitual. :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11}
- Risco nunca é manual, nunca “mágico”, sempre explicável: evento → padrão → score → decisão. :contentReference[oaicite:12]{index=12}

------------------------------------------------------------
1) IDENTIDADE DO PRODUTO (O QUE É / NÃO É)
------------------------------------------------------------
O que é:
- Plataforma modular de gestão operacional com núcleo inteligente de risco (NexoCore).
- Conecta: Cliente → Agenda → OS → Execução → Financeiro → Comunicação → Histórico → Risco. :contentReference[oaicite:13]{index=13}

O que NÃO é:
- Não é ERP pesado, não é contábil, não é CRM de marketing, não é disparador em massa, não é “painel de gráfico vazio”.
- Se começar a virar ERP genérico, tá errado. :contentReference[oaicite:14]{index=14}

Problema central:
- Pequenas/médias empresas quebram por desorganização operacional (não por falta de cliente). :contentReference[oaicite:15]{index=15}

Frases-chave:
- “Se não está no sistema, não aconteceu.”
- “O NexoGestão organiza o que o WhatsApp bagunça.”
- “Não é ERP. É ordem operacional.” :contentReference[oaicite:16]{index=16}

------------------------------------------------------------
2) MVP V1 — ESCOPO FECHADO (FOCO, SEM INVENTAR MODA)
------------------------------------------------------------
Inclui (somente):
1) Clientes (Customer): cadastro, ativo/inativo, histórico vinculado.
2) Agenda (Appointment): pendente/confirmado/cancelado/realizado/no-show; confirmação via WhatsApp; agenda = presença.
3) Ordem de Serviço (ServiceOrder): aberta/em execução/concluída/cancelada; responsável; timeline.
4) Financeiro essencial: Charge/Payment; pendente/pago/atrasado; vencimento; lembretes; recibo simples.
5) WhatsApp básico operacional: confirmação, lembrete 24h, lembrete pagamento, recibo; editável, logado, idempotente, sem spam. :contentReference[oaicite:17]{index=17}

NÃO entra:
- Estoque, BI avançado, relatórios complexos, dashboard executivo completo, permissões hiper granulares, “menu infinito”. :contentReference[oaicite:18]{index=18}

Definition of Done MVP:
- Cadastrar cliente → criar agendamento → criar OS → registrar execução → gerar cobrança → enviar lembretes → marcar pagamento → consultar histórico completo, tudo SEM sair do sistema. :contentReference[oaicite:19]{index=19}

------------------------------------------------------------
3) FLUXO CANÔNICO (REGRA DE NEGÓCIO + TRANSIÇÕES)
------------------------------------------------------------
- Cliente é origem da operação; cliente inativo não gera OS nova.
- Agenda controla comparecimento (no-show impacta risco).
- OS registra execução real (conclusão gera timeline + cobrança possível + recalcular risco).
- Financeiro sempre vinculado à OS; atraso impacta risco; “pago” gera recibo + timeline.
- Comunicação WhatsApp é operacional; toda mensagem logada e idempotente; sem spam.
- Timeline reconstrói a história do cliente.
- Risco é consequência do fluxo, nunca manual. :contentReference[oaicite:20]{index=20}

------------------------------------------------------------
4) ARQUITETURA TÉCNICA OFICIAL (MONOREPO)
------------------------------------------------------------
- apps/api: NestJS + Prisma + Postgres (Docker)
- apps/web: React + Vite + Tailwind
- Camadas: Controller (sem regra) / Service (lógica) / Repository (dados) / DTO (validação) / Presenter (formatação).
- Controller NÃO tem regra; transição de estado só via Service.
- Multi-tenant obrigatório em toda entidade e query.
- Infra Docker com healthcheck; entrypoint espera DB, migra, seed controlado por env. :contentReference[oaicite:21]{index=21} :contentReference[oaicite:22]{index=22}

------------------------------------------------------------
5) DADOS, PRISMA, MIGRATIONS (CONTRATO)
------------------------------------------------------------
- Migration é contrato: nunca edite migration aplicada. Reset só em dev/local.
- organizationId em tudo operacional.
- FK/índices certos (organizationId + status + createdAt + dueDate etc).
- Idempotência com unique keys onde faz sentido (seed/mensagens).
- Entidades canônicas: Organization, User, Person, Customer, Appointment, ServiceOrder, Charge/Payment, TimelineEvent, AuditEvent, RiskSnapshot. :contentReference[oaicite:23]{index=23}

------------------------------------------------------------
6) SEED + DEMO (NARRATIVA, NÃO “ENCHER BANCO”)
------------------------------------------------------------
Seed deve ser: idempotente + determinístico + coerente com fluxo.
Cria org demo + users/pessoas + clientes realistas + agenda (passado/futuro) + OS variadas + cobranças (paga/pendente/atrasada) + timeline/audit coerentes + mensagens WhatsApp (queue/mock).
Cenários de demo: cliente faltoso; inadimplência; operação saudável; operador com falhas moderadas.
SQL canônico de validação (clientes, agenda, OS, cobranças, timeline). :contentReference[oaicite:24]{index=24} :contentReference[oaicite:25]{index=25}

------------------------------------------------------------
7) WHATSAPP “MEU ACESSOR” (OPERACIONAL, CONTROLADO)
------------------------------------------------------------
Casos MVP:
- Confirmar agendamento; lembrete 24h; confirmação de execução; link de pagamento; lembrete não agressivo; recibo.
Regras:
- Anti-spam com cooldown por tipo; idempotência via messageKey; tudo persistido (queued/sent/failed/canceled).
- Templates editáveis com placeholders controlados (sem {qualquer_coisa} livre). Render falhou? NÃO envia.
- Controller nunca chama provedor; Service cria log; Job/Worker envia via Provider Adapter (Meta/Z-API/Mock).
- Toda fila/envio/falha gera Audit + Timeline. :contentReference[oaicite:26]{index=26} :contentReference[oaicite:27]{index=27}

------------------------------------------------------------
8) NEXOCORE (RISCO OPERACIONAL)
------------------------------------------------------------
- Score 0–100; níveis fixos: 0–20 estável, 21–40 atenção, 41–60 moderado, 61–80 alto, 81–100 crítico.
- Inputs (cliente): no-show, atraso, reincidência, cancelamentos; reduz com consistência e pagamento em dia.
- MVP pode ser recalcular completo por eventos (mais previsível).
- RiskSnapshot recomendado, com contributors JSON pra explicar “por que está alto”.
- Risco tem que gerar ação: alertas, prioridade, sugestão de confirmação manual etc. :contentReference[oaicite:28]{index=28}

------------------------------------------------------------
9) RUNBOOK OPERACIONAL (PADRÃO WILLIAM)
------------------------------------------------------------
Regra de edição:
1) rm -f caminho/do/arquivo
2) nano caminho/do/arquivo
3) cat caminho/do/arquivo (sempre mostrar arquivo inteiro)
Sem edição “direto no chat”. :contentReference[oaicite:29]{index=29}

Comandos padrão:
- Subir: docker compose up -d --build
- Status: docker compose ps
- Logs: docker compose logs -f api
- Health: curl -s http://localhost:3000/health
- SQL:
  docker compose exec -T postgres psql -U postgres -d nexogestao -c '\dt'
  docker compose exec -T postgres psql -U postgres -d nexogestao -c 'select * from "_prisma_migrations" order by "finished_at" desc;'
- Reset total DEV: docker compose down -v && docker compose up --build :contentReference[oaicite:30]{index=30}

------------------------------------------------------------
10) STATUS ATUAL E PRÓXIMOS PASSOS
------------------------------------------------------------

**CI/CD:**
- Workflows de CI/CD para Staging e Produção configurados com sucesso no GitHub Actions.
- Deploy para Staging acionado automaticamente em pushes para `development`.
- Deploy para Produção acionado em pushes para `main`.

**Próximos Passos (Prioridade):**
1. **Corrigir o Docker (bind mount)** para o módulo Governance/Enforcement, conforme detalhado anteriormente.
2. **Restaurar/recriar o módulo Governance** dentro do caminho correto (host montado).
3. **Criar smoke test mínimo** para o módulo Governance.
4. **Voltar para features novas** após a correção do Governance.

**Última atualização:** 2026-03-05

------------------------------------------------------------
12) FORMATO DE RESPOSTA DO AGENT (SEM ENROLAÇÃO)
------------------------------------------------------------
- Sempre responder com:
  A) Diagnóstico curto
  B) Mudanças exatas (arquivos + diffs)
  C) Comandos exatos pra executar
  D) Queries SQL de validação
- Se editar arquivo: seguir rm -f → nano → cat e mostrar conteúdo completo no final.


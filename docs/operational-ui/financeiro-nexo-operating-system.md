---
status: review
owner: nexogestao
last_reviewed: 2026-09-06
source_of_truth: true
supersedes:
---

# Financeiro — Nexo Operating System UI

Financeiro é o cockpit de conversão **execução → cobrança → pagamento → recebimento**. A página `/finances` não é ERP contábil: ela deve ajudar o operador a decidir, cobrar, reduzir risco de caixa, enxergar evidência e executar apenas ações reais já existentes.

## Hierarquia obrigatória

1. **Header:** contexto operacional, saúde da carteira, atrasos, pendências e atualização.
2. **Hero compacto:** apenas três métricas — dinheiro recebido, dinheiro pendente e dinheiro em risco — com baixa altura para não competir com a ação imediata.
3. **FAÇA AGORA:** bloco dominante de decisão imediata, com motivo, impacto, segurança e CTA real.
4. **Pipeline Financeiro:** fluxo visual principal `Cliente → Cobrança → Envio → Contato → Pagamento → Recebimento`, com conectores claros e gargalo destacado.
5. **Carteira operacional:** fila real de trabalho, antecipada na leitura, com cobranças selecionáveis em cards/linhas operacionais e sem tabela administrativa pesada.
6. **Conversão de receita:** faixa compacta de recebido, pendente, em risco e previsto total.
7. **Radar financeiro:** alertas compactos com título curto, sinal/quantidade, consequência curta e CTA curto.
8. **Detalhe financeiro:** contexto financeiro essencial → decisão operacional → ações reais → prova operacional financeira → comunicação/WhatsApp.

## Pipeline Financeiro

O pipeline oficial de Financeiro é:

**Cliente → Cobrança → Envio → Contato → Pagamento → Recebimento**

Regras do pipeline:

- usar somente dados já carregados na página;
- não inventar histórico, envio, contato, pagamento ou automação;
- destacar visualmente o gargalo principal;
- não transformar Timeline/Governança em etapa principal;
- usar linguagem humana e operacional;
- acionar apenas CTAs reais já existentes, como WhatsApp contextual, criação de cobrança, registro de pagamento e navegação para Cliente/O.S.

## Conversão de receita

A leitura de conversão deve ser uma faixa compacta, sem biblioteca externa ou gráfico pesado, mostrando:

- **Recebido**;
- **Pendente**;
- **Em risco**;
- **Previsto total**.

Essa faixa resume a conversão execução → receita e substitui leituras repetitivas do antigo pulso financeiro. Sinais de gargalo pertencem ao Pipeline e alertas acionáveis pertencem ao Radar.

## Carteira e detalhe

- A carteira deve destacar cliente, valor, status, vencimento/atraso, origem operacional humanizada, prioridade humana, próxima ação e CTA principal.
- Prioridade deve preferir rótulos humanos: **Crítico**, **Atenção**, **Acompanhar** e **Informativo**.
- A carteira não deve exibir ID bruto de cobrança, O.S., cliente, UUID, hash ou telefone cru.
- O detalhe financeiro deve iniciar pelo contexto essencial: **Cliente**, **Valor**, **Status/vencimento** e **Origem operacional**.
- Depois do contexto, o detalhe mostra **Decisão operacional**.
- Depois da decisão, o detalhe mostra **Ações reais** e então **Prova operacional financeira** e **Comunicação/WhatsApp**.
- Telefones crus não devem aparecer; use “Contato cadastrado”, “WhatsApp disponível” ou “Sem contato retornado”, salvo se existir regra global de máscara segura.

## Timeline financeira humanizada

Eventos conhecidos devem ser traduzidos para:

- Cobrança criada
- Lembrete preparado
- Lembrete enviado
- Pagamento registrado
- Cobrança atualizada
- Cobrança acompanhada
- Ação financeira registrada
- Evento financeiro registrado

Fallback obrigatório: **Evento financeiro registrado**.

## Regra anti-vazamento técnico

A UI do operador não deve exibir UUID, hash, ID cru, telefone cru, eventType, actionKey, backend, BFF, endpoint, payload, metadata, tokens internos, pipes, setas técnicas ou nomes técnicos de ação/evento.

Quando a fonte atual não trouxer dado suficiente, usar fallback honesto de negócio, como “Evento financeiro registrado”, “Sem O.S. vinculada”, “Sem contato retornado” ou “Origem não informada pela fonte atual”.

## Limites preservados

Esta direção não altera backend, API, Prisma, rotas, contratos, segurança multi-tenant, WhatsAppPage, automações reais, mocks ou seeds. A página pode apenas reorganizar e humanizar dados já carregados, subir a carteira operacional na hierarquia e acionar fluxos reais existentes.

# Auditoria de autoridade — pipeline executivo

## Autoridades encontradas

- **Cliente:** `Customer.active` e seus registros persistidos são fatos canônicos de cadastro.
- **Agendamento:** `Appointment.status` é autoridade sobre cada agendamento.
- **O.S.:** `ServiceOrder.status` e as políticas de transição do módulo são autoridade sobre cada ordem.
- **Cobrança:** `Charge.status` e as políticas financeiras são autoridade sobre cada cobrança.
- **Pagamento:** o registro `Payment`, vinculado à cobrança e ao tenant, é o fato canônico de recebimento.
- O estado operacional geral vem da leitura persistida de governança; sinais e próxima ação têm contratos próprios. Nenhum deles decide o estado agregado de uma etapa do pipeline.

## Limite de decisão

Os estados por entidade são fatos/decisões canônicos no seu próprio agregado. Não existe atualmente contrato ou política de domínio que converta o conjunto de entidades de uma etapa em `done`, `active`, `warning`, `blocked` ou `idle`. Contagens, datas e a mistura de status não constituem essa política.

Por isso, as cinco etapas permanecem `unavailable`. O endpoint retorna o volume factual e a evidência correspondente, mas não usa esses valores para inferir saúde, risco, bloqueio ou conclusão. Para disponibilizar um estado no futuro, falta uma política explícita por etapa, com entradas, estados de saída e justificativas definidas pelo domínio.

## Fronteiras

O endpoint recebe o tenant exclusivamente do usuário autenticado pelo decorator `@Org()`. Não aceita `orgId`, estado ou ordenação do navegador. O BFF valida o contrato e a ordem fixa Cliente → Agendamento → O.S. → Cobrança → Pagamento; o Dashboard apenas mapeia a resposta para apresentação.

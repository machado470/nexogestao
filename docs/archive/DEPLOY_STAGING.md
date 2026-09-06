'''# Tutorial de Deploy para o Ambiente de Staging (NexoGestão)

Este documento descreve o processo completo para implantar o ambiente de *staging* do NexoGestão em um servidor Ubuntu com Docker e Docker Compose.

## 1. Pré-requisitos

Antes de começar, garanta que os seguintes softwares estejam instalados no servidor de deploy:

- **Git**: Para clonar o repositório.
- **Docker**: Para executar os contêineres. [Instruções de instalação](https://docs.docker.com/engine/install/ubuntu/)
- **Docker Compose**: Para orquestrar os contêineres. Geralmente vem com o Docker Desktop, mas em servidores pode precisar de instalação separada.

## 2. Configuração Inicial

Primeiro, clone o repositório e configure as variáveis de ambiente.

```bash
# 1. Clone o repositório
git clone https://github.com/machado470/NexoGestao.git
cd NexoGestao

# 2. Crie o arquivo de variáveis de ambiente para staging
cp .env.staging.example .env.staging
```

Agora, **edite o arquivo `.env.staging`** e preencha as variáveis, especialmente o `JWT_SECRET` com um valor longo e seguro. Os valores padrão são adequados para um ambiente local, mas o `JWT_SECRET` deve ser alterado.

```ini
# .env.staging

# ... (outras variáveis)

# Altere esta chave para algo seguro!
JWT_SECRET="seu-jwt-secret-super-seguro-para-staging"

# ... (outras variáveis)
```

## 3. Executando o Deploy

O processo de deploy é automatizado por um único script. Ele é idempotente, o que significa que pode ser executado várias vezes, reconstruindo o ambiente do zero a cada vez.

```bash
# Execute o script de deploy para o ambiente de staging
./dev/deploy-staging.sh
```

O script irá:
1. Parar e remover quaisquer contêineres de staging antigos.
2. Reconstruir as imagens Docker da `api` and `web`.
3. Iniciar os serviços (`postgres`, `api`, `web`).
4. Aguardar a API ficar disponível e saudável.
5. Executar um *smoke test* para validar as funcionalidades principais.

Ao final, você verá as URLs para acessar a aplicação.

## 4. Checklist de Validação Pós-Deploy

Após o deploy bem-sucedido, siga este checklist para garantir que todo o fluxo principal da aplicação está funcionando como esperado.

| Passo | Ação | Resultado Esperado |
| :--- | :--- | :--- |
| 1 | **Acessar a Aplicação** | Abra `http://<seu-servidor-ip>:3000` no navegador. A página de login deve ser exibida. |
| 2 | **Login** | Faça login com um usuário existente (se o banco foi semeado com `SEED_MODE=demo`, use `admin@nexo.com` / `admin`). | O dashboard principal deve ser carregado sem erros. |
| 3 | **Criar um Cliente** | Navegue até a seção de Clientes e crie um novo cliente. | O cliente deve aparecer na lista de clientes. |
| 4 | **Criar um Agendamento** | Vá para a agenda e crie um novo agendamento para o cliente recém-criado. | O agendamento deve aparecer no calendário. |
| 5 | **Criar uma Ordem de Serviço (OS)** | A partir do agendamento, ou diretamente, crie uma nova Ordem de Serviço. | A OS deve ser criada e listada na seção de Ordens de Serviço. |
| 6 | **Finalizar a OS e Gerar Cobrança** | Edite a OS, adicione um valor (`amountCents`) e mude o status para `DONE`. | Uma cobrança (`charge`) deve ser gerada automaticamente no módulo Financeiro. |
| 7 | **Registrar Pagamento** | Encontre a cobrança gerada e registre um pagamento para ela (ex: em dinheiro). | O status da cobrança deve mudar para `PAID`. |
| 8 | **Verificar Dashboards e Alertas** | Verifique o dashboard financeiro e o dashboard principal. | Os valores de receita e atividades recentes devem ser atualizados para refletir a OS e o pagamento. |
| 9 | **Verificar Endpoint de Saúde** | Acesse `http://<seu-servidor-ip>:3001/health` no navegador ou via `curl`. | Deve retornar um JSON com `{"status":"ok", ...}`. |

Se todos os passos forem concluídos com sucesso, o ambiente de staging está validado e operacional.
'''

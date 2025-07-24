# NexoGestão - Sistema PDV (Módulo Caixa e Vendas)

Sistema completo de Ponto de Venda (PDV) desenvolvido com React, TypeScript, Tailwind CSS e Supabase.

## 🚀 Funcionalidades

### ✅ Implementadas
- **Autenticação de Operadores**: Login seguro com diferentes níveis de acesso
- **Interface PDV**: Busca de produtos por nome, código ou código de barras
- **Carrinho de Vendas**: Adição, remoção e edição de quantidades
- **Múltiplas Formas de Pagamento**: Dinheiro, Cartão e PIX
- **Controle de Caixa**: Abertura, fechamento, sangrias e suprimentos
- **Tema Escuro/Claro**: Interface adaptável
- **Design Responsivo**: Otimizado para desktop e tablet

### 🔄 Em Desenvolvimento
- Módulo de Produtos (CRUD completo)
- Módulo de Clientes
- Relatórios e Dashboard
- Configurações do Sistema

## 🛠️ Tecnologias

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth + bcrypt
- **Ícones**: Lucide React

## 📦 Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd nexogestao-pdv
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure o Supabase**
   - Crie um projeto no [Supabase](https://supabase.com)
   - Copie `.env.example` para `.env`
   - Configure as variáveis de ambiente:
```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. **Execute o script SQL**
   - No painel do Supabase, vá em SQL Editor
   - Execute o conteúdo do arquivo `supabase-setup.sql`

5. **Inicie o servidor de desenvolvimento**
```bash
npm run dev
```

## 👤 Acesso Demo

- **Usuário**: `admin`
- **Senha**: `123456`

## 🏗️ Estrutura do Projeto

```
src/
├── components/          # Componentes React
│   ├── ui/             # Componentes de interface
│   ├── LoginForm.tsx       # Tela de login por usuário
│   ├── EmailLoginForm.tsx  # Login utilizando email e senha
│   ├── Dashboard.tsx   # Layout principal
│   ├── PDVScreen.tsx   # Tela do PDV
│   └── ...
├── contexts/           # Contextos React
│   ├── AuthContext.tsx # Autenticação
│   └── ThemeContext.tsx # Tema
├── hooks/              # Hooks customizados
├── lib/                # Configurações
│   └── supabase.ts     # Cliente Supabase
├── types/              # Tipos TypeScript
└── App.tsx             # Componente principal
```

## 🗄️ Banco de Dados

### Tabelas Principais
- `operators`: Operadores do sistema
- `products`: Produtos cadastrados
- `cash_sessions`: Sessões de caixa
- `cash_movements`: Movimentações do caixa
- `sales`: Vendas realizadas

## 🔐 Segurança

- Senhas criptografadas com bcrypt
- Row Level Security (RLS) habilitado
- Validação de dados no frontend e backend
- Controle de acesso por níveis de usuário

## 📱 Interface

- **Design Moderno**: Interface limpa e intuitiva
- **Tema Escuro/Claro**: Alternância automática
- **Responsivo**: Funciona em desktop e tablet
- **Acessibilidade**: Componentes acessíveis

## 🚀 Deploy

O projeto está configurado para deploy fácil:

1. **Frontend**: Netlify, Vercel ou similar
2. **Backend**: Supabase (já configurado)

## 📋 Próximos Passos

1. **Módulo de Produtos**: CRUD completo com categorias
2. **Módulo de Clientes**: Cadastro e histórico
3. **Relatórios**: Vendas, estoque, financeiro
4. **NF-e/NFC-e**: Emissão de notas fiscais
5. **Backup**: Sistema de backup automático

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 📞 Suporte

Para suporte e dúvidas, abra uma issue no repositório.
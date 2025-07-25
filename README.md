# NexoGestão

**NexoGestão** é um sistema completo de gestão empresarial (ERP + PDV), construído para funcionar como SaaS (Software como Serviço), permitindo múltiplas empresas e usuários em um único sistema.

---

## 🚀 Funcionalidades

- Cadastro de produtos, clientes e fornecedores  
- Controle de vendas (PDV)  
- Relatórios financeiros e fiscais  
- Gestão de múltiplas empresas (multi-tenancy)  
- Integração com Supabase  
- Layout moderno com Tailwind e Vite  
- Estrutura organizada por features e módulos  

---

## 🧱 Estrutura do Projeto

```
src/
├── features/
│   ├── auth/
│   ├── pdv/
│   ├── produtos/
│   ├── clientes/
│   ├── fornecedores/
│   ├── financeiro/
│   ├── fiscal/
│   ├── relatorios/
│   ├── dashboard/
│   └── layout/
├── saas/
├── tenants/
├── ui/
├── services/
├── controllers/
├── models/
├── hooks/
├── types/
├── contexts/
├── config/
├── routes/
├── lib/
├── data/
└── tests/
```

---

## 🧪 Tecnologias e Ferramentas

- `React` + `Vite`  
- `Supabase`  
- `Tailwind CSS`  
- `ESLint + Prettier`  
- `Husky + lint-staged`  
- `TypeScript`  
- `Git + GitHub`

---

## ⚙️ Como rodar localmente

```bash
# Clonar o repositório
git clone https://github.com/SEU_USUARIO/nexogestao.git

# Acessar a pasta
cd nexogestao

# Instalar dependências
npm install

# Rodar o projeto
npm run dev
```

---

## 🧠 Organização do Código

O projeto segue uma arquitetura baseada em **features e domínios**, separando responsabilidades e facilitando a manutenção, expansão e reaproveitamento de código em módulos SaaS.

---

## 🛡️ Licença

Este projeto está sob a licença [MIT](LICENSE).

---

## 📞 Contato

Desenvolvido por William Machado  
LinkedIn: [linkedin.com/in/williammachado](https://linkedin.com/in/williammachado)  
GitHub: [github.com/machado4702](https://github.com/machado4702)


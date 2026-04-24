# Sistema de Gerenciamento de Bingo

Sistema completo para gerenciamento de sorteios de bingo, vendedores, cartelas e vendas.

## 📋 Requisitos

- **Frontend**: Node.js 18+ com npm/pnpm/bun
- **Backend**: Node.js 18+
- **Banco de Dados**: PostgreSQL 12+ ou MySQL 8.0+

## 🚀 Instalação

### 1. Instalar Dependências

Frontend:
```bash
npm install
```

Backend:
```bash
cd backend
npm install
```

### 2. Configurar Banco de Dados

Crie um banco de dados PostgreSQL ou MySQL e execute o script de inicialização:

```bash
# PostgreSQL
psql -U postgres -d bingo < database/database-complete.sql

# MySQL
mysql -u root -p bingo < database/database-complete.sql
```

### 3. Configurar Variáveis de Ambiente

Backend (`.env` ou variáveis do sistema):
```bash
DB_TYPE=postgres          # ou mysql
DB_HOST=localhost
DB_PORT=5432             # 5432 para postgres, 3306 para mysql
DB_NAME=bingo
DB_USER=postgres         # seu usuário do banco
DB_PASSWORD=sua_senha
PORT=3001

# Opcional - autenticação básica
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=senha
```

Frontend (`.env`):
```bash
VITE_API_URL=http://localhost:3001
VITE_BASIC_AUTH_USER=admin
VITE_BASIC_AUTH_PASS=senha
```

### 4. Iniciar Aplicação

Backend:
```bash
cd backend
npm start
```

Frontend (em outro terminal):
```bash
npm run dev
```

## 📱 Primeiro Acesso

1. Acesse `http://localhost:5173` (ou porta configurada pelo Vite)
2. No primeiro acesso, você será solicitado a criar um usuário administrador
3. Preencha os dados do administrador e faça login

## 🐳 Docker (Opcional)

Para executar com Docker:

```bash
docker-compose up -d
```

Isso iniciará:
- Frontend (porta 80)
- Backend (porta 3001)
- PostgreSQL (porta 5432)

## 📁 Estrutura do Projeto

```
.
├── backend/               # API Node.js + Express
│   ├── server.js         # Servidor principal
│   ├── db-adapter.js     # Adaptador de banco de dados
│   └── package.json
├── database/             # Scripts SQL
│   └── database-complete.sql  # Schema completo do banco
├── src/                  # Frontend React + TypeScript
│   ├── components/       # Componentes UI
│   ├── contexts/         # Contextos React
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Utilitários
│   ├── pages/            # Páginas da aplicação
│   └── types/            # TypeScript types
├── public/               # Arquivos estáticos
└── package.json          # Dependências frontend
```

## 🔒 Segurança

- Senhas são hasheadas com SHA-256
- Autenticação JWT com expiração de 24 horas
- Autenticação básica opcional para API
- Validação de entrada com Zod

**⚠️ IMPORTANTE para Produção:**
- Altere todas as senhas padrão no `docker-compose.yml`
- Gere um `JWT_SECRET` forte e aleatório
- Use senhas fortes para `BASIC_AUTH_USER` e `BASIC_AUTH_PASS`
- Use HTTPS em produção
- Configure firewall para proteger portas do banco de dados

## 📝 Funcionalidades

- ✅ Gestão de usuários e permissões (admin/user)
- ✅ Criação e gerenciamento de sorteios
- ✅ Cadastro de vendedores
- ✅ Gestão de cartelas
- ✅ Registro de vendas
- ✅ Sistema de sorteio de números
- ✅ Relatórios e exportação de dados
- ✅ Interface responsiva e moderna

## 🛠️ Tecnologias

**Frontend:**
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- React Query
- Zod

**Backend:**
- Node.js
- Express
- PostgreSQL / MySQL
- JWT Authentication
- Crypto

## 📄 Licença

Este projeto é privado.

# Sistema de Gerenciamento de Bingo

Sistema completo para gerenciar sorteios, vendedores, cartelas, vendas, loja pública, planos de assinatura e transmissão do sorteio.

## Visão Geral

O sistema reúne:
- gestão de usuários e permissões
- criação e administração de sorteios
- criação de cartelas e atribuições
- vendas manuais e integração com a loja pública
- pagamento de planos com Stripe
- área pública de compra de cartelas
- tela de sorteio ao vivo com ranking e vencedor
- dashboard administrativa com métricas financeiras e de usuários

## Perfis de Uso

### Admin
- cria e edita usuários
- aprova, ativa e gerencia assinaturas
- cria planos e define ciclos de renovação
- acessa a dashboard de usuários e finanças
- atribui sorteios e vendedores
- acompanha pagamentos, vencimentos e situação das assinaturas
- visualiza loja, vendas e relatórios

### Usuário/Vendedor
- administra seus sorteios e cartelas
- vende cartelas manualmente
- disponibiliza cartelas na loja pública
- acompanha vendas e pagamentos
- usa a tela de sorteio ao vivo
- gerencia sua aparência pública e favicon

### Cliente final
- cria conta na loja pública
- escolhe cartelas disponíveis
- compra cartelas pela loja
- acompanha histórico e download de cartelas

## Funcionalidades Principais

### Sorteios
- criação e edição de sorteios
- definição de faixa de números
- suporte a bingo e rifa
- sorteio ao vivo com ranking
- card Top 10 Cartelas
- identificação automática de vencedores
- histórico de números sorteados
- transmissão para OBS / tela pública

### Cartelas
- geração de cartelas com layouts configuráveis
- atribuição de cartelas a vendedores
- controle de cartelas ativas, vendidas, devolvidas e extraviadas
- exportação e visualização de cartelas
- integração com cartelas validadas

### Vendas
- registro de novas vendas
- edição e exclusão de vendas
- pagamentos vinculados à venda
- reversão de cartelas ao excluir venda
- integração entre `Vendas` e `Minha Loja`

### Minha Loja
- disponibilização de cartelas para venda pública
- ajuste de preço por cartela
- suporte a múltiplas cartelas por vez
- integração com pagamentos Stripe e Mercado Pago
- bloqueio de cartelas já vendidas
- exibição de status de venda e vendedor associado

### Loja Pública
- página pública com visualização de cartelas disponíveis
- compra de cartelas individuais ou múltiplas
- autenticação de comprador
- histórico de compras
- download de PDF das cartelas
- aparência personalizada por usuário
- favicon e identidade visual próprios por loja

### Assinaturas e Planos
- planos Teste Grátis, Mensal e Anual
- renovação configurável por ciclo de dias
- aviso de vencimento com 7 dias
- renovação direta pelo usuário
- bloqueio do sistema quando a assinatura vence
- checkout Stripe usando as chaves do admin
- suporte ao fluxo de confirmação de pagamento via Stripe
- admins podem alterar plano de qualquer usuário a qualquer momento

### Administração
- nova página de gerenciamento de usuários em `/admin/usuarios`
- filtros por ativo, pendente, vencido e forma de pagamento
- dashboard financeira com estatísticas de base e pagamentos
- gerenciamento de lojas, planos, sorteios e vendedores
- edição de aparência, logo, favicon e hero image
- relatórios e exportações

## Tecnologias

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- React Query
- Zod

### Backend
- Node.js
- Express
- PostgreSQL ou MySQL
- JWT
- Stripe
- Mercado Pago

## Estrutura do Projeto

```text
.
├── backend_worker/        # API Node.js + Express
│   ├── server.js          # Servidor principal
│   ├── db-adapter.js      # Camada de banco de dados
│   └── package.json
├── database/              # Scripts SQL
│   └── database-complete.sql
├── frontend_worker/       # Frontend React + TypeScript
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   └── types/
└── frontend_worker/public/
```

## Requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 12+ ou MySQL 8+

## Instalação

### 1. Dependências

```bash
npm install
cd backend_worker
npm install
```

### 2. Banco de Dados

Execute o schema:

```bash
psql -U postgres -d bingo < database/database-complete.sql
```

ou

```bash
mysql -u root -p bingo < database/database-complete.sql
```

### 3. Variáveis de Ambiente

#### Backend

```bash
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bingo
DB_USER=postgres
DB_PASSWORD=sua_senha
PORT=3001
APP_URL=http://localhost:5173
JWT_SECRET=uma_chave_forte
```

#### Frontend

```bash
VITE_API_BASE_URL=http://localhost:3001
```

Se houver autenticação básica na API, configure também:

```bash
VITE_BASIC_AUTH_USER=admin
VITE_BASIC_AUTH_PASS=senha
```

### 4. Executar

Backend:

```bash
cd backend_worker
npm start
```

Frontend:

```bash
npm run dev
```

## Principais Páginas

- `/auth` - login e cadastro
- `/app` - área interna do sistema
- `/sortear` - tela de sorteio ao vivo
- `/planos` - planos de assinatura
- `/profile` - perfil e assinatura
- `/loja/...` - loja pública
- `/admin` - painel administrativo
- `/admin/usuarios` - gestão completa de usuários e finanças

## Fluxos Importantes

### Checkout de planos
- usa Stripe do admin
- planos pagos usam cartão
- plano grátis é ativado sem pagamento

### Loja pública
- compra por cartão via Stripe ou Mercado Pago
- confirmações ficam visíveis para usuário e admin
- cartelas vendidas saem da disponibilidade pública

### Vendas internas
- ao criar venda, o sistema marca a cartela como vendida
- ao excluir venda, a cartela volta para `Minha Loja` como disponível, quando aplicável

## Segurança

- autenticação JWT
- permissões por perfil
- validações de entrada no backend
- checagem de assinatura ativa para áreas protegidas

## Observações

- O sistema foi desenhado para funcionar com múltiplos usuários e múltiplos sorteios.
- A aparência pública da loja pode ser personalizada por usuário.
- O favicon e a identidade visual são ajustáveis por loja.

## Licença

Este projeto é privado.

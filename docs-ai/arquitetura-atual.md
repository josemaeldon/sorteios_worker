# Arquitetura Atual

## Backend
- Stack: Node.js + Express.
- Entrada principal: `POST /api` com switch por `action`.
- Arquivo central: `backend_worker/server.js`.
- Adapter de banco: `backend_worker/db-adapter.js`.

## Frontend
- Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui.
- Rotas em `frontend_worker/src/App.tsx`.
- Estado principal em `AuthContext` e `BingoContext`.

## Banco de Dados
- Script base: `database/database-complete.sql`.
- Suporte PostgreSQL/MySQL.
- Parte do schema também é criada/evoluída em runtime no backend.

## Infra
- Docker Compose com `postgres`, `backend`, `frontend`.
- Build/push de imagens via GitHub Actions para GHCR.

## Fluxos de negócio
- Auth/admin/usuário/comprador.
- Sorteios, cartelas, atribuições, vendas, pagamentos.
- Loja pública com checkout Stripe/Mercado Pago.
- Planos e assinatura.

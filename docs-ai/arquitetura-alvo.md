# Arquitetura Alvo

## Backend (modular)
- `src/http/routes/*`
- `src/domain/services/*`
- `src/infra/repositories/*`
- `src/infra/integrations/*`
- `src/jobs/*`
- `src/shared/*`

## Banco
- Migrations versionadas e idempotentes.
- Schema único de referência sem dependência de auto-migração em runtime.
- Normalização gradual de `vendas.numeros_cartelas` para tabela relacional.

## Frontend
- Organização por feature:
  - `src/features/sorteios`
  - `src/features/cartelas`
  - `src/features/vendas`
  - `src/features/loja`
  - `src/features/auth`
- Contexto global mínimo; estado remoto via React Query por domínio.

## Operação
- Fila para jobs assíncronos (email/PDF/webhook pesado).
- Observabilidade mínima (logs estruturados + métricas de latência/erro).

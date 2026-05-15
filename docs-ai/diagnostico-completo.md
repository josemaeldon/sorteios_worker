# Diagnóstico Completo

## Resumo Executivo
O sistema é funcional e abrangente, mas carrega risco técnico elevado por acoplamento excessivo no backend, desalinhamento de schema versionado vs schema real de runtime, e padrões transacionais que podem sofrer sob concorrência e volume alto.

## Arquitetura Observada
- Backend monolítico em único arquivo (`backend_worker/server.js`).
- API baseada em `action` via `POST /api`.
- Frontend React com concentração de regras em contextos grandes.
- Banco com adapter PG/MySQL e auto-migrações em runtime.

## Pontos Fortes
- Fluxos de negócio amplos e já integrados.
- Cobertura funcional de venda, loja, sorteio, assinatura, comprador.
- Rate limiting e autenticação JWT presentes.
- Batch em operações de criação/importação de cartelas.

## Fragilidades
- Complexidade e baixa separação de responsabilidades.
- Drift de banco por auto-migração no backend.
- Loops com N queries em fluxos críticos.
- Risco de corrida em webhooks e venda concorrente.
- CORS permissivo e gestão de segredos sensível.

## Impacto para 20k+ cartelas
- Viável com PostgreSQL, porém depende de:
  - transações corretas;
  - operações set-based;
  - índices revisados;
  - redução de loops por item.

## Conclusão
Não é recomendado iniciar refatoração estrutural antes de estabilizar migrações e segurança.

# Plano de Migrações de Banco

## Objetivo
Estabelecer um fluxo de migração versionado, reproduzível e auditável, eliminando auto-migrações implícitas do runtime.

## Diretrizes
- Uma migration por mudança lógica.
- Migration idempotente quando possível.
- Versionamento incremental (`001_`, `002_`, `003_`...).
- Script de validação pós-migration.
- Rollback documentado (ou estratégia forward-only segura).

## Ordem recomendada
1. Tabelas faltantes usadas em runtime
2. Colunas faltantes usadas em runtime
3. Índices e constraints de integridade
4. Ajustes de dados legados

## Governança
- Nenhuma alteração estrutural direta em produção sem migration versionada.
- Toda migration deve passar por homolog + smoke tests.

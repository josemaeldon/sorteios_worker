# Checklist Fase 0 e 1

## Pré-execução
- [ ] Backup validado do banco
- [ ] Ambiente de homolog espelhado
- [ ] Lista de fluxos críticos validada

## Fase 0
- [ ] Medir latência p50/p95 por action
- [ ] Medir taxa de erro por action
- [ ] Registrar baseline inicial

## Fase 1
- [ ] Inventariar todas tabelas/colunas reais usadas em runtime
- [ ] Criar migrations versionadas iniciais
- [ ] Atualizar schema de referência
- [ ] Executar migrações em homolog
- [ ] Rodar smoke tests completos
- [ ] Documentar rollback

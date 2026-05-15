# Métricas e Baseline

## Métricas mínimas
- Latência por action (`p50`, `p95`, `p99`)
- Taxa de erro por action (4xx e 5xx)
- Tempo médio de checkout e confirmação
- Tempo de geração/sincronização de cartelas em lote
- Uso de conexões do pool

## Metas iniciais
- Reduzir `p95` de ações críticas em pelo menos 30%
- Reduzir erros 5xx em pelo menos 50%
- Eliminar divergência de schema entre ambientes

## Coleta
- Captura por logs estruturados com timestamp, action, duração, status
- Consolidação diária por ambiente

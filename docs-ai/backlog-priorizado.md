# Backlog Priorizado

## Critérios
- Prioridade: P0 (crítico), P1 (alto), P2 (médio), P3 (baixo)
- Esforço: S, M, L
- Risco de mudança: baixo, médio, alto

## P0
1. Alinhar schema versionado ao schema real utilizado
- Esforço: L
- Risco: médio
- Resultado: deploy previsível

2. Remover dependência de auto-migração em runtime para produção
- Esforço: M
- Risco: médio
- Resultado: menos drift entre ambientes

3. Endurecer CORS e política de segredos
- Esforço: M
- Risco: baixo
- Resultado: redução imediata de exposição

## P1
1. Transacionar fluxos críticos de venda/checkout/webhook
- Esforço: L
- Risco: médio
- Resultado: integridade sob concorrência

2. Trocar loops N queries por operações em lote
- Esforço: L
- Risco: médio
- Resultado: ganho de performance para 20k+

3. Criar auditoria de ações administrativas sensíveis
- Esforço: M
- Risco: baixo
- Resultado: rastreabilidade e governança

## P2
1. Modularizar backend por domínio
- Esforço: L
- Risco: médio
- Resultado: manutenção e evolução mais rápidas

2. Reorganizar frontend por features
- Esforço: L
- Risco: médio
- Resultado: menor acoplamento e melhor testabilidade

## P3
1. Introduzir fila de jobs (email/PDF/webhooks pesados)
- Esforço: M/L
- Risco: médio
- Resultado: robustez operacional em pico

2. Normalizar totalmente `vendas.numeros_cartelas`
- Esforço: L
- Risco: alto
- Resultado: modelo de dados escalável e consistente

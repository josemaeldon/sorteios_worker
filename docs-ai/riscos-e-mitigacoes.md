# Riscos e Mitigações

## Risco: regressão funcional em fluxos críticos
- Probabilidade: média
- Impacto: alto
- Mitigação: smoke tests obrigatórios + rollout incremental

## Risco: incompatibilidade de schema entre ambientes
- Probabilidade: alta
- Impacto: alto
- Mitigação: migrations versionadas + validação de schema no startup

## Risco: dupla venda por corrida concorrente
- Probabilidade: média
- Impacto: alto
- Mitigação: transações + constraints/locks + idempotência em webhooks

## Risco: vazamento de segredo
- Probabilidade: média
- Impacto: alto
- Mitigação: secret manager/env seguro + mascaramento + rotação

## Risco: degradação com 20k+ cartelas
- Probabilidade: média
- Impacto: alto
- Mitigação: operações set-based + índices + teste de carga contínuo

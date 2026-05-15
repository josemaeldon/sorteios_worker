# Estratégia de Testes

## Níveis
1. Smoke tests (obrigatórios por fase)
2. Regressão funcional de fluxos críticos
3. Testes de concorrência para venda/webhook
4. Testes de carga para 20k+ cartelas

## Fluxos críticos mínimos
- Login/admin/usuário
- Criar sorteio/cartelas/atribuições
- Venda manual e reversão
- Loja pública checkout (single/multi)
- Confirmação webhook Stripe e Mercado Pago
- Assinatura e renovação

## Critério de saída por fase
- 0 regressões bloqueantes
- Sem aumento de erro 5xx
- Métricas dentro da meta da fase

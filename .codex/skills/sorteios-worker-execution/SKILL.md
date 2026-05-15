---
name: sorteios-worker-execution
description: Use esta skill ao trabalhar no projeto sorteios_worker para aplicar o plano existente em docs-ai, priorizar execução segura por fases e evitar mudanças arriscadas que ignorem migrações, segurança e checagens de regressão.
---

# Execução Sorteios Worker

## Quando usar
Use esta skill sempre que a solicitação envolver:
- mudanças de código no `sorteios_worker`
- decisões de arquitetura ou refatoração
- mudanças de banco/schema
- performance/escalabilidade
- reforço de segurança
- roadmap ou priorização

Se a tarefa não for relacionada a este repositório, não use esta skill.

## Fonte da verdade
Antes de propor ou implementar mudanças, use estes arquivos como referência canônica:
- `docs-ai/plano-melhoria.md`
- `docs-ai/diagnostico-completo.md`
- `docs-ai/backlog-priorizado.md`
- `docs-ai/roadmap-fases.md`
- `docs-ai/riscos-e-mitigacoes.md`
- `docs-ai/checklist-fase-0-1.md`
- `docs-ai/plano-migracoes-banco.md`
- `docs-ai/estrategia-testes.md`
- `docs-ai/metricas-e-baseline.md`

## Fluxo obrigatório
1. Identificar em qual fase a solicitação se encaixa (Fase 0..6).
2. Confirmar impacto esperado (segurança, performance, integridade, manutenibilidade).
3. Verificar se a tarefa altera schema/modelo de dados.
4. Se for relacionada a schema:
- exigir migração versionada primeiro
- evitar mutação de schema apenas em runtime como solução final
5. Para fluxos de risco (venda/webhook/checkout):
- exigir integridade transacional
- avaliar condição de corrida e idempotência
6. Definir escopo de validação:
- smoke test do fluxo afetado
- checagens de regressão dos caminhos críticos
7. Só então implementar mudanças.

## Guardrails
- Não introduzir quebra de API sem pedido explícito.
- Não pular estratégia de migração para mudanças de banco.
- Não contornar baseline de segurança (CORS, segredos, auth).
- Não misturar refatoração estrutural com mudança de regra de negócio em um único passo grande.
- Preferir mudanças incrementais e reversíveis.

## Política de prioridade
Use esta ordem, salvo se o usuário sobrescrever explicitamente:
1. Fase 0/1 fundamentos (baseline + migrações)
2. Fase 2 segurança
3. Fase 3 transações/performance
4. Fase 4 modularização do backend
5. Fase 5 modularização do frontend
6. Fase 6 operação em escala

## Padrões de implementação
- Preferir operações set-based no banco em vez de loop por linha.
- Manter escritas críticas dentro de transações explícitas.
- Adicionar/revisar índices com base nas queries reais.
- Separar responsabilidades por domínio (routes/services/repositories).
- Preservar comportamento atual e validar com testes direcionados.

## Formato de saída para tarefas do projeto
Ao responder tarefas do projeto, incluir:
1. Mapeamento de fase
2. Resumo das mudanças
3. Notas de risco
4. Validação executada (ou pendente)
5. Próximo passo seguro

## Roteamento rápido de tarefa
- "Ajuste de schema" -> Fase 1 + plano de migração
- "Falha em checkout/webhook" -> Fase 3 + revisão de transação/idempotência
- "Melhorar segurança" -> Fase 2
- "Refatorar server.js" -> Fase 4 (incremental)
- "Escalar 20k+" -> primeiro Fase 3, depois Fase 6

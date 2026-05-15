# Plano de Melhoria do Projeto Sorteios Worker

## Objetivo
Transformar o diagnóstico técnico em um plano de execução por fases, com foco em segurança, estabilidade, performance e escalabilidade (20.000 cartelas ou mais), sem quebrar o que já funciona.

## Escopo Avaliado
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express (monolito em `server.js`)
- Banco: PostgreSQL/MySQL via adapter
- Infra: Docker Compose + GHCR
- Regras de negócio: sorteios, cartelas, atribuições, vendas, loja pública, pagamentos, assinaturas, comprador

---

## 1) Arquitetura Atual (Resumo)

### Backend
- API centralizada em `backend_worker/server.js` (~6300 linhas).
- Endpoint principal `POST /api` com roteamento por `action`.
- Integrações com Stripe, Mercado Pago, Nodemailer e geração de PDF.
- `db-adapter.js` abstrai PostgreSQL e MySQL.

### Frontend
- Rotas principais em `frontend_worker/src/App.tsx`.
- Estado e regras distribuídos principalmente em `AuthContext` e `BingoContext`.
- Funcionalidades amplas: painel interno, admin, loja pública, sorteio público e streaming.

### Banco de Dados
- Schema versionado em `database/database-complete.sql`.
- Backend também executa auto-criação/auto-migração em runtime (`initSchema`).

### Docker / Deploy
- `docker-compose.yml` com serviços `postgres`, `backend`, `frontend`.
- Pipeline de publicação de imagens no GHCR.

---

## 2) O que já está bem construído
- Cobertura funcional ampla fim-a-fim.
- Fluxos críticos de negócio já implementados (venda, loja, pagamentos, validação de cartelas).
- JWT, permissões por role e rate limit por IP em ações sensíveis.
- Batch insert em pontos importantes (ex.: geração/importação de cartelas).
- Lazy loading no frontend para páginas principais.
- Compatibilidade PostgreSQL/MySQL com adapter único.

---

## 3) Problemas, Riscos e Pontos Frágeis

### 3.1 Manutenibilidade
- Monolito com alto acoplamento (`server.js` concentra tudo).
- Regras de negócio, acesso a dados e HTTP misturados no mesmo arquivo.

### 3.2 Consistência de Banco / Deploy
- Desalinhamento entre schema versionado e tabelas/colunas realmente usadas em runtime.
- Dependência de auto-migração no backend aumenta risco de drift entre ambientes.

### 3.3 Concorrência e Integridade
- Vários fluxos de venda/loja/pagamento sem transação ponta-a-ponta.
- Risco de corrida em compras simultâneas e webhooks concorrentes.

### 3.4 Performance
- Muitos loops com N queries (`for + INSERT/UPDATE` por item).
- Campos CSV (`vendas.numeros_cartelas`) dificultam consultas, integridade e escala.

### 3.5 Segurança
- CORS aberto (`origin: '*'`).
- Segredos sensíveis em configurações administráveis (gateway/email) sem camada dedicada de segredo.
- Ausência de trilha de auditoria robusta para ações críticas.

### 3.6 Frontend
- Contextos extensos e com múltiplas responsabilidades.
- Alta concentração de regras em componentes grandes (ex.: telas administrativas e loja).

---

## 4) Duplicações, Arquivos Desnecessários e Gargalos

### 4.1 Duplicação de lógica
- Fluxos de checkout confirmação/sincronização repetidos entre Stripe e Mercado Pago.
- Código duplicado entre fluxos single-cartela e multi-cartela.
- Repetição de lógica de configuração de gateway em diferentes telas.

### 4.2 Arquivos desnecessários versionados
- `node_modules/` em frontend e backend.
- `frontend_worker/dist/`.
- `*.tsbuildinfo`.
- Arquivo legado `DrawTab.old.tsx`.

### 4.3 Gargalos operacionais
- Processamento de lote por query individual em fluxos de alto volume.
- Limpezas e ajustes de integridade acontecendo em algumas rotas de leitura.
- Falta de fila para tarefas assíncronas (email, PDF, processamento pesado de webhook).

---

## 5) Avaliação de Segurança, Performance e Escalabilidade (20k+ cartelas)

### Segurança
- Nível atual: funcional, porém com exposições relevantes para produção.
- Prioridade: endurecer CORS, segredos, auditoria e políticas de acesso.

### Performance
- Banco suporta 20k+ cartelas com modelagem/índices corretos.
- Gargalo principal hoje está no padrão de acesso (N queries, loops, acoplamento de estados).

### Escalabilidade
- Sem filas, sem particionamento por domínio e sem estratégia clara de jobs.
- Crescimento para 20k+ é possível, mas com risco de degradação e inconsistências sob pico.

---

## 6) Plano de Ação por Fases (sem quebrar o que funciona)

## Fase 0 — Preparação e Baseline
**Objetivo:** reduzir risco de regressão antes de mexer na base.

### Ações
- Criar checklist de smoke tests dos fluxos críticos.
- Medir baseline de latência por `action` e taxa de erro.
- Garantir backup/restauração de banco em ambiente de homologação.

### Impacto
- Evita mudanças “cegas”.
- Permite validar se cada fase melhorou ou piorou o sistema.

---

## Fase 1 — Banco e Migrações (Prioridade Máxima)
**Objetivo:** estabilizar estrutura de dados e eliminar drift.

### Ações
- Criar pasta de migrações versionadas (ex.: `backend_worker/migrations`).
- Converter auto-migrações do `initSchema` em migrations formais.
- Alinhar `database/database-complete.sql` ao estado real exigido em runtime.
- Manter `initSchema` apenas para validação mínima em produção.

### Impacto
- Deploy previsível e repetível.
- Redução drástica de falhas por diferença entre ambientes.

---

## Fase 2 — Segurança
**Objetivo:** reduzir superfície de risco sem alterar regra funcional.

### Ações
- Restringir CORS por ambiente/domínio confiável.
- Revisar e endurecer políticas de autenticação/autorização.
- Implementar política de segredos (env/secret manager) para chaves de pagamento e SMTP.
- Incluir trilha de auditoria para ações admin sensíveis.

### Impacto
- Menor risco de vazamento/abuso.
- Melhor governança operacional.

---

## Fase 3 — Integridade Transacional e Performance
**Objetivo:** suportar volume alto com consistência.

### Ações
- Encapsular fluxos críticos em transações completas (venda, baixa de cartela, webhook).
- Substituir loops por operações em lote (`UNNEST`, updates set-based, inserts em massa).
- Reduzir processamento em memória para listas muito grandes.
- Revisar índices com base nas queries mais pesadas.

### Impacto
- Menos inconsistências em concorrência.
- Melhor throughput para 20k+ cartelas.

---

## Fase 4 — Refatoração Incremental de Backend
**Objetivo:** aumentar mantenibilidade e velocidade de evolução.

### Ações
- Quebrar `server.js` por domínio:
  - `routes/`
  - `services/`
  - `repositories/`
  - `integrations/` (Stripe/MP/Email)
- Criar camada de validação de payload por ação.
- Isolar utilitários e erros padronizados.

### Impacto
- Menor risco de regressão em mudanças futuras.
- Onboarding técnico mais rápido.

---

## Fase 5 — Frontend em Features
**Objetivo:** reduzir acoplamento e melhorar evolução de UI/regra.

### Ações
- Migrar estrutura para `features/<dominio>`.
- Reduzir tamanho de contextos globais; mover estado remoto para React Query por domínio.
- Extrair lógica repetida de gateways/pagamentos para hooks e serviços comuns.

### Impacto
- Menos complexidade por tela.
- Maior previsibilidade de estado e menor retrabalho.

---

## Fase 6 — Operação e Escala
**Objetivo:** robustez em pico real de uso.

### Ações
- Introduzir fila para jobs assíncronos (email, PDF, processamento de webhook pesado).
- Definir observabilidade mínima (logs estruturados, métricas de erro/latência).
- Executar testes de carga progressivos (20k, 50k) com cenários reais.

### Impacto
- Sistema mais estável sob carga alta.
- Diagnóstico rápido de gargalos em produção.

---

## 7) Priorização Prática
1. Fase 0 (baseline mínimo)
2. Fase 1 (migrações e alinhamento de schema)
3. Fase 2 (segurança)
4. Fase 3 (transações e performance)
5. Fase 4 (refatoração backend)
6. Fase 5 (refatoração frontend)
7. Fase 6 (operação e escala)

---

## 8) Estrutura Ideal Recomendada

### Backend (alvo)
- `backend_worker/src/http/routes/*`
- `backend_worker/src/domain/services/*`
- `backend_worker/src/infra/repositories/*`
- `backend_worker/src/infra/integrations/*`
- `backend_worker/src/jobs/*`
- `backend_worker/src/shared/*`

### Banco (alvo)
- Migrations versionadas e idempotentes.
- Normalizar relacionamento de cartelas vendidas (evitar CSV em `numeros_cartelas`).
- Reforçar constraints para evitar dupla venda em concorrência.

### Frontend (alvo)
- `frontend_worker/src/features/<dominio>/{components,hooks,api,types}`
- Contexto global apenas para sessão/autenticação e preferências globais.

---

## 9) Regras para execução sem quebra
- Sempre preservar compatibilidade de API durante transição.
- Introduzir mudanças de schema com migração reversível quando possível.
- Validar cada fase com smoke tests e comparação de baseline.
- Não alterar regra de negócio sem teste de regressão dos fluxos críticos.

---

## 10) Próximo passo recomendado
Iniciar pela **Fase 0 + Fase 1** em um PR dedicado com:
- inventário completo de schema real vs versionado,
- pacote de migrações iniciais,
- checklist de validação pós-migração.

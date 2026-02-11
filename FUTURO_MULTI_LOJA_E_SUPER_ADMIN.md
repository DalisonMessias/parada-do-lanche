# Plano Futuro: Multi-loja + Super Admin

## Aviso Importante

Este arquivo e somente um plano de referencia futura.
Nao implementar nada deste documento sem aprovacao explicita do dono do projeto (Dalison Messias).
Qualquer agente/IA deve tratar este conteudo como "nao executar automaticamente".
Antes de qualquer acao, pedir confirmacao e escopo aprovado.

Este documento e um rascunho de decisao para voce revisar depois.
Objetivo: transformar o sistema atual (loja unica) em SaaS multi-loja com painel global de administracao.

## Objetivo

- Permitir varias lojas no mesmo sistema.
- Isolar dados por loja.
- Ter um painel super admin para gerenciar todas as lojas.
- Facilitar cobranca, manutencao e suporte.

## Escopo Fase 1 (base multi-loja)

- Criar tabela `stores`.
- Criar tabela `store_users` (usuarios por loja, com papel).
- Adicionar `store_id` nas tabelas de negocio:
  - `settings`
  - `categories`
  - `products`
  - `tables`
  - `sessions`
  - `session_guests`
  - `cart_items`
  - `orders`
  - `order_items`
  - `profiles` (ou separar perfil global de membership por loja)
- Ajustar queries do frontend/backend para sempre filtrar por `store_id`.
- Ativar RLS por loja (cada usuario enxerga somente sua loja).

## Escopo Fase 2 (painel super admin)

- Nova area: `/#/super-admin` (ou rota dedicada).
- Funcoes principais:
  - Criar/editar/desativar loja.
  - Vincular usuarios a loja e papel (ADMIN, MANAGER, WAITER).
  - Ver status de assinatura/plano.
  - Ver metricas basicas por loja (pedidos, faturamento, mesas ativas).
  - Impersonacao controlada (opcional, com log).
- Auditoria:
  - Tabela de logs administrativos (`admin_audit_logs`).

## Escopo Fase 3 (cobranca)

- Planos por loja (ex: Basico, Pro).
- Controle de status:
  - `trialing`, `active`, `past_due`, `canceled`.
- Bloqueio suave de features quando inadimplente.
- Integracao futura com gateway (Stripe, Asaas, Mercado Pago etc.).

## Modelo de dados sugerido (resumo)

- `stores (id, name, slug, status, created_at)`
- `store_users (id, store_id, user_id, role, created_at)`
- `subscriptions (id, store_id, plan, status, renewal_date, created_at)`
- `admin_audit_logs (id, actor_user_id, store_id, action, metadata, created_at)`

## Estrategia de migracao (sem quebrar o sistema)

1. Criar `stores` e loja padrao (ex: "Loja Principal").
2. Adicionar `store_id` nas tabelas com `default` para loja padrao.
3. Backfill dos dados existentes para `store_id` da loja padrao.
4. Tornar `store_id` obrigatorio (`not null`) nas tabelas.
5. Ajustar frontend para operar com contexto de loja.
6. So depois ativar RLS por loja.

## Riscos e cuidados

- Risco de vazamento entre lojas se alguma query esquecer `store_id`.
- RLS mal configurado pode bloquear operacao legitima.
- Migracao em producao precisa backup e janela de manutencao.
- Storage (logos/imagens) tambem deve ter separacao por loja em path/bucket.

## Decisoes pendentes (para voce escolher depois)

- `profiles` global + `store_users` (recomendado) ou perfil por loja.
- Uma conta poder acessar varias lojas? (sim/nao)
- Super admin separado dos admins de loja? (recomendado: sim)
- Cobranca por loja ou por usuario?
- Ter white-label por loja desde o inicio ou depois?

## Entrega sugerida por etapas

- Etapa A: Base de dados multi-loja + ajustes de leitura/escrita.
- Etapa B: RLS por loja + testes de seguranca.
- Etapa C: Painel super admin.
- Etapa D: Cobranca e automacoes.

## Estimativa alta (referencia)

- Etapa A+B: media complexidade
- Etapa C: media/alta
- Etapa D: alta (depende gateway e regras financeiras)

---

Se decidir implementar, este arquivo vira checklist de execucao.

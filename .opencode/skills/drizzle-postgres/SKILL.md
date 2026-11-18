---
name: Drizzle PostgreSQL
description: Schemas, migrations, transações, constraints, bloqueios e integridade com Drizzle ORM + PostgreSQL 18 no Master Transporte.
---

# Drizzle + PostgreSQL — persistência e concorrência

## Quando usar

Tarefas com schema de banco, migrations, consultas, transações, índices/constraints, locks ou correção de concorrência.

## Regras do projeto (resumo operacional)

- Driver: `postgres` (postgres.js) + `drizzle-orm` 0.x, migrations via `drizzle-kit` (`drizzle.config.ts`). Relações: API 0.x (não `defineRelations` 1.0) — ver `docs/drizzle/relacoes.md`.
- Acesso a dados **somente** em `src/repositories/`; services não escrevem SQL direto.
- **Migrations já aplicadas não são alteradas.** Mudanças de schema = nova migration + estratégia de compatibilidade com dados existentes (`docs/drizzle/migrations.md`).
- Mantenha invariantes com transações e operações atômicas (`docs/drizzle/transacoes.md`): não substitua concorrência segura por read-then-write.
- Unicidade e integridade ficam no PostgreSQL (constraints), não só na aplicação. Zod valida forma; banco garante invariantes.
- Políticas temporais: `timestamptz` para instantes, `date` para datas civis (`docs/temporal/schema-e-banco.md`).
- Sem resets/seeds destrutivos/push em bancos não descartáveis sem autorização explícita.

## Armadilhas técnicas

- `ON CONFLICT` exige constraint/índice único correspondente real no banco.
- Níveis de isolamento: leia `docs/drizzle/diagnostico-postgres.md` e a doc de iso (link abaixo) antes de "consertar" race condition com retry cego.
- Soft delete, unicidade parcial e índices por expressão existem no projeto — verifique a regra real de cada entidade antes de generalizar.
- Contagem de linhas/limites: use `count()`/`limit` no SQL, não em memória.

## Referências (consultar conforme a necessidade)

Catálogo completo: `docs/references.md` e `docs/drizzle/referencias.md`. Páginas principais:

- Drizzle + PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql
- Índices e constraints: https://orm.drizzle.team/docs/indexes-constraints
- Transações: https://orm.drizzle.team/docs/transactions
- Migrations: https://orm.drizzle.team/docs/migrations
- PostgreSQL 18 — transactions/iso: https://www.postgresql.org/docs/18/transaction-iso.html
- PostgreSQL 18 — constraints: https://www.postgresql.org/docs/18/ddl-constraints.html

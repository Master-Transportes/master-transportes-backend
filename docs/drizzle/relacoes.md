# Relações: `references()` ≠ `relations()`

Diferença fundamental, frequente fonte de confusão:

## `references()` — foreign key real

```ts
userId: uuid("user_id")
  .notNull()
  .references(() => users.id, { onDelete: "cascade" })
```

Cria uma **FK real no PostgreSQL**, aplicada pelo próprio banco. É garantia de
integridade. Neste projeto, `references()` gera FK física no DDL das migrations.

## `relations()` — relações para consultas relacionais

No Drizzle 0.45.x, `relations()` descreve relações para o `db.query`
(`db.query.users.findFirst({ with: ... })`). **Não cria constraint** no banco.

Exemplo compatível com a linha 0.x:

```ts
import { relations } from "drizzle-orm";
import { users, userRoles, sessions } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  sessions: many(sessions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
```

> **Não criar esse código se já existe** um `relations.ts` equivalente no projeto
> (`src/infra/database/relations.ts`).

## Um não substitui o outro

- `references()` sem `relations()`: FK funciona, mas `db.query` relacional não.
- `relations()` sem `references()`: `db.query` funciona, mas o banco não garante
  integridade.

Ambos convivem no projeto por propósito diferente.

## ⚠️ Ambiguidade proprietário × revisor

`driver_profiles` e `driver_documents` têm **duas** referências a `users`:
o proprietário (`userId`) e o revisor (`reviewedByUserId`).

Se ambas forem expostas como relações do ORM, é preciso diferenciá-las com
**`relationName`**, senão as relações ficam ambíguas (API suportada na linha 0.x).

**Pendente de auditoria:** o conteúdo real de `src/infra/database/relations.ts` não
foi revisado. Consigo avaliar as FKs, mas não confirmar se as relações declaradas
para `db.query` estão corretas e sem ambiguidade. Verificar ao tocar nessas tabelas.

## ❌ Não migrar para a API v2 preventivamente

A documentação mais recente usa `defineRelations()` (linha 1.0). **Não migrar**
`relations()` para `defineRelations()` apenas porque a doc nova a utiliza — a API
pertence à evolução da 1.0 e este projeto está na 0.45.x (ver
[`versoes-e-compatibilidade.md`](./versoes-e-compatibilidade.md)).

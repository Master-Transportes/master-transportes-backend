# Conexão com PostgreSQL (postgres.js)

> Este documento descreve o padrão de conexão. A implementação real fica em
> `src/infra/database/drizzle.ts` — **verificar o código vigente antes de alterar**.

## Exemplo de configuração

O projeto usa `postgres.js` (`postgres`) + `drizzle-orm/postgres-js`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada");
}

export const sql = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });
```

Exemplo ilustrativo — não substituir a configuração existente sem justificativa.

## Cuidados importantes

### Pool de conexões

`max: 10` é um limite **por instância do cliente**. Dez processos com esse limite
podem somar **cem conexões** ao PostgreSQL. Dimensionar conforme réplicas, banco e
carga real.

### Ciclo de vida

- **Não** criar um novo cliente PostgreSQL por requisição.
- **Reutilizar** o pool e encerrá-lo de forma controlada quando o processo desligar.

### Transações

Operações atômicas usam `db.transaction()` — e **todas** as consultas participantes
devem usar o objeto transacional recebido, não o `db` global. Ver
[`transacoes.md`](./transacoes.md).

### Segurança

- TLS em ambientes remotos quando exigido.
- Credenciais com permissões mínimas.
- Segredos fora do código-fonte (`src/config/env.ts` / `.env` neste projeto).

### Prepared statements

O `postgres.js` os usa por padrão. Se futuramente houver um pooler externo em modo
de transação (ex.: PgBouncer), verificar compatibilidade e possível necessidade de
`prepare: false` — **sem desativar preventivamente** no ambiente atual.

## Drivers suportados

O Drizzle oferece suporte oficial a `postgres.js` e `node-postgres`. **Não trocar**
de driver apenas por suposta superioridade — o projeto já está no driver adequado.

## Referência

- [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle — Connection details](https://orm.drizzle.team/docs/connect-overview)

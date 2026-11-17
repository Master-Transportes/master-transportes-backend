# Referências oficiais — Drizzle, PostgreSQL e Docker

| Tema | Link |
|---|---|
| Drizzle com PostgreSQL | https://orm.drizzle.team/docs/get-started-postgresql |
| Declaração de schema | https://orm.drizzle.team/docs/sql-schema-declaration |
| Índices e constraints | https://orm.drizzle.team/docs/indexes-constraints |
| Migrations do Drizzle | https://orm.drizzle.team/docs/migrations |
| Referência do `drizzle.config.ts` | https://orm.drizzle.team/docs/drizzle-config-file |
| Relações v1 versus v2 | https://orm.drizzle.team/docs/relations-v1-v2 |
| PostgreSQL 18 — Constraints | https://www.postgresql.org/docs/18/ddl-constraints.html |
| PostgreSQL 18 — Date/Time Types | https://www.postgresql.org/docs/18/datatype-datetime.html |
| PostgreSQL 18 — Date/Time Functions | https://www.postgresql.org/docs/18/functions-datetime.html |
| Imagem oficial PostgreSQL no Docker | https://hub.docker.com/_/postgres |

## O que cobrir em cada link

- **Get started PostgreSQL** — drivers, configuração de conexão, integração com
  PostgreSQL (inclui `postgres.js`, driver deste projeto).
- **Schema declaration** — estrutura de tabelas e tipos no código TypeScript.
- **Indexes & constraints** — PKs, índices únicos (inclusive parciais e por expressão),
  checks, `references()`.
- **Migrations** — `generate`, `check`, `migrate`, estratégias de versionamento.
- **drizzle.config.ts** — opções de configuração, credenciais e histórico de migrações.
- **Relations v1 vs v2** — distinguir a API do Drizzle 0.x (usada aqui) da nova
  linha 1.0 (`defineRelations`). Ver [`relacoes.md`](./relacoes.md).
- **PostgreSQL Constraints** — regras reais de integridade aplicadas pelo banco
  (FK, CHECK, unicidade, semântica de NULL em CHECK).
- **Date/Time** — comportamento de `timestamptz`, `AT TIME ZONE`, `now()` e
  funções relacionadas (base da política temporal em `../temporal/`).
- **Docker Hub postgres** — volumes, variáveis, particularidades da imagem do
  PostgreSQL 18 (ver [`diagnostico-postgres.md`](./diagnostico-postgres.md)).

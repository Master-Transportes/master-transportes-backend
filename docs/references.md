# Referências técnicas oficiais — Master Transporte

Catálogo central de links oficiais, organizado por assunto. **Não carregue tudo de
uma vez**: consulte `webfetch` apenas na página pertinente à dúvida atual. As
referências por domínio já existem em `docs/api/referencias.md`,
`docs/pubsub/referencias.md`, `docs/drizzle/referencias.md`,
`docs/streaming/referencias.md` e prevalecem com detalhe maior nos seus assuntos.

Antes de usar, verifique a versão efetivamente instalada em `package.json`
(`encore.dev`, `drizzle-orm`, `ioredis`, `zod`, `postgres`) e confira se o
comportamento descrito vale para ela.

## Encore.ts

| Documento | Tema |
|---|---|
| [Docs TS](https://encore.dev/docs/ts) | Índice geral da documentação TypeScript |
| [APIs](https://encore.dev/docs/ts/primitives/apis) | `api()`, contratos, `sensitive`, `tags` |
| [Auth Handler](https://encore.dev/docs/ts/develop/auth) | AuthHandler, identidade e propagação de auth |
| [Middleware](https://encore.dev/docs/ts/develop/middleware) | Middleware seletivo, `target.tags`, ordem |
| [Streaming APIs](https://encore.dev/docs/ts/primitives/streaming-apis) | Streaming, ciclo de vida de conexões |
| [Pub/Sub (primitiva)](https://encore.dev/docs/ts/primitives/pubsub) | Topic, Subscription, publicação, consumo |
| [Pub/Sub (runtime/self-host)](https://encore.dev/docs/ts/runtime/pubsub) | Runtime, NSQ, configuração local |
| [API Errors](https://encore.dev/docs/ts/primitives/errors) | `APIError`, códigos, `withDetails` |
| [Request Validation](https://encore.dev/docs/ts/develop/validation) | Validação de requests |
| [Service Communication](https://encore.dev/docs/ts/primitives/service-communication) | `~encore/clients`, `service.ref()` |
| [Drizzle ORM](https://encore.dev/docs/ts/develop/orms/drizzle) | Integração Drizzle com Encore |
| [MCP](https://encore.dev/docs/mcp) | MCP local do Encore (inspeção de app) |
| [Self-host: configure infra](https://encore.dev/docs/self-host/configure-infra) | Infraestrutura self-hosted |
| [AI Integration](https://encore.dev/docs/ai-integration) | Integrações de IA com apps Encore |

## PostgreSQL 18 e Drizzle ORM

| Documento | Tema |
|---|---|
| [Docs PostgreSQL 18](https://www.postgresql.org/docs/18/) | Índice geral |
| [Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | Níveis de isolamento, concorrência |
| [Constraints (DDL)](https://www.postgresql.org/docs/18/ddl-constraints.html) | FK, CHECK, unicidade |
| [Drizzle Overview](https://orm.drizzle.team/docs/overview) | Conceitos do ORM |
| [Drizzle Transactions](https://orm.drizzle.team/docs/transactions) | Transações e savepoints |
| [Drizzle Migrations](https://orm.drizzle.team/docs/migrations) | `generate`, `migrate`, versionamento |
| [Drizzle com Encore](https://encore.dev/docs/ts/develop/orms/drizzle) | Padrão do projeto (`postgres` + Drizzle) |

## Redis 7.2 e ioredis

| Documento | Tema |
|---|---|
| [Docs Redis](https://redis.io/docs/latest/) | Índice geral |
| [GEOADD](https://redis.io/docs/latest/commands/geoadd/) | Registro de coordenadas |
| [GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/) | Busca geográfica por raio |
| [EVAL](https://redis.io/docs/latest/commands/eval/) | Scripts Lua |
| [Programmability: Eval intro](https://redis.io/docs/latest/develop/programmability/eval-intro/) | Atomicidade com Lua |
| [ioredis (GitHub)](https://github.com/redis/ioredis) | API do cliente, tipos de retorno |

## TypeScript e Zod

| Documento | Tema |
|---|---|
| [TS Docs](https://www.typescriptlang.org/docs/) | Índice geral |
| [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) | Type guards e `unknown` |
| [Zod](https://zod.dev/) | Schemas, `validateOrThrow`, `z.infer` |

## Arquitetura e qualidade

| Documento | Tema |
|---|---|
| [Design Patterns (TS)](https://refactoring.guru/design-patterns/typescript) | Padrões com exemplos TS |
| [Catálogo de refatoração](https://refactoring.guru/refactoring/catalog) | Técnicas nomeadas |
| [Martin Fowler — Architecture](https://martinfowler.com/architecture/) | Artigos de arquitetura |
| [Patterns of Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/index.html) | Idempotência, retry, lease, etc. |

## NSQ e Docker

| Documento | Tema |
|---|---|
| [NSQ](https://nsq.io/) | Visão geral do NSQ |
| [NSQ Design](https://nsq.io/overview/design.html) | Garantias, at-least-once, ordenação |
| [Docker Compose](https://docs.docker.com/compose/) | Composição da infra local (`docker-compose.yml`) |

## Testes

| Documento | Tema |
|---|---|
| [Bun — test runner](https://bun.com/docs/cli/test) | Runner usado via `encore exec -- bun test` |

## Como usar este catálogo

1. Identifique o assunto da dúvida e abra apenas o link correspondente.
2. Confirme a versão instalada (`package.json`, `encore version`) antes de aplicar exemplos.
3. O código, os contratos reais e os testes deste repositório têm prioridade sobre exemplos genéricos da documentação.

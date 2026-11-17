# Referências oficiais — Encore.ts

Fontes principais da documentação oficial, para aprofundar assinaturas, configurações e
exemplos.

| Tema | Link |
|---|---|
| Streaming APIs | https://encore.dev/docs/ts/primitives/streaming-apis |
| Referência do módulo `encore.dev/api` | https://encore.dev/docs/ts/runtime/api |
| Pub/Sub | https://encore.dev/docs/ts/primitives/pubsub |
| Bancos SQL | https://encore.dev/docs/ts/primitives/databases |
| Drizzle ORM com Encore | https://encore.dev/docs/ts/develop/orms/drizzle |
| Autenticação | https://encore.dev/docs/ts/develop/auth |
| Caching e Redis | https://encore.dev/docs/ts/primitives/caching |
| Geração de clientes | https://encore.dev/docs/ts/cli/client-generation |
| Exemplo oficial: chat em tempo real | https://github.com/encoredev/examples/tree/main/ts/streaming-chat |
| Exemplos oficiais das três modalidades | https://github.com/encoredev/examples/tree/main/ts/streaming |

## O que cobrir em cada link

- **Streaming APIs** — os três tipos de stream, handshake, autenticação, broadcast,
  cliente e comunicação entre serviços.
- **Referência `encore.dev/api`** — interfaces e tipos, métodos `send()` e `close()`,
  definições de `StreamIn`, `StreamOut` e `StreamInOut`.
- **Pub/Sub** — topics, subscriptions, publicação, retentativas, garantias de entrega e DLQ.
- **Bancos SQL** — PostgreSQL, migrações, SQL parametrizado, consultas e transações.
- **Drizzle** — integração oficial com Drizzle e configuração de migrações (padrão usado
  neste projeto).
- **Autenticação** — AuthHandler, `getAuthData`, propagação da identidade e controle de acesso.
- **Caching** — clusters, keyspaces, expiração, tipos de dados e comportamento do cache local.
- **Geração de clientes** — clientes TypeScript, JavaScript, Go e contratos OpenAPI.

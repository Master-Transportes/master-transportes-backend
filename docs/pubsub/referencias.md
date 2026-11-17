# Referências oficiais — Pub/Sub no Encore.ts

| Tema | Link |
|---|---|
| Pub/Sub — docs oficiais | https://encore.dev/docs/ts/primitives/pubsub |
| Referência do SDK (`encore.dev/pubsub`) | https://encore.dev/docs/ts/runtime/pubsub |
| Self-hosting: configuração de infraestrutura | https://encore.dev/docs/self-host/configure-infra |
| Infraestrutura por ambiente | https://encore.dev/docs/platform/infrastructure/infra |
| Exemplo oficial event-driven | https://github.com/encoredev/examples/tree/main/ts/simple-event-driven |

## O que cobrir em cada link

- **Docs oficiais (primitives)** — conceitos: Topics, subscriptions, publicação,
  retentativas, garantias de entrega e DLQ.
- **Referência do SDK** — `TopicConfig`, `SubscriptionConfig`, `retryPolicy`,
  `ackDeadline`, `messageRetention`, `maxConcurrency`, `Attribute`, `orderingAttribute`,
  `ref<Publisher>()`.
- **Self-hosting** — providers configuráveis fora da plataforma gerenciada (NSQ,
  GCP Pub/Sub, AWS SNS/SQS) e parâmetros do arquivo de infraestrutura. Relevante para
  decidir como este projeto será implantado (ver
  [`infra-e-limites.md`](./infra-e-limites.md)).
- **Infraestrutura por ambiente** — diferenças entre desenvolvimento local, AWS e GCP.
- **Exemplo oficial** — arquitetura orientada a eventos completa para comparar com a
  proposta desta pasta.

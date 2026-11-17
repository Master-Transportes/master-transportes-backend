# Topics e Subscribers na prática

## Regras de declaração

- `Topic` é declarado no **escopo do módulo** (package-level), **nunca** criado
  dinamicamente dentro de funções.
- Cada Topic precisa de: nome único, tipo de evento e configuração de entrega.
- Declarações de `Subscription` devem ficar em módulos associados a **serviços
  reconhecidos pelo Encore**.

## Exemplo adaptado ao domínio existente: conta criada

O domínio de identidade já existe neste projeto, então o evento de conta criada é o
exemplo didático válido. (`ride-*` é o futuro domínio de corridas — ver
[`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md).)

### `identity-events.ts` — contrato + Topic

```ts
import { Topic } from "encore.dev/pubsub";

export interface AccountCreatedEvent {
  eventId: string;
  userId: string;
  occurredAt: string;
}

export const accountCreated = new Topic<AccountCreatedEvent>(
  "account-created",
  {
    deliveryGuarantee: "at-least-once",
  },
);
```

Detalhes do contrato:

- **`eventId`** — identificador da operação de negócio, escolhido pela aplicação.
  **Não** é o ID de publicação retornado pelo broker. É a base da idempotência (ver
  [`garantias-e-falhas.md`](./garantias-e-falhas.md)).
- **`occurredAt`** — instante do acontecimento de negócio, **ISO 8601 UTC** (ver
  [`../temporal/README.md`](../temporal/README.md)).

### Publicando após um cadastro

```ts
import { accountCreated } from "./identity-events";

async function afterAccountCreated(userId: string) {
  const publicationId = await accountCreated.publish({
    eventId: crypto.randomUUID(),
    userId,
    occurredAt: new Date().toISOString(),
  });

  return publicationId;
}
```

`publish()` retorna uma `Promise<string>`. O exemplo demonstra a publicação — a
criação da conta e a publicação **ainda não** estão ligadas atomicamente (tratado em
[`garantias-e-falhas.md`](./garantias-e-falhas.md)).

### Dois Subscribers independentes

```ts
import { Subscription } from "encore.dev/pubsub";
import { accountCreated } from "./identity-events";

const welcomeSubscriber = new Subscription(
  accountCreated,
  "welcome-account",
  {
    handler: async (event) => {
      console.log("Boas-vindas para:", event.userId);
    },
  },
);

const auditSubscriber = new Subscription(
  accountCreated,
  "audit-account",
  {
    handler: async (event) => {
      console.log("Auditar evento:", event.eventId);
    },
  },
);
```

As duas assinaturas recebem a publicação **independentemente**: se a primeira falhar,
a segunda não falha por consequência.

> O exemplo usa logs para ensinar a API; implementação real de notificação/auditoria
> persistente é outro passo. No projeto, handlers ficam em services — regra, SQL e
> persistência seguem o padrão `AGENTS.md`.

## ⚠️ Subscriber ≠ réplica

Uma assinatura lógica do Encore recebe eventos **para processamento** — isso **não**
significa que o evento será executado em todas as instâncias da aplicação. Portanto,
uma `Subscription` que apenas chama uma função sobre o **mapa local de WebSockets**
**não** é solução para múltiplas réplicas (ver
[`../streaming/redis-e-distribuicao.md`](../streaming/redis-e-distribuicao.md)).

## Referências de Topic: `topic.ref<Publisher>()`

Funcionalidade menos conhecida: o Encore usa **análise estática** para descobrir quais
serviços publicam e consomem cada Topic. Passar livremente objetos `Topic` por funções
e classes dificulta a identificação de permissões/recursos.

`ref<Publisher>()` permite transferir a **capacidade de publicar** sem expor o objeto
completo:

```ts
import { Publisher } from "encore.dev/pubsub";
import { rideAccepted } from "./events";

const publisher = rideAccepted.ref<Publisher>();

export async function publishEvent(event: RideAcceptedEvent) {
  return publisher.publish(event);
}
```

- A referência deve ser criada **dentro de um serviço** reconhecido pelo Encore.
- Atualmente `Publisher` é a permissão de referência documentada.

> **Não introduzir agora** neste projeto, a menos que serviços realmente precisem
> receber publishers por injeção de dependência ou composição semelhante.

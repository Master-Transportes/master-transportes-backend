# Encore Pub/Sub e comunicação entre serviços

> **Nota:** esta página cobre o caso específico de **streaming entre serviços Encore**.
> A referência completa de Pub/Sub (topics, garantias de entrega, idempotência, DLQ,
> Outbox, ordenação, providers) está em [`../pubsub/README.md`](../pubsub/README.md).

## Para que serve o Pub/Sub nativo

Especialmente útil quando uma operação concluída precisa desencadear outras operações em
**serviços diferentes**. Exemplo: um motorista aceitou uma corrida — pode ser necessário
atualizar métricas, gerar notificação e registrar auditoria.

```ts
import { Topic, Subscription } from "encore.dev/pubsub";

interface RideAcceptedEvent {
  rideId: string;
  passengerId: string;
  driverId: string;
}

export const rideAccepted = new Topic<RideAcceptedEvent>("ride-accepted", {
  deliveryGuarantee: "at-least-once",
});

// Após a operação de negócio ser concluída:
async function publishRideAccepted(event: RideAcceptedEvent) {
  await rideAccepted.publish(event);
}

// Um consumidor de eventos.
const notificationSubscriber = new Subscription(
  rideAccepted,
  "notify-ride-accepted",
  {
    handler: async (event) => {
      // Enfileirar ou registrar uma notificação.
      // A operação precisa ser IDEMPOTENTE.
      console.log(event.rideId);
    },
  },
);
```

Um `Topic<T>` publica eventos tipados; `Subscription` registra um consumidor. A entrega
pode ser `at-least-once` ou `exactly-once` — mas mesmo a segunda **não elimina
totalmente** a possibilidade de reentrega.

## ⚠️ Consumidores ≠ réplicas

Uma `Subscription` lógica do Encore recebe eventos **para processamento**; isso **não**
significa que o evento será executado em todas as instâncias. Portanto, uma `Subscription`
que apenas chama uma função sobre o **mapa local de WebSockets** **não** é solução
garantida para múltiplas réplicas. Para isso, veja
[`redis-e-distribuicao.md`](./redis-e-distribuicao.md).

## O problema da dupla escrita

Para eventos importantes:

```
1. Atualizar a corrida no PostgreSQL.
2. Publicar o evento no broker.
```

Se o processo morrer **entre** as duas operações, o banco está atualizado, mas o evento
**pode nunca ser publicado**.

**Solução arquitetural — Transactional Outbox:** gravar a alteração de negócio **e** o
evento pendente **na mesma transação** do PostgreSQL; depois, um processo de publicação
com tentativas e idempotência publica os eventos.

Essencial para: pagamentos, cancelamentos, aceitação de corridas e outros eventos que
**não podem simplesmente desaparecer**.

## Streaming entre serviços Encore

Outro caso: streaming **entre dois serviços do próprio Encore** (não apenas app ↔ backend),
via `~encore/clients`:

```ts
import { chat } from "~encore/clients";

async function connectInternalService() {
  const stream = await chat.connect();

  await stream.send({
    conversationId: "...",
    clientMessageId: "...",
    text: "Evento interno",
  });

  for await (const message of stream) {
    console.log(message);
  }
}
```

### Cuidados

- A chamada interna precisa **respeitar ou implementar explicitamente o contexto de
  autorização** necessário — não basta ser outro serviço para ganhar acesso às mensagens.
- Endpoints somente internos: declarar com `expose: false`.
- Para comunicação assíncrona de negócio entre serviços, **preferir `Topic`/`Subscription`**
  em vez de manter conexões WebSocket internas continuamente abertas. Reserve o streaming
  interno para casos em que o fluxo contínuo efetivamente traz vantagem.

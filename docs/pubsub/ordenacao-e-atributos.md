# Ordenação e atributos

## `Attribute<T>`

Normalmente, os campos do evento são serializados no **payload JSON**. Campos
marcados como `Attribute<T>` podem ser utilizados **pela infraestrutura** para
funcionalidades como ordenação e filtros.

## Ordenação por entidade: `orderingAttribute`

```ts
import { Topic, Attribute } from "encore.dev/pubsub";

interface RideStateEvent {
  eventId: string;
  rideId: Attribute<string>;
  version: number;
  status: string;
  occurredAt: string;
}

export const rideStateChanged = new Topic<RideStateEvent>(
  "ride-state-changed",
  {
    deliveryGuarantee: "at-least-once",
    orderingAttribute: "rideId",
  },
);
```

Eventos da mesma corrida preservam a ordem de publicação (conforme a garantia do
provider); chaves diferentes progridem independentemente:

```
Corrida 123                Corrida 456
1. accepted                1. accepted
2. started                 2. cancelled
3. completed
```

```ts
await rideStateChanged.publish({
  eventId: crypto.randomUUID(),
  rideId: "ride-123",
  version: 2,
  status: "accepted",
  occurredAt: new Date().toISOString(),
});
```

## ⚠️ Três cuidados da documentação

1. **Tópicos são não ordenados por padrão** — favorecem maior paralelismo.
2. **`orderingAttribute` não tem efeito no ambiente local** do Encore.
3. **Head-of-line blocking**: se um evento falha, os seguintes **da mesma chave**
   podem ficar bloqueados até serem processados ou descartados para DLQ.

A ordem garantida é a **de publicação** — não necessariamente a ordem em que duas
transações concorrentes começaram.

## O banco decide o estado válido — não o broker

Para corridas, **não depender exclusivamente da ordenação do broker**. O PostgreSQL
deve continuar validando as transições de estado.

Adicionar uma **versão monotônica** da entidade, mantida no PostgreSQL:

```
ride-123
  versão 1: searching
  versão 2: accepted
  versão 3: in_progress
  versão 4: completed
```

O consumidor pode **rejeitar eventos de versão anterior** ao último estado aplicado,
seguindo uma política para lacunas de sequência.

> **Ordenação do broker ajuda; o banco continua decidindo qual é o estado válido.**
> A decisão de estado transacional está em
> [`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md).

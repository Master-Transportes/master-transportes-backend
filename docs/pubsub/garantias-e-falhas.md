# Garantias de entrega, idempotência, retentativas e Outbox

## As duas modalidades

| Garantia        | Comportamento                                                            |
| --------------- | ------------------------------------------------------------------------ |
| `at-least-once` | Mensagem **pode ser entregue mais de uma vez**                            |
| `exactly-once`  | Infraestrutura reduz a chance de reentrega, **mas não elimina duplicações** |

**Recomendação inicial: `at-least-once`.** O sistema tenta assegurar o processamento,
podendo reenviar quando não recebe confirmação de sucesso.

> ⚠️ Mesmo com `exactly-once`, **mantenha idempotência nas operações críticas**:
> a documentação alerta para reentregas excepcionais, e a modalidade **não deduplica
> duas chamadas independentes de `publish()`** com o mesmo conteúdo.

Limites de vazão documentados (dependem do provedor/contexto): ~300 msg/s por Topic
em AWS; cotas regionais no GCP. Detalhes em [`infra-e-limites.md`](./infra-e-limites.md).

## Por que idempotência é obrigatória

Mesmo com código correto, um evento pode ser entregue duas vezes:

```
Primeira entrega:
  1. Handler recebe o evento
  2. Atualiza o banco
  3. Processo perde conexão ANTES do ACK

Segunda entrega:
  1. Broker acredita que o evento não foi confirmado
  2. Entrega novamente
  3. Handler executa outra vez
```

Se o evento `ride-accepted` for processado duas vezes, o sistema não pode gerar duas
cobranças nem aplicar duas transições de estado.

### Controle no PostgreSQL: `processed_events`

Registrar o processamento **por consumidor**, na **mesma transação** da alteração de
negócio:

```sql
CREATE TABLE processed_events (
    consumer_name TEXT NOT NULL,
    event_id UUID NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (consumer_name, event_id)
);
```

Exemplo com Drizzle:

```ts
async function processRideAccepted(event: RideAcceptedEvent) {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(processedEvents)
      .values({
        consumerName: "ride-analytics",
        eventId: event.eventId,
      })
      .onConflictDoNothing()
      .returning({ eventId: processedEvents.eventId });

    if (inserted.length === 0) {
      return; // Já processado.
    }

    // Efeito que deve acontecer uma única vez.
    await tx.insert(rideAnalytics).values({
      rideId: event.rideId,
      driverId: event.driverId,
    });
  });
}
```

- `processedEvents` e `rideAnalytics` são tabelas Drizzle que precisariam ser definidas
  no schema (não existem hoje).
- `RideAcceptedEvent` precisa incluir `eventId` **estável**.
- Se a transação falhar, registro e efeito são revertidos **juntos**.

> ⚠️ Essa solução protege **efeitos transacionais no mesmo banco**. Para e-mails, push
> notifications e chamadas externas, não basta registrar "processado" antes de enviar:
> é preciso idempotência do provedor, filas de entrega ou registro de envio com
> recuperação após falhas.

## Erros, retentativas e DLQ

Se um subscriber falha, o Encore tenta novamente conforme a política configurada.
Esgotadas as tentativas, a mensagem vai para a **Dead-Letter Queue (DLQ)**, que
permite investigar e reprocessar.

### Opções documentadas do SDK

| Propriedade              | Padrão documentado   | Para que serve                               |
| ------------------------ | -------------------- | -------------------------------------------- |
| `retryPolicy.minBackoff` | 10 segundos          | Intervalo mínimo de retentativa              |
| `retryPolicy.maxBackoff` | 10 minutos           | Intervalo máximo                             |
| `retryPolicy.maxRetries` | 100 quando 0/omitido | Limite de tentativas                         |
| `ackDeadline`            | 30 segundos          | Prazo de processamento antes de nova entrega |
| `messageRetention`       | 7 dias               | Retenção de mensagens não entregues          |
| `maxConcurrency`         | Depende do provedor  | Máximo de execuções simultâneas por instância |

Exemplo de configuração:

```ts
new Subscription(accountCreated, "welcome-account", {
  handler: async (event) => {
    await sendWelcomeNotification(event.userId);
  },

  retryPolicy: {
    minBackoff: "5s",
    maxBackoff: "2m",
    maxRetries: 5,
  },

  ackDeadline: "30s",
});
```

> **Não copiar esses tempos indiscriminadamente.** Notificações, pagamentos e
> atualização de indicadores pedem políticas diferentes. Provedores de nuvem podem
> impor limites que ajustam o comportamento por ambiente.

## ❌ O problema mais perigoso: PostgreSQL + Pub/Sub não formam uma transação única

```ts
// ⚠️ PARECE correto, mas não é seguro:
await db.transaction(async (tx) => {
  await tx.update(rides).set({ status: "accepted" });
  await rideAccepted.publish(event);  // ❌ o broker não participa da transação!
});
```

- **Publicar dentro da transação:** se a transação falhar depois, existe um evento de
  "corrida aceita" sem corrida aceita no banco.
- **Publicar depois do commit (`updateRide(); publish();`):** o banco confirma a
  corrida, mas o processo pode morrer **antes** de publicar.

### Solução: Transactional Outbox

```
1. Serviço atualiza a corrida E grava um evento pendente no PostgreSQL,
   NA MESMA transação.
2. Um publicador consulta os eventos pendentes e os publica.
3. Broker confirma → publicador marca o evento como publicado.
4. Falha? O evento permanece recuperável no banco.
```

O publicador também precisa lidar com: múltiplos workers, tentativas, bloqueios ou
*leases*, e publicações duplicadas.

> A Outbox **não elimina toda duplicação**. Ela impede que alterações confirmadas no
> banco fiquem **permanentemente sem publicação** por falha entre commit e broker.
> Considere seriamente para corridas, pagamentos e outros eventos críticos. Fluxo
> completo em [`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md).

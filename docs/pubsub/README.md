# 📬 Pub/Sub no Encore.ts

Publicação e assinatura de eventos para processamento **assíncrono** entre componentes
do backend — com políticas de entrega, retentativas e Dead-Letter Queue.

> **Fontes principais:** [Pub/Sub — docs oficiais](https://encore.dev/docs/ts/primitives/pubsub),
> [Referência do SDK](https://encore.dev/docs/ts/runtime/pubsub),
> [Exemplo oficial event-driven](https://github.com/encoredev/examples/tree/main/ts/simple-event-driven).

## Quando usar — e quando NÃO usar

Pub/Sub **não substitui** PostgreSQL, REST nem WebSocket. Ele conecta operações
assíncronas entre componentes do backend.

### API síncrona × orientada a eventos

Na API tradicional, o serviço chamaria diretamente todos os outros:

```
Motorista aceita corrida
          │
          v
      Ride Service
          ├──> Atualizar banco
          ├──> Enviar notificação      ← se uma dessas operas lentas/indisponível,
          ├──> Registrar auditoria        o fluxo todo sofre
          └──> Atualizar estatísticas
```

Com Pub/Sub, o serviço registra o acontecimento e **publica um evento**; outros
componentes processam independentemente:

```
Ride Service ──> publish(ride-accepted) ──┬──> Subscriber: notificações
                                          ├──> Subscriber: auditoria
                                          └──> Subscriber: indicadores
```

A falha ou lentidão de um consumidor **não bloqueia** as outras assinaturas — cada
uma tem processamento e fila pendentes próprios.

### Os quatro conceitos

| Conceito         | Função                                    |
| ---------------- | ----------------------------------------- |
| **Publisher**    | Publica um acontecimento                  |
| **Topic**        | Canal lógico que recebe eventos           |
| **Subscription** | Assinatura que recebe eventos de um Topic |
| **Handler**      | Função que processa cada evento recebido  |

Um serviço publica no Topic; vários serviços criam assinaturas próprias. O Encore
gerencia a integração com a infraestrutura de mensageria conforme o ambiente de
execução (ver [`infra-e-limites.md`](./infra-e-limites.md)).

## O que acontece quando publicamos um evento

1. **O serviço produz o evento.**
2. **O Topic recebe a publicação** — `publish()` retorna quando o broker aceita, ou
   falha se não conseguir publicar.
3. **Cada Subscription recebe sua própria entrega lógica** — três assinaturas podem
   processar o evento; isso **não** significa que todas as réplicas de cada serviço
   executarão o mesmo handler (ver [`topicos-e-subscribers.md`](./topicos-e-subscribers.md)).
4. **O handler executa seu trabalho** — sucesso confirma a mensagem; erro pode gerar
   nova tentativa conforme a política ([`garantias-e-falhas.md`](./garantias-e-falhas.md)).

> ⚠️ `publish()` **não espera** os consumidores concluírem. Uma publicação
> bem-sucedida indica que o broker aceitou o evento — **não** que os consumidores
> terminaram. É justamente isso que desacopla as operações.

## Fluxo completo (quando corridas existirem)

1. **Aplicativo → Encore API** — endpoint autenticado.
2. **Ride Service → PostgreSQL** — valida oferta e confirma a aceitação **atomicamente**
   (ver [`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md)).
3. **PostgreSQL → Outbox → Pub/Sub** — evento confirmado publicado de forma
   recuperável, evitando perda entre o commit e o broker (ver
   [`garantias-e-falhas.md`](./garantias-e-falhas.md)). Outbox é decisão arquitetural,
   **não** efeito automático de `publish()`.
4. **Pub/Sub → Subscribers** — notificações, auditoria e outras tarefas processam
   independentemente.
5. **Realtime → WebSocket** — componente de entrega em tempo real encaminha a
   atualização aos conectados. **O estado definitivo continua no banco.**

## Escopo recomendado para este projeto

- **Documentar agora, implementar quando surgir um consumidor real.** Não criar
  Topics, subscribers nem filas sem funcionalidades que os exijam.
- Antes de implementar: definir o **provider de produção** e as **garantias exigidas**
  (ver [`infra-e-limites.md`](./infra-e-limites.md)).
- Sequência de adoção recomendada em [`testes.md`](./testes.md).
- Referência cruzada: o caso específico de streaming entre serviços Encore está em
  [`../streaming/pubsub-entre-servicos.md`](../streaming/pubsub-entre-servicos.md).

## Conteúdo desta pasta

| Arquivo | Assunto |
|---|---|
| [`topicos-e-subscribers.md`](./topicos-e-subscribers.md) | Topic, publish, Subscription, `ref<Publisher>()` |
| [`garantias-e-falhas.md`](./garantias-e-falhas.md) | Garantias de entrega, idempotência, retries, DLQ, Outbox |
| [`ordenacao-e-atributos.md`](./ordenacao-e-atributos.md) | `Attribute`, `orderingAttribute`, versão monotônica |
| [`infra-e-limites.md`](./infra-e-limites.md) | Providers por ambiente, Redis ≠ broker, entrega a apps |
| [`testes.md`](./testes.md) | Níveis de teste, adoção incremental, eventos × comandos |
| [`referencias.md`](./referencias.md) | Links oficiais |

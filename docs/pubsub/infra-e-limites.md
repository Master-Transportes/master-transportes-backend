# Infraestrutura, providers e limites

## Onde o Pub/Sub realmente roda?

A API (`Topic`/`Subscription`) é independente de provedor, mas a **infraestrutura**
depende do ambiente de execução:

| Ambiente                         | Infraestrutura descrita                     |
| -------------------------------- | ------------------------------------------- |
| Desenvolvimento local com Encore | Implementação local baseada em NSQ          |
| Encore Cloud                     | Infraestrutura gerenciada conforme ambiente |
| GCP                              | Google Cloud Pub/Sub                        |
| AWS                              | SNS + SQS                                   |
| Self-hosting                     | Provider configurado explicitamente         |

## ⚠️ O Redis do Docker NÃO é o broker do Encore

Este projeto já tem Redis disponível na infraestrutura local, mas **o Redis não
substitui automaticamente o Pub/Sub nativo do Encore**:

| Redis Pub/Sub                                                         | Encore Pub/Sub                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Publicação e recebimento em canais Redis                              | Topics e subscriptions declarados no código                          |
| Tradicional **não retém** mensagens para assinantes offline           | Retentativas, retenção e DLQ conforme configuração e provider        |
| Distribuição de mensagens em tempo real                               | Processamento assíncrono de eventos entre serviços                   |
| Infraestrutura Redis sob seu controle                                 | Provider próprio configurado ou provisionado pela plataforma         |

- **Self-hosting:** declarar `new Topic()` **não** faz o Redis existente ser usado.
  Os providers configuráveis documentados são **NSQ, Google Cloud Pub/Sub e AWS
  SNS/SQS**, com parâmetros no arquivo de infraestrutura.
- O Redis do projeto ainda tem outro papel: distribuição de eventos de tempo real
  entre réplicas (ver [`../streaming/redis-e-distribuicao.md`](../streaming/redis-e-distribuicao.md)).
- **Consequência para o projeto:** a decisão de adotar Encore Pub/Sub precisa
  considerar **como o backend será implantado**, e não apenas a API.

## Pub/Sub não entrega direto ao aplicativo

O Pub/Sub do Encore entrega eventos aos **subscribers do backend**, **não** a clientes
Android conectados. Para notificar o motorista Y, é preciso uma etapa adicional:

```
Ride Service
    │
    │ Publica ride-offered
    v
Encore Pub/Sub
    │
    v
Notification Subscriber
    ├──> Lê driverId
    ├──> Registra notificação persistente
    └──> Aciona entrega por WebSocket ou push
                │
                v
            Motorista Y
```

- O `driverId` identifica o **destinatário lógico**; o componente de entrega resolve
  como chegar a ele (sessão autenticada, dispositivo conectado, infraestrutura
  distribuída).
- Se Y não estiver conectado, o evento passar pelo Pub/Sub **não** significa entrega:
  o sistema deve oferecer recuperação via API, persistência de notificações e, quando
  apropriado, push notifications.
- **Não criar uma assinatura por motorista.** Uma assinatura de notificações processa
  os eventos e determina os destinatários.

## Nem todo evento pertence ao Pub/Sub

Frequências e garantias exigidas são diferentes — não tratar todos os acontecimentos
como o mesmo tipo de mensagem:

| Evento                             | Melhor abordagem inicial                   |
| ---------------------------------- | ------------------------------------------ |
| Corrida aceita                     | PostgreSQL + evento assíncrono             |
| Corrida cancelada                  | PostgreSQL + evento assíncrono             |
| Documento aprovado                 | PostgreSQL + evento assíncrono             |
| Notificação a ser enviada          | Fila/assinatura com recuperação            |
| Atualização frequente de GPS       | Canal de tempo real + estado temporário    |
| Histórico relevante de localização | Persistência seletiva conforme necessidade |

Uma coordenada GPS antiga perde a utilidade quando chega uma nova; um evento de
corrida cancelada **não pode ser descartado**. GPS em tempo real não pertence ao
Pub/Sub durável sem justificativa clara (ver
[`../streaming/README.md`](../streaming/README.md)).

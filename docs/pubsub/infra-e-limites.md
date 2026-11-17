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

## NSQ no Docker Compose deste projeto (preparação para self-host)

O `docker-compose.yml` declara um `nsqd` único (`mt_nsqd`, imagem `nsqio/nsq:v1.3.0`)
para o dia em que o backend for executado como imagem self-hosted:

| Item                    | Configuração                                                |
| ----------------------- | ----------------------------------------------------------- |
| Serviço / container     | `nsqd` / `mt_nsqd`                                          |
| Porta TCP (clientes)    | `4150`, apenas na rede Docker (`expose`, sem publicação)    |
| Porta HTTP (inspeção)   | `${NSQD_HTTP_PORT:-4151}`, publicada somente em `127.0.0.1` |
| Persistência            | volume `nsq_data` + `--data-path=/data`                     |
| Fila em memória         | `--mem-queue-size=0` (mensagens vão para disco)             |
| Lookupd / admin         | ausentes: nó único, sem alta disponibilidade                |

- **O `mt_nsqd` não é usado pelo `encore run`.** Em desenvolvimento local o próprio
  Encore sobe seu broker e executa os Topics/Subscriptions declarados no código.
  Subir o container não muda o broker usado pelo Encore.
- O container só vira o broker da aplicação quando ela for compilada com um
  `infra-config.json` cujo `pubsub` aponte para `nsqd:4150` (ver
  [`../deployment/self-host/encore-self-host-configure-infra.md`](../deployment/self-host/encore-self-host-configure-infra.md)).
  O arquivo [`../deployment/self-host/infra-config-nsq.example.json`](../deployment/self-host/infra-config-nsq.example.json)
  continua sendo **exemplo**, não configuração ativada.
- O volume preserva as filas entre reinicializações, mas **não substitui** redundância,
  backup ou mecanismos de recuperação de eventos críticos (ver
  [`garantias-e-falhas.md`](./garantias-e-falhas.md)).
- **Ainda não há Topic/Subscription declarado no código.** O container está preparado
  e isolado, sem tráfego, até existir um consumidor real (ver [`README.md`](./README.md)).

Validação local (PowerShell, na raiz do projeto):

```powershell
docker compose config --quiet
docker compose up -d nsqd
docker compose ps
Invoke-RestMethod -Uri "http://127.0.0.1:4151/ping"
Invoke-RestMethod -Uri "http://127.0.0.1:4151/stats?format=json"
```

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

# 🗺️ Roadmap completo — Master Transporte

Documento principal do roadmap. Para a execução do MVP de solicitação e oferta em tempo real
(etapas 0–10, entregas 1–7 e teste final de aceitação), veja [`mvp-tempo-real.md`](./mvp-tempo-real.md).

Arquitetura **híbrida: API REST + Streaming (WebSocket) + Pub/Sub + PostgreSQL + Redis**.

Não escolhemos apenas WebSocket nem apenas API. Cada tecnologia resolve um problema diferente.

A decisão principal é esta:

- **API REST:** executar ações importantes, como solicitar transporte, cancelar, aceitar e finalizar uma corrida.
- **Streaming (WebSocket):** receber acontecimentos imediatamente, como uma nova oferta, motorista encontrado ou localização atualizada.
- **Pub/Sub:** processar trabalho entre componentes do backend, como iniciar a busca por motoristas e distribuir ofertas.
- **PostgreSQL:** manter o estado definitivo e garantir que nenhuma corrida seja atribuída incorretamente.
- **Redis:** armazenar localização recente, presença e acelerar a descoberta de motoristas próximos.

O Encore.ts tem suporte oficial a APIs de streaming e Pub/Sub, incluindo handlers de Subscription e
entrega de eventos com possibilidade de repetição (ver [`../pubsub/`](../pubsub/README.md) e
[`../streaming/`](../streaming/README.md)).

O NSQ não substitui o Redis, nem o PostgreSQL, nem o WebSocket. Ele será o broker de mensageria
quando o Encore estiver configurado para utilizá-lo no ambiente self-hosted
(ver [`../deployment/`](../deployment/README.md)).

Também não precisamos criar um segundo aplicativo Node.js para executar as Subscriptions
inicialmente. O próprio runtime do Encore executa os handlers; um processo dedicado de workers só
se justifica se o volume, o isolamento ou a implantação exigirem isso.

> **Status:** este documento descreve o design-alvo acordado para o produto. As etapas devem ser
> implementadas na ordem, cada uma com testes verdes antes da seguinte. Contratos de rotas e
> eventos aqui são **propostas de contrato** até existirem no código; ao implementar, siga
> `../api/padroes-do-projeto.md`.

---

## 1. Arquitetura final

```
[Passageiro]──REST──►[Encore API]──PostgreSQL──►[estado definitivo]
[Motorista] ──REST──►     │
[Motorista] ──Stream──►   │──► Redis (presença + GEO)
                          │
                Pub/Sub (NSQ)──► Subscription ──► DispatchService ──► ofertas
                          │
[Apps] ◄──Streaming── eventos (oferta, aceite, localização)
```

## 2. Quando usar API, Streaming ou Pub/Sub?

Regra de engenharia:

| Acontecimento | Tecnologia principal | Por quê? |
|---|---|---|
| Cadastro, login, `getMe` | REST | Requisição e resposta |
| Motorista fica disponível | REST | Altera estado operacional |
| Passageiro solicita transporte | REST | Precisa persistir e devolver um ID |
| Backend começa a procurar motoristas | Pub/Sub | Trabalho assíncrono |
| Motorista recebe uma oferta | Streaming | Aviso imediato |
| Motorista aceita ou recusa | REST | Precisa de resultado transacional |
| Passageiro é avisado do aceite | Streaming | Atualização imediata |
| Motorista envia coordenadas | Streaming ou REST | Telemetria contínua, com fallback |
| Passageiro acompanha localização | Streaming | Posições frequentes |
| Corrida é iniciada/finalizada | REST | Transição definitiva no banco |
| Solicitação expira | PostgreSQL + processamento de recuperação | Precisa funcionar mesmo sem conexão |
| Usuário reconecta | REST + Streaming | Recupera estado e continua recebendo eventos |

**A regra é simples: ação importante usa REST; atualização imediata usa Streaming; processamento
desacoplado usa Pub/Sub.** Isso não significa duplicar todas as operações: REST executa a mudança;
Streaming comunica o resultado.

## 3. Roadmap de implementação, na ordem certa

| Etapa | Escopo | Tecnologias |
|---|---|---|
| 0 — Consolidar o backend atual | Validar limpeza dos endpoints, schema e testes existentes. Nenhuma funcionalidade nova | — |
| 1 — Motoristas e disponibilidade | Aprovação, disponibilidade operacional, online/offline e bloqueios | REST + PostgreSQL |
| 2 — Solicitações de transporte | Criar, consultar, cancelar e expirar solicitações, sem confirmar corridas | REST + PostgreSQL |
| 3 — Ofertas e aceite transacional | Ofertar a motoristas simulados; criar a corrida confirmada apenas após um aceite válido | REST + PostgreSQL |
| 4 — Localização de motoristas | Receber posições e localizar candidatos usando Redis GEO | REST/Streaming + Redis |
| 5 — Despacho automático | Iniciar buscas, formar grupos de candidatos, enviar ofertas e recuperar falhas | Encore Pub/Sub + Subscription |
| 6 — Comunicação em tempo real | Notificar ofertas, aceite e cancelamentos; sincronizar aplicativos após reconexão | Encore Streaming + REST + push |
| 7 — Execução da viagem | Chegada, embarque, início, acompanhamento, conclusão e histórico | REST + Streaming + PostgreSQL |
| 8 — Recuperação, segurança e testes de carga | Falhas de rede, concorrência, reinicializações, observabilidade, várias instâncias | Sistema integrado |

Cada etapa precisa funcionar e passar em testes antes de introduzirmos a seguinte.

---

## Etapa 0 — Consolidar o que já temos

O projeto já possui autenticação, papéis, profiles, sessions, Drizzle e migrations `0000`, `0001` e `0002`.

Resultado esperado: backend de identidade funcional, migrations preservadas, nenhum endpoint de
corridas abandonado e testes verdes.

Contrato de domínio a fechar:

- Uma **solicitação de transporte** existe antes de haver motorista.
- Uma **corrida confirmada** só existe após o aceite válido.
- Uma solicitação expirada não gera corrida confirmada.
- Uma solicitação aceita gera exatamente uma corrida.
- Uma corrida não pode ser atribuída a dois motoristas.

Recomendação: separar `ride_requests`, `ride_offers` e `rides`, mas somente depois da revisão das
tabelas e dos dados atuais (ver `../drizzle/schema.md`).

## Etapa 1 — Motoristas e disponibilidade

Ter perfil `APPROVED` não significa estar online e procurando passageiros. São informações distintas:

| Informação | Exemplo | Onde fica |
|---|---|---|
| Aprovação cadastral | APPROVED, PENDING, SUSPENDED | PostgreSQL |
| Preferência operacional | Disponível para receber solicitações | PostgreSQL ou estado operacional |
| Presença atual | Conectado e enviando sinais recentes | Redis |
| Localização atual | Latitude, longitude e instante | Redis |
| Corrida ativa | Motorista ocupado | PostgreSQL |

API inicial proposta:

```
PATCH /driver/availability
```

Contrato semelhante a:

```json
{
  "available": true
}
```

Quando o motorista tentar ficar disponível, o backend verifica aprovação e condições operacionais.

**Atenção:** não basta gravar `available = true`. Um motorista pode desligar o celular. A
elegibilidade final deve exigir presença recente e ausência de corrida conflitante.

Como ainda não temos o sistema administrativo completo, a aprovação de motoristas para os testes
deve usar dados controlados — nunca um endpoint público que permita ao próprio motorista aprovar
sua conta.

**Critério de conclusão:** um motorista aprovado pode ativar a disponibilidade; um suspenso ou
pendente não pode; uma conexão perdida não deixa o motorista elegível indefinidamente.

## Etapa 2 — Solicitações de transporte

Endpoints sugeridos (nome de rota é proposta de contrato):

```
POST /ride-requests
GET  /ride-requests/active
GET  /ride-requests/:requestId
POST /ride-requests/:requestId/cancel
```

Ciclo de vida da solicitação: `SEARCHING` (aguardando motorista) → `CONFIRMED` (motorista aceitou)
/ `EXPIRED` (prazo terminou) / `CANCELLED` (passageiro desistiu).

**Decisão de produto:** um passageiro só pode ter uma solicitação aberta ou uma corrida ativa por
vez. Garantir isso sob concorrência real, inclusive quando uma solicitação está sendo confirmada ao
mesmo tempo em que outra é criada.

Outras exigências desta etapa:

- `expiresAt` para o prazo máximo de busca.
- Idempotência no `POST`, evitando duplicatas por falhas de rede.
- Cancelamento pelo próprio passageiro.
- Expiração consistente usando o relógio do PostgreSQL.
- Histórico de solicitações expiradas separado das viagens realizadas.
- Encerramento recuperável mesmo se o servidor reiniciar.

**Critério de conclusão:** solicitar, expirar, cancelar e solicitar novamente, sem deixar registros
presos ou duplicados.

## Etapa 3 — Ofertas e aceite de corrida

Testes com motoristas simulados, sem Redis e sem WebSocket. Uma operação interna cria ofertas
destinadas aos motoristas e endpoints autenticados permitem responder:

```
GET  /driver/offers
POST /driver/offers/:offerId/accept
POST /driver/offers/:offerId/reject
```

Quando o motorista aceita, o PostgreSQL realiza, na mesma transação, a confirmação da solicitação,
a atualização da oferta e a criação da corrida efetiva. Uma `ride_request` confirmada deve estar
vinculada a uma única `ride`.

A lógica **não** pode simplesmente verificar o status e depois criar registros sem bloqueios,
porque duas requisições concorrentes poderiam observar o mesmo estado antigo (ver
`../drizzle/transacoes.md`).

**Critério de conclusão:** dois motoristas tentam aceitar simultaneamente; apenas um vence;
exatamente uma corrida é criada; repetir o aceite não gera outra corrida.

## Etapa 4 — Localização e descoberta com Redis GEO

Aqui deixamos de utilizar motoristas simulados. O aplicativo do motorista enviará coordenadas
enquanto estiver efetivamente em operação. O Redis recebe as posições e o serviço de matching
consulta motoristas próximos do embarque com `GEOSEARCH`.

**REST ou Streaming para enviar GPS?** Streaming para localização contínua durante uma sessão
ativa, com REST como alternativa e mecanismo de recuperação:

- Motorista entra em operação: REST.
- Aplicativo abre uma conexão autenticada de streaming.
- Aplicativo envia posições de acordo com deslocamento, precisão e estado operacional.
- Backend valida a posição e atualiza o Redis.
- Se o streaming falhar, o aplicativo reconecta; em cenários apropriados pode utilizar REST.
- Se o motorista parar de enviar posições por tempo excessivo, deixa de ser elegível.

O Encore oferece `api.streamIn`, `api.streamOut` e `api.streamInOut`, sobre WebSocket
(ver `../streaming/tipos-de-stream.md`).

Parâmetros iniciais para experimentar (não definitivos):

| Estado | Estratégia inicial |
|---|---|
| Motorista parado e disponível | Atualizações menos frequentes |
| Motorista se deslocando | Atualizações por intervalo e distância |
| Motorista em viagem | Maior frequência, conforme precisão e bateria |
| Localização desatualizada | Retirar da seleção de candidatos |

Não confundir GPS com telemetria garantida: o Android pode restringir a execução em segundo plano;
tratar permissões, serviços de localização em primeiro plano e economia de bateria.

Detalhe técnico: um TTL na chave individual do motorista **não** apaga automaticamente seu membro
do índice GEO compartilhado. O backend precisa verificar atualidade e remover posições obsoletas.

**E a rota até o passageiro?** Redis GEO encontra candidatos por distância geográfica aproximada,
não por tempo real de chegada pelas ruas. Começar pela proximidade e elegibilidade; depois
aprimorar por ETA com um serviço de rotas, sem confundir os dois cálculos.

**Critério de conclusão:** motoristas próximos e elegíveis aparecem, enquanto motoristas offline,
ocupados ou com localização antiga são excluídos.

## Etapa 5 — Pub/Sub e despacho automático

É a fase em que o NSQ começa a fazer sentido. Quando o passageiro cria uma solicitação, o backend
inicia uma busca assíncrona:

```
POST /ride-requests ──persistir──► Topic: ride-requested ──► Subscription: dispatch-requests
                                                              └─► DispatchService (seleciona motoristas e cria ofertas)
```

**Como o Topic funciona de verdade?** O Topic contém mensagens, não motoristas:

```json
{
  "requestId": "request-123"
}
```

Quando o handler da Subscription recebe esse evento, consulta novamente o PostgreSQL. Se a
solicitação já estiver cancelada, confirmada ou expirada, ele não cria novas ofertas. Se ainda
estiver em busca, consulta candidatos no Redis GEO e cria ofertas no banco.

O Encore entrega com garantia *at-least-once*, com retentativas — o handler precisa ser
**idempotente**: receber duas vezes o mesmo evento não pode duplicar ofertas ou corridas
(ver `../pubsub/garantias-e-falhas.md` e `../pubsub/topicos-e-subscribers.md`).

**Política inicial de despacho:** lotes pequenos de candidatos, com expansão progressiva de busca.
Parâmetros para testar (não são constantes rígidas de negócio antes de medir o comportamento real):
raio inicial 3 km, 3 motoristas por rodada, prazo por oferta 15 s, prazo máximo da solicitação 120 s.

**Como evitar perder solicitações?** Dois riscos distintos:

1. O PostgreSQL grava a solicitação, mas a publicação no Topic falha.
2. A Subscription recebe o evento, mas o processo reinicia antes de concluir.

O desenho final deve incluir uma estratégia de publicação recuperável (**Transactional Outbox**,
ver `../pubsub/garantias-e-falhas.md`) e handlers idempotentes. Uma rotina de reconciliação também
deve localizar solicitações esquecidas, ofertas vencidas e operações incompletas.

Não usar `setTimeout()` como único mecanismo para uma expiração importante. Não depender
exclusivamente de Cron Jobs do Encore para precisão de poucos segundos: eles não executam
automaticamente no desenvolvimento local.

**Critério de conclusão:** reiniciar broker ou backend durante uma busca não produz corridas
duplicadas, não deixa solicitações permanentes e permite recuperar o processamento.

## Etapa 6 — Streaming e notificações em tempo real

**Um canal lógico autenticado de eventos por usuário**, em vez de um WebSocket específico para cada
tipo de operação. Eventos exemplos (contrato futuro, não endpoints implementados):

```json
{
  "eventId": "evt-123",
  "type": "ride.offer.created",
  "resourceId": "offer-456",
  "version": 1
}
```

```json
{
  "eventId": "evt-124",
  "type": "ride.request.confirmed",
  "resourceId": "request-123",
  "version": 2
}
```

O Encore permite autenticação no handshake dos streams com `auth: true`. A integração deve respeitar
os papéis atuais, inclusive revogação de conta ou sessão durante uma conexão longa
(ver `../streaming/confiabilidade.md`).

**O streaming deve carregar tudo?** Não. Eventos importantes têm identificador e versão. O
aplicativo recebe o evento e atualiza a tela; se detectar perda de mensagens ou versão inesperada,
consulta o estado definitivo via REST. Para a posição do carro no mapa, transmitir a própria
coordenada (dado volátil e frequente — não faz sentido exigir uma consulta HTTP por posição).

**Android/Kotlin:**

- **Retrofit:** cadastro, login, solicitar, cancelar e aceitar corridas.
- **OkHttp WebSocket ou cliente compatível com Encore Streaming:** receber eventos e posições.
- **ViewModel + StateFlow:** atualizar a interface de acordo com eventos e respostas REST.
- **Repositório local:** recuperar e manter o último estado conhecido.
- **Reconexão controlada:** ao voltar a ficar online, consultar o estado atual e restabelecer o stream.

Para motoristas com o aplicativo em segundo plano, estudar **Firebase Cloud Messaging (FCM)**: uma
conexão WebSocket não substitui notificação push quando o Android suspende o aplicativo. E o FCM,
sozinho, também não garante que uma oferta seja vista antes de expirar.

**E se tivermos várias instâncias Encore?** Um `Map` em memória com conexões WebSocket funciona
apenas dentro da instância em que está armazenado. Com três instâncias, uma atualização processada
na instância A precisa chegar até B (motorista conectado à B). Prever distribuição de eventos entre
instâncias, mantendo o PostgreSQL como autoridade. Mensageria interna pode encaminhar notificações,
mas **nunca** enviar informações de todas as corridas para todos os usuários
(ver `../streaming/redis-e-distribuicao.md`).

**Critério de conclusão:** ofertas e confirmações chegam rapidamente, mensagens são isoladas por
usuário e os aplicativos recuperam o estado corretamente após reconexões.

## Etapa 7 — Ciclo completo da corrida

Somente depois das etapas anteriores completar as transições operacionais da viagem:

```
Solicitação confirmada → Motorista a caminho → Motorista chegado →
Notificação de chegada → Viagem iniciada → Embarque confirmado →
Viagem concluída → Estado final e histórico
```

Decidir com precisão quem pode iniciar, finalizar e cancelar, além das regras para cancelamento
após o embarque. Transições continuam usando API REST e transações; atualizações de status e
localização seguem por Streaming. No futuro, este módulo também permitirá histórico, avaliação e
pagamento, sem misturar essas responsabilidades com o algoritmo de despacho.

## Etapa 8 — Testes de falhas e preparação para operação

Testar o comportamento do sistema em condições reais, não apenas o caminho ideal:

| Cenário | Comportamento exigido |
|---|---|
| Dois motoristas aceitam juntos | Apenas um recebe a corrida |
| Passageiro cancela durante o aceite | Uma decisão transacional consistente |
| Passageiro solicita duas vezes por falha de rede | Mesma solicitação pela chave de idempotência |
| NSQ entrega evento duplicado | Nenhuma oferta ou corrida duplicada |
| Redis perde localizações | Motoristas ficam temporariamente indisponíveis para matching |
| Motorista fecha o aplicativo | Presença expira |
| WebSocket desconecta | REST recupera o estado |
| Oferta expira enquanto motorista aceita | O banco decide usando prazo e estado |
| Backend reinicia durante o despacho | Processamento é recuperado |
| Motorista perde aprovação | Não recebe novas atribuições |
| PostgreSQL fica indisponível | Não confirma corridas sem transação bem-sucedida |

Monitorar: latência de descoberta, tempo até o primeiro aceite, taxa de solicitações expiradas,
erros de publicação, reprocessamentos e quantidade de conexões de streaming. Para iniciar operação
em Manaus, testar primeiro com motoristas controlados, antes de permitir solicitações reais.

---

## 4. Componentes e quantidades iniciais

Arquitetura inicial enxuta:

| Componente | Quantidade inicial | Finalidade |
|---|---|---|
| PostgreSQL | 1 instância de desenvolvimento | Fonte de verdade |
| Redis | 1 instância | Geolocalização e presença |
| NSQ | 1 `nsqd` local | Broker self-hosted para testes |
| Encore API | Aplicação atual | Endpoints e domínio |
| Topic `ride-requested` | 1 | Iniciar despacho |
| Subscription `dispatch-requests` | 1 | Processar busca |
| Canal lógico de Streaming | 1 por sessão conectada | Eventos ao aplicativo |
| Processo Node worker separado | 0 inicialmente | Desnecessário no primeiro desenho |

Uma única instância NSQ não é suficiente para disponibilidade de produção; para o ambiente de
desenvolvimento atual, sim. Antes de operação real, revisar infraestrutura e tolerância a falhas
(ver `../deployment/self-host/`).

O Encore declara Topics e Subscriptions em código; na implantação self-hosted, a configuração de
infraestrutura mapeia esses recursos para NSQ e seus canais.

## 5. Decisões arquiteturais que devemos manter

Quatro separações para evitar problemas futuros:

1. **Identidade não é operação.** Um motorista possuir `DRIVER` e perfil aprovado não significa
   estar disponível para atender.
2. **Solicitação não é corrida.** Uma tentativa de encontrar motorista pode expirar sem que exista
   viagem confirmada.
3. **Mensagem não é estado definitivo.** Pub/Sub avisa que existe trabalho; a Subscription consulta
   o PostgreSQL antes de agir.
4. **Conexão não é garantia de entrega.** WebSocket oferece comunicação rápida, mas o aplicativo
   precisa ser capaz de recuperar dados após reconectar.

Essas quatro regras eliminam grande parte das ambiguidades que apareceram nas primeiras tentativas
de implementação.

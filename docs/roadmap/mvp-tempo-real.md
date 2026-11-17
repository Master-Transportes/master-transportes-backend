# 🚕 MVP — solicitação e oferta em tempo real

Documento de execução do MVP derivado do [`README.md`](./README.md) (roadmap completo). Define o
funcionamento exato a entregar, as etapas 0–10, o plano de entregas 1–7 e o teste final de aceitação.

> **Status:** design-alvo acordado. Contratos de rotas, mensagens de stream e eventos são
> **propostas de contrato** até existirem no código; ao implementar, siga
> [`../api/padroes-do-projeto.md`](../api/padroes-do-projeto.md).
>
> **Estado do repositório (verificado em 2026-11-17):** o modelo de dados da Etapa 0 **já está
> implementado** — `src/infra/database/schema.ts` separa `ride_requests`, `ride_offers` e `rides`
> com as constraints do contrato de domínio (corrida única por solicitação, ofertas pendentes
> únicas por motorista/solicitação, corrida só nasce após aceite), e a migration
> `drizzle/migrations/0003_ride_requests_separation.sql` já existe. Endpoints de corrida ainda não
> existem. Divergência de nomenclatura já resolvida no código: o documento propunha
> `CONFIRMED`; o schema usa `ACCEPTED` (e acrescenta `COMPLETED`) em `ride_request_status`.
> Ver detalhes na [Etapa 0](#etapa-0--fechar-o-modelo-de-dados-e-os-contratos).

---

## O funcionamento exato que vamos entregar agora

MVP — solicitação e oferta em tempo real:

| Passo | O que acontece |
|---|---|
| Passageiro pede transporte no ponto X | REST cria solicitação e espera motorista |
| PostgreSQL registra a solicitação | Ainda não é uma corrida confirmada |
| Pub/Sub aciona o despacho | Subscription busca motoristas no Redis GEO |
| Motorista recebe oferta pelo Stream | Solicitação aparece automaticamente na tela |
| Aceita | REST confirma e cria a corrida |
| Recusa | Despacho tenta outro motorista |

Para o motorista: **uma conexão `api.streamInOut` autenticada**, capaz de receber atualizações de
localização do aplicativo e enviar ofertas do servidor pela mesma conexão. Isso economiza conexões
e permite trabalhar com tipos diferentes de mensagem. O Encore suporta streaming bidirecional,
incluindo tipos separados para mensagens recebidas e enviadas
(ver [`../streaming/tipos-de-stream.md`](../streaming/tipos-de-stream.md)).

As ações definitivas — aceitar, recusar, cancelar e iniciar viagem — continuarão em REST, para
receberem uma resposta clara e executarem transações seguras.

**Limite desta versão:** o motorista deve estar com o aplicativo aberto, conectado e disponível.
Não haverá notificação quando o aplicativo estiver encerrado ou sem conexão, porque notificações
push ficam para uma fase futura.

## Etapa 0 — Fechar o modelo de dados e os contratos

Antes dos endpoints, garantir que o banco represente corretamente o produto.

O schema original tinha `rides` com `SEARCHING` e `ride_offers` vinculada à corrida. Como decidimos
que a corrida confirmada só nasce quando o motorista aceita, a organização é esta:

| Tabela | Responsabilidade |
|---|---|
| `users` | Passageiros e motoristas |
| `driver_profiles` | Cadastro e aprovação |
| `ride_requests` | Solicitações ainda não confirmadas |
| `ride_offers` | Ofertas enviadas aos motoristas |
| `rides` | Corridas confirmadas |
| `sessions` | Autenticação |

A `ride_request` tem estados próprios (`SEARCHING`, `ACCEPTED`, `EXPIRED`, `CANCELLED`,
`COMPLETED`) e a tabela `rides` tem os estados da viagem depois da atribuição (`ACCEPTED`,
`IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

Quando um motorista aceitar, a transação relacionará a solicitação, a oferta vencedora e a nova
corrida. Uma solicitação confirmada terá exatamente uma corrida associada
(`rides_request_unique`). **Observação:** o enum legado `ride_status` (SEARCHING/ACCEPTED/...)
das migrations 0001–0002 permanece apenas por compatibilidade do histórico; nenhuma tabela nova o
usa.

**Entregável:** modelo revisado, migrations incrementais sem reescrever `0000`–`0002`, constraints
testadas e contratos definidos. ✅ *Já atendido pela migration `0003_ride_requests_separation.sql`
e pelas constraints de `schema.ts`; restam os contratos de API/stream.*

## Etapa 1 — Motorista online e disponível

Um motorista pode entrar no aplicativo, autenticar e escolher ficar disponível.

Endpoints propostos:

| Endpoint | Operação |
|---|---|
| `PATCH /driver/availability` | Ativar/desativar disponibilidade |
| `GET /driver/availability` | Consultar o estado operacional |

Distinguir três coisas: perfil aprovado no PostgreSQL, intenção de receber corridas e presença
recente. Um motorista só será elegível se estiver aprovado, disponível, com localização atual e sem
corrida ativa conflitante. **Não confiar apenas no fato de existir uma conexão WebSocket.**

**Entregável:** motorista aprovado entra e sai de operação, com testes de autorização, suspensão e
indisponibilidade.

## Etapa 2 — Streaming bidirecional do motorista

Primeira implementação de tempo real, não algo para o final.

Endpoint conceitual: `/driver/stream`, com `api.streamInOut`, `auth: true` e as políticas
operacionais apropriadas. O Encore autentica no handshake inicial. Para conexões longas, prever
revalidação da sessão, da aprovação e da disponibilidade, porque essas condições podem mudar depois
da conexão.

O aplicativo Android abre o stream quando o motorista entra no modo operacional.

**Mensagens que o motorista enviará:**

```json
{
  "type": "location.updated",
  "latitude": -3.119,
  "longitude": -60.021,
  "accuracyMeters": 12,
  "sampledAt": "2026-11-17T20:00:00Z"
}
```

Outro tipo poderá ser `heartbeat`, informando que a conexão continua ativa. O servidor validará
tipos, coordenadas, precisão, sequência e horário; não confiará cegamente no relógio do telefone.

**Mensagens que ele receberá:**

```json
{
  "type": "offer.created",
  "offerId": "uuid-da-oferta",
  "requestId": "uuid-da-solicitacao",
  "pickup": {
    "latitude": -3.119,
    "longitude": -60.021
  },
  "expiresAt": "2026-11-17T20:00:20Z"
}
```

Quando essa mensagem chegar, o aplicativo apresenta a oferta imediatamente.

**Entregável:** motorista conecta, envia localização, recebe uma mensagem de teste do servidor e
reconecta corretamente após uma queda.

## Etapa 3 — Atualização de localização com Redis GEO

Conectar o stream ao Redis. A localização recente não precisa gerar um UPDATE no PostgreSQL a cada
poucos segundos; será armazenada e atualizada no Redis. O índice GEO permite localizar motoristas
em determinada região usando `GEOADD` e `GEOSEARCH`.

Estratégia inicial para testar (hipóteses ajustáveis conforme precisão, velocidade, bateria e
testes reais):

| Situação | Atualização proposta |
|---|---|
| Motorista parado | A cada 10–15 segundos |
| Motorista em deslocamento | A cada 3–5 segundos ou por distância |
| Motorista em corrida | A cada 2–5 segundos, conforme necessidade |
| Localização sem atualização recente | Considerar indisponível para novas ofertas |

Retirar posições antigas do índice GEO: somente TTL em chaves individuais **não** limpa
automaticamente os membros de um índice geográfico compartilhado.

**Entregável:** dois motoristas de teste enviam coordenadas, o Redis mantém as posições e um
motorista com localização antiga deixa de ser selecionado.

## Etapa 4 — Passageiro solicita transporte

O aplicativo obtém a localização de embarque e o destino e envia uma solicitação usando REST:

```
POST /ride-requests
```

O backend valida os dados, verifica se o passageiro já possui solicitação ou corrida ativa e grava
a nova `ride_request` com prazo máximo de busca. A API responde imediatamente com o identificador,
o estado e o prazo. O passageiro permanece na tela "Procurando motorista".

Também haverá consulta e cancelamento da solicitação. A primeira versão permite **uma solicitação
aberta ou uma corrida ativa por passageiro**. Essa regra precisa ser protegida contra requisições
concorrentes (as constraints `rides_passenger_active_unique` e o índice parcial sobre solicitações
em `SEARCHING` já dão a base no banco), e não apenas verificada na interface.

**Entregável:** o passageiro pede transporte, consulta o andamento, cancela e pode pedir novamente
após expiração.

## Etapa 5 — Ofertas e aceite seguro

Nesta etapa uma solicitação é conectada a motoristas de teste. O sistema cria uma oferta com prazo
e destinatário definidos, registrada no PostgreSQL. Quando a oferta aparece na tela, o motorista
tem duas ações:

- **Aceitar:** REST verifica tudo e confirma a atribuição — `POST /driver/offers/:offerId/accept`.
- **Recusar:** REST registra a resposta e permite continuar a busca —
  `POST /driver/offers/:offerId/reject`.

O Stream entrega a oferta, mas **não decide quem recebeu a corrida**. O aceite é confirmado
exclusivamente por uma transação PostgreSQL. Nessa transação, o sistema impede aceites depois do
prazo, atribuições duplicadas e conflitos com motoristas ocupados. Ao aceitar, a solicitação
torna-se aceita e nasce a `ride`.

**Entregável:** uma oferta aparece ao vivo; dois motoristas tentam aceitar; exatamente um recebe a
corrida. Recusas e ofertas expiradas não criam viagens.

## Etapa 6 — Descoberta automática de motoristas próximos

Até aqui as ofertas terão sido criadas por testes controlados. Agora entra o algoritmo real de
candidatos. Quando uma solicitação estiver procurando motorista, o `DispatchService` consultará o
Redis GEO perto do embarque.

Filtros: localização antiga, motoristas offline, ocupados, suspensos ou que não aceitem aquela
categoria de serviço. Depois, ordenar os candidatos. No primeiro MVP, a distância geográfica serve
como filtro inicial; para escolher por tempo estimado de chegada será necessário integrar um
serviço de rotas.

Começar com uma pequena rodada de candidatos — por exemplo, até três motoristas — e ampliar a busca
quando necessário. Não fixar esses números definitivamente sem testes.

**Entregável:** passageiro solicita no ponto X, o serviço encontra motoristas próximos e escolhe
candidatos reais, sem criar ofertas duplicadas.

## Etapa 7 — Pub/Sub e Subscription para executar o despacho

Fluxo:

```
POST /ride-requests
        ↓
PostgreSQL
        ↓
Evento ride-requested
        ↓
Encore Topic
        ↓
Subscription dispatch-requests
        ↓
DispatchService
        ↓
Redis GEO
        ↓
Criação de ofertas
        ↓
Entrega via Stream
```

O Topic transporta o evento; a Subscription executa o handler. Não precisamos de um novo servidor
Node.js apenas para declarar esse processamento. O Encore permite configurar a entrega e as
retentativas da Subscription (ver [`../pubsub/topicos-e-subscribers.md`](../pubsub/topicos-e-subscribers.md)).

**O que faremos para evitar falhas:** tratar cuidadosamente a diferença entre gravar dados e
publicar eventos. Se a solicitação for salva, mas a publicação falhar, o passageiro não pode ficar
procurando indefinidamente. Incluir uma **Transactional Outbox** ou mecanismo equivalente de
publicação recuperável, associada a um processamento de reconciliação
(ver [`../pubsub/garantias-e-falhas.md`](../pubsub/garantias-e-falhas.md)). Como o sistema fará
ofertas com prazos curtos, também haverá controle persistido de próximos despachos e vencimentos.

A Subscription não deve ficar dormindo durante todo o prazo da solicitação: processa uma rodada,
persiste o resultado e encerra. O próximo processamento deve ser acionado por evento ou por um
mecanismo recuperável de agendamento. O Pub/Sub do Encore **não** é um agendador de tarefas para
cada prazo de expiração.

**Entregável:** uma solicitação provoca automaticamente a busca, a criação de ofertas e a
notificação ao motorista, mesmo com reentregas de eventos, reinicializações ou recusas.

## Etapa 8 — Entrega confiável dos eventos ao Stream

Quando a Subscription cria uma oferta, ela precisa alcançar o motorista que está conectado ao
Encore. Com uma única instância do backend, o serviço mantém o registro das conexões ativas e
entrega o evento ao stream correto. Com várias instâncias, a conexão pode estar em outro processo —
um `Map` local sozinho não resolve. Criaremos uma camada pequena de entrega direcionada, preparada
para utilizar Redis Pub/Sub entre instâncias quando necessário.

Duas responsabilidades diferentes:

| Componente | Responsabilidade |
|---|---|
| Encore Topic/NSQ | Processamento assíncrono do despacho |
| Canal de eventos ao usuário | Entregar uma notificação ao stream conectado |

Um evento de oferta não deve ser enviado a motoristas diferentes do destinatário. Além disso, a
notificação de stream não substitui a persistência: se a conexão cair, o motorista recupera suas
ofertas ainda válidas por uma API autenticada.

**Entregável:** oferta entregue ao motorista certo, sem vazamento para outros usuários, com
recuperação após reconexão.

## Etapa 9 — Passageiro acompanha a busca ao vivo

Evitar que o passageiro consulte o backend a cada segundo: stream autenticado de saída
(`/client/stream`) com atualizações relevantes — busca começou, foi ampliada, expirou ou encontrou
um motorista.

Quando alguém aceitar, o passageiro recebe:

```json
{
  "type": "ride.confirmed",
  "requestId": "uuid-da-solicitacao",
  "rideId": "uuid-da-corrida",
  "driverId": "uuid-do-motorista"
}
```

Depois o app consulta ou recebe os detalhes autorizados da corrida confirmada. O passageiro não
tem acesso às ofertas privadas de outros motoristas nem à localização precisa de todos os
candidatos.

**Entregável:** o passageiro vê a busca em andamento e, quando há aceite, recebe a confirmação sem
atualizar manualmente a tela.

## Etapa 10 — Motorista atualiza o andamento da corrida

Depois do aceite, completar a operação do transporte. Transições controladas pelo servidor:

| Evento | Quem executa | Como |
|---|---|---|
| Motorista segue ao embarque | Motorista | Localização via Stream |
| Motorista chegou | Motorista | REST |
| Viagem iniciada | Motorista | REST |
| Viagem concluída | Motorista | REST |
| Cancelamento permitido | Usuário autorizado | REST |
| Passageiro acompanha o carro | Backend | Stream |

O motorista continua enviando localização durante o trajeto; o passageiro recebe atualizações pelo
stream correspondente. Para não sobrecarregar o PostgreSQL, posições frequentes ficam no Redis;
eventos de negócio e timestamps relevantes permanecem no banco.

A autorização precisa conferir, em cada mudança de estado, se aquele motorista realmente está
atribuído àquela corrida.

**Entregável:** corrida confirmada pode seguir do embarque até a conclusão, com o passageiro
acompanhando localização e status ao vivo.

---

## Como ficará a comunicação no MVP?

| Operação | Canal escolhido |
|---|---|
| Login, cadastro, `getMe` | REST |
| Entrar/sair de disponibilidade | REST |
| Motorista envia localização | `api.streamInOut` |
| Motorista recebe oferta | `api.streamInOut` |
| Passageiro pede transporte | REST |
| Busca automática é acionada | Pub/Sub |
| Escolha de candidatos | Service + Redis GEO |
| Motorista aceita/recusa | REST |
| Passageiro recebe confirmação | `api.streamOut` |
| Iniciar, finalizar, cancelar | REST |
| Atualizações de posição durante a corrida | Streams |
| Recuperação após desconexão | REST |

## O que ficará para outra fase

Notificações push, FCM, funcionamento garantido com aplicativo encerrado, pagamentos, carteira,
chat, avaliações, precificação dinâmica e um módulo administrativo completo ficam para depois.

Isso significa que, **se o motorista fechar o aplicativo ou perder a conexão, não poderá contar com
uma oferta chegando fora do app**. O backend deve reconhecer a perda de presença e procurar outro
motorista.

A aprovação de motoristas para testes pode ser feita com dados controlados, sem disponibilizar uma
rota pública de autoaprovação.

## Como vamos executar

Trabalho dividido em entregas separadas, mantendo os testes verdes ao final de cada uma:

| Entrega | Escopo |
|---|---|
| 1 | Modelo de dados + disponibilidade do motorista |
| 2 | Stream do motorista + localização Redis |
| 3 | Solicitações + ofertas + aceite transacional |
| 4 | Matching geográfico e seleção de candidatos |
| 5 | Pub/Sub + Subscription + recuperação de despacho |
| 6 | Notificações por stream e integração ponta a ponta |
| 7 | Execução da viagem + testes de falhas |

Antes de cada entrega: verificar os arquivos atuais e as migrations, implementar apenas o escopo
daquela etapa e testar com PostgreSQL 18 e Redis reais. Sem refatorações cosméticas ou uma
implementação enorme de uma só vez.

## O teste final que vai provar que deu certo

Um passageiro abre o aplicativo, define o ponto de embarque e solicita transporte. Três motoristas
estão conectados, enviando suas localizações. O sistema encontra os candidatos próximos e envia uma
oferta ao primeiro grupo.

A oferta aparece automaticamente na tela dos motoristas por Stream. Um deles recusa; outro aceita.
O PostgreSQL atribui a corrida somente ao vencedor. O passageiro recebe a confirmação em tempo
real. O motorista segue até o embarque, atualizando sua posição, e o passageiro acompanha o
deslocamento.

Se ninguém aceitar, a solicitação expira e o passageiro pode tentar novamente, sem que uma corrida
confirmada tenha sido criada.

**Esse é o nosso MVP funcional.** A primeira entrega é **modelo de dados, disponibilidade do
motorista e contratos do Stream**, para que as próximas etapas já nasçam compatíveis com a
comunicação em tempo real.

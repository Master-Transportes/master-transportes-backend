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

### Regras do controle "Receber corridas" (decisão de produto)

Comportamento igual ao botão **"Receber corridas"** dos aplicativos de transporte. **Estar
conectado ao stream NÃO significa estar disponível para receber corridas** — são estados
independentes:

1. O motorista inicia com "Receber corridas" **desativado** (`available = false` é o default do
   banco); login ou conexão ao `/driver/stream` nunca ativam a disponibilidade.
2. Ao ativar, o backend registra a **intenção explícita** de receber ofertas no PostgreSQL
   (`PATCH /driver/availability`).
3. Elegibilidade para receber ofertas = conta ativa **E** papel `DRIVER` **E** perfil `APPROVED`
   **E** disponibilidade ativada **E** localização/presença recentes (Etapa 3, Redis) **E**
   nenhuma corrida ativa incompatível. Falta qualquer uma → inelegível, sem exceções.
4. Ao desativar, para de receber novas ofertas **imediatamente** (a próxima decisão de despacho
   consulta o estado real no PostgreSQL).
5. Ao aceitar validamente uma corrida, a disponibilidade é desativada **na mesma transação do
   aceite** (contrato para a futura transação de aceite, abaixo).
6. Ao finalizar ou cancelar a corrida, a disponibilidade **não é reativada automaticamente**. O
   motorista precisa pressionar "Receber corridas" novamente.
7. Recusar uma oferta ou deixá-la expirar **não** desativa a disponibilidade.
8. Desconectar o stream **não** altera a preferência salva, mas torna o motorista inelegível
   enquanto estiver desconectado ou sem presença recente.
9. Ao reconectar, nunca considerar o motorista elegível apenas porque o stream abriu: reavaliar
   preferência explícita, aprovação, corrida ativa e presença antes de qualquer entrega.

Aplicado agora no backend:

- Ativar disponibilidade com corrida ativa (`rides.status IN ('ACCEPTED','IN_PROGRESS')`) retorna
  **409** com razão estável `DRIVER_ALREADY_ON_RIDE` — verificação na **mesma transação** do lock
  do perfil (`FOR UPDATE`), imune a concorrência e a múltiplas instâncias (o PostgreSQL é a
  autoridade; desativar nunca é bloqueado).
- O stream **não lê nem altera** a disponibilidade: autenticação de stream e disponibilidade
  operacional são camadas independentes. O stream continua útil durante a viagem (localização,
  atualizações da corrida aceita) mesmo com "Receber corridas" desativado.

**Contrato para a futura transação de aceite (Etapa 5):** a transação que confirma solicitação +
oferta vencedora + criação da `ride` DEVE, no mesmo commit, gravar
`driver_profiles.available = false` para o motorista vencedor. Assim "aceitou" e "parou de receber
ofertas" são um único fato atômico — sem janela em que o motorista com corrida ativa possa receber
nova oferta. A seleção de candidatos (Etapa 6) deve filtrar por `available = true` **e** corrida
inexistente; a entrega de ofertas deve revalidar essas condições na hora (ver Etapa 2,
`isEligible()` + `isHeartbeatFresh()`).

> **Status (2026-11-17):** endpoints `PATCH /driver/availability` (tags
> `driver-role` + `driver-operational`) e `GET /driver/availability` (tag `driver-role`)
> **implementados com as regras acima**: coluna `available` em `driver_profiles` (migration
> `0004`, default `false`), verificação de aprovação e de corrida ativa dentro da transação de
> gravação (409 `DRIVER_ALREADY_ON_RIDE`), política central atualizada, testes de service
> (ativação, desativação, corrida ativa, recém-registrado inicia desativado) e integração
> (corrida ativa bloqueia/libera, toggles concorrentes serializados por `FOR UPDATE`). Pendente
> nesta entrega: contratos do stream do motorista (Etapa 2); presença/localização recente entra
> na Etapa 3.

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

> **Status (2026-11-17):** **implementado e verificado em runtime** (`/driver/stream` via
> `api.streamInOut`, tags `driver-role` + `driver-operational`): handshake autenticado com JWT,
> `stream.connected` do servidor, localização/heartbeat validados, fail fast em violação semântica
> e reconexão. Detalhes verificados contra o Encore 1.58.4:
> - o runtime descarta silenciosamente mensagens com `type` fora do schema de fio e remove campos
>   extras; violações semânticas (coordenada, `sampledAt`, precisão) fecham a conexão via Zod;
> - motoristas inelegíveis (PENDING/SUSPENDED) completam o handshake HTTP mas não recebem nenhuma
>   mensagem (middleware operacional bloqueia o handler): o cliente deve tratar a ausência de
>   `stream.connected` como recusa;
> - revalidação **orientada às mensagens** (`heartbeat`/`location.updated`) com **janela mínima de
>   30 s** (`DRIVER_STREAM_MIN_REVALIDATION_INTERVAL_MS`), sem timer independente e sem consulta em
>   conexão ociosa: a verificação sequencial (sessão ativa → conta ativa → papel DRIVER → perfil
>   APPROVED, falha fechada) ocorre na primeira mensagem após a janela. Motivo: 4 consultas por
>   amostra de GPS (a cada 3 s) inviabilizam o banco; **decisão permanente: NÃO usaremos timer
>   independente nem verificação a cada mensagem** — janela por mensagem + revalidação na hora de
>   cada entrega sensível (`isEligible()`). Antes de qualquer oferta, a camada de entrega executa
>   uma verificação ATUAL da autorização operacional;
> - **Connection Registry em memória** (`DriverConnectionRegistry`): `add`/`get`/`remove`
>   (comparação por identidade do stream; `add` mantém a conexão mais recente por usuário sem
>   fechar a anterior; o registro é removido quando o loop `for await` termina). Serve apenas para
>   localizar a conexão — nenhum status derivado é armazenado; Map é local à instância (Etapa 8
>   trata distribuição);
> - **Stream ≠ disponibilidade**: o stream não lê nem altera "Receber corridas". Motorista
>   conectado com o recebimento desativado continua enviando heartbeat/GPS e mantendo a corrida
>   aceita; a seleção de candidatos e a entrega de ofertas é que exigirão disponibilidade +
>   aprovação + presença/localização recentes + ausência de corrida ativa;
> - **Política de presença (contrato para a entrega):** presença = última atividade válida medida
>   com **horário do servidor**, com expiração — o telefone não prolonga presença com `sampledAt`
>   arbitrário. `isHeartbeatFresh()` (60 s) é contrato, ainda **não implementado** na entrega;
>   será obrigatório na camada real antes da primeira oferta. Conexão aberta sem atividade
>   recente não recebe ofertas;
> - **Ordenação de GPS:** autoridade é o **script Lua no Redis** (atômico): amostra antiga/
>   duplicada é ignorada lá, com validação de `sampledAt` futuro (`TIME` do Redis + tolerância
>   única de 10 s compartilhada com o Zod). A ordenação in-memory do stream foi removida;
> - o auditor de política central (`endpoint-policy.spec.ts`) foi estendido para reconhecer
>   declarações de stream (sem `method` HTTP).
>
> Artefato de prova: `scripts/smoke-driver-stream.ts`. Pendente nesta etapa (Etapa 3): gravação da
> posição no Redis GEO.

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

Regras da integração Redis GEO (decididas na revisão do stream):

- **Horário:** a presença e a expiração usam o **horário do servidor** (instante de recebimento da
  mensagem válida) — o `sampledAt` do telefone é referência da amostra, nunca prova de presença.
- **Ordenação/anti-sobrescrita:** aceitar coordenadas apenas se a amostra for mais recente que a
  última posição válida do motorista (o stream já ignora amostras fora de ordem; o Redis deve
  manter a mesma regra com o horário do servidor como autoridade).
- **Precisão para matching:** o limite de `accuracyMeters ≤ 100 km` é sanidade de transporte, NÃO
  posição válida para escolher motorista próximo — o matching deverá exigir precisão útil
  (parâmetro a calibrar) além da proximidade geográfica.
- **Presença vencida ⇒ inelegível:** sem atividade válida recente, o motorista sai do matching e
  nenhuma oferta nova é enviada (alinhado com `isHeartbeatFresh()` na entrega).

> **Status (2026-11-18):** **implementado** — `DriverPresenceService` (Redis, scripts Lua
> atômicos) integrado ao `DriverStreamService`; presença (TTL 60 s, relógio do Redis), localização
> com duplo frescor (`sampledAt` **e** `receivedAt` ≤ 45 s), precisão ≤ 200 m para elegibilidade
> de matching, `connectionId` gerado pelo servidor com propriedade atômica do estado, limpeza
> oportunista condicional de membros GEO e `findNearbyDrivers()` funcional. Relatório completo:
> `docs/roadmap/etapa3-redis-geo.md`.

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

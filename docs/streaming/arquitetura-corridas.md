# Arquitetura de streaming para o app de transporte

Para o modelo de despacho híbrido (passageiro, motorista, aceitação e recusa), separar os
**domínios** e evitar colocar toda a lógica do aplicativo dentro do handler WebSocket.

**Princípio central:** *a corrida existe e muda de estado no banco; o streaming apenas
informa a mudança.* Assim, uma conexão cair, uma mensagem atrasar ou um servidor reiniciar
não cria uma segunda corrida nem uma aceitação indevida.

## Eventos do domínio

| Evento               | Destinatário           | Fonte de verdade             |
| -------------------- | ---------------------- | ---------------------------- |
| `ride.requested`     | Sistema de matching    | PostgreSQL                   |
| `ride.offer`         | Motorista selecionado  | Oferta persistida            |
| `ride.offer_expired` | Motorista              | Estado/validade da oferta    |
| `ride.accepted`      | Passageiro e motorista | Corrida no PostgreSQL        |
| `ride.rejected`      | Sistema de matching    | Oferta no PostgreSQL         |
| `ride.cancelled`     | Partes envolvidas      | Corrida no PostgreSQL        |
| `driver.location`    | Passageiro autorizado  | Redis / amostras persistidas |
| `ride.completed`     | Passageiro e motorista | Corrida no PostgreSQL        |

Os eventos devem incluir: `eventId`, `rideId`, `occurredAt` e uma **versão ou sequência**
do estado quando aplicável — ajuda a identificar duplicações e rejeitar informações antigas.

## O caso crítico: dois motoristas aceitam a mesma corrida

O WebSocket pode entregar a oferta para **dois** motoristas, mas **ele não decide quem
fica com a corrida**. A decisão deve ocorrer numa **operação atômica do PostgreSQL**.

Exemplo conceitual, assumindo tabelas `rides` e `ride_offers`:

```sql
UPDATE rides AS r
SET
    driver_id = $1,
    status = 'accepted',
    updated_at = NOW()
WHERE r.id = $2
  AND r.status = 'searching'
  AND EXISTS (
      SELECT 1
      FROM ride_offers AS o
      WHERE o.ride_id = r.id
        AND o.driver_id = $1
        AND o.status = 'pending'
        AND o.expires_at > NOW()
  )
RETURNING r.id, r.driver_id, r.status;
```

- O **motorista autenticado** é associado ao `$1`; o ID da corrida ao `$2`.
- Se a instrução **não retornar linha**, a aceitação **não ocorreu**.
- Se dois motoristas tentarem aceitar **simultaneamente**, apenas **uma** atualização
  consegue mudar a corrida de `searching` para `accepted`.

Em produção, a transação também deve: atualizar a oferta aceita, **invalidar as
concorrentes**, impedir o motorista de possuir duas corridas incompatíveis e registrar os
eventos pendentes na **outbox** (ver [`pubsub-entre-servicos.md`](./pubsub-entre-servicos.md)).

## Fluxo recomendado

**O servidor confirma primeiro no banco; só depois notifica os clientes.**
Nunca trate o clique de "Aceitar" no aplicativo como confirmação definitiva.

1. `POST /rides/:id/accept` recebe a tentativa de aceitação (REST, não WebSocket).
2. O serviço de corridas valida: identidade, papel do motorista, oferta e estado atual.
3. O PostgreSQL executa a **transição atômica** e registra o evento.
4. O evento é distribuído ao canal de tempo real.
5. Passageiro e motorista recebem o novo estado, e ambos podem **consultar a corrida**
   para confirmar.

Assim, uma falha do WebSocket **não compromete a consistência da corrida**.

## Adaptação a este projeto

Este repositório contém **identidade/autenticação implementadas** e o **modelo
PostgreSQL completo** (`ride_requests`, `rides`, `ride_offers`, migrations e teste
de constraints — ver [`../drizzle/schema.md`](../drizzle/schema.md)). A camada
REST de corridas (solicitação, ofertas, aceite e recusa) foi **removida** nesta
etapa e será reconstruída depois sobre despacho orientado a eventos, respeitando
a distinção entre solicitação e corrida confirmada (ver
[`../api/corridas.md`](../api/corridas.md)). **Ainda não** existem matching
geográfico, despacho automático, streaming, GPS, Pub/Sub ou Outbox. Este documento
continua sendo a referência de arquitetura para essas próximas etapas.

# Testes e adoção incremental

## Quatro níveis de teste

| Teste         | O que verificar                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| **Publicação**    | Evento possui contrato e identificadores corretos (inclui `eventId`)     |
| **Processamento** | Subscriber produz o efeito esperado                                       |
| **Duplicação**    | Mesmo `eventId` **não** duplica efeitos (idempotência)                    |
| **Falhas**        | Erros temporários geram novas tentativas e não deixam efeitos inconsistentes |

## Ambiente local × provider real

- No ambiente local, `encore run` executa Topics e Subscriptions declarados, e o
  painel de desenvolvimento ajuda a observar chamadas e eventos.
- Testes de **concorrência, ordenação e falhas do broker** precisam considerar o
  provider real de produção: o ambiente local **não reproduz** todas as garantias de
  AWS ou GCP (e `orderingAttribute` não tem efeito local — ver
  [`ordenacao-e-atributos.md`](./ordenacao-e-atributos.md)).

## Eventos de domínio × comandos assíncronos

Distinguir os dois tipos de mensagem — ambos usam mensageria, mas com significados
diferentes:

| Tipo                 | Significado                  | Exemplos                                   |
| -------------------- | ---------------------------- | ------------------------------------------ |
| **Evento de domínio**| Descreve algo que **já aconteceu** | `ride.accepted`, `driver.approved`, `ride.cancelled` |
| **Comando assíncrono**| Solicita **uma ação**       | `send.notification`, `generate.report`, `process.document` |

Essa separação mantém contratos claros e reduz acoplamento entre serviços.

## Sequência de adoção recomendada

Começar com **um único caso de uso** que realmente precise de processamento assíncrono
(ex.: gerar notificação após aprovação de um documento, ou acontecimento importante
de uma corrida):

1. Definir o **contrato do evento** (com `eventId` e `occurredAt`).
2. Implementar o **subscriber**.
3. Adicionar **idempotência** (ver [`garantias-e-falhas.md`](./garantias-e-falhas.md)).
4. **Testar falhas** (os quatro níveis acima).
5. Escolher o **provider de implantação** (ver [`infra-e-limites.md`](./infra-e-limites.md)).
6. Somente se necessário, introduzir uma **Outbox**.

**Não criar dezenas de Topics** para cada mudança pequena do banco. E lembrar do
escopo: neste momento, Pub/Sub está **documentado, não implementado** — a adoção
depende de um consumidor real (ver `README.md` desta pasta).

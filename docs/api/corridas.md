# Corridas e ofertas — camada REST removida

> **Estado atual:** a camada REST de corridas foi **removida** nesta etapa para que o
> backend fique restrito a identidade, contas e autenticação (CLIENT/DRIVER) até que
> o despacho seja desenhado sobre Pub/Sub do Encore.
>
> O que foi removido: endpoints de `/ride-requests`, `/rides` e `/driver/offers`
> (criação, listagem, consulta, cancelamento, ofertas, aceite e recusa), além do
> service, repositório, DTOs, mappers, validações e testes exclusivos dessa camada.
>
> O que permanece: o **modelo PostgreSQL** (`ride_requests`, `rides`, `ride_offers`),
> `relations.ts`, migrations aplicadas e o teste de integração de constraints —
> a modelagem foi preservada de propósito, para reconstruir os fluxos depois
> respeitando a regra **solicitação ≠ corrida confirmada**.

## Reconstrução futura

A próxima camada de corridas não deve replicar esta: a corrida efetiva só existe
após o aceite válido de um motorista, e o despacho será orientado a eventos
(Pub/Sub + Subscription + descoberta geográfica no Redis), com PostgreSQL como
fonte de verdade e WebSocket apenas notificando estados já confirmados no banco.

Referências de estudo:
- [`../pubsub/`](../pubsub/README.md) — Topic, Subscription, garantias, falhas
- [`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md) — eventos do domínio e aceitação concorrente
- [`../streaming/redis-e-distribuicao.md`](../streaming/redis-e-distribuicao.md) — descoberta e distribuição
- Histórico do Git — implementação anterior desta camada, usável como referência de transações e locks

---
name: Encore Events
description: Pub/Sub do Encore (topics, subscriptions), NSQ, processamento assíncrono, idempotência, retry e recuperação de falhas no Master Transporte.
---

# Encore Events — Pub/Sub, NSQ e processamento assíncrono

## Quando usar

Tarefas com topics, subscriptions, publicação/consumo de eventos, retentativas, idempotência, ordenação ou infraestrutura NSQ.

## Regras do projeto (resumo operacional)

- Diferencie: conexão/entrega em tempo real (`docs/streaming/`), persistência (Drizzle) e processamento assíncrono (Pub/Sub). Uma tecnologia não substitui a outra.
- **Infra self-hosted**: Pub/Sub roda sobre NSQ (`docs/pubsub/infra-e-limites.md`, `docs/deployment/self-host/`). Respeite os limites e garantias reais da configuração vigente.
- **Idempotência**: consumidores devem tolerar reentregas; considere chaves de idempotência e consistência entre transação do banco e publicação do evento.
- **Falhas**: configure retry/delay/DLQ conforme o padrão existente em `docs/pubsub/garantias-e-falhas.md`; ordem não é garantida por padrão (`docs/pubsub/ordenacao-e-atributos.md`).
- Não assuma que mapas em memória ou assinaturas locais funcionam entre réplicas.
- Testes: ver padrões em `docs/pubsub/testes.md`; cubra reentrega e falha de consumidor.

## Armadilhas técnicas

- At-least-once: todo handler precisa ser idempotente ou deduplicado no banco.
- Publicar evento dentro de transação não torna os dois atômicos; avalie outbox/ordem quando a consistência exigir.
- Atributos/metadata do NSQ têm limites de tamanho; não carregue payload grande no evento — passe IDs.
- Alterar schema de evento é contrato: consumidores antigos continuam rodando.

## Referências (consultar conforme a necessidade)

Catálogo completo: `docs/references.md` e `docs/pubsub/referencias.md`. Páginas principais:

- Pub/Sub (primitiva): https://encore.dev/docs/ts/primitives/pubsub
- Pub/Sub (runtime/self-host): https://encore.dev/docs/ts/runtime/pubsub
- NSQ design: https://nsq.io/overview/design.html
- Infra self-host: https://encore.dev/docs/self-host/configure-infra

# 📡 Streaming no Encore.ts

Comunicação em tempo real com WebSockets, mensagens tipadas em TypeScript,
autenticação no handshake e arquitetura escalável.

> **Fonte principal:** [Streaming APIs — Encore.ts](https://encore.dev/docs/ts/primitives/streaming-apis)

## O que é?

Streaming permite manter uma conexão aberta entre cliente e servidor para transmitir
mensagens à medida que elas acontecem, sem uma nova requisição HTTP por atualização.
O Encore.ts implementa via **WebSockets**, com mensagens tipadas.

Toda conexão começa com um **handshake HTTP** (que pode transportar path params, query,
headers e credenciais de autenticação). Aceita a conexão, o transporte passa a ser WebSocket.

## Os três tipos

| API               | Direção            | Aplicações                                     |
| ----------------- | ------------------ | ---------------------------------------------- |
| `api.streamIn`    | Cliente → Servidor | Envio contínuo de dados                        |
| `api.streamOut`   | Servidor → Cliente | Notificações, atualizações e progresso         |
| `api.streamInOut` | Cliente ↔ Servidor | Chats, rastreamento e comunicação bidirecional |

## Responsabilidades de cada tecnologia

| Tecnologia       | Responsabilidade correta                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| Encore Streaming | Conexão bidirecional e transmissão de eventos                                     |
| PostgreSQL       | Dados persistentes, relacionamentos e transações                                  |
| Redis            | Presença, cache, estado temporário e, quando configurado, distribuição de eventos |
| Encore Pub/Sub   | Eventos assíncronos entre componentes e serviços                                  |
| REST API         | Consultas, operações de negócio e recuperação de dados                            |
| AuthHandler      | Identificar a sessão e o usuário autenticado                                      |

> ⚠️ **Distinção fundamental:** `Encore Pub/Sub` ≠ `Redis Pub/Sub`, e nenhum dos dois
> substitui o WebSocket. Cada tecnologia tem garantias diferentes.

**Regra de ouro:** o WebSocket transporta mensagens em tempo real. **Ele não é banco de
dados, fila durável ou sistema de garantia de entrega.** O estado de negócio vive no
PostgreSQL; o streaming apenas *informa* a mudança.

## Exemplo de fluxo (app de transporte)

1. O passageiro X solicita uma corrida.
2. O backend registra a solicitação no PostgreSQL.
3. O servidor notifica o motorista Y via stream.
4. Y aceita ou recusa.
5. O servidor valida a resposta, atualiza a corrida no banco e notifica X.

## Conteúdo desta pasta

| Arquivo | Assunto |
|---|---|
| [`tipos-de-stream.md`](./tipos-de-stream.md) | Os três tipos + handshake com parâmetros |
| [`mensagens-entre-usuarios.md`](./mensagens-entre-usuarios.md) | Enviar mensagem do usuário X para o usuário Y |
| [`exemplo-integrado-chat.md`](./exemplo-integrado-chat.md) | Chat completo: registro de conexões + persistência + idempotência |
| [`cliente.md`](./cliente.md) | Consumindo os streams (TypeScript gerado e Android/Kotlin) |
| [`redis-e-distribuicao.md`](./redis-e-distribuicao.md) | Presença e distribuição entre múltiplas instâncias |
| [`pubsub-entre-servicos.md`](./pubsub-entre-servicos.md) | Encore Pub/Sub, comunicação entre serviços e Outbox |
| [`arquitetura-corridas.md`](./arquitetura-corridas.md) | Eventos de corrida e o caso crítico de aceitação concorrente |
| [`confiabilidade.md`](./confiabilidade.md) | Reconexão, estados de entrega e testes essenciais |
| [`referencias.md`](./referencias.md) | Links oficiais da documentação |

## Notas de adaptação a este projeto

- O repo usa **Drizzle** em vez de `SQLDatabase`: as queries de persistência do exemplo
  de chat devem viver em `src/repositories/` (único lugar com SQL/Drizzle).
- `getAuthData()?.userID` → neste projeto o AuthHandler está em `src/auth/` e retorna
  `userID`; confirme o campo real do `AuthData`.
- Endpoints de streaming também precisam de classificação em `src/auth/endpoint-policy.ts`.

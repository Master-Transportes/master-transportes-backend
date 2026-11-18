---
name: Redis Realtime
description: ioredis, Redis GEO, presença/heartbeat, GPS, TTL, scripts Lua atômicos, conexão dona e busca geográfica no Master Transporte.
---

# Redis Realtime — presença, GEO e operações atômicas

## Quando usar

Tarefas com Redis 7.2 + ioredis: localização/matching por proximidade, presença online, heartbeat, TTL de sessão/GPS, busca geográfica ou scripts Lua.

## Regras do projeto (resumo operacional)

- Cliente: `ioredis` (^5.8). Acesso centralizado conforme o padrão existente em `src/infra/` ou services — siga o código vigente, não crie camada paralela.
- **TTL sempre**: chaves de presença/GPS expiram; renovação via heartbeat. Sem TTL, chaves órfãs corrompem matching.
- **GEO**: `GEOADD`/`GEOSEARCH` para proximidade; armazene coordenadas com precisão consistente e use radius/limit real do domínio (corrida urbana). Veja `docs/roadmap/etapa3-redis-geo.md`.
- **Lua atômico**: use `EVAL`/scripts para sequências read-check-write que precisam ser atômicas (ex.: claim de corrida, troca de conexão dona). Não reimite atomicidade com vários comandos separados.
- **Conexão dona / múltiplas instâncias**: memória local não é estado compartilhado; quem "dona" um recurso (ex.: stream de corrida) deve ser resolvido no Redis com expiração e renovação (`docs/streaming/redis-e-distribuicao.md`).
- Redis é volátil/cacheável: dados que precisam sobreviver a restart vão para PostgreSQL.

## Armadilhas técnicas

- `GEOSEARCH` retorna membros e distâncias — parse de retorno do ioredis é array aninhado; teste o formato real.
- ioredis retorna `null`/strings; valide com Zod na fronteira do service, não confie em cast implícito.
- `KEYS` é proibido em produção (bloqueia); use `SCAN` ou conjuntos indexados.
- Scripts Lua são single-key-friendly; keys diferentes limitam cluster/failover — mantenha keys da mesma entidade juntas quando possível.
- Clock: TTL do Redis não substitui regra de negócio temporal do PostgreSQL.

## Referências (consultar conforme a necessidade)

Catálogo completo: `docs/references.md`. Páginas principais:

- GEOADD: https://redis.io/docs/latest/commands/geoadd/
- GEOSEARCH: https://redis.io/docs/latest/commands/geosearch/
- EVAL / programabilidade: https://redis.io/docs/latest/develop/programmability/eval-intro/
- ioredis (GitHub): https://github.com/redis/ioredis

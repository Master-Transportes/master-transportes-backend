# 📍 Etapa 3 — Redis GEO, presença e localização em tempo real

> **Status: implementada, corrigida após auditoria independente e verificada** (2026-11-18).
> Este documento reflete o que foi **realmente implementado**, não o plano original. Roadmap
> principal: [`mvp-tempo-real.md`](./mvp-tempo-real.md).
>
> **Correções da auditoria (A1, A2, A3, B1, F1, F2) aplicadas e testadas** — ver seção 10.

## 1. Arquitetura resultante

```
DriverStreamService (WebSocket /driver/stream)
        │  heartbeat / location.updated (Zod validado)
        ▼
DriverPresenceService ──scripts Lua atômicos──► Redis 7.2 (ioredis)
        │                                        ├── driver:geo          (ZSET GEO)
        │                                        └── driver:state:<id>   (HASH + TTL)
PostgreSQL (fonte de verdade: identidade, aprovação, "Receber corridas", corridas)

Futuro DispatchService (Etapa 6) ──► findNearbyDrivers() + filtros de domínio
```

Separações mantidas: **Connection Registry em memória** (localizar conexões locais), **Redis**
(presença/localização volátil, compartilhado entre instâncias), **PostgreSQL** (estado definitivo),
**Stream** (comunicação em tempo real — não decide disponibilidade nem corrida).

## 2. Arquivos

| Tipo         | Arquivo                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Novo         | `src/services/driver-presence.service.ts`                                                                             |
| Alterado     | `src/services/driver-stream.service.ts` (integração presença; ordenação local removida)                               |
| Alterado     | `src/infra/cache/redis-client.ts` (conexão proativa no boot)                                                          |
| Novos testes | `src/services/__tests__/driver-presence.integration.spec.ts` (Redis real), ajustes em `driver-stream.service.spec.ts` |
| Smoke        | `scripts/smoke-driver-presence-verify.ts`, `scripts/smoke-driver-presence-hold.ts`                                    |
| Docs         | `docs/roadmap/mvp-tempo-real.md` (status Etapa 3), `docs/streaming/redis-e-distribuicao.md`                           |

## 3. Contrato do `DriverPresenceService`

| Operação                                       | Comportamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claimConnection(userId, connectionId)`        | A conexão mais recente assume a propriedade do estado **e invalida o GPS anterior na mesma execução** (`HSET connectionId` + `HDEL receivedAt/sampledAt/accuracy` + `ZREM` do membro GEO + `PEXPIRE`): uma conexão nova sem localização própria NÃO aparece na descoberta com a posição da substituída.                                                                                                                                                                                                                                                                                                                        |
| `recordActivity(userId, connectionId)`         | Heartbeat: renove presença/`activityAtMs` **somente se a conexão ainda for a dona**. **NÃO cria estado** — conexão substituída (ou estado expirado) jamais recupera a propriedade por heartbeat. **Não** altera coordenadas nem `sampledAt`/`receivedAt`. Resultados: `renewed` / `superseded` / `absent` (estado expirado).                                                                                                                                                                                                                                                                                                   |
| `recordLocation(userId, connectionId, sample)` | GPS **atômico**, com TODAS as validações antes de qualquer escrita (Lua não tem rollback): estado ausente ⇒ `absent`; dono divergente ⇒ `superseded`; `sampledAt` futuro além da tolerância (decidido com `TIME` do Redis) ⇒ `future`; `sampledAt ≤ atual` ⇒ `stale`; caso contrário `GEOADD` + estado (`receivedAt` do relógio do Redis) + TTL na mesma execução ⇒ `accepted`. Coordenadas fora dos limites Web Mercator ⇒ `invalid`.                                                                                                                                                                                         |
| `releaseConnection(userId, connectionId)`      | Desconexão: `DEL` + `ZREM` **somente se esta conexão for a dona** (`absent` / `not-owner` / `released`). NÃO é chamado no aceite de corrida.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `isPresent(userId)`                            | Presença = estado existe (TTL de atividade). O Map local NÃO decide presença global.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `findNearbyDrivers(lng, lat, raio, limit)`     | `GEOSEARCH ... ASC WITHDIST` (sem `COUNT ANY` — preserva ordenação exata) + filtragem por membro em script atômico: estado existe + **duplo frescor** (`receivedAt` ≤ 45 s **E** `sampledAt` ≤ 45 s **E** sem futuro além da tolerância) + precisão ≤ 200 m. Órfãos (estado vencido) recebem `ZREM` condicional na própria leitura. Sobreseleção: página inicial 4×limit, ampliação quando a página vem cheia (corrigida na auditoria), até 3 rodadas com teto de 256 — **limitação documentada: densidades acima do teto não são totalmente cobertas nesta consulta**. Erros do Redis **propagam** (fail-closed no chamador). |

Fluxo pós-correção no stream: `superseded`/`absent` ⇒ o servidor **encerra a conexão**
(log + `stream.close()`), forçando reconexão com novo claim — recuperação controlada, sem
re-claim implícito por heartbeat ou GPS. `stale`/`future`/`invalid` ⇒ amostra ignorada com
`log.debug`, conexão continua.

## 4. Chaves Redis

| Chave                   | Tipo       | Conteúdo                                                                        | TTL                               | Quem escreve/remove                                                             |
| ----------------------- | ---------- | ------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `driver:geo`            | ZSET (GEO) | membro `userId`, score geohash                                                  | — (limpeza oportunista)           | `recordLocation` (escreve), `releaseConnection` e leitura condicional (removem) |
| `driver:state:<userId>` | HASH       | `connectionId`, `activityAtMs`, `receivedAtMs`, `sampledAtMs`, `accuracyMeters` | **60 s** (renovado por atividade) | conexão dona (escreve), `releaseConnection` (remove)                            |

## 5. Política temporal (valores iniciais, calibráveis)

| Parâmetro                                                               | Valor | Constante                                    |
| ----------------------------------------------------------------------- | ----- | -------------------------------------------- |
| TTL de presença                                                         | 60 s  | `DRIVER_PRESENCE_TTL_MS`                     |
| Idade máxima da localização (aplicada a `receivedAt` **e** `sampledAt`) | 45 s  | `DRIVER_LOCATION_MAX_AGE_MS`                 |
| Precisão máxima para elegibilidade de matching                          | 200 m | `DRIVER_MAX_ACCURACY_FOR_MATCHING_M`         |
| Janela de revalidação de identidade no stream                           | 30 s  | `DRIVER_STREAM_MIN_REVALIDATION_INTERVAL_MS` |
| Frescor de conexão para entrega sensível (contrato)                     | 60 s  | `DRIVER_STREAM_HEARTBEAT_STALENESS_MS`       |

Relógio: todas as marcações de servidor usam **`TIME` do Redis** (consistência entre instâncias).
Heartbeat não renova a validade da localização — coordenada coletada há minutos não é elegível
mesmo recebida agora (provado no teste 11).

## 6. Concorrência, conexões e desconexão

- `connectionId` é gerado **pelo servidor** (`randomUUID`) por conexão; a propriedade é assumida
  atomicamente no `claim`.
- Mensagens e limpeza de conexão antiga são **no-ops** contra o estado da nova (`superseded` /
  `not-owner`), verificados dentro do mesmo script atômico.
- Limpeza de membro GEO: a condição de expiração é reavaliada **dentro do script** que remove —
  uma busca concorrente nunca remove posição renovada.
- Queda abrupta sem `finally`: o TTL de presença resolve (máx. 60 s) e a leitura remove o órfão.
- Falha do Redis no stream: log com throttle (30 s), **conexão permanece aberta**, nenhuma
  confirmação em falso; a descoberta é fail-closed (sem estado = sem candidato).
- Melhoria de infra: conexão proativa do cliente Redis no boot (`redis.connect()` no
  `redis-client.ts`) — elimina a corrida do primeiro comando pós-start (`lazyConnect`).

## 7. Integração no stream

`heartbeat` → `recordActivity`; `location.updated` → `recordLocation` (dados já validados pelo
Zod). A ordenação in-memory da Etapa 2 foi **removida** — a autoridade de ordenação é o script
Lua no Redis (um único mecanismo, compartilhado entre conexões/instâncias). O stream continua
útil durante a viagem com "Receber corridas" desativado; o aceite de corrida (Etapa 5) não deve
chamar `releaseConnection`.

## 8. Testes executados

| Suíte                                                              | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários (`npm test`)                                             | **179 pass / 0 fail** — encaminhamento heartbeat→`recordActivity`, GPS→`recordLocation`, falha do Redis não fecha a conexão nem falso-confirma, `superseded`/`absent` encerram a conexão, janela de 30 s, registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Integração Redis real (`TEST_REDIS_URL=redis://127.0.0.1:6379/15`) | **19 pass / 0 fail** — (1/2) dois motoristas em raio amplo ordenados por proximidade; (2) raio menor isolando o mais próximo; (3/4) GPS parado + heartbeat vivo ⇒ inelegível com presença viva; (5) sem atividade ⇒ TTL expira + ZREM do órfão; (5b/5c) heartbeat/GPS NÃO recriam estado expirado; (6/7) reconexão: heartbeat/GPS/limpeza da conexão antiga não afetam a nova; (8) amostra antiga não sobrescreve; (9) atualizações concorrentes mantêm a mais recente; (10) limpeza antiga não remove dados renovados; (11) GPS coletado há 8 min não é elegível mesmo recebido agora; (11b/11c) sampledAt futuro rejeitado / dentro da tolerância; (12) precisão insuficiente/desconhecida inelegível; (13) Redis indisponível rejeita (sem falso-sucesso); (14) buscas estáveis; (15) limite de resultados + coordenadas inválidas; (16) sobreseleção com página cheia de órfãos; (17) claim invalida GPS da conexão substituída |
| Verificações                                                       | `tsc --noEmit` ✔ · `eslint` ✔ · `prettier --check` ✔ · `drizzle-kit check` ✔ (sem migration — schema PostgreSQL não mudou)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 9. Smoke real do Encore (evidências)

Motorista de teste `presenca-smoke-driver-*` APPROVED, conexão em `/driver/stream` com JWT:

- **Com conexão aberta (t+10s):**
  - `STATE: {"connectionId":"010664cf-…","activityAtMs":"1794973184442","sampledAtMs":"1794973184441","receivedAtMs":"1794973184442","accuracyMeters":"12"}`
  - `GEOPOS: [["-60.02100080251693726","-3.11900100113874856"]]`
  - `PRESENTE: true`
  - `NEARBY (Manaus, 5km): [{"userId":"5c285749-…","distanceMeters":0.1426,"receivedAtMs":…,"sampledAtMs":…,"accuracyMeters":12}]`
- **Após desconexão (t+25s):** `STATE: {}`, `GEOPOS: [null]`, `HGETALL` vazio e `ZSCORE` nulo —
  limpeza da conexão dona executada no `finally`.
- `scripts/smoke-driver-stream.ts`: `SMOKE OK` — handshake autenticado, `stream.connected`,
  type desconhecido descartado pelo runtime, fail fast em violação, reconexão.

## 10. Correções da auditoria independente (aplicadas e testadas)

| ID    | Problema                                                                                                                                    | Correção                                                                                                                                                                                                    | Prova                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A1    | GPS com `sampledAt` futuro congelava a posição e bloqueava GPS real por ~10 min                                                             | Tolerância futura única (`DRIVER_SAMPLE_FUTURE_TOLERANCE_MS = 10 s`, compartilhada Zod/Service) validada **no script Lua com `TIME` do Redis**; filtro de descoberta também valida limite inferior de idade | Integração 11b/11c: +9 min ⇒ `future` (nada gravado); +6 s ⇒ aceito; GPS real depois ⇒ `accepted` e encontrado                   |
| A2    | Ampliação progressiva nunca executava (`pageFull` com formato flat)                                                                         | `pageFull` calculado pelo nº real de membros (formato aninhado do ioredis)                                                                                                                                  | Integração 16: 16 órfãos + 1 válido depois deles ⇒ válido encontrado e órfãos limpos                                             |
| B1    | Conexão antiga podia reassumir a propriedade após expiração (heartbeat e GPS recriavam estado)                                              | Heartbeat e GPS **não criam estado**: só renovam se donos; recuperação = reconexão com `claimConnection`; stream encerra conexão `superseded`/`absent`                                                      | Integração 5b/5c/6+7; smoke duas conexões reais (seção 10b)                                                                      |
| A4    | **Claim não invalidava o GPS da conexão substituída** — nova conexão aparecia na descoberta com a posição da anterior (verificação final 1) | `CLAIM_SCRIPT` agora faz `HDEL` dos metadados de GPS + `ZREM` do membro GEO **na mesma execução atômica** do claim                                                                                          | Integração 17: mesmo motorista, nova conexão sem GPS ⇒ excluído da descoberta (`ZSCORE` nulo); primeiro GPS da nova ⇒ encontrado |
| A3    | Descartes (`stale`/`future`/`invalid`) silenciosos                                                                                          | `log.debug` controlado no stream (sem coordenadas)                                                                                                                                                          | Unitários                                                                                                                        |
| F1/F2 | Docs divergentes (dto header; bullet de ordenação do MVP)                                                                                   | Corrigidos para o comportamento real                                                                                                                                                                        | —                                                                                                                                |

## 11. Smoke com DUAS conexões WebSocket reais simultâneas

`scripts/smoke-driver-two-connections.ts` (motorista APPROVED, token real, Redis real):

```
✓ 1. A conectou, enviou GPS e o estado existe no Redis
✓ 3. A enviou heartbeat após B assumir e foi ENCERRADA pelo servidor
✓ 4. B continua com estado válido no Redis
✓ 4b. Presença global confirmada
✓ 5. B tentou GPS após A assumir e foi ENCERRADA pelo servidor
✓ 6. O GPS da conexão substituída NÃO sobrescreveu o estado de A
✓ 6b. findNearbyDrivers encontra o motorista
SMOKE TWO-CONNECTIONS OK
```

Comportamento de detecção: **orientado a mensagens** (sem timer) — a conexão substituída é
encerrada na primeira mensagem que ela tentar após perder a propriedade; se ficar ociosa, o TTL
de presença resolve sozinho.

## 12. Limita��es restantes

- Pub/Sub/NSQ, matching/despacho, entrega de ofertas e push permanecem para as etapas 5–8 (por
  decisão: usados só quando houver dependência funcional real).
- Limpeza do índice GEO é oportunista (na leitura); se o acúmulo de órfãos entre buscas se
  tornar relevante, considerar índice temporal auxiliar ou reconciliação na Etapa 5.
- `findNearbyDrivers` NÃO é autorização final de oferta: falta disponibilidade "Receber
  corridas", corrida ativa e verificação na hora da entrega (Etapa 5/6).
- Redis single-node de desenvolvimento; antes de produção, revisar infraestrutura (Etapa 8).

## 13. Próximas dependências do roadmap

1. **Etapa 4/6** — despacho: `DispatchService` consumindo `findNearbyDrivers` + filtros
   PostgreSQL (`available`, `APPROVED`, corrida ativa).
2. **Etapa 5** — aceite transacional + Pub/Sub (`ride-requested`) com Outbox.
3. **Etapa 5/8** — entrega de ofertas via stream com `isEligible()` + `isHeartbeatFresh()` na hora.

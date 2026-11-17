# Redis: presença e distribuição entre servidores

O Redis tem **dois usos distintos** que precisam ser separados:

1. **Presença / estado temporário** — quem está online, estado volátil.
2. **Distribuição de eventos** — quando há múltiplas réplicas do servidor.

## 1. Presença e estado temporário

O SDK nativo do Encore oferece `CacheCluster` e `Keyspaces`. Exemplo: registrar
atividade recente de um usuário.

```ts
import {
  CacheCluster,
  StringKeyspace,
  expireInSeconds,
} from "encore.dev/storage/cache";

const cluster = new CacheCluster("presence", {
  evictionPolicy: "allkeys-lru",
});

const presence = new StringKeyspace<{ userId: string }>(cluster, {
  keyPattern: "presence/:userId",
  defaultExpiry: expireInSeconds(45),
});

export async function markOnline(userId: string) {
  await presence.set({ userId }, "online");
}

export async function isOnline(userId: string) {
  const value = await presence.get({ userId });
  return value === "online";
}
```

> ⚠️ Este exemplo marca **atividade recente**. Para presença com múltiplos dispositivos,
> o controle deve ser **por sessão/conexão**, com expiração e renovação periódica —
> não basta apagar a chave do usuário quando **uma única** conexão fecha.

> Nota: a interface de cache do Encore é uma API de operações sobre chaves. **Ela não
> expõe automaticamente um Redis Pub/Sub** para distribuir mensagens entre réplicas.

## 2. Redis Pub/Sub entre múltiplas instâncias

Com várias réplicas, o mapa de conexões (`Map<string, Set<Stream>>`) é **local** a cada
processo. O destinatário pode estar conectado em outro servidor:

```
Réplica A                    Réplica B
├── user-X (celular)         ├── user-Y (celular)   ← destinatário está aqui!
└── user-Z (navegador)       └── user-X (navegador)
```

**Princípio:** cada réplica se inscreve no canal compartilhado. Quando um evento chega,
cada uma procura o destinatário **no seu próprio mapa de conexões**.

```ts
// Exemplo conceitual de integração com um Redis externo.
// Necessita inicialização e gerenciamento de ciclo de vida.

import Redis from "ioredis";

const publisher = new Redis(redisUrl);
const subscriber = new Redis(redisUrl);

await subscriber.subscribe("realtime.events");

subscriber.on("message", (_channel, payload) => {
  const event = JSON.parse(payload);

  // deliver() é o roteador local do exemplo do chat.
  void deliver(event.targetUserId, event.data);
});

// Uma publicação chega a TODAS as réplicas inscritas.
await publisher.publish(
  "realtime.events",
  JSON.stringify({
    targetUserId: "user-Y",
    data: {
      type: "notification",
      message: "Nova corrida disponível",
    },
  }),
);
```

### Cuidados de integração

Este trecho demonstra o **mecanismo**; não colocar diretamente dentro de cada handler de
conexão. O assinante deve ser:

- Inicializado **uma vez por processo**;
- Com **reconexão** automática;
- Com **validação** dos eventos recebidos;
- Com **encerramento controlado**;
- Com **credenciais armazenadas com segurança** (`src/config/env.ts` neste projeto).

### Limitação fundamental

O Redis Pub/Sub tradicional é **efêmero**: se uma réplica estiver desconectada no momento
da publicação, **não receberá** aquele evento depois. Por isso a **persistência no
PostgreSQL continua indispensável**.

> Nota para este projeto: `ioredis` já está instalado (`src/infra/cache`), mas **sem
> consumidores**. Ativar distribuição via Redis aqui exige decisão arquitetural própria
> (ver `AGENTS.md` — pendências conhecidas).

# Master Transport Backend

Backend do Master Transport construído com **Encore.ts**, **TypeScript**, **Drizzle ORM + PostgreSQL/PostGIS**, **Redis**, **RabbitMQ** e **Zod**.

## Stack

| Tecnologia | Uso |
|---|---|
| Encore.ts | Runtime e API endpoints |
| TypeScript | Toda a base |
| Drizzle ORM + PostgreSQL | Dados persistentes |
| Redis (ioredis) | Cache de sessão, profile, localização/status de motoristas e pedidos de corrida |
| RabbitMQ (amqplib) | Fila de eventos de rides |
| Zod | Validação de schemas |
| h3-js | Geohashing/hexágonos |

## Estrutura

```
src/
├── api/                   # Endpoints Encore (handler + encore.service.ts por módulo)
│   ├── auth/              #   Refresh, logout, sessões
│   ├── user/              #   Perfil, histórico, request/cancel ride
│   ├── driver/            #   Perfil, histórico, localização, online/offline, ofertas
│   ├── dashboard/         #   Admin: listar/ativar/banir usuários
├── services/              # Lógica de negócio (singletons)
│   ├── user.service.ts    #   Registro, login, /me, perfil, rides
│   ├── driver.service.ts  #   Registro, login, perfil, localização, ofertas
│   ├── profile.service.ts #   Perfil e senha compartilhados
│   ├── dashboard.service.ts # Ações de admin
│   └── wallet.service.ts   # Carteira do motorista
├── dto/                   # DTOs de entrada/saída (+ shared.types.ts com enums da API)
├── validations/           # Schemas Zod
├── middlewares/           # Autorização (auth gateway + role/client/driver/admin)
├── constants/             # Constantes de negócio (ride, cache, rate-limit, system)
├── auth/                  # JWT (sign/verify)
├── utils/                 # Utils gerais (geo.ts)
└── infra/                 # Infra por tecnologia (contracts/ + implementations/)
    ├── drizzle/           #   PostgreSQL/PostGIS (schema, client, contracts, implementations)
    ├── redis/             #   Redis (client, keys-cache, contracts, implementations)
    ├── rabbitmq/          #   Mensageria de rides (connection, contracts, implementations)
    ├── metrics/           #   Métricas
    └── observability/     #   Logger
```

## Primeiros Passos

```bash
# Infra (PostgreSQL + Redis + RabbitMQ)
docker compose up -d

# Migrations + seed (usuários/drivers de teste)
npx drizzle-kit migrate
npm run seed

# Terminal único (sobe infra, migra, seed e roda Encore com watch)
npm run dev
```

Abra o dashboard local em <http://localhost:9400/>.

## Contexto para IA

O arquivo `AGENTS.md` contém o contexto primário para assistentes de código. Consulte-o primeiro.

Documentação do Encore.ts está em `.github/copilot-instructions.md` — carregue apenas quando necessário.

## Redis

Redis single-node para cache de sessão, profile, localização/status de motoristas e pedidos de corrida. Configurado via `REDIS_STATE_URL` (default: `redis://127.0.0.1:6379`).

## Testes

```bash
encore exec -- bun test
```

## Docker (Infra)

```bash
# Sobe PostgreSQL + Redis + RabbitMQ
docker compose up -d

# Migrations + seed
npx drizzle-kit migrate
npm run seed
```

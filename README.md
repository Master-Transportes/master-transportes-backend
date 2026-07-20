# Master Transport Backend

Backend do Master Transport construído com **Encore.ts**, **TypeScript**, **Drizzle ORM + PostgreSQL/PostGIS**, **Redis** e **Zod**.

## Stack

| Tecnologia | Uso |
|---|---|
| Encore.ts | Runtime, API endpoints, auth |
| Drizzle ORM + PostgreSQL/PostGIS | Dados persistentes + queries geoespaciais |
| Redis (ioredis) | Cache de sessão e profile de usuário |
| Zod | Validação de schemas |

## Estrutura

```
src/
├── api/                  # Endpoints Encore (finos)
│   ├── auth/auth.ts      #   Login, register, refresh, logout
│   ├── user/user.ts      #   Perfil, histórico de corridas
│   ├── driver/driver.ts  #   Perfil, histórico de corridas
│   ├── access/access.ts  #   Login, /me
│   ├── dashboard/        #   Admin: listar/ativar/banir usuários
│   ├── area/area.ts      #   Resolução de região por coordenada
├── services/             # Business logic
│   ├── access.service.ts #   SignIn, refresh, me
│   ├── session.service.ts#   Gerenciamento de sessões (Redis)
│   ├── user.service.ts   #   CRUD clientes
│   ├── driver.service.ts #   CRUD motoristas
│   ├── dashboard.service.ts # Admin actions
│   ├── area.service.ts   #   Resolução de região
├── repositories/         # Acesso a dados (Drizzle)
├── infra/
│   ├── db/               # Drizzle schema + client
│   ├── cache/            # Redis client, keys
│   └── observability/    # Logger, métricas
├── interfaces/           # Tipos e DTOs compartilhados
├── validations/          # Schemas Zod
└── auth/                 # JWT auth
```

## Primeiros Passos

```bash
npm install
encore run
```

Abra o dashboard local em <http://localhost:9400/>.

## Contexto para IA

O arquivo `AGENTS.md` contém o contexto primário para assistentes de código. Consulte-o primeiro.

Documentação do Encore.ts está em `.github/copilot-instructions.md` — carregue apenas quando necessário.

## Redis

Redis single-node para cache de sessão e profile. Configurado via `REDIS_STATE_URL` (default: `redis://127.0.0.1:6379`).

## Testes

```bash
encore exec -- bun test
```

## Docker (Infra)

```bash
# Sobe PostgreSQL + Redis
docker compose up -d

# Migrations + seed
npx drizzle-kit migrate
npm run seed
```

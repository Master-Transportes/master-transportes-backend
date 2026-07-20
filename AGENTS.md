# Project Agent Rules

## Prioridades

1. Seguir implementação real do projeto — SEMPRE olhe o código antes de assumir
2. Reutilizar padrões existentes — consistência > criar novo
3. Evitar overengineering — solução mais simples que funciona

## Contexto e Tokens

Este arquivo é seu contexto PRIMÁRIO. Para documentação detalhada:
- `README.md` — visão geral do projeto
- `.github/copilot-instructions.md` — documentação do Encore.ts

NÃO carregue arquivos grandes sem necessidade.

## Stack Atual

| Tecnologia | Uso |
|---|---|
| Encore.ts | Runtime + API endpoints + auth |
| TypeScript | Toda a base |
| PostgreSQL + PostGIS | Dados persistentes via Drizzle ORM |
| Redis (ioredis) | Cache de sessão e profile de usuário |
| Zod | Validação de schemas |
| Prettier | Formatação de código |

## Estrutura

```
src/api/                    → Endpoints Encore (finos, delegam para services)
├── auth/auth.ts            →   Register, login, refresh, logout
├── user/user.ts            →   Perfil, histórico de corridas
├── driver/driver.ts        →   Perfil, histórico de corridas
├── access/access.ts        →   SignIn, me
├── dashboard/dashboard.ts  →   Admin: listar/banir/ativar usuários
├── area/area.ts            →   Resolução de região por coordenada

src/infra/adapters/         → Adapter classes (DrizzleDatabase)
src/infra/cache/            → RedisCache class (cache + redis-client)
src/services/               → Business logic
├── access.service.ts       →   SignIn, refresh, me
├── session.service.ts      →   Gerenciamento de sessões (Redis)
├── user.service.ts         →   CRUD clientes
├── driver.service.ts       →   CRUD motoristas
├── dashboard.service.ts    →   Admin actions
├── area.service.ts         →   Resolução de região
└── __tests__/              →   Specs (access, session)

src/repositories/           → Acesso a dados (Drizzle ORM)
├── user.repository.ts
├── driver.repository.ts
└── ride.repository.ts

src/infra/                  → DB (Drizzle schema), Cache (Redis), Observability
src/interfaces/             → Tipos e DTOs compartilhados (exceto ports)
src/validations/            → Schemas Zod
src/auth/                   → JWT auth
```

## Regras Arquiteturais

- Services/repositories recebem classes concretas no construtor (`RedisCache`, `DrizzleDatabase`)
- Cada classe de infra tem responsabilidade única e é usada diretamente — sem interfaces Port
- Zero `any`/`@ts-ignore`/`@ts-nocheck` no domínio — apenas nas fronteiras de infra (ioredis)

### Gerais

- APIs finas em `src/api`, business logic em `src/services`
- PostgreSQL = source of truth
- Redis = cache de sessão e profile (nunca source of truth)
- Validação com Zod + `validateOrThrow`
- Erros de negócio com `APIError` do Encore
- Cada módulo (repository, service) exporta seu próprio singleton no final do arquivo — sem `di.ts` central
- Qualquer código novo deve parecer originalmente escrito dentro do projeto

## Uso de Subagents

Use APENAS para: arquitetura, documentação, múltiplos módulos, refactors grandes, mudanças cross-module, alterações distribuídas.

NÃO use para: mudanças pequenas, arquivos isolados, bugs simples, ajustes locais, tarefas triviais.

## Arquitetura

```
API (Encore)
  ├── Redis: sessões, cache de profile
  └── PostgreSQL: dados persistentes (users, drivers, rides, vehicles, areas)
```

### Fluxo

```
POST /auth/register → Auth endpoint → UserService.create → UserRepository (PG)
POST /access/login  → Access endpoint → AccessService → UserRepository (PG) + SessionService (Redis)
GET  /access/me     → Access endpoint → AccessService → UserRepository (PG) + RedisCache
GET  /user/rides    → User endpoint → UserService → RideRepository (PG)
```

## Rodando Localmente

### Pré-requisitos

```bash
# Infra (PostgreSQL + Redis)
docker compose up -d

# Migrations + seed
npx drizzle-kit migrate
npm run seed
```

### Terminal único

```bash
npx encore run
```

## Docker

```bash
encore build docker master-transporte-api:latest
```

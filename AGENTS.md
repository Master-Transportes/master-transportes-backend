# Project Agent Rules

## Prioridades
1. Seguir implementação real do projeto — SEMPRE olhe o código antes de assumir
2. Reutilizar padrões existentes — consistência > criar novo
3. Evitar overengineering — solução mais simples que funciona

## Contexto e Tokens
Este arquivo é seu contexto PRIMÁRIO. Para documentação detalhada:
- `README.md` — visão geral do projeto
- `.github/copilot-instructions.md` — documentação do encore.dev nosso framework para o backend

Não carregue arquivos grandes sem necessidade.

## Stack Atual
| Tecnologia | Uso |
|---|---|
| encore.dev | Runtime e API endpoints |
| TypeScript | Toda a base |
| PostgreSQL + PostGIS | Dados persistentes (via Drizzle ORM) |
| Redis (ioredis) | Cache de sessão e profile |
| RabbitMQ (amqplib) | Fila de eventos de rides |
| Zod | Validação de schemas |
| h3-js | Geohashing/hexágonos |
| Prettier | Formatação de código (scripts `npm run prettier` e `npm run prettier:fix`) |

## Estrutura
```
src/api/                → Endpoints encore.dev
├── auth/               → SignIn, JWT, sessões
├── dashboard/          → Admin: listar/banir/ativar usuários
├── driver/             → Perfil, histórico de corridas
├── user/               → Perfil, histórico de corridas
├── area/               → Resolução de região por coordenada
src/infra/              → DB (Drizzle schema), Cache (Redis), Observability, RabbitMQ, Session
├── cache/              → CACHES ESPECIALIZADAS (driver‑location‑cache, driver‑status‑store, keys‑cache, ride‑request‑store, user‑cache)
├── db/                 → Drizzle schema
├── metrics/            → Métricas de observabilidade
├── observability/      → Observabilidade
├── rabbitmq/           → Publishers/Consumers de eventos de rides
├── session/            → Redis‑Session‑Store
├── schema/             → Drizzle schema files
src/constants/          → Constantes de negócio
src/dto/                → DTOs de entrada/saída
src/contracts/          → Ports (interfaces) para repositórios e eventos
src/interfaces/         → Tipos compartilhados
src/middlewares/        → Middlewares de autorização e validação
src/repositories/       → Acesso a dados (Drizzle ORM)
src/services/           → Lógica de negócio
├── user.service.ts
├── driver.service.ts
├── dashboard.service.ts
├── area.service.ts
├── auth.service.ts
src/validations/       → Schemas Zod
src/utils/              → Utils gerais (geo.ts)
```

## Regras Arquiteturais
- **Ports & Adapters**: interfaces em `src/contracts/`, implementações em `repositories/` ou infra (`RedisCache`, `RabbitMQPublisher`, etc.)
- Cada serviço depende de **Ports**, não de classes concretas
- PostgreSQL = source of truth; Redis = cache de sessão/profile; RabbitMQ = fila de eventos
- Validação com Zod + `validateOrThrow`
- Erros de negócio com `APIError` do encore.dev
- Código novo deve seguir padrões do projeto, sem `any`/`@ts-ignore` exceto em fronteiras de infra
- Singletons são exportados por módulo (sem `di.ts` central)

## Uso de Subagents
Use APENAS para: arquitetura, documentação, múltiplos módulos, refactors grandes, mudanças cross‑module, alterações distribuídas.  
NÃO use para: mudanças pequenas, arquivos isolados, bugs simples, ajustes locais, tarefas triviais.

## Arquitetura
```
API (encore.dev)
  ├── Redis: sessões, cache de profile
  ├── PostgreSQL: dados persistentes (users, drivers, rides, vehicles, areas)
  └── RabbitMQ: fila de eventos de rides
```

## Fluxo
```
POST /auth/register → Auth endpoint → UserService.create → UserRepository (PG)
POST /auth/login    → Auth endpoint → AccessService → UserRepository (PG) + RedisSessionStore
GET  /auth/me       → Auth endpoint → AccessService → UserRepository (PG) + CacheLayer
GET  /user/rides    → User endpoint → UserService → RideRepository (PG)
Ride events publicados → RabbitMQ → Consumers (ex.: ride‑event‑publisher)
```

## Rodando Localmente
### Pré‑requisitos
```bash
# Infra (PostgreSQL, Redis, RabbitMQ)
docker compose up -d
# Migrations + seed
npx drizzle-kit migrate
npm run seed   # roda inits de areas e users
```

### Terminal único
```bash
# Start com watch em mudanças de código
npm run dev
```

## Docker
```bash
encore build docker master-transporte-api:latest
```
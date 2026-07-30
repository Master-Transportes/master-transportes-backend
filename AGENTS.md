# Project Agent Rules

## Prioridades
1. Seguir implementação real do projeto — SEMPRE olhe o código antes de assumir
2. Reutilizar padrões existentes — consistência > criar novo
3. Sempre priorizar o código limpo !

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
src/infra/
├── drizzle/            → PostgreSQL via Drizzle ORM
│   ├── contracts/      → IUserRepository, IDriverRepository, IRideRepository, etc.
│   ├── implementations/→ user.repository.ts, driver.repository.ts, etc.
│   ├── drizzle.ts      → Conexão Drizzle
│   ├── schema/         → Schema Drizzle (tabelas, enums)
│   └── index.ts        → Barrel (singletons)
├── redis/              → Cache e sessão
│   ├── contracts/      → IUserCache, IDriverLocationCache, IDriverStatusStore, IRideRequestStore, ISessionStore
│   ├── implementations/→ redis-user-cache.ts, redis-driver-location-cache.ts, etc.
│   ├── redis-client.ts → Conexão ioredis (singleton)
│   ├── keys-cache.ts   → Definições de chaves (CACHE_KEYS, MATCHING_KEYS)
│   └── index.ts        → Barrel (singletons)
├── rabbitmq/           → Mensageria
│   ├── contracts/      → IRideEventPublisher
│   ├── implementations/→ rabbit-ride-event-publisher.ts, rabbit-ride-accepted-consumer.ts
│   ├── connection.ts   → Conexão AMQP compartilhada (único ensureChannel)
│   └── index.ts        → Barrel (singletons)
├── metrics/            → Métricas de observabilidade
└── observability/      → Logger
src/services/           → Lógica de negócio (singletons, sem interfaces)
├── user.service.ts
├── driver.service.ts
├── profile.service.ts
├── dashboard.service.ts
└── area.service.ts
src/dto/                → DTOs de entrada/saída
src/middlewares/        → Middlewares de autorização
src/validations/        → Schemas Zod
src/constants/          → Constantes de negócio
src/utils/              → Utils gerais (geo.ts)
```

## Regras Arquiteturais

### Infra por tecnologia
- Cada tecnologia de infra tem sua própria pasta com `contracts/` e `implementations/`:
  - `src/infra/redis/` — contratos e implementações Redis
  - `src/infra/drizzle/` — contratos e implementações PostgreSQL/Drizzle
  - `src/infra/rabbitmq/` — contratos e implementações RabbitMQ
- Cada módulo exporta um barrel (`index.ts`) com seus singletons

### Ports & Adapters
- Interfaces (ports) em `contracts/` dentro de cada módulo de infra
- Implementações (adapters) em `implementations/` dentro do mesmo módulo
- Serviços dependem de **ports**, não de classes concretas de infra
- PostgreSQL = source of truth; Redis = cache de sessão/profile; RabbitMQ = fila de eventos

### Contratos vs Implementações
- **Tipos moram no contrato**, nunca na implementação
- ❌ `export type { UserRow } from "./implementations/user.repository"` — NUNCA re-exporte tipos da implementação
- ✅ `import type { UserRow } from "./contracts/IUserRepository"` — sempre importe do contrato
- Re-exportar tipo da implementação cria duas fontes da verdade e inverte a dependência

### Interfaces: quando criar
- **Infra (Redis, PostgreSQL, RabbitMQ):** sempre criar interface — permite trocar tecnologia e mockar em testes
- **Serviços (UserService, DriverService, ProfileService):** NÃO criar interface — serviços são terminais, chamados direto pela API, sem polimorfismo
- Só crie abstração se houver motivo real (2+ implementações ou necessidade de mock)

### Validação com Zod
- Schemas são importados **diretamente** no arquivo que os usa
- ❌ NUNCA passar schema como parâmetro de método (`method(payload, schema: ZodObject)`)
- ❌ NUNCA usar casting após `validateOrThrow` (`as unknown as`, `as { ... }`)
- ✅ SEMPRE: `const validated = validateOrThrow(MeuSchema, payload)` — tipo inferido automaticamente
- Erros de negócio com `APIError` do encore.dev

### Conexões de infra
- Um único ponto de conexão por tecnologia
- ❌ NUNCA duplicar código de conexão/canal entre arquivos
- Consumers e publishers compartilham a mesma conexão (ex.: `connection.ts` no RabbitMQ)
- Singletons são exportados por módulo (sem `di.ts` central)

### Qualidade de código
- Código novo deve seguir padrões do projeto
- Sem `any`/`@ts-ignore` exceto em fronteiras de infra
- Sem código morto — se ninguém importa, delete

### Antes de codificar
1. **Olhe o código existente** — seguir padrão do projeto > criar padrão novo
2. **Pergunte-se: isso realmente precisa de abstração?** — se não houver 2+ implementações, não crie interface
3. **Menos arquivos é melhor** — delegate desnecessário (classe que só redireciona) = remova
4. **Entenda o que já existe** — não duplique lógica nem conexão

## Uso de Subagents
Use APENAS para: arquitetura, documentação, múltiplos módulos, refactors grandes, mudanças cross‑module, alterações distribuídas.  
NÃO use para: mudanças pequenas, arquivos isolados, bugs simples, ajustes locais, tarefas triviais.

## Arquitetura
```
API (encore.dev)
  ├── Redis: sessões, cache de profile, localização de drivers, lock de corrida
  ├── PostgreSQL: dados persistentes (users, drivers, rides, vehicles, areas)
  └── RabbitMQ: fila de eventos de rides
```

## Fluxo
```
POST /auth/register → Auth endpoint → UserService.register → UserRepository (PG)
POST /auth/login    → Auth endpoint → UserService.signIn → UserRepository (PG) + RedisSessionStore
GET  /auth/me       → Auth endpoint → UserService.getMe → UserRepository (PG) + RedisUserCache
GET  /user/rides    → User endpoint → UserService.getRides → RideRepository (PG)
POST /user/rides/request → User endpoint → UserService.requestRide → RideRequestStore (Redis) + RabbitMQ
POST /driver/location    → Driver endpoint → DriverService.updateLocation → DriverLocationCache (Redis)
POST /driver/online      → Driver endpoint → DriverService.goOnline → DriverLocationCache (Redis)
Ride events publicados → RabbitMQ → Consumers
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
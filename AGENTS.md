# AGENTS.md — Master Transporte B

## Prioridades
1. Seguir implementação real do projeto — SEMPRE olhe o código antes de assumir
2. Reutilizar padrões existentes — consistência > criar novo
3. Sempre priorizar código limpo

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
| PostgreSQL | Dados persistentes (via Drizzle ORM) |
| Redis (ioredis) | Cache de sessão, profile, wallet, localização |
| RabbitMQ (amqplib) | Fila de eventos de rides |
| Zod | Validação de schemas |
| h3-js | Geohashing/hexágonos |
| Prettier | Formatação de código (`.prettierrc` na raiz) |

## Estrutura
```
src/api/                → Endpoints encore.dev
├── auth/               → SignIn, JWT, sessões
├── dashboard/          → Admin: listar/banir/ativar usuários
├── driver/             → Perfil, corridas, wallet do motorista
├── user/               → Perfil, corridas, wallet do cliente
├── webhooks/           → Webhooks externos (Asaas)
src/services/           → Lógica de negócio (singletons, sem interfaces)
├── wallet.service.ts
├── payment.service.ts
├── user.service.ts
├── driver.service.ts
├── profile.service.ts
├── dashboard.service.ts
└── __tests__/          → Testes de integração (bun:test)
src/repositories/       → Acesso a dados
├── contracts/          → Interfaces (I prefix) + tipos Row/Data
├── mappers/            → Mapeamento DB row → domain row
├── *.repository.ts     → Implementações
├── index.ts            → Barrel (singletons)
src/cache/              → Cache Redis
├── contracts/          → Interfaces (I prefix + Cache/Store)
├── *.cache.ts          → Implementações Redis
├── index.ts            → Barrel (singletons)
src/infra/              → Infraestrutura compartilada
├── database/           → Drizzle schema, conexão, types
├── cache/              → Redis client, keys-cache
└── messaging/          → RabbitMQ connection (shared)
src/messaging/          → Publicação e consumo de eventos
├── contracts/          → IRideEventPublisher
├── consumers/          → Consumers RabbitMQ (self-starting)
├── ride-publisher.ts   → Publisher
└── index.ts            → Barrel
src/integrations/       → APIs externas isoladas
└── asaas/              → Asaas (pagamento, webhook types)
src/dto/                → Data Transfer Objects (interfaces)
src/validations/        → Schemas Zod + validateOrThrow
src/constants/          → Constantes de negócio
src/middlewares/        → Auth, roles, rate limiting
src/utils/              → Utils gerais (geo.ts, document.ts, database.ts)
```

## Padrões de Código

### Serviços (Services)
- **SEM interfaces** — serviços são terminais, chamados direto pela API
- Constructor injection com interfaces de infra (IWalletRepository, IWalletCache, etc.)
- Singleton exportado na **última linha** do arquivo
- Validação com `validateOrThrow` **dentro do service**, NOS endpoints
- Errors com `APIError` do encore.dev (português)

```typescript
export class WalletService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly txRepo: IWalletTransactionRepository,
    private readonly walletCache: IWalletCache,
  ) {}

  async getBalance(ownerId: string, ownerType: WalletOwnerType): Promise<WalletBalanceResponse> {
    const validated = validateOrThrow(ListTransactionsSchema, options ?? {});
    // ... lógica
  }
}
export const walletService = new WalletService(walletRepository, walletTransactionRepository, walletCache);
```

### Repositórios
- Interface: `I` + nome + `Repository` em `contracts/`
- Tipos: `Row` suffix para rows, `Data` suffix para criação
- Implementação: `class X implements IXRepository` + singleton
- Colunas: constante `COLUMNS` com `as const`
- Soft delete: `isNull(deletedAt)` em todas queries
- Transactions: `db.transaction()` com `SELECT FOR UPDATE` para locks

```typescript
// contracts/IWalletRepository.ts
export interface IWalletRepository {
  findByOwner(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow | null>;
  credit(walletId: string, data: CreditDebitData): Promise<WalletTransactionRow>;
}
```

### Cache
- Interface: `I` + nome + `Cache`/`Store` em `contracts/`
- Keys: definidas em `infra/cache/keys-cache.ts` (funções)
- TTL: definidos em `constants/cache.ts`
- **Invalidação obrigatóRIA** em TODA operação de escrita no service
- Balance cache: TTL 60s (wallet), profile cache: 600s

```typescript
// No service - SEMPRE invalidar após escrita
async credit(...) {
  const txEntry = await this.walletRepo.credit(walletId, { ... });
  await this.walletCache.invalidate(walletId); // ← obrigatório
  return txEntry;
}
```

### Validações
- Schemas: `PascalCase` + `Schema` em `validations/dto/{domain}.validate.ts`
- Importar `z` de `"zod"`
- `validateOrThrow(Schema, data)` retorna tipo inferido — NUNCA casting
- ❌ NUNCA passar schema como parâmetro de método

### Integrações Externas
- Isoladas em `src/integrations/{provider}/`
- Client HTTP com error class customizada
- Types separados do client
- Env vars para configuração (BASE_URL, API_KEY)

### API Endpoints
- Definidos com `api<Input, Output>()` do encore.dev
- Auth: `auth: true` (requer JWT) / `auth: false` (público)
- Extrair dados: `const { userID } = auth.getAuthData()!`
- Endpoints são **finos**: extrair auth → chamar service → retornar
- Paths: `/auth/*`, `/client/*`, `/driver/*`, `/dashboard/*`, `/webhooks/*`

```typescript
export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/client/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID, "USER");
  },
);
```

### Middlewares
- Auth gateway: `auth.gateway.ts` (verifica JWT + sessão)
- Roles: factory `createRoleMiddleware({ role, lookupFn, cache })`
- Rate limit: factory `createRateLimitMiddleware({ action, resolveIdentifier })`
- Webhook: validação de token via header customizado
- Atribuídos no `encore.service.ts` de cada service

### Mensageria (RabbitMQ)
- Publisher: objeto literal implementando interface (não classe)
- Consumers: self-starting via side-effect import em `messaging/index.ts`
- Exchange: topic, durable. Queue: durable. Routing keys: dot notation
- Conexão compartilhada via `infra/messaging/connection.ts`
- Poison messages (ZodError): nack sem requeue

## Fluxos Críticos

### Autenticação
```
POST /auth/login → UserService.signIn → UserRepository (PG) + SessionStore (Redis+PG) → JWT
GET  /auth/me    → UserService.getMe  → RedisUserCache → UserRepository (PG)
```

### Pagamento (Depósito Pix)
```
POST /client/wallet/deposit → PaymentService.createDeposit
  → Asaas.createCustomer + Asaas.createPayment → PaymentRepository (PG)
POST /webhooks/asaas → PaymentService.processWebhook
  → PaymentRepository.findWebhookEventByExternalId (idempotência)
  → PaymentRepository.updateStatus → WalletService.credit → WalletCache.invalidate
```

### Wallet
```
GET /client/wallet          → WalletService.getWallet → findOrCreateWallet
GET /client/wallet/balance  → WalletService.getBalance → Cache first, DB fallback
GET /driver/wallet/transactions → WalletService.getTransactions → WalletTransactionRepository
POST /driver/wallet/payout  → WalletService.requestPayout → validateOrThrow + debit + WalletCache.invalidate
```

### Corrida
```
POST /client/rides → UserService.requestRide → RideRequestStore (Redis lock) → RabbitMQ
POST /driver/offers/:id/accept → DriverService.acceptOffer → RabbitMQ
PUT  /driver/rides/:id/complete → DriverService.completeRide → RideRepository (PG)
```

## Convenções de Nomenclatura
| Elemento | Padrão | Exemplo |
|---|---|---|
| Arquivo | kebab-case | `wallet.service.ts` |
| Classe | PascalCase | `WalletService` |
| Singleton | camelCase | `walletService` |
| Interface (contrato) | `I` + PascalCase | `IWalletRepository` |
| Row type | PascalCase + `Row` | `WalletRow` |
| Data type | PascalCase + `Data` | `CreateWalletTransactionData` |
| DTO input | PascalCase + `DTO` | `RegisterUserDTO` |
| DTO response | PascalCase + `Response` | `WalletResponse` |
| Schema Zod | PascalCase + `Schema` | `PayoutSchema` |
| Cache interface | `I` + PascalCase + `Cache` | `IWalletCache` |
| Cache key | SCREAMING_SNAKE | `WALLET_BALANCE` |
| Constante | SCREAMING_SNAKE | `MIN_PAYOUT_AMOUNT_CENTS` |
| Error message | Português | `"Saldo insuficiente."` |

## Configuração de Ambiente
```bash
# Infra
docker compose up -d
# Migrations + seed
npx drizzle-kit migrate
npm run seed
# Desenvolvimento
npm run dev
```

### Env vars necessárias
```
DATABASE_URL          # PostgreSQL
REDIS_STATE_URL       # Redis
RABBITMQ_URL          # RabbitMQ
JWT_SECRET            # Chave JWT
ASAAS_KEY_SANDBOX     # Asaas API key
ASAAS_WEBHOOK_TOKEN   # Token webhook Asaas
```

## Testes
- Framework: `bun:test` (`encore exec -- bun test`)
- Localização: `src/services/__tests__/`
- Integração (banco real, não mock)
- Setup: criar dados direto no PG via repository/schema
- Cleanup: deletar em ordem reversa (respeitar FKs)
- Prefixo único: `TEST_PREFIX = "test-${Date.now()}"`

## Boas Práticas para IA
1. **Antes de criar algo**, verifique se já existe padrão equivalente no projeto
2. **Repositories** = sempre criar interface + implementação (ports & adapters)
3. **Services** = NÃO criar interface, só classe + singleton
4. **Cache** = SEMPRE invalidar em operações de escrita
5. **Validação** = SEMPRE dentro do service, nunca no endpoint
6. **Imports** = tipos de `contracts/`, nunca de `implementations/`
7. **Errors** = `APIError` do encore.dev, mensagens em português
8. **Path alias** = `@/` para `./src/*`, `~encore/` para `./encore.gen/*`
9. **Não use `any`** exceto em fronteiras de infra (JSONB casts)
10. **Mensagens de erro** = sempre em português, específicas

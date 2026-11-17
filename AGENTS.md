# AGENTS.md — Master Transporte B

## Prioridades
1. Seguir a implementação real — leia o código antes de assumir.
2. Reutilizar padrões existentes — consistência > criar novo.
3. Não criar abstração, índice, constraint ou camada sem necessidade concreta.

## Escopo atual
Este repositório contém **somente identidade e autenticação** (clientes e motoristas).
Não existem — e não devem ser recriados por suposição — carteira/wallet, pagamentos, Asaas,
RabbitMQ, corridas, despacho, localização, dashboard admin, webhooks ou cache de domínio.
Os commits antigos que citam esses módulos são histórico, não arquitetura vigente.

## Stack efetiva
| Tecnologia | Versão/Uso |
|---|---|
| Encore.ts | 1.58.4 — runtime e endpoints |
| TypeScript | 5.9.3, `strict: true`, paths `@/*` e `~encore/*` |
| PostgreSQL | 18 (Docker), acessado com `drizzle-orm` 0.45.2 + `postgres` 3.4.9 |
| Zod | 4.x — validação de entrada |
| bcrypt | 6 — hash de senha, custo 12 |
| jose | 6 — JWT HS256 |
| ioredis | 5 — instalado; o client em `src/infra/cache` **não tem consumidores** |
| bun:test | testes, sempre via `encore exec` |
| ESLint 9 + Prettier 3 | lint e formatação |

## Estrutura
```
src/
├── api/client/          # 5 endpoints de cliente + encore.service.ts (tag client-role)
├── api/driver/          # 5 endpoints de motorista + encore.service.ts (tag driver-role)
├── auth/                # AuthHandler, JWT, refresh token, bcrypt, requireRole
├── domain/identity/     # AccountStatus, AuthRole, normalização/validação de CPF e telefone
├── domain/driver/       # DriverStatus, tipos de documento, política de login
├── dto/                 # contratos públicos (request/response)
├── mappers/             # repositório → DTO (ex.: Date → ISO string)
├── services/            # regra de negócio: classe + singleton, SEM interface
├── repositories/        # interface + DrizzleXRepository + singleton, barrel em index.ts
├── validations/         # schemas Zod + validateOrThrow
├── constants/           # auth.ts, error-reasons.ts
├── middlewares/         # autorização por papel (target por tag)
├── config/env.ts        # única porta de entrada para variáveis de ambiente
└── infra/
    ├── database/        # schema.ts, relations.ts, drizzle.ts
    └── cache/           # redis-client.ts (sem uso no momento)
```

## Fluxo API → Service → Repository
- **API**: define o endpoint, extrai auth, valida o payload e chama o service. Sem SQL nem regra de negócio.
- **Service**: orquestra repositories, aplica regra e traduz erro de persistência. Recebe as interfaces dos repositories por constructor.
- **Repository**: único lugar com Drizzle/SQL. Interface e classe no mesmo arquivo; singleton na última linha; exportado por `src/repositories/index.ts`.

```ts
export const me = api<void, ClientMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true, sensitive: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return clientService.getMe(userID);
  },
);
```

## Endpoints existentes (10)
- Cliente: `POST /client/register`, `POST /client/login`, `POST /client/refresh`, `POST /client/logout`, `GET /client/me`.
- Motorista: as mesmas cinco rotas sob `/driver/*`.
- `logout` não leva tag de papel (encerrar sessão válida deve funcionar mesmo após remover o papel).
- `/client/me` exige a tag `client-role`; `/driver/me` exige `driver-role`.

## Convenção obrigatória dos endpoints
- Objeto de opções em **uma linha** quando couber em 120 colunas.
- Ordem: `expose`, `method`, `path`, `auth`, `sensitive`, `tags`.
- Callback separado, indentado; não usar `prettier-ignore` para forçar layout.
- Não adicionar campo `HttpStatus` nas respostas: use o status padrão do Encore (o cadastro responde 200).

```ts
export const register = api<ClientRegisterRequest, ClientRegisterResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false, sensitive: true },
  async payload => {
    const input = validateOrThrow(ClientRegisterSchema, payload);
    return clientService.register(input);
  },
);
```

## Autorização (RBAC)
- **Autenticação** (`auth: true`) é resolvida pelo AuthHandler: JWT + sessão + conta + papéis atuais no PostgreSQL.
- **Autorização** é feita por middleware seletivo: `middleware({ target: { auth: true, tags: ["..."] } })`, registrado no `new Service(...)` de `src/api/*/encore.service.ts`.
- Papéis usam `CLIENT` → tag `client-role` e `DRIVER` → tag `driver-role`. O middleware usa `authData.roles` carregado pelo AuthHandler, nunca papéis enviados pelo cliente ou claims não verificadas.
- Ausência de autenticação → `401 AUTHENTICATION_REQUIRED`; sem o papel → `403 ROLE_NOT_ALLOWED`. Requisição negada nunca chama `next`.
- Conta com CLIENT + DRIVER acessa ambos. Possuir DRIVER ≠ estar aprovado para operar corridas.
- `logout` é a exceção deliberada: `auth: true` sem tag, para encerrar sessão válida após perder o papel.
- Todo endpoint precisa de classificação explícita em `src/auth/endpoint-policy.ts` (`public`, `authenticated`, `client`, `driver`). O teste `src/auth/__tests__/endpoint-policy.spec.ts` compara o mapa com as definições reais e falha se um endpoint novo ficar sem política ou divergir das tags.
- `target.tags` do Encore usa OR entre tags; não declare múltiplas tags de papel no mesmo endpoint.
- Docs: [middleware](https://encore.dev/docs/ts/develop/middleware), [auth](https://encore.dev/docs/ts/develop/auth), [errors](https://encore.dev/docs/ts/primitives/errors).

## DTOs, validação e mappers
- Contratos públicos em `src/dto/*.dto.ts` (`Request`/`Response`). Nunca retornar row do banco.
- Schemas Zod em `src/validations/*.validate.ts`, `strictObject` para rejeitar campos desconhecidos.
- `validateOrThrow(Schema, data)` devolve o **output** tipado (transforms aplicados); nunca usar casting.
- Duplicação conhecida e aceita: o endpoint valida o payload público e o service revalida antes de usar. Não crie uma terceira camada.
- Regras puras de normalização (e-mail, nome, CPF, telefone) ficam em `src/domain/identity/identity.utils.ts`.
- Enums de domínio (`AccountStatus`, `AuthRole`, `DriverStatus`, documentos) são TypeScript puros e alimentam os `pgEnum`.

## Repositórios
- Nome do contrato **sem prefixo `I`** (`UserRepository`), implementação `DrizzleUserRepository`.
- Tipos auxiliares em `*.types.ts` (`UserProfile`, `SessionRecord`, `CreateSessionInput`).
- Filtro de soft delete: `isNull(deletedAt)` em toda query de leitura.
- Transação: `db.transaction()` quando mais de uma tabela precisa mudar junta.
- Erros de unicidade são traduzidos no service (`translatePersistenceError`), não no repository.

## PostgreSQL e Drizzle
- `.references()` gera **FK real**; `relations.ts` serve apenas para `db.query` relacional (hoje não utilizado). Um não substitui o outro.
- `driver_profiles` é 1:0..1 com `users` (PK = `user_id`); `driver_documents` referencia `driver_profiles.user_id`.
- `onDelete: cascade` para dados possuídos pelo usuário; `set null` para referências de revisor.
- Índices únicos são **parciais** (`WHERE deleted_at IS NULL`) para permitir reutilização de e-mail/CPF após soft delete.
- Soft delete **não** dispara `ON DELETE`; sessões/documentos devem ser tratados na aplicação.
- Não crie índice sem uma query que o use. FK **não** cria índice automaticamente.
- `updatedAt` tem apenas `defaultNow()`: em novos caminhos de update use `$onUpdateFn` ou atualize explicitamente.
- Enums vêm de arrays do domínio; adicionar valor exige migration.
- Migrations: `drizzle-kit generate` + `drizzle-kit migrate`. O Encore **não** gerencia este banco (não há `SQLDatabase`), então migrations não são aplicadas sozinhas.
- Nunca editar migration já aplicada. Nunca usar `db:push`/`db:pull`.
- Trigger/constraint nova só com regra de negócio comprovada + plano de migration, backfill e rollback.

## Transações e concorrência
- Cadastro: `users` + `user_roles` (+ `driver_profiles`) na mesma transação.
- Refresh é CAS por `id` + hash atual + não revogado + não expirado. Quem perde a corrida recebe 409 sem revogar a sessão.
- Reutilização de refresh autêntico e obsoleto → revoga a sessão (possível vazamento).
- Múltiplas sessões por usuário são permitidas (não há unicidade por `user_id`).
- `SELECT FOR UPDATE` só quando uma invariante real exigir; não use por padrão.
- Códigos PostgreSQL: `23505` → 409, `23514` → 400, indisponibilidade → 503, resto → 500 sem vazar SQL.

## Segurança
- Access token JWT HS256 (15 min) com `iss`/`aud`; refresh opaco de 30 dias no formato `sessionId.random.HMAC`.
- Do banco só sai o SHA-256 do refresh token; o token completo nunca é persistido.
- Toda requisição autenticada confirma sessão, status da conta e papéis **no PostgreSQL** (sem cache de auth).
- Endpoints de cadastro/login/refresh/logout/me usam `sensitive: true` (PII fora dos traces).
- Login usa a mesma mensagem para e-mail inexistente e senha errada.
- Segredos vêm de `src/config/env.ts`, com mínimo de 32 caracteres.
- Erros: `APIError` do Encore em português + `details.reason` de `src/constants/error-reasons.ts`.

## Comandos reais
```bash
docker compose up -d          # PostgreSQL + Redis
npx drizzle-kit migrate       # aplica migrations
npm run dev                   # docker + migrate + encore run
npm run lint                  # eslint src/
npm run format                # prettier --write
npm run format:check          # prettier --check
npm run db:generate           # gera migration a partir do schema
encore exec -- bun test       # testes (NUNCA `bun test` direto: falta ENCORE_RUNTIME_LIB)
npx tsc --noEmit              # typecheck
```

## Testes
- Arquivos `*.spec.ts` em pastas `__tests__` colocadas por camada (`src/services/__tests__`, `src/auth/__tests__`, etc.).
- Unitários usam fakes (`src/services/__tests__/fakes.ts`); integração real é `skipIf` sem `TEST_DATABASE_URL`.
- Não há script `seed`. Não execute integração sem banco migrado e descartável.

## Pendências conhecidas (não implementar por conta própria)
- `driver_documents` existe no schema, mas ainda não tem repository/endpoint.
- Redis/ioredis instalados sem consumidores.
- `updatedAt` não é atualizado automaticamente.
- Índices atuais precisam de revisão com `EXPLAIN` antes de qualquer remoção/adição.

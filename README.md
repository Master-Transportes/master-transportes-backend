# Master Transporte — Backend

Backend do Master Transporte, construído com **Encore.ts**, **TypeScript**, **PostgreSQL** (via **Drizzle ORM**) e **Zod**.
O escopo atual é **identidade e autenticação** de clientes e motoristas: cadastro, login, sessões com JWT e refresh token, autorização por papéis e perfil de motorista.

> Convenções internas de código, banco e formatação ficam no [`AGENTS.md`](./AGENTS.md). Este README cobre instalação, execução, API e operação.

---

## Escopo atual

- Conta única por pessoa (`users`) com múltiplos papéis (`user_roles`).
- Cadastro público de **CLIENT** e de **DRIVER**.
- Perfil de motorista (`driver_profiles`) com status de aprovação.
- Login, refresh com rotação de token, logout e consulta do próprio perfil.
- Sessões persistidas em PostgreSQL; toda requisição autenticada valida sessão, conta e papéis no banco.

---

## Stack

| Tecnologia               | Versão      | Uso                                    |
| ------------------------ | ----------- | -------------------------------------- |
| Encore.ts                | 1.58.4      | Runtime, definição de APIs e serviços  |
| TypeScript               | 5.9.3       | Toda a base (`strict: true`)           |
| PostgreSQL               | 18 (Docker) | Persistência                           |
| Drizzle ORM              | 0.45.2      | Schema, queries e migrations           |
| postgres.js              | 3.4.9       | Driver do PostgreSQL                   |
| Zod                      | 4.4.3       | Validação de entrada                   |
| bcrypt                   | 6.0.0       | Hash de senha (custo 12)               |
| jose                     | 6.2.16      | Assinatura/verificação de JWT (HS256)  |
| ioredis                  | 5.11.1      | Instalado; **sem uso no código atual** |
| Bun                      | 1.x         | Execução dos testes (`bun:test`)       |
| ESLint 9 + Prettier 3.10 | —           | Lint e formatação                      |

---

## Estrutura

```
src/
├── api/
│   ├── client/        # Endpoints /client/* e configuração do service
│   └── driver/        # Endpoints /driver/* e configuração do service
├── auth/              # AuthHandler, JWT, refresh token, bcrypt
├── config/            # env.ts — única porta de entrada para variáveis de ambiente
├── constants/         # Constantes de autenticação e códigos de erro
├── domain/            # Enums e regras puras de identidade e motorista
├── dto/               # Contratos públicos de request/response
├── mappers/           # Persistência → DTO
├── middlewares/       # Autorização por papel (client-role / driver-role)
├── repositories/      # Acesso a dados (user, driver, session)
├── services/          # Regras de negócio (auth, client, driver)
├── validations/       # Schemas Zod e validateOrThrow
└── infra/
    ├── database/      # schema.ts, relations.ts, conexão Drizzle
    └── cache/         # Client Redis (sem consumidores)
drizzle/migrations/    # Migrations SQL versionadas
drizzle.config.ts      # Configuração do drizzle-kit
encore.app             # Metadados da aplicação Encore (não vinculada à plataforma)
```

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) com Docker Compose
- [Node.js](https://nodejs.org/) e npm
- [Bun](https://bun.sh/) (execução dos testes)
- [Encore CLI](https://encore.dev/docs/ts/install) disponível no `PATH`

---

## Configuração

### Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores. O arquivo `.env` é a fonte única de configuração local (o projeto não usa Encore secrets).

| Variável                                              | Obrigatória | Descrição                                                                           |
| ----------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | Sim         | String de conexão do PostgreSQL usada pela aplicação e pelo drizzle-kit             |
| `JWT_SECRET`                                          | Sim         | Segredo do access token; mínimo de 32 caracteres                                    |
| `REFRESH_TOKEN_SECRET`                                | Sim         | Segredo HMAC do refresh token; mínimo de 32 caracteres                              |
| `NODE_ENV`                                            | Não         | `production` desativa o cache global da conexão de desenvolvimento                  |
| `REDIS_STATE_URL`                                     | Não         | Default `redis://127.0.0.1:6379`; usado apenas pelo client Redis (sem consumidores) |
| `REDIS_PASSWORD`                                      | Não         | Senha do Redis, se houver                                                           |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Docker      | Consumidas pelo `docker-compose.yml` para subir o Postgres                          |

Gere segredos **novos e distintos**. Nunca reutilize valores de exemplo.

### Instalação

```bash
npm install
docker compose up -d          # PostgreSQL 18 + Redis 7.2
npx drizzle-kit migrate       # aplica as migrations
npm run dev                   # docker + migrations + encore run
```

A aplicação sobe com o Encore em `http://localhost:4000` e o dashboard local em `http://localhost:9400/`.

> As migrations **não** são aplicadas automaticamente pelo Encore: este projeto se conecta ao PostgreSQL por `DATABASE_URL`, sem `SQLDatabase` do Encore.

---

## Endpoints

Todos os endpoints são expostos publicamente, usam `sensitive: true` (payloads e headers fora dos traces) e respondem em JSON. Endpoints autenticados exigem `Authorization: Bearer <accessToken>`.

### Cliente

| Método | Rota               | Autenticação | Papel                | Sucesso |
| ------ | ------------------ | ------------ | -------------------- | ------- |
| `POST` | `/client/register` | pública      | —                    | `200`   |
| `POST` | `/client/login`    | pública      | —                    | `200`   |
| `POST` | `/client/refresh`  | pública      | —                    | `200`   |
| `POST` | `/client/logout`   | Bearer       | qualquer autenticado | `200`   |
| `GET`  | `/client/me`       | Bearer       | `CLIENT`             | `200`   |

### Motorista

| Método | Rota               | Autenticação | Papel                | Sucesso |
| ------ | ------------------ | ------------ | -------------------- | ------- |
| `POST` | `/driver/register` | pública      | —                    | `200`   |
| `POST` | `/driver/login`    | pública      | —                    | `200`   |
| `POST` | `/driver/refresh`  | pública      | —                    | `200`   |
| `POST` | `/driver/logout`   | Bearer       | qualquer autenticado | `200`   |
| `GET`  | `/driver/me`       | Bearer       | `DRIVER`             | `200`   |

Os endpoints de cadastro usam o status padrão do Encore para `POST` (`200`). `logout` não exige papel, para permitir encerrar uma sessão válida mesmo após a remoção do papel.

### Formatos de resposta

**Cadastro de cliente**

```json
{
  "id": "uuid",
  "fullName": "Cliente Exemplo",
  "email": "cliente@exemplo.com",
  "phone": "11999999999",
  "cpf": "52998224725",
  "status": "ACTIVE",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Cadastro de motorista** — mesmos campos de identidade, com `accountStatus` e `driverStatus` (inicialmente `PENDING`).

**Login e refresh**

```json
{ "accessToken": "<jwt>", "refreshToken": "<token opaco>", "sessionId": "uuid", "expiresIn": 900 }
```

**Logout**

```json
{ "message": "Logout realizado com sucesso." }
```

**Perfil (`/me`)** — identidade sem `createdAt`; no motorista inclui `accountStatus` e `driverStatus`.

### Erros

Erros usam `APIError` do Encore com mensagem em português e código estável em `details.reason` (ex.: `INVALID_CREDENTIALS`, `ROLE_NOT_ALLOWED`, `ACCOUNT_UNAVAILABLE`, `SESSION_EXPIRED`, `REFRESH_REUSE_DETECTED`). Status usuais: `400` validação, `401` autenticação/sessão, `403` papel ou conta bloqueada, `409` conflito (cadastro duplicado ou refresh concorrente), `503` banco indisponível.

---

## Autenticação e sessões

1. **Cadastro** cria `users` e `user_roles` na mesma transação; o cadastro de motorista também cria `driver_profiles` com status `PENDING`.
2. **Login** valida senha (bcrypt), estado da conta, papel exigido pelo endpoint e, para motorista, o status do perfil. Em seguida cria uma sessão.
3. **Access token**: JWT HS256 com validade de 15 minutos (`sub`, `sid`, `jti`, `iss`, `aud`).
4. **Refresh token**: token opaco de 30 dias (`sessionId.random.HMAC`). O banco guarda somente o hash SHA-256.
5. **Refresh** localiza a sessão, valida o MAC e o hash e faz rotação atômica (compare-and-swap). Token autêntico e obsoleto indica reutilização e revoga a sessão; refresh concorrente perde a disputa e recebe `409` sem revogar a sessão.
6. **Requisições autenticadas** revalidam no PostgreSQL: sessão ativa, conta `ACTIVE` e papéis atuais — não há cache de autorização.
7. **Logout** revoga a sessão e é idempotente.

### Papéis e status

- Papéis: `CLIENT`, `DRIVER`, `ADMIN`, `SUPPORT`. O cadastro público concede apenas `CLIENT` ou `DRIVER`.
- Conta: `ACTIVE`, `INACTIVE`, `BANNED`. Apenas `ACTIVE` autentica.
- Motorista: `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`. Login permitido para `PENDING`, `UNDER_REVIEW` e `APPROVED`.
- Uma mesma pessoa pode ser `CLIENT` e `DRIVER` (relação N:N em `user_roles`).
- Endpoints autenticados exigem o papel correspondente via middleware e tag (`client-role` / `driver-role`); `logout` exige apenas sessão válida.

---

## Banco de dados

| Tabela             | Papel                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `users`            | Identidade única (nome, e-mail, telefone, CPF, hash de senha, status)            |
| `user_roles`       | Papéis por conta (N:N)                                                           |
| `driver_profiles`  | Estado de aprovação do motorista (1:0..1 com `users`)                            |
| `driver_documents` | Metadados de documentos do motorista — schema pronto, **sem fluxo de API ainda** |
| `sessions`         | Sessões de refresh token (hash, expiração, revogação)                            |

E-mail e CPF têm índices únicos **parciais** (`WHERE deleted_at IS NULL`), permitindo reutilização após exclusão lógica. O schema, as regras de integridade e as convenções de migrations estão detalhados no [`AGENTS.md`](./AGENTS.md).

### Migrations

```bash
npm run db:generate     # gera nova migration a partir de src/infra/database/schema.ts
npm run db:migrate      # aplica migrations pendentes
npm run db:studio       # abre o Drizzle Studio
```

Migrations ficam em `drizzle/migrations/` e não devem ser editadas depois de aplicadas. Evite `db:push`/`db:pull`: eles ignoram o histórico versionado.

---

## Testes

Os testes ficam em pastas `__tests__` por camada, com sufixo `.spec.ts`.

- **Unitários** (`src/auth/__tests__`, `src/domain/identity/__tests__`, `src/services/__tests__`, `src/repositories/__tests__/database-errors.spec.ts`): usam fakes e não precisam de banco.
- **Integração** (`src/repositories/__tests__/repositories.integration.spec.ts`): usa PostgreSQL real e só executa com `TEST_DATABASE_URL` definida e migrations aplicadas. Sem a variável, o bloco é ignorado (`skipIf`).

```bash
npm test                                      # encore exec -- bun test
TEST_DATABASE_URL=postgres://... npm test     # inclui os testes de integração
```

No PowerShell:

```powershell
$env:TEST_DATABASE_URL = "postgres://..."
npm test
```

Execute sempre via `npm test` (ou `encore exec -- bun test`). `bun test` direto falha porque o runtime do Encore não está carregado (`ENCORE_RUNTIME_LIB`).

---

## Scripts

| Comando                | Descrição                                        |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Sobe Docker, aplica migrations e inicia o Encore |
| `npm start`            | Inicia o Encore sem subir infraestrutura         |
| `npm test`             | Roda os testes com o runtime do Encore           |
| `npm run lint`         | ESLint em `src/`                                 |
| `npm run lint:fix`     | ESLint com correção automática                   |
| `npm run format`       | Prettier em `src/**/*.ts`                        |
| `npm run format:check` | Verifica formatação sem alterar                  |
| `npm run db:generate`  | Gera migration                                   |
| `npm run db:migrate`   | Aplica migrations                                |
| `npm run db:studio`    | Abre o Drizzle Studio                            |

Typecheck não tem script dedicado:

```bash
npx tsc --noEmit
```

---

## Redis

O `docker-compose.yml` sobe um Redis 7.2 e existe um client em `src/infra/cache/`, mas **nenhum fluxo atual o consome**. Ele está presente como infraestrutura preparada; não é necessário para cadastro, login ou sessões.

---

## Qualidade de código

```bash
npm run format:check
npm run lint
npx tsc --noEmit
```

O Prettier usa `printWidth: 120` e `objectWrap: "collapse"`, mantendo objetos curtos (como as opções dos endpoints) em uma linha. Regras de formatação de endpoints, camadas e banco estão no [`AGENTS.md`](./AGENTS.md).

---

## Limitações conhecidas

- `driver_documents` existe no schema, mas ainda não tem endpoints nem repository.
- Redis e `ioredis` estão instalados e sem consumidores.
- O Encore não aplica migrations automaticamente neste projeto.
- A aplicação não está vinculada à plataforma Encore (`encore.app` sem `id`); o uso é local.

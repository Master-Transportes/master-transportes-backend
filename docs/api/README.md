# 🌐 APIs no Encore.ts — Master Transporte B

Padrões para definir, validar, autenticar, testar e tratar erros nas APIs do backend.
Baseado na documentação oficial do Encore.ts (`encore.dev ^1.58`) e na implementação
atual do projeto (`src/api/`, `src/services/`, `src/repositories/`).

## O fluxo de uma requisição

```
HTTP (App Android / cliente)
   │
   ▼
Endpoint `api()` ............ contrato HTTP (método, rota, tipos, expose, auth)
   │
   ▼
Middleware (Encore) ......... autenticação (AuthHandler) + autorização por papel (tags)
   │
   ▼
Validação (Zod) ............. transformações e regras de entrada (`validateOrThrow`)
   │
   ▼
Service ..................... regras de negócio e orquestração
   │
   ▼
Repository (Drizzle) ........ consultas e operações transacionais
   │
   ▼
PostgreSQL .................. integridade, constraints e unicidade
```

Responsabilidades **não se misturam**: o endpoint delega; o service decide; o
repository persiste. Detalhes em [`padroes-do-projeto.md`](./padroes-do-projeto.md).

## Índice

| Arquivo | Conteúdo |
|---|---|
| [`definindo-endpoints.md`](./definindo-endpoints.md) | `api()`, opções (`expose`, `method`, `path`, `auth`, `sensitive`, `tags`), origem dos campos (body/query/path/header/cookie) e `api.raw()` |
| [`validacao.md`](./validacao.md) | Validação nativa do Encore × Zod, divisão de responsabilidades e limites (resposta não é validada em runtime) |
| [`autenticacao-autorizacao.md`](./autenticacao-autorizacao.md) | AuthHandler, `auth.getAuthData()`, middleware por papel, papel ≠ autorização sobre o recurso |
| [`comunicacao-entre-servicos.md`](./comunicacao-entre-servicos.md) | `~encore/clients`, `service.ref()`, chamada direta no mesmo domínio e quando NÃO criar um endpoint |
| [`erros.md`](./erros.md) | `APIError`, tabela código × HTTP, `withDetails({ reason })`, padrão do projeto |
| [`padroes-do-projeto.md`](./padroes-do-projeto.md) | **Regras obrigatórias para novas APIs** — o arquivo referenciado pelo `AGENTS.md` |
| [`referencias.md`](./referencias.md) | Links da documentação oficial |

## Notas de contexto deste repositório

- Persistência é **Drizzle ORM** (não `SQLDatabase` nativo do Encore); exemplos da
  documentação oficial com `db.queryRow` devem ser adaptados aos repositories em
  `src/repositories/`.
- Validação de entrada usa **Zod 4** via `src/validations/` + `validateOrThrow`.
- Autorização por papel usa middleware com **tags** (`src/middlewares/role.middleware.ts`)
  registradas no `encore.service.ts` de cada serviço API.
- Códigos estáveis de erro ficam em `src/constants/error-reasons.ts` e viajam em
  `details.reason`.

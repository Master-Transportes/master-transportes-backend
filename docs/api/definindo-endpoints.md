# Definindo endpoints com `api()`

No Encore.ts, um endpoint é uma função TypeScript assíncrona declarada com `api()`.
O Encore analisa os tipos e a definição para produzir o contrato HTTP, validar
estruturalmente as requisições e permitir chamadas tipadas entre serviços.

## Anatomia

```ts
import { api } from "encore.dev/api";

// Endpoint ilustrativo: pressupõe DTO em src/dto/ e service em src/services/.
export const getRide = api<GetRideRequest, GetRideResponse>(
  { expose: true, method: "GET", path: "/rides/:rideId", auth: true, sensitive: true },
  async ({ rideId }) => {
    return rideService.getRide(rideId);
  },
);
```

## Opções da configuração

| Propriedade       | Responsabilidade                                                    |
| ----------------- | -------------------------------------------------------------------- |
| `expose: true`    | Disponibiliza o endpoint externamente                                 |
| `expose: false`   | Restringe a chamadas internas da aplicação                            |
| `method`          | GET, POST, PATCH, DELETE etc.                                         |
| `path`            | Rota e parâmetros de URL (`/rides/:rideId`)                           |
| `auth: true`      | Exige autenticação válida (passa pelo AuthHandler)                    |
| `auth: false`     | Endpoint público (ex.: registro, login, refresh)                      |
| `sensitive: true` | Oculta payloads e headers dos traces                                  |
| `tags`            | Classifica endpoints, usada pelos middlewares (`"client-role"` etc.)  |

**Importante:** `expose: true` **não** significa que o endpoint está autorizado
para qualquer usuário. A autorização depende da autenticação (`auth`), do papel
(verificado no middleware por tag) e da permissão de negócio sobre o recurso
(verificada no service). Ver [`autenticacao-autorizacao.md`](./autenticacao-autorizacao.md).

Padrão do projeto: **declaração explícita** de `expose`, `method`, `path` e `auth`,
mesmo quando algum deles tem valor padrão — o arquivo `src/api/client/client.ts`
segue exatamente esse formato.

```ts
// Padrão real em uso (src/api/client/client.ts)
export const me = api<void, ClientMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true, sensitive: true, tags: ["client-role"] },
  async () => {
    const { userID } = requireAuthData(auth.getAuthData());
    return clientService.getMe(userID);
  },
);
```

## De onde vêm os campos da requisição

O Encore determina a origem dos campos pelo método HTTP, pela rota e pelos tipos.

| Origem     | Como declarar                          | Exemplo                         |
| ---------- | --------------------------------------- | -------------------------------- |
| Body JSON  | Campo comum em POST/PATCH               | `name: string`                   |
| Path       | Campo correspondente à rota             | `/rides/:rideId` → `rideId: string` |
| Query      | `Query<T>` (ou campo comum em GET/HEAD/DELETE) | `page?: Query<number>`    |
| Header     | `Header<"X-Nome">`                      | cabeçalho personalizado          |
| Cookie     | `Cookie<"nome">`                        | cookie tipado                    |

Regra do runtime: em **GET, HEAD e DELETE**, campos comuns da requisição são lidos
da **query string** por padrão. Em **POST e PATCH**, campos comuns são lidos do
**body JSON**, a menos que se use um tipo como `Query<T>`.

```ts
// GET: page, pageSize e status são interpretados como query params.
interface ListRidesRequest {
  page?: number;
  pageSize?: number;
  status?: string;
}

// Endpoint ilustrativo.
export const listRides = api<ListRidesRequest, ListRidesResponse>(
  { expose: true, method: "GET", path: "/rides", auth: true, sensitive: true },
  async params => {
    return rideService.list(params);
  },
);
```

## Contratos: request e response

- Request e response são **interfaces próprias em `src/dto/`** — nunca expor
  diretamente linhas do Drizzle ou entidades de persistência.
- O Encore valida a **entrada** em runtime (ver [`validacao.md`](./validacao.md)),
  mas **não valida a resposta** em runtime: o contrato de resposta é verificado
  pela tipagem na compilação. Dados montados a partir do banco precisam passar por
  **mappers** (`src/mappers/`) e testes.

## Quando usar `api.raw()`

`api.raw()` expõe a requisição e a resposta HTTP de baixo nível. Serve para
situações especiais — receber webhooks ou formatos que os endpoints tipados não
suportam adequadamente.

- Para cadastro, login, consultas, criação e gerenciamento de corridas: use `api()`.
- `api.raw()` **não deve virar o padrão** por oferecer mais controle: ao usá-lo,
  você assume a responsabilidade por leitura, validação e escrita da resposta HTTP.

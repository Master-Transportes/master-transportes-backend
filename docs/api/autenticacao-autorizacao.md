# Autenticação e autorização

O Encore separa **identificar o usuário** (AuthHandler) de **executar o endpoint**.
Autorização tem duas etapas no projeto: papel no middleware e permissão sobre o
recurso no service.

## Camadas

```
AuthHandler (Encore) ........ identifica quem fez a requisição → AuthData
Middleware (por tag) ........ verifica o papel (CLIENT / DRIVER)
Endpoint (api) .............. lê auth.getAuthData() e delega
Service ..................... verifica permissão sobre o recurso específico
```

## AuthHandler e `getAuthData()`

Endpoints com `auth: true` passam pelo AuthHandler antes do handler. O dado de
autenticação fica disponível via `auth.getAuthData()`:

```ts
// Padrão real em uso (src/api/client/client.ts)
export const me = api<void, ClientMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true, sensitive: true, tags: ["client-role"] },
  async () => {
    const { userID } = auth.getAuthData()!;
    return clientService.getMe(userID);
  },
);
```

## Middleware por papel (tags)

`src/middlewares/role.middleware.ts` define políticas de papel com `target`:

```ts
// Padrão real em uso (src/middlewares/role.middleware.ts)
export const CLIENT_ROLE_POLICY: RoleMiddlewarePolicy = {
  tag: "client-role",
  role: AuthRole.Client,
  deniedMessage: "Acesso restrito a passageiros.",
};

export const ClientRoleMiddleware = createRoleMiddleware(CLIENT_ROLE_POLICY);
```

O middleware é registrado no `encore.service.ts` do serviço API:

```ts
// Padrão real (src/api/client/encore.service.ts)
export default new Service("client", { middlewares: [ClientRoleMiddleware] });
```

Detalhes da semântica do `target`:

- `target.tags` usa **OR**: basta o endpoint possuir **uma** das tags indicadas
  para o middleware ser aplicado. Por isso cada middleware carrega uma única tag
  de papel.
- `target.auth: true` restringe a endpoints autenticados.
- A **ausência** de tag em um endpoint não pode ser compensada no middleware — é
  justamente o que o teste de política de endpoints verifica.

**Exceção deliberada (logout):** `logout` fica **sem tag de papel**, para que uma
sessão válida possa ser encerrada mesmo após a perda do papel CLIENT ou DRIVER.

## Regras de segurança

1. **O cliente não escolhe quem está autenticado.** Identificadores de dono
   (`passengerId`, `driverId`) vêm de `auth.getAuthData()`, nunca do payload:

   ```ts
   // Errado: passengerId no body usado para decidir o dono da operação.
   // Certo:
   const { userID } = auth.getAuthData()!;
   return rideService.create({ passengerId: userID, ...payload });
   ```

2. **Papel não substitui autorização sobre o recurso.** Ser ADMIN não autoriza
   automaticamente qualquer ação de negócio sobre qualquer corrida; a permissão
   sobre o recurso específico é verificada no service (ex.: o dono da corrida).

3. **`auth: true` é obrigatório nos endpoints autenticados**, e a tag de papel
   correspondente deve estar presente (contrato verificado por testes de política).

4. **Sessões revogáveis:** qualquer mudança em sessão, refresh, revogação ou
   papel exige análise de concorrência e testes de acesso negado, além dos
   cenários de sucesso (ver `AGENTS.md`).

5. Erros de autenticação/autorização seguem o padrão de erros:
   `APIError.unauthenticated(...)` → 401, `APIError.permissionDenied(...)` → 403,
   sempre com `details.reason` estável (`src/constants/error-reasons.ts`).
   Ver [`erros.md`](./erros.md).

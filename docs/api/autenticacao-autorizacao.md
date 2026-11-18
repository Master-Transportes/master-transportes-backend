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

Endpoints com `auth: true` passam pelo AuthHandler (`src/auth/auth.gateway.ts`) antes do
handler: JWT válido → sessão ativa → conta ativa → papéis efetivos, todos no PostgreSQL.
Com isso garantido, o endpoint usa `auth.getAuthData()` diretamente:

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

O `!` é seguro apenas em endpoints `auth: true` (o Encore só executa o handler com AuthData
presente). **Não usar `!` em endpoints `auth: false`** — lá o contexto pode ser nulo.
Os middlewares de papel mantêm um guard interno de nulo como defesa de estágio, porque o
getter é injetável em testes.

**Login/refresh são públicos (`auth: false`) e não passam pelo middleware de papel.**
Por isso eles recebem `AuthRole.Client`/`AuthRole.Driver` no service: o parâmetro
define o escopo do endpoint de entrada e, no caso de motorista, também revalida o
perfil. Não remover essa regra como se fosse redundante.

**Elegibilidade operacional é diferente de papel.** `DRIVER` autentica e acessa
`/driver/me`; operações de transporte exigem `driver_profiles.status = APPROVED` e
devem declarar `tags: ["driver-role", "driver-operational"]` (o guard operacional
não é aplicado a `/driver/me` nem a logout). O middleware operacional também
revalida o papel, então a tag não pode ser usada como bypass.

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

## Segunda função: CLIENT → DRIVER

`POST /driver/apply` (com `client-role`) adiciona o papel DRIVER a uma identidade
existente. O endpoint vive no serviço `client` para reutilizar o
`ClientRoleMiddleware`; a identidade vem do AuthData. O payload aceita apenas
telefone/CPF, e o repository, em uma transação com `FOR UPDATE` na linha do
usuário, insere `user_roles(DRIVER)` + `driver_profiles(PENDING)`. Já ser DRIVER,
CPF/telefone divergentes ou conflito de unicidade retornam 409. ADMIN/SUPPORT nunca
são concedidos por esse fluxo. O comportamento do cadastro público de novas contas
não muda.

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

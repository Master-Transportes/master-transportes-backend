# Referências oficiais — Encore.ts

Documentação usada como base deste diretório. Exemplos da documentação oficial
com `SQLDatabase`/`db.queryRow` devem ser adaptados aos repositories Drizzle do
projeto (`src/repositories/`).

## APIs

| Documento | Tema |
|---|---|
| [APIs in Encore.ts](https://encore.dev/docs/ts/primitives/apis) | `api()`, contratos, origem dos campos, `sensitive`, `tags` |
| [Raw Endpoints](https://encore.dev/docs/ts/primitives/raw-endpoints) | Controle HTTP de baixo nível (`api.raw()`) |
| [API Errors](https://encore.dev/docs/ts/primitives/errors) | `APIError`, códigos, `withDetails` |
| [API Documentation](https://encore.dev/docs/ts/develop/api-docs) | Documentação de contratos gerada pelo Encore |

## Validação

| Documento | Tema |
|---|---|
| [Request Validation](https://encore.dev/docs/ts/develop/validation) | Validação automática de requests e `encore.dev/validate` |

## Serviços e comunicação

| Documento | Tema |
|---|---|
| [Defining Services](https://encore.dev/docs/ts/primitives/services) | Criação e organização dos serviços Encore |
| [Service Communication](https://encore.dev/docs/ts/primitives/service-communication) | `~encore/clients`, `service.ref()` e restrições de análise estática |

## Autenticação e middleware

| Documento | Tema |
|---|---|
| [Authenticating Users](https://encore.dev/docs/ts/develop/auth) | AuthHandler, identidade e propagação de autenticação |
| [Middleware](https://encore.dev/docs/ts/develop/middleware) | Middleware seletivo, `target.tags` (OR) e ordem de execução |

## Consumo

| Documento | Tema |
|---|---|
| [Client Generation](https://encore.dev/docs/ts/cli/client-generation) | Clientes gerados e contratos para consumidores |

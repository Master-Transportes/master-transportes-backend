---
name: Encore Runtime
description: APIs, services, streaming, AuthHandler, middleware e DTOs no Encore.ts do Master Transporte. Use em tarefas de endpoints, autenticação, validação de entrada ou Streaming.
---

# Encore Runtime — APIs, serviços, auth e streaming

## Quando usar

Tarefas que envolvem criar/alterar endpoints, AuthHandler, middleware, comunicação entre serviços ou APIs de streaming (SSE/WebSocket) no backend Master Transporte.

## Regras do projeto (resumo operacional)

- **Endpoint pequeno**: recebe dados, identifica o usuário, chama o service. Sem regras de negócio no handler, sem acesso direto a repositories.
- **Contrato explícito**: interfaces próprias em `src/dto/` (nunca linhas do Drizzle); declarar `expose`, `method`, `path`, `auth`; `sensitive: true` onde houver credenciais/sessão/dados pessoais.
- **Validação**: Zod via `validateOrThrow` na entrada do service; o endpoint não repete o parse.
- **Autorização em duas etapas**: papel via middleware por tag (`client-role`, `driver-role`) + permissão sobre o recurso no service. `passengerId`/`driverId` vêm de `auth.getAuthData()`, nunca do payload. Papel `DRIVER` exige `driver_profiles.status = APPROVED` para operações de transporte (`tags: ["driver-role", "driver-operational"]`).
- **Erros**: `APIError` + `details.reason` estável de `src/constants/error-reasons.ts`; mensagens em português.
- **Fronteira entre serviços Encore**: `~encore/clients`; chamada TS direta no mesmo domínio; `api.raw()` só para webhooks/formatos especiais.
- **Streaming**: autenticar conexão, autorizar destinatário, validar mensagens, tratar desconexão; ver `docs/streaming/`.

## Armadilhas técnicas

- Middleware por `target.tags` usa OR entre tags; ordem de registro define execução.
- Não propagar `userId` vindo do request como identidade; usar sempre o auth data.
- Datas: instantes em ISO 8601 UTC, datas civis em `YYYY-MM-DD` (`docs/temporal/`).
- Mudanças de contrato público exigem análise de consumidores e testes por endpoint (auth, autorização, entrada inválida, sucesso, falha, concorrência).

## Referências (consultar conforme a necessidade)

Catálogo completo: `docs/references.md` e `docs/api/referencias.md`. Páginas mais usadas:

- APIs: https://encore.dev/docs/ts/primitives/apis
- Auth: https://encore.dev/docs/ts/develop/auth
- Middleware: https://encore.dev/docs/ts/develop/middleware
- Streaming: https://encore.dev/docs/ts/primitives/streaming-apis
- Erros: https://encore.dev/docs/ts/primitives/errors

Use `webfetch` apenas na página pertinente à dúvida atual.

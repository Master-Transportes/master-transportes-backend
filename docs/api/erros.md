# Erros: `APIError` e `details.reason`

O Encore usa `APIError` com códigos padronizados mapeados para respostas HTTP.
O projeto mantém um único sistema de erros: mensagens em português + `details.reason`
estável para decisões de UI.

## Códigos e HTTP

| Situação                          | Código Encore          | HTTP |
| ---------------------------------- | ---------------------- | ---- |
| Entrada inválida                   | `invalid_argument`     | 400  |
| Sem autenticação                   | `unauthenticated`      | 401  |
| Sem permissão                      | `permission_denied`    | 403  |
| Recurso inexistente                | `not_found`            | 404  |
| Operação concorrente abortada      | `aborted`              | 409  |
| Recurso já existente               | `already_exists`       | 409  |
| Limite excedido                    | `resource_exhausted`   | 429  |
| Serviço indisponível               | `unavailable`          | 503  |
| Falha interna (sem detalhes)       | `internal`             | 500  |

```ts
import { APIError } from "encore.dev/api";

throw APIError.permissionDenied("Você não tem permissão para acessar esta corrida");
```

## `withDetails` e `ErrorReason`

Para classificação de domínio, anexe um `reason` estável:

```ts
import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";

throw APIError.permissionDenied("Operação não permitida.").withDetails({
  reason: ErrorReason.ROLE_NOT_ALLOWED,
});
```

`ErrorReason` (`src/constants/error-reasons.ts`) concentra os códigos de contrato
(`ACCOUNT_ALREADY_EXISTS`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`,
`ROLE_NOT_ALLOWED`, `SERVICE_UNAVAILABLE`, etc.). São códigos estáveis para a UI,
**não mensagens de exibição**.

## Padrões do projeto

1. **Validação de entrada** falha com `APIError.invalidArgument` + lista de erros
   por campo, via `validateOrThrow` (`src/validations/schema-validator.ts`):

   ```ts
   // Real (src/validations/schema-validator.ts)
   throw APIError.invalidArgument(options?.message ?? "Dados da requisição inválidos.").withDetails({
     errors: result.error.issues.map(issue => ({
       field: issue.path.length ? issue.path.join(".") : "root",
       message: issue.message,
     })),
   });
   ```

2. **Falhas de persistência** são traduzidas por `translatePersistenceError`
   (`src/services/service-errors.ts`):

   | Falha                          | Resultado                                    |
   | ------------------------------- | --------------------------------------------- |
   | Unicidade (23505)               | 409 `already_exists` + `details.reason`       |
   | Banco indisponível              | 503 `unavailable` + `SERVICE_UNAVAILABLE`     |
   | CHECK violation (23514)         | 400 `invalid_argument`                        |
   | `APIError` já intencional       | relançado sem alteração                       |
   | Demais falhas                   | 500 `internal` sem detalhes sensíveis         |

3. **Nunca exponha** SQL, mensagens do driver, hashes, tokens ou dados pessoais
   em logs, traces e respostas. O log de persistência registra apenas código de
   erro e nome da constraint.

4. **Sem segundo sistema de erros.** Não criar exceções customizadas concorrentes
   com `APIError`; a tradução para HTTP é responsabilidade do Encore.

5. Testes de erro cobrem: mensagem amigável, código HTTP e `details.reason`.

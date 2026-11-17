# Validação: Encore nativo × Zod

O Encore já possui validação automática de requisições, e o projeto já usa Zod 4
com transformações próprias. A regra é **não repetir a mesma validação em várias
camadas** sem justificativa técnica.

## O que o Encore valida sozinho

Antes de o handler executar, o runtime do Encore (em Rust) verifica:

- Tipos e campos obrigatórios;
- Arrays, enums e outras estruturas;
- Regras declaradas com `encore.dev/validate`.

```ts
import { Min, Max, MinLen, MaxLen } from "encore.dev/validate";

interface SearchRequest {
  page: number & Min<1>;
  pageSize: number & (Min<1> & Max<50>);
  search?: string & (MinLen<2> & MaxLen<100>);
}
```

Essas regras rodam **antes de a requisição chegar ao JavaScript**.

## O que o Encore NÃO valida

**A resposta não é validada em runtime.** O contrato de resposta é verificado pela
tipagem na compilação. TypeScript não substitui testes e mappers quando os dados
são montados a partir do banco — use `src/mappers/` e testes de regressão.

## Divisão de responsabilidades no projeto

O projeto usa Zod via `src/validations/` e o helper `validateOrThrow`
(`src/validations/schema-validator.ts`), que converte falhas em `APIError` 400
(`invalid_argument`) com detalhes por campo.

| Validação                                | Responsável                 |
| ----------------------------------------- | ---------------------------- |
| Tipos HTTP básicos                        | Encore                       |
| Campos obrigatórios                       | Encore                       |
| Faixas simples e tamanho                  | Encore **ou** Zod, conforme o padrão existente do arquivo |
| Normalização de CPF, telefone, e-mail     | Zod / domínio                |
| Transformações de entrada                 | Zod                          |
| Regras de negócio                         | Service                      |
| Unicidade e integridade                   | PostgreSQL (constraints)     |
| Autorização para acessar um recurso       | Middleware (papel) + Service (recurso) |

```ts
// Padrão real em uso (src/api/client/client.ts)
export const register = api<ClientRegisterRequest, ClientRegisterResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false, sensitive: true },
  async payload => {
    const input = validateOrThrow(ClientRegisterSchema, payload);
    return clientService.register(input);
  },
);
```

Detalhe do `validateOrThrow`: ele retorna o **tipo de saída** do schema
(`z.output<S>`), ou seja, o dado **após transforms** — o service recebe o valor
normalizado, não o bruto.

## Regras práticas

1. **Não duplique**: a mesma regra não deve existir em Encore + Zod + service
   apenas por redundância. Escolha a camada mais adequada a cada tipo de regra.
2. Estruturas básicas do contrato HTTP (obrigatoriedade, tipo) podem ficar a cargo
   do Encore; regras com transformação ou mensagem específica ficam no Zod.
3. Falhas de persistência (unicidade, CHECK, banco indisponível) não são validação
   de entrada: são tratadas no service via `translatePersistenceError`
   (`src/services/service-errors.ts`). Ver [`erros.md`](./erros.md).
4. **Ponto de auditoria pendente no projeto**: mapear quais validações hoje são
   necessárias nas duas fronteiras (Encore e Zod) e quais estão apenas sendo
   repetidas — possível simplificação dos endpoints novos sem perda de segurança.

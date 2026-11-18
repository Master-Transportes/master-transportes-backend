---
name: TypeScript Quality
description: TypeScript estrito, Zod, Clean Code, SOLID, Design Patterns, testes, segurança, performance e refatoração fundamentada no Master Transporte.
---

# TypeScript Quality — tipagem, arquitetura e testes

## Quando usar

Tarefas de tipagem, validação com Zod, decisões de arquitetura/design patterns, testes, segurança de aplicação, performance de código TS ou avaliação de refatoração.

## Regras do projeto (resumo operacional)

- **TS estrito** (`tsconfig.json` vigente): tipos explícitos nas fronteiras (DTOs, contratos); inferência local só onde não oculta erro. `any` não passa review.
- **Zod 4**: `validateOrThrow` na entrada do service é o ponto único de validação/transformação; não duplique a mesma regra em endpoint + service + banco. Schemas derivam tipos (`z.infer`), não o contrário.
- **Clean Code / SOLID com juízo**: extraia classe/função quando houver motivo concreto (duplicação real, mudança isolada, teste); nunca por estética. Prefira a solução mais simples compatível com o domínio.
- **Testes**: `npm test` → `encore exec -- bun test` (use esse invólucro). Cubra auth, autorização (papel e recurso), entrada inválida, sucesso, falhas e concorrência. Não declare teste aprovado sem executar.
- **Segurança**: nunca confie em dados do cliente para autorização; sanzaliza/logue sem dados sensíveis; valide limites de payload e paginação.
- **Refatoração**: fundamentada no catálogo (link abaixo) com evidência de ganho; mudanças públicas de contrato exigem análise de consumidores.

## Armadilhas técnicas

- Narrowing: `unknown` + type guard em vez de casts; `satisfies` para preservar literal types em configs/DTOs.
- Async: erros em promises flutuantes se perdem; toda promise é awaitida ou tratada explicitamente.
- Zod 4 mudou APIs em relação a 3 (ex.: `error`, mensagens) — confira a doc da versão instalada antes de escrever schema.
- `enum`/`const enum` e decorators: siga o que o projeto já usa; não introduza recurso que exija flags novas do tsconfig.

## Referências (consultar conforme a necessidade)

Catálogo completo: `docs/references.md`. Páginas principais:

- TS Handbook — narrowing: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- Zod: https://zod.dev/
- Design Patterns (TS): https://refactoring.guru/design-patterns/typescript
- Catálogo de refatoração: https://refactoring.guru/refactoring/catalog
- Patterns of Distributed Systems: https://martinfowler.com/articles/patterns-of-distributed-systems/index.html

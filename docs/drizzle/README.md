# 🗄️ Drizzle ORM + PostgreSQL no Master Transporte

Referência técnica de persistência: Drizzle ORM, Drizzle Kit, postgres.js e PostgreSQL 18.

> **Fontes principais:** [Drizzle — PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql),
> [Migrations](https://orm.drizzle.team/docs/migrations), [Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints),
> [PostgreSQL 18 — DDL Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Decisões arquiteturais deste projeto

| Decisão | Justificativa |
|---|---|
| **PostgreSQL externo (Docker) + Drizzle**, não `SQLDatabase` do Encore | O Encore **não provisiona nem migra** este banco; o fluxo é nosso (`drizzle-kit migrate`). Não misturar os dois modelos sem decisão explícita. |
| **Migrations versionadas** (`generate` → revisar → `migrate`) | Mais controlável que `push`; o histórico SQL é fonte de verdade. |
| **Nunca `drizzle-kit push` / `pull`** | Evita divergências entre schema declarado e banco real. |
| **Nunca editar migration já aplicada** | Alterar histórico aplicado corrompe o rastro. |
| **Único lugar com SQL: `src/repositories/`** | Services aplicam regra; API não toca no banco (ver `AGENTS.md`). |

## Responsabilidades de cada componente

| Componente               | Responsabilidade                                                           |
| ------------------------ | -------------------------------------------------------------------------- |
| `drizzle-orm`            | Executar queries, inserts, updates e transações tipadas                    |
| `drizzle-kit`            | Gerar/aplicar migrations, verificar histórico e abrir o Studio             |
| `postgres` (postgres.js) | Gerenciar conexões e comunicar-se com o PostgreSQL                         |
| PostgreSQL               | Armazenar e proteger os dados, aplicar constraints e executar transações   |

## Estrutura física no projeto

| Camada                | O que contém                                         |
| --------------------- | ---------------------------------------------------- |
| `src/infra/database/schema.ts`   | Tabelas, colunas, FKs, enums, índices, constraints |
| `src/infra/database/relations.ts` | Relações para consultas relacionais (`db.query`)  |
| `src/infra/database/drizzle.ts`   | Criação e ciclo de vida do cliente                |
| `src/repositories/`    | Queries e operações persistentes                     |
| `src/services/`        | Regras de negócio, transações e orquestração         |
| `drizzle/migrations/`  | Histórico SQL versionado                             |

Princípio: **não dividir `schema.ts` por domínio preventivamente**. Quando surgirem
corridas, ofertas, matching e localização — e a organização realmente pedir — separar
por domínio e reexportar por um ponto central. O mesmo vale para interfaces de
repositório: abstração só quando resolver um problema real.

## Pontos de atenção levantados na auditoria

Resultado da revisão estática (schema + configuração) de **2026-11-17**. Base
considerada sólida — FKs reais, índices únicos parciais, PKs compostas, enums, checks
e `timestamptz` corretos. Nada exige recriar tabelas ou trocar de ORM.

| Prioridade | Ponto | Ação |
|---|---|---|
| Alta | `updatedAt` | `defaultNow()` só vale no INSERT. Sessões agora atualizam `updated_at` explicitamente; demais updates devem seguir o mesmo padrão. |
| Alta | Migrations reais | Conferir SQL aplicado, constraints e índices no PostgreSQL real |
| Alta | Fluxos integros | Confirmar que cadastro/alterações relacionadas são transacionais |
| Média | `relations.ts` | Auditar ambiguidade proprietário × revisor (ver `relacoes.md`) |
| Média | Índices | Verificar queries reais antes de criar/remover (ver `diagnostico-postgres.md`) |
| Média | Exclusão lógica | Conferir filtros `deleted_at` e comportamento de recuperação/recriação |
| Média | Docker | Restringir acesso externo ao banco em dev (ver `diagnostico-postgres.md`) |
| Baixa | Versões do Drizzle | Patches estáveis, só com testes (ver `versoes-e-compatibilidade.md`) |
| Baixa | Organização de arquivos | Manter como está até surgir necessidade real |

> ⚠️ Esta auditoria foi **estática**: não executou o projeto nem inspecionou uma
> instância real do banco. As ações acima devem ser confirmadas com evidência antes
> de qualquer mudança.

## Conteúdo desta pasta

| Arquivo | Assunto |
|---|---|
| [`versoes-e-compatibilidade.md`](./versoes-e-compatibilidade.md) | Versões instaladas, semântica do `^`, atualização segura |
| [`schema.md`](./schema.md) | Revisão tabela por tabela do `schema.ts` |
| [`relacoes.md`](./relacoes.md) | `references()` vs `relations()`, v1 vs v2, ambiguidades |
| [`migrations.md`](./migrations.md) | `drizzle.config.ts`, ciclo de migration, o que nunca fazer |
| [`conexao.md`](./conexao.md) | postgres.js, pool, TLS, prepared statements |
| [`transacoes.md`](./transacoes.md) | `db.transaction()`, atomicidade, quando usar `FOR UPDATE` |
| [`diagnostico-postgres.md`](./diagnostico-postgres.md) | EXPLAIN, catálogos do PostgreSQL, índices, Docker/UTC |
| [`referencias.md`](./referencias.md) | Links oficiais |

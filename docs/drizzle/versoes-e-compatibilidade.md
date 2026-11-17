# Versões e compatibilidade

## Versões usadas no projeto

Do `package.json`:

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.10"
  }
}
```

Versões estáveis da linha 0.x verificadas nos registros de publicação:

| Pacote        | Versão-base | Versão estável encontrada |
| ------------- | ----------- | ------------------------- |
| `drizzle-orm` | `0.45.2`    | `0.45.4`                  |
| `drizzle-kit` | `0.31.10`   | `0.31.11`                 |

## ⚠️ O `^` não fixa a versão

O prefixo `^` permite atualizações compatíveis dentro do intervalo semântico. O
`package.json` **não garante** que a versão efetivamente instalada seja exatamente
`0.45.2` / `0.31.10`.

Verificar o que está realmente instalado:

```bash
npm ls drizzle-orm drizzle-kit postgres
```

Antes de consultar qualquer documentação de API, confirmar a versão efetivamente
instalada — as APIs mudam entre linhas (ver alerta da 1.0 abaixo).

## Compatibilidade com o PostgreSQL 18

- PostgreSQL 18 + Drizzle ORM/Kit 0.45.x/0.31.x: **par estável, compatível**.
- Chaves estrangeiras do projeto: **corretas**.
- Migrações: exigem verificação contra o banco real (ver
  [`diagnostico-postgres.md`](./diagnostico-postgres.md)).

## Não migrar imediatamente para o Drizzle 1.0 RC

A documentação mais recente já apresenta APIs novas (ex.: `defineRelations()`,
relações v2), mas **algumas pertencem à linha 1.0 e não devem ser copiadas
automaticamente** para a 0.45.x. Detalhes em [`relacoes.md`](./relacoes.md).

## Atualização dentro da linha estável (opcional)

```bash
npm install drizzle-orm@0.45.4
npm install -D drizzle-kit@0.31.11
```

**Não tratar como obrigatória.** Antes de atualizar: testar as migrations, a tipagem
(`npx tsc --noEmit`) e os repositórios. Uma atualização de patch também merece rodar
a suíte de testes (`npm test`).

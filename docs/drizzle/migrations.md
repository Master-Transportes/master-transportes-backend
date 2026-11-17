# Migrations com Drizzle Kit

## Configuração real do projeto (`drizzle.config.ts`)

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não está definida nas variáveis de ambiente.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/database/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});
```

Não é necessário criar um arquivo de configuração para cada tabela.

## O ciclo de migration

1. **Modificar o schema TypeScript** — nova coluna, constraint, índice etc.
2. **Gerar a migration**

   ```bash
   npx drizzle-kit generate
   ```

3. **Revisar o SQL gerado** — tabelas, índices, enums, dados existentes e
   **operações destrutivas**. Esta revisão é manual e obrigatória.
4. **Validar o histórico**

   ```bash
   npx drizzle-kit check
   ```

5. **Aplicar em banco de desenvolvimento/teste**

   ```bash
   npx drizzle-kit migrate
   ```

6. **Executar testes e validar o estado real do banco** — confirmar que o PostgreSQL
   recebeu exatamente o esperado.

> `check` verifica a consistência do histórico gerado; **não** substitui a inspeção
> do banco nem comprova que as migrations foram aplicadas corretamente.

## Regras deste projeto (não negociáveis)

- ❌ **Nunca editar migration já aplicada.**
- ❌ **Nunca usar `drizzle-kit push` / `pull`** como estratégia. O projeto tem
  histórico versionado; `generate` + revisão + `migrate` é o fluxo controlado.
  Há também relatos de problemas de introspecção de índices em versões do Kit,
  reforçando a importância da revisão manual.
- ⚠️ **O Encore não aplica estas migrations automaticamente.** Este banco é externo
  ao Encore (Docker próprio). `npm run dev` executa `drizzle-kit migrate`; fora dele,
  verificar o estado do banco antes de rodar o backend.
- Mudanças de schema exigem: estratégia de migração, compatibilidade com dados
  existentes e testes.

## Produção

Executar migrations como **etapa controlada de implantação**, não automaticamente
em cada réplica da aplicação.

## Encontrar a versão efetivamente instalada

O `^` do `package.json` não fixa a versão — confirmar com:

```bash
npm ls drizzle-orm drizzle-kit postgres
```

Ver [`versoes-e-compatibilidade.md`](./versoes-e-compatibilidade.md).

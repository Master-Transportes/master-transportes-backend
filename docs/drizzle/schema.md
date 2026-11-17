# Schema: revisão tabela por tabela

Revisão estática do `src/infra/database/schema.ts` (auditoria de 2026-11-17).

> **Resumo:** a base está bem estruturada. Nenhuma tabela precisa ser recriada; os
> pontos de ação estão indicados em cada seção.

## 1. `users` — identidade única

### O que está correto

- `id: uuid("id").defaultRandom().primaryKey()` — UUID gerado no banco, não depende
  da aplicação para unicidade, evita sequências públicas previsíveis.
- Separação de `passwordHash`, estados da conta e timestamps.

### Índice único de e-mail — bom padrão do projeto

```ts
uniqueIndex("users_email_lower_unique")
  .on(sql`lower(${t.email})`)
  .where(sql`deleted_at IS NULL`)
```

Combina dois recursos oficiais do PostgreSQL (índice por **expressão** + índice
**parcial**):

1. `lower(email)` impede duplicidade que diferencie apenas maiúsculas/minúsculas.
2. `WHERE deleted_at IS NULL` permite **reutilizar** o e-mail após soft delete.

**Correção de comentário:** o índice **não** verifica `status = ACTIVE`; verifica
somente `deleted_at IS NULL`. Comentar como:

```
// E-mail único entre usuários não excluídos,
// independentemente de maiúsculas/minúsculas.
```

Não mudar o índice — apenas o comentário.

### CPF: `varchar(11)`

Correto **se** o projeto armazena exclusivamente os 11 dígitos, sem pontos/traços.
Mas `varchar(11)` impõe apenas tamanho máximo — **não garante exatamente 11 dígitos
nem dígito verificador válido**.

Ação: verificar se **todos os caminhos de escrita** passam pela validação/normalização
do domínio (`src/domain/identity/identity.utils.ts`). Não acrescentar constraint
complexa de CPF sem necessidade concreta demonstrada.

### ⚠️ `updatedAt` — o ponto mais importante

```ts
updatedAt: timestamptz("updated_at").defaultNow().notNull()
```

`defaultNow()` define valor padrão **apenas no INSERT**. **Não atualiza automaticamente
em cada UPDATE.**

**Opção A — atualização explícita no repository (preferida):**

```ts
await db
  .update(users)
  .set({
    fullName: input.fullName,
    updatedAt: new Date(),
  })
  .where(eq(users.id, userId));
```

Vantagens: comportamento explícito, fácil de testar, aplicável aos updates que já têm
regra de negócio.

**Opção B — `$onUpdateFn()` do Drizzle:**

```ts
updatedAt: timestamptz("updated_at")
  .defaultNow()
  .$onUpdateFn(() => new Date())
  .notNull()
```

Funciona nas operações **via ORM**; não instala mecanismo no PostgreSQL para escritas
externas.

> Não aplicar as duas indiscriminadamente. Primeiro auditar como os repositórios
> atuais atualizam esses campos (prioridade **alta** na auditoria).

## 2. `user_roles` — múltiplos papéis

- PK composta `(user_id, role)`: impede papel duplicado, permite CLIENT + DRIVER
  para o mesmo usuário. ✔ Correta.
- `onDelete: "cascade"` para o vínculo com `users`: ok para exclusões físicas, desde
  que seja a política desejada.
- `index("user_roles_role_idx").on(role)`: útil para consultas por papel (ex.: listar
  motoristas). A PK composta já atende consultas por `user_id`.

Ação: **manter o índice por enquanto** e verificar uso real antes de remover.
Não existe motivo para criar índice adicional só sobre `user_id`.

## 3. `driver_profiles` — 1:0..1 com users

- `userId` como PK com FK `references(users.id, onDelete: "cascade")`: implementa
  corretamente "zero ou um perfil por usuário". **Não adicionar outro `id` UUID** —
  isso duplicaria a identidade.
- ⚠️ **Soft delete + PK:** um perfil com `deletedAt` preenchido **continua ocupando a
  PK**. Não é possível criar outro perfil para o mesmo `userId` enquanto o registro
  existir. Para este modelo, isso tende a ser **correto**: restaurar/reativar o perfil
  existente preserva histórico. Manter a PK atual até uma regra de negócio demonstrar
  o contrário.
- **Estado de aprovação:** `status` + `reviewedAt` + `reviewedByUserId` +
  `rejectionReason` registram uma decisão, mas o banco aceita combinações inválidas
  (ex.: `APPROVED` com `rejectionReason` preenchido). Tratar por **política de
  transição de estados no service**; constraints adicionais só quando houver regras
  estáveis.
- O schema **não impede** usuário sem papel DRIVER de ter linha em `driver_profiles`.
  Se proibido, o fluxo de criação deve garantir transacionalmente (ver
  [`transacoes.md`](./transacoes.md)).

## 4. `driver_documents` — documentos

- FK para `driverProfiles.userId` com cascade: documento pertence a perfil existente. ✔
- Índice único parcial `(driverUserId, type) WHERE deleted_at IS NULL`: apenas um
  documento ativo de cada tipo por motorista.

| Motorista | Tipo | Excluído? | Permitido?       |
| --------- | ---- | --------- | ---------------- |
| X         | CNH  | Não       | Sim              |
| X         | CNH  | Não       | ❌ duplicidade   |
| X         | CNH  | Sim       | Sim (histórico)  |
| X         | CRLV | Não       | Sim              |

- Documento **rejeitado ou expirado** continua ocupando a unicidade enquanto não houver
  soft delete. A política "excluir logicamente o anterior + criar novo, **na mesma
  transação**" faz sentido para substituição com histórico.
- **Checks corretos** (com armadilha conhecida):

```ts
check("driver_documents_dates_check",
  sql`expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on`)

check("driver_documents_category_type_check",
  sql`license_category IS NULL OR type = 'CNH'`)
```

> Um `CHECK` do PostgreSQL considera a condição satisfeita quando a expressão é
> **verdadeira OU NULL**. O uso explícito de `IS NULL` e a separação das condições
> aqui são intencionais e corretos.

Ação: não adicionar checks para todo campo. Distinguir **invariantes de domínio**
das regras que dependem do fluxo de análise do documento.

## 5. `sessions` — autenticação e refresh

- FK para `users` com cascade, múltiplas sessões por usuário. ✔
- **Guardar o hash do refresh token (não o token completo) é decisão correta.** Mas
  isso só é seguro com tokens imprevisíveis, verificação correta, rotação e revogação
  implementadas — garantias que vêm do código, não da tabela.

### Os três índices

| Índice                            | Avaliação                                   |
| --------------------------------- | ------------------------------------------- |
| `sessions_user_id_idx`            | Útil (consultar/revogar sessões por usuário) |
| `sessions_refresh_token_hash_idx` | Potencialmente redundante                   |
| `sessions_expires_at_idx`         | Útil se houver limpeza/consulta por expiração |

Pergunta-chave: **existe alguma query que busca a sessão pelo hash do refresh token?**
Se o refresh token contém o `sessionId` e o repository sempre busca pela PK `id`,
o índice de hash pode nunca ser usado.

Ação: **não remover sem evidência**. Investigar código + plano de execução (ver
[`diagnostico-postgres.md`](./diagnostico-postgres.md)).

> O PostgreSQL cria índices para PKs e constraints de unicidade, mas **não** cria
> automaticamente índices para todas as colunas de FK.

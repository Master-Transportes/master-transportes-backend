# Transações e concorrência

## Regra geral

Operações que representam **uma única operação de negócio** mas tocam **mais de uma
tabela** devem ser atômicas via `db.transaction()`. Todas as consultas participantes
usam o objeto transacional recebido — nunca o `db` global.

## Exemplo: cadastro de motorista

Criar usuário + atribuir papel + criar perfil é **uma** operação de negócio:

```ts
await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({
      fullName: input.fullName,
      email: input.email,
      passwordHash: input.passwordHash,
    })
    .returning({ id: users.id });

  await tx.insert(userRoles).values({
    userId: user.id,
    role: AuthRole.DRIVER,
  });

  await tx.insert(driverProfiles).values({
    userId: user.id,
  });

  return user;
});
```

Pressupostos: `input` já validado, hash de senha gerado com segurança,
`AuthRole` importado do domínio (`src/domain/identity`).

Se qualquer insert falhar, a transação desfaz os anteriores — o banco nunca fica com
um usuário sem papel ou sem perfil.

> **Nota:** no projeto, a transação vive no **service**, que orquestra via
> repositories (ver `AGENTS.md` — service traduz erro de persistência; repository
> é o único lugar com SQL/Drizzle).

## `SELECT FOR UPDATE`: só quando a invariante exigir

**Não** usar `FOR UPDATE` em todas as transações. Bloqueios explícitos só entram
quando a operação concorrente e a invariante de domínio exigem isso.

Exemplo futuro que **mereceria** controle específico: aceitação de corrida com dois
motoristas concorrentes (quando corridas existirem — ver
[`../streaming/arquitetura-corridas.md`](../streaming/arquitetura-corridas.md)).

## Casos do schema atual que devem ser transacionais

- **Cadastro** (`users` + `user_roles` [+ `driver_profiles`]) — já é a prática do
  projeto.
- **Substituição de documento** (`driver_documents`): soft delete do anterior +
  insert do novo **na mesma transação**, preservando a unicidade parcial
  `(driver_user_id, type) WHERE deleted_at IS NULL` (ver [`schema.md`](./schema.md)).
- Mudanças em sessão/refresh/revogação exigem análise específica de concorrência e
  testes de acesso negado (ver `AGENTS.md`).

## Regras de tradução de erro (padrão do projeto)

Códigos PostgreSQL relevantes para a camada de service:

| Código  | Significado              | Tradução |
| ------- | ------------------------ | -------- |
| `23505` | Violação de unicidade    | 409      |
| `23514` | Violação de CHECK/FK     | 400      |
| —       | Indisponibilidade do banco | 503    |
| —       | Demais erros             | 500, sem vazar SQL |

# Diagnóstico no PostgreSQL real

> Uma coisa é declarar em `schema.ts`; outra é confirmar que a migration criou aquilo
> no banco. Um `schema.ts` correto **não** garante que um banco migrado ao longo dos
> meses esteja idêntico ao código atual.

Comandos de diagnóstico para **ambiente de desenvolvimento**.

## Ver os índices existentes

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## Ver FKs, checks e demais constraints

```sql
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY table_name, constraint_name;
```

## Ver as migrations registradas pelo Drizzle Kit

Esquema e tabela padrão do migrador:

```sql
SELECT *
FROM drizzle.__drizzle_migrations
ORDER BY id;
```

## Analisar performance de uma query

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM sessions
WHERE user_id = '00000000-0000-4000-8000-000000000001';
```

Com `ANALYZE`, a consulta é **efetivamente executada** — não usar indiscriminadamente
em comandos que alteram dados.

Avaliar:

- Se o índice foi utilizado.
- Quantas linhas foram examinadas.
- Volume de leituras.
- Seletividade do filtro.
- Se o benefício justifica o custo de escrita e armazenamento do índice.

> Um índice não é otimização só por aparecer numa FK ou num campo usado em filtro.
> **Nunca criar ou remover índice sem evidência** (ver `AGENTS.md`).

## Índices candidatos a investigação (auditoria 2026-11-17)

Investigar antes de qualquer mudança:

1. `sessions_refresh_token_hash_idx` — potencialmente redundante (existe query que
   busca pelo hash? ver [`schema.md`](./schema.md)).
2. `users_status_idx`
3. `driver_profiles_status_idx`

**Não remover nenhum sem `EXPLAIN` + código + plano de execução.**

## Docker / PostgreSQL 18 — observações de infraestrutura

### O volume atual está correto ✔

```
volumes:
  - postgres_data:/var/lib/postgresql
```

A partir do PostgreSQL 18, a imagem oficial mudou o volume recomendado de
`/var/lib/postgresql/data` para `/var/lib/postgresql`. O `healthcheck` com
`pg_isready` também é apropriado.

### Ajustes operacionais sugeridos (opcionais)

```yaml
services:
  postgres:
    image: postgres:18
    restart: unless-stopped

    ports:
      - "127.0.0.1:5432:5432"   # restringe à máquina local

    environment:
      POSTGRES_USER: ${POSTGRES_USER:?Obrigatório}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Obrigatório}
      POSTGRES_DB: ${POSTGRES_DB:?Obrigatório}

    volumes:
      - postgres_data:/var/lib/postgresql

    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s

volumes:
  postgres_data:
```

O que muda em relação ao compose atual:

- `127.0.0.1:5432:5432` evita publicar o banco em todas as interfaces.
- `${VAR:?Obrigatório}` faz o Compose falhar se faltar variável essencial.
- `$$POSTGRES_USER` / `$$POSTGRES_DB` deixam o shell do contêiner usar as próprias
  variáveis.
- Remoção de `container_name` e de rede personalizada: não são necessários para a
  descoberta de serviços, **a menos que outros serviços usem a rede específica** —
  nesse caso, preservá-la.

### ⚠️ Cuidados

- **Não executar `docker compose down -v`** em ambiente com dados a conservar —
  isso apaga o volume do banco.
- **Não trocar a versão principal do PostgreSQL** sobre um volume existente sem
  planejar a migração dos dados.

### Configurar timezone do banco em UTC

A recomendação completa está em [`../temporal/`](../temporal/) (política de datas).
Resumo: configurar `timezone=UTC` no serviço, confirmar com `SHOW TIME ZONE`, e
**não depender** dessa configuração para interpretar horários locais de negócio.

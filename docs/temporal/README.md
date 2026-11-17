# ⏰ Política de datas e horários

Política transversal do Master Transporte: como **datas e horários circulam entre
aplicativo, API, service, repository e PostgreSQL**, sem depender do fuso da máquina
onde o backend estiver executando.

> **Fontes principais:** [PostgreSQL 18 — Date/Time Types](https://www.postgresql.org/docs/18/datatype-datetime.html),
> [Date/Time Functions](https://www.postgresql.org/docs/18/functions-datetime.html),
> [Drizzle — PG Column Types](https://orm.drizzle.team/docs/column-types/pg),
> [Zod 4](https://zod.dev/api).

## Status

- O **schema atual já está correto** — nenhuma coluna temporal precisa ser trocada.
- O que falta é **estabelecer e aplicar a política** abaixo, de preferência **antes**
  de implementar corridas, rastreamento, agendamentos e histórico.

## A regra central: três tipos de informação temporal

| Informação                      | Exemplo                            | Tipo PostgreSQL | API                               |
| ------------------------------- | ---------------------------------- | --------------- | --------------------------------- |
| **Instante exato**              | Corrida aceita às 14h UTC          | `timestamptz`   | ISO 8601 em UTC com `Z`           |
| **Data civil**                  | CNH vence em 17/11/2027            | `date`          | `2027-11-17`                      |
| **Hora local de agendamento**   | Buscar passageiro às 08h em Manaus | Data + hora + fuso IANA | Campos explícitos         |

Essa distinção evita a maior parte dos erros de timezone.

10:00 em Manaus (UTC−04:00) e 14:00 em UTC são **o mesmo instante**, padronizado na
API como `2026-11-17T14:00:00.000Z`.

Já `2027-11-17` (vencimento de CNH) **não representa um instante às 00h UTC** — é uma
data do calendário. **Não** transformá-la indiscriminadamente em `Date`.

## Contrato de datas da API

Política única para todos os endpoints:

| Tipo       | Entrada aceita                            | Resposta                 |
| ---------- | ----------------------------------------- | ------------------------ |
| Instante   | ISO 8601 com `Z` ou offset explícito      | ISO 8601 em UTC, com `Z` |
| Data civil | `YYYY-MM-DD`                              | Mesmo formato            |
| Fuso       | Identificador IANA, como `America/Manaus` | Identificador IANA       |
| Hora local | `HH:mm`, vinculada a uma data e fuso      | De acordo com a operação |

```json
// Entrada:
{ "scheduledAt": "2026-11-17T10:00:00-04:00" }

// Saída:
{ "scheduledAt": "2026-11-17T14:00:00.000Z" }
```

❌ **Não aceitar** `2026-11-17T10:00:00` como instante — sem offset/zona, o servidor
não sabe a que instante corresponde.

## Regras duradouras (resumo)

- ❌ Nunca aceitar instante **sem offset** explícito.
- ❌ Nunca calcular "próximo dia" com `24 * 60 * 60 * 1000` (dias têm 23 ou 25 horas).
- ❌ Nunca descobrir timezone por **IP**.
- ❌ Nunca confiar no horário enviado pelo app do motorista para **eventos críticos** —
  o servidor/banco define (ver [Autoridade dos timestamps](#autoridade-dos-timestamps)).
- ❌ Nunca retornar horário já formatado (`17/11/2026 10:00`) em campos destinados a
  processamento — formatação é responsabilidade da interface.
- ✅ Instante = `timestamptz` + ISO UTC com `Z`; data civil = `date` + `YYYY-MM-DD`.
- ✅ Timezone de negócio é da **região operacional** (da corrida, do documento), não do
  usuário.
- ✅ **Não** adicionar coluna `time_zone` em `users` agora — antecipação sem
  funcionalidade concreta (ver [Consumo e região](./validacao-e-consumo.md)).

## Autoridade dos timestamps

O **servidor** é a autoridade para eventos críticos:

| Operação                      | Quem define o instante                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Cadastro realizado            | PostgreSQL                                                                      |
| Sessão criada                 | Backend/PostgreSQL                                                              |
| Refresh token expirado        | Verificação contra relógio confiável do servidor                                |
| Motorista aceitou uma corrida | PostgreSQL, no commit da operação                                               |
| Corrida cancelada             | Backend/PostgreSQL                                                              |
| Localização GPS capturada     | Dispositivo pode informar o horário da captura; servidor registra o recebimento |
| Vencimento da CNH             | Data civil, segundo a regra aplicável ao documento                                              |

## Conteúdo desta pasta

| Arquivo | Assunto |
|---|---|
| [`schema-e-banco.md`](./schema-e-banco.md) | Tipos no Drizzle, `timestamptz` e o mito do fuso armazenado, UTC no banco, filtros por dia |
| [`validacao-e-consumo.md`](./validacao-e-consumo.md) | Schemas Zod, mappers, Android/Kotlin, timezone por região |
| [`testes.md`](./testes.md) | Suíte de regressão temporal |

Detalhes de `now()`, `statement_timestamp()` e `clock_timestamp()` estão em
[`schema-e-banco.md`](./schema-e-banco.md); fundamentos de `timestamptz`/`date` no
PostgreSQL em [`../drizzle/referencias.md`](../drizzle/referencias.md).

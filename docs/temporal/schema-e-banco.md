# Tipos no schema e no banco

## O schema atual está correto — manter

Definição existente no projeto:

```ts
const timestamptz = (name: string) =>
  timestamp(name, {
    withTimezone: true,
    mode: "date",
  });
```

`withTimezone: true` usa o tipo PostgreSQL `timestamp with time zone`; no modo `date`,
o ORM converte para `Date` no TypeScript. **Manter exatamente assim.**

Campos adequados com `timestamptz`: `createdAt`, `updatedAt`, `deletedAt`,
`reviewedAt`, `expiresAt` de sessão etc.

E nos documentos do motorista, manter:

```ts
issuedOn: date("issued_on", { mode: "string" }),
expiresOn: date("expires_on", { mode: "string" }),
```

`mode: "string"` é apropriado: o TypeScript recebe a **data civil** como texto, sem
transformá-la em instante.

> Nenhuma migration é necessária apenas por timezone.

## ⚠️ O detalhe mais importante sobre `timestamptz`

Apesar do nome, o PostgreSQL **não preserva o fuso horário original** numa coluna
`timestamptz`. Ele normaliza o instante internamente em UTC e, ao consultar, apresenta
o horário conforme o **fuso da sessão**:

```
2026-11-17 10:00:00-04
                  ↓
             PostgreSQL
                  ↓
2026-11-17 14:00:00+00
```

A informação `America/Manaus` **não fica armazenada**. Se ela for importante para a
regra de negócio, deve ser guardada **separadamente** (ver
[`validacao-e-consumo.md`](./validacao-e-consumo.md)).

## Configurar o PostgreSQL para UTC

Mesmo que `timestamptz` represente instantes corretamente, configurar o timezone das
sessões do PostgreSQL como **UTC** evita surpresas com operações dependentes do fuso
(`CURRENT_DATE`, conversões implícitas, apresentação de timestamps em SQL).

### Descobrir a configuração atual

```sql
SHOW TIME ZONE;

SELECT
  now() AS current_instant,
  now() AT TIME ZONE 'America/Manaus' AS manaus_time,
  current_setting('TimeZone') AS database_timezone;
```

O primeiro valor é `timestamptz`; o segundo é a representação civil daquele instante
em Manaus, **sem** timezone anexado.

### Configurar no Docker Compose

Fragmento a **integrar** ao serviço existente (não substituir as demais configs):

```yaml
services:
  postgres:
    image: postgres:18

    command:
      - postgres
      - -c
      - timezone=UTC
```

Após reiniciar, confirmar com `SHOW TIME ZONE` numa **conexão nova**. Configurações de
banco, usuário ou sessão podem sobrepor o valor padrão.

> Essa mudança **não reconverte** os timestamps armazenados: os instantes de
> `timestamptz` permanecem os mesmos. Ela altera a interpretação/apresentação padrão
> de operações dependentes do fuso.

### E o Node/Encore?

Padronizar o ambiente de execução em UTC quando possível, mas **não fazer a lógica
depender disso**:

```ts
// ❌ Depende do timezone do processo:
const hour = new Date().getHours();

// ❌ Não representa um instante inequívoco:
const date = new Date("2026-11-17T10:00:00");

// ✅ Instante explícito:
const now = new Date();
const iso = now.toISOString();
const timestamp = now.getTime();
```

`Date` e timestamp numérico representam um instante independentemente do fuso do
processo. Quando precisar da hora de uma região, indicar a zona explicitamente.

## Filtros por dia — o erro clássico

Quando existir histórico de corridas, o passageiro vai selecionar um **dia local**
(17/11 em Manaus). O erro seria:

```sql
-- ❌ Depende do timezone da SESSÃO PostgreSQL:
--    em UTC, representa o dia UTC, não o dia que o usuário selecionou.
--    Além disso, converter a coluna pode impedir o uso de índice em created_at.
SELECT * FROM rides
WHERE created_at::date = '2026-11-17';
```

### Abordagem recomendada

A API recebe:

```
GET /rides?date=2026-11-17&timeZone=America/Manaus
```

O repository transforma os limites do dia local em **instantes**, com início
inclusivo e **fim exclusivo**:

```sql
SELECT *
FROM rides
WHERE created_at >= ($1::date::timestamp AT TIME ZONE $2)
  AND created_at < (($1::date + 1)::timestamp AT TIME ZONE $2)
ORDER BY created_at DESC;
-- $1 = '2026-11-17'   $2 = 'America/Manaus'
```

Versão Drizzle, com a mesma lógica (sem calcular offsets manualmente):

```ts
import { and, gte, lt, sql } from "drizzle-orm";

const start = sql`(${date}::date::timestamp AT TIME ZONE ${timeZone})`;
const end = sql`((${date}::date + 1)::timestamp AT TIME ZONE ${timeZone})`;

const results = await db
  .select()
  .from(rides)
  .where(and(gte(rides.createdAt, start), lt(rides.createdAt, end)));
```

- `rides` e `ride_offers` **existem no schema, na migration `0001` e já possuem a
  primeira camada funcional REST** (ver [`../api/corridas.md`](../api/corridas.md)).
  O exemplo de filtro por dia local continua sendo referência para quando o
  histórico paginado por dia for implementado; a listagem atual não aceita filtro
  de data.
- O template SQL do Drizzle usa **parâmetros** (sem concatenar entrada do cliente),
  mas `date` e `timeZone` devem ser validados antes (ver
  [`validacao-e-consumo.md`](./validacao-e-consumo.md)).
- A consulta representa exatamente o dia do calendário naquela região, inclusive em
  fusos com horário de verão.

## Funções de timestamp do PostgreSQL

Para registrar eventos no servidor, preferir a hora **do banco**:

```ts
await tx.update(rides).set({
  status: "accepted",
  acceptedAt: sql`now()`,
  updatedAt: sql`now()`,
});
// where(...)  ← condição atômica de aceitação
```

| Função                   | Valor                                   |
| ------------------------ | --------------------------------------- |
| `now()`                  | Início da transação (consistente nela)  |
| `statement_timestamp()`  | Início da instrução                     |
| `clock_timestamp()`      | Relógio efetivo no instante da instrução |

Usar `now()` por padrão; as demais só quando o requisito exigir.

## Datas civis e vencimento

Uma validade como `2027-11-17` continua sendo **data civil**. Para saber se um
documento está vencido, comparar com a data de hoje **na região da regra de negócio**:

```sql
SELECT
  expires_on < (now() AT TIME ZONE 'America/Manaus')::date AS is_expired
FROM driver_documents;
```

O timezone apropriado para validade documental segue a regra de emissão/uso do
documento — **não** necessariamente o fuso atual do usuário.

## Agendamentos futuros (quando existirem)

Corrida agendada ≠ corrida imediata. Para preservar o significado do agendamento,
guardar **os três valores**:

```json
{ "pickupDate": "2026-11-20", "pickupTime": "08:30", "timeZone": "America/Manaus" }
```

- Data/hora locais originais, **timezone IANA** (não offset fixo como `-04:00`, que
  não descreve regras históricas/futuras) e o **instante UTC** calculado.
- Horário de verão: em zonas como `America/New_York`, horas locais podem não existir
  ou ocorrer duas vezes. A proposta [Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
  oferece desambiguação explícita (incluindo `reject`).
- Introduzir `@js-temporal/polyfill` **somente** quando o projeto precisar resolver
  agendamentos locais ou recorrências. Para os campos atuais de autenticação,
  `Date` + `timestamptz` são suficientes.

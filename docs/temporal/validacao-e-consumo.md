# Validação, mappers e consumo

## Schemas Zod centralizados

A validação temporal fica nos schemas Zod do projeto (`src/validations/*.validate.ts`,
`strictObject` para rejeitar campos desconhecidos).

```ts
import { z } from "zod";

export const InstantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const CivilDateSchema = z.iso.date();

export const TimeZoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Fuso horário inválido" },
);
```

Responsabilidades distintas:

- `InstantSchema` — aceita instante **com offset** e entrega um `Date` para uso interno.
- `CivilDateSchema` — valida data de calendário **sem aplicar fuso**.
- `TimeZoneSchema` — verifica se o runtime reconhece o identificador de fuso.

> ⚠️ A validação com `Intl` aceita os identificadores reconhecidos pelo runtime; não
> garante uma política estrita de nomes regionais IANA. Se necessário, restringir os
> identificadores aceitos.

**No DTO público, o campo continua `string`.** O `Date` transformado pertence ao
processamento interno, não ao contrato JSON. A regra do projeto de duplicação
(endpoint valida, service revalida) vale aqui — não criar terceira camada.

## Mappers: converter para ISO UTC na saída

No projeto, os **mappers** (`src/mappers/`) convertem dados da persistência para DTOs
(`Date` → ISO string). Manter essa responsabilidade:

```ts
interface SessionResponse {
  id: string;
  expiresAt: string;
  createdAt: string;
}

function toSessionResponse(session: SessionRow): SessionResponse {
  return {
    id: session.id,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}
```

`.toISOString()` **sempre** retorna UTC com sufixo `Z` — os consumidores recebem
horários padronizados, estejam em Manaus, São Paulo ou qualquer região.

❌ Nunca retornar `17/11/2026 10:00` em campos destinados a processamento — formatação
é responsabilidade da interface.

## Timezone por região — quem determina o fuso?

Separar o **instante** do evento da **região** à qual a regra de negócio pertence:

| Contexto                                  | Timezone correto                                   |
| ----------------------------------------- | -------------------------------------------------- |
| Exibição de notificações                  | Preferência do usuário ou fuso do dispositivo      |
| Histórico de corridas por dia de operação | Fuso da região operacional definida para a corrida |
| Agendamento de uma viagem                 | Fuso do local de partida da viagem                 |

❌ **Não** descobrir timezone por IP (falha em redes móveis, corporativas, VPNs,
viagens).

❌ **Não** hardcodar `America/Manaus` como regra universal em todos os endpoints
apenas porque a operação começa no Amazonas.

### Adicionar `timeZone` em `users` agora?

**Não obrigatoriamente.** Se o usuário ainda não pode escolher preferência de horário
e o backend não oferece filtros locais nem agendamentos, a coluna seria antecipação
desnecessária. Quando houver essa funcionalidade:

```ts
timeZone: varchar("time_zone", { length: 64 }),
// armazena identificador IANA, ex.: "America/Manaus" — não "-04:00"
```

Para corrida agendada, persistir o timezone do **local de partida na própria corrida**
(dado histórico do agendamento) — mudança posterior na preferência do passageiro não
altera silenciosamente o horário combinado.

## Consumo no Android/Kotlin

O aplicativo respeita os mesmos tipos. Para:

```json
{ "createdAt": "2026-11-17T14:00:00.000Z", "expiresOn": "2027-11-17" }
```

Usar `java.time`:

```kotlin
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

val instant = Instant.parse("2026-11-17T14:00:00.000Z")

val zone = ZoneId.of("America/Manaus")

val localDateTime = instant.atZone(zone)

val formatter = DateTimeFormatter.ofPattern(
    "dd/MM/yyyy HH:mm",
    Locale.forLanguageTag("pt-BR")
)

val displayed = localDateTime.format(formatter)
// 17/11/2026 10:00

val expiresOn = LocalDate.parse("2027-11-17")
// Data civil, sem timezone
```

- `java.time` é nativa a partir do **Android API 26**; para versões anteriores, usar
  *core library desugaring*.
- **A API envia dados padronizados; o app decide como exibi-los.**

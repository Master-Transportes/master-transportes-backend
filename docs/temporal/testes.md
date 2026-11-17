# Testes de regressão temporal

Suíte para impedir que alterações futuras introduzam problemas de timezone.

## Casos de teste

| Teste                                         | Resultado esperado                                         |
| --------------------------------------------- | ---------------------------------------------------------- |
| Entrada UTC com `Z`                           | Aceita como instante válido                                |
| Entrada com `-04:00`                          | Convertida para o UTC correspondente                       |
| Entrada sem offset                            | Rejeitada quando o campo exige um instante                 |
| `Date` → mapper → JSON                        | Retorna ISO UTC com `Z`                                    |
| Data civil `2027-11-17`                       | Mantém exatamente o mesmo dia                              |
| Consulta de dia em Manaus                     | Retorna somente os instantes daquele dia local             |
| Dia com transição de horário de verão         | Calcula corretamente os limites locais                     |
| PostgreSQL em UTC vs outro timezone           | Mesmos instantes e resultados explícitos de negócio        |
| Agendamento em horário inexistente ou ambíguo | Rejeitado ou resolvido conforme política explícita         |
| Expiração de sessão                           | Não depende do timezone do dispositivo                     |

## Executar com timezones diferentes

Rodar pelo menos parte dos testes com `TZ=UTC` e `TZ=America/Manaus` no processo Node,
quando o ambiente permitir — isso detecta **dependências acidentais** do timezone do
servidor.

No Windows/PowerShell:

```powershell
$env:TZ = "America/Manaus"; encore exec -- bun test
```

No Linux/CI:

```bash
TZ=America/Manaus encore exec -- bun test
```

(Invólucro `encore exec` obrigatório — ver `AGENTS.md`. Ajustar ao fluxo real de CI
quando existir.)

## Escopo recomendado agora (política atual)

Implementar **antes** das funcionalidades temporais (corridas, histórico,
agendamentos), sem mexer no schema:

1. **Manter o schema** — `timestamptz` (`mode: "date"`) para instantes e `date`
   (`mode: "string"`) para datas civis.
2. **Padronizar entrada/saída da API** — instantes ISO **com offset** validados,
   resposta em UTC, datas civis `YYYY-MM-DD`; reutilizar mappers e validadores
   existentes.
3. **Verificar o timezone do PostgreSQL** — UTC como padrão de sessão, confirmado com
   `SHOW TIME ZONE` (ver [`schema-e-banco.md`](./schema-e-banco.md)).
4. **Padronizar a autoridade dos timestamps** — auditar `defaultNow()`, updates
   (ver [`../drizzle/schema.md`](../drizzle/schema.md)), expiração de sessões e
   operações concorrentes.
5. **Documentar e testar a política** — estes documentos + a suíte acima.

**Não implementar agora:** serviço global de timezone, tabela de fusos, campos extras
de timezone em todas as entidades. A infraestrutura atual comporta a política.

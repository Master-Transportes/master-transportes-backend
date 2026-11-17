# Comunicação entre serviços

O Encore gera comunicação tipada entre serviços Encore sem URLs, `fetch` ou
clientes HTTP manuais. A regra do projeto: **use a ferramenta mais simples para
cada caso** — e não transforme toda chamada entre classes em uma chamada de API.

## Formas de comunicação e quando usar cada uma

| Situação                                                  | Abordagem                          |
| ---------------------------------------------------------- | ---------------------------------- |
| Endpoint chama uma função do próprio domínio                | Service TypeScript diretamente     |
| Um serviço Encore precisa chamar outro serviço Encore       | `~encore/clients`                  |
| Referência de cliente precisa ser passada a outro componente | `service.ref()` (com restrições)  |
| Evento precisa ser processado assincronamente               | Encore Pub/Sub (ver `docs/pubsub/`) |
| App Android chama o backend                                 | HTTP (endpoint `expose: true`)     |
| Atualizações contínuas para o usuário                       | Streaming/WebSocket (ver `docs/streaming/`) |

## `~encore/clients`

Para cada serviço Encore definido, o Encore gera um cliente tipado no módulo
`~encore/clients`:

```ts
// Ilustrativo: pressupõe um endpoint interno getUser no serviço "identity".
import { identity } from "~encore/clients";

const user = await identity.getUser({ userId: "user-123" });
```

Características relevantes:

- A chamada é **tipada** com o contrato do endpoint de destino;
- O **contexto de autenticação é propagado**: se o endpoint de destino exigir
  autenticação e não houver contexto autenticado, a chamada falha;
- Endpoints de destino com `expose: false` só são acessíveis internamente.

## `service.ref()`

`service.ref()` retorna uma referência de cliente que pode ser **passada** a
outros componentes (por exemplo, como dependência). A análise estática do Encore
impõe restrições a como clientes de serviços podem ser manipulados — consulte a
documentação oficial antes de usá-lo.

## Regras do projeto

1. **Chamada direta primeiro.** Se duas funções pertencem ao mesmo domínio e ao
   mesmo serviço, uma chamada TypeScript direta é mais simples. Não crie um
   endpoint interno só para chamar o service ao lado.
2. `~encore/clients` quando há fronteira real entre serviços Encore (ex.: um
   serviço de corridas consumindo o serviço de identidade).
3. Pub/Sub quando o processamento é assíncrono e pode desacoplar do ciclo da
   requisição — com idempotência, duplicações e lacunas tratadas conforme
   `docs/pubsub/garantias-e-falhas.md`.
4. Chamadas entre serviços continuam respeitando autorização: o contexto
   autenticado propagado vale como identidade, e a permissão sobre o recurso
   continua sendo verificada no service de destino.

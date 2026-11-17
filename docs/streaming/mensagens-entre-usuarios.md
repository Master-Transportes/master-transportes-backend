# Enviar mensagens do usuário X para o usuário Y

Este é o passo mais importante além dos exemplos básicos: o backend precisa relacionar

> **identidade autenticada → conexão ativa → destinatário autorizado**

## Registro de conexões em memória

### Por que `Map<string, Set<Stream>>`?

Um usuário pode estar conectado em mais de um dispositivo ou sessão (celular + navegador).
O formato organiza exatamente isso:

```ts
import type { StreamInOut } from "encore.dev/api";

interface Incoming {
  text: string;
}

interface Outgoing {
  from: string;
  text: string;
}

type Connection = StreamInOut<Incoming, Outgoing>;

const connections = new Map<string, Set<Connection>>();
```

Estrutura resultante:

```
connections
│
├── "user-X"
│   ├── conexão do celular
│   └── conexão do navegador
│
├── "user-Y"
│   └── conexão do celular
│
└── "user-Z"
    └── conexão do navegador
```

### Enviar para um usuário específico

```ts
async function sendToUser(userId: string, event: Outgoing): Promise<void> {
  const streams = connections.get(userId);

  if (!streams) return;

  for (const stream of streams) {
    try {
      await stream.send(event);
    } catch {
      streams.delete(stream);
    }
  }

  if (streams.size === 0) {
    connections.delete(userId);
  }
}
```

Uso:

```ts
await sendToUser("user-Y", {
  from: "user-X",
  text: "Olá, Y!",
});
```

## ⚠️ Limitações e cuidados

- **Remetente vem da autenticação**, nunca do payload do cliente.
- A **permissão de comunicação** entre X e Y precisa ser validada antes do envio.
- A **mensagem deve ser persistida** antes (ou junto) da entrega — veja
  [`exemplo-integrado-chat.md`](./exemplo-integrado-chat.md).
- Esse mapa é **por instância**: com múltiplas réplicas, o destinatário pode estar
  conectado em outro servidor. Solução em
  [`redis-e-distribuicao.md`](./redis-e-distribuicao.md).

## Exemplo completo

O exemplo integrado de chat (registro de conexões, persistência, idempotência e entrega
para todos os dispositivos dos participantes) está em
[`exemplo-integrado-chat.md`](./exemplo-integrado-chat.md).

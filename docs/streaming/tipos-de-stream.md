# Os três tipos de stream

## 1. `api.streamIn` — Cliente envia dados ao servidor

Útil quando o cliente precisa transmitir vários eventos na mesma conexão
(upload em pedaços, ingestão contínua, telemetria).

```ts
import { api } from "encore.dev/api";

interface DataChunk {
  sequence: number;
  content: string;
}

interface UploadResult {
  received: number;
}

export const upload = api.streamIn<DataChunk, UploadResult>(
  { path: "/stream/upload", expose: true, auth: true },
  async (stream): Promise<UploadResult> => {
    let received = 0;

    for await (const chunk of stream) {
      // Processar ou persistir cada chunk.
      received++;
    }

    return { received };
  },
);
```

O servidor consome as mensagens com `for await...of`, processando cada item conforme chega.

> O exemplo acima apenas conta os itens. Em um upload real, adicione limites de tamanho
> e verificação de integridade.

## 2. `api.streamOut` — Servidor envia dados ao cliente

Ideal para acompanhar mudanças de estado (progresso de processamento, notificações).

```ts
import { api } from "encore.dev/api";

interface ProgressEvent {
  progress: number;
  status: string;
}

export const progress = api.streamOut<ProgressEvent>(
  { path: "/stream/progress", expose: true, auth: true },
  async (stream) => {
    await stream.send({ progress: 25, status: "Iniciado" });
    await stream.send({ progress: 75, status: "Processando" });
    await stream.send({ progress: 100, status: "Concluído" });

    await stream.close();
  },
);
```

O servidor envia com `stream.send()` e encerra com `stream.close()`.

## 3. `api.streamInOut` — Comunicação bidirecional

O cliente envia eventos e recebe respostas sem abrir conexão nova a cada interação
(chats, rastreamento de posição).

```ts
import { api } from "encore.dev/api";

interface ClientMessage {
  text: string;
}

interface ServerMessage {
  response: string;
}

export const communicate = api.streamInOut<ClientMessage, ServerMessage>(
  {
    path: "/stream/communicate",
    expose: true,
    auth: true,
  },
  async (stream) => {
    for await (const message of stream) {
      await stream.send({ response: `Recebido: ${message.text}` });
    }
  },
);
```

> Esse exemplo é um *echo*: o servidor responde ao mesmo cliente. Não é ainda
> comunicação entre dois usuários diferentes — veja
> [`mensagens-entre-usuarios.md`](./mensagens-entre-usuarios.md).

## Handshake: passando parâmetros ao conectar

Quando o endpoint precisa de dados iniciais (ex.: identificação da sala), a assinatura
ganha um primeiro genérico para o handshake:

```ts
import { api } from "encore.dev/api";

interface Handshake {
  roomId: string;
}

interface Incoming {
  text: string;
}

interface Outgoing {
  text: string;
}

export const connect = api.streamInOut<Handshake, Incoming, Outgoing>(
  {
    path: "/rooms/:roomId/connect",
    expose: true,
    auth: true,
  },
  async ({ roomId }, stream) => {
    // roomId identifica a sala solicitada.
    // VALIDAR se o usuário autenticado pode acessar essa sala!
    for await (const message of stream) {
      await stream.send({ text: message.text });
    }
  },
);
```

Assinaturas disponíveis:

| Modalidade    | Sem handshake                    | Com handshake                            |
| ------------- | -------------------------------- | ---------------------------------------- |
| `streamIn`    | `<In, Out>`                      | `<Handshake, In, Out>`                   |
| `streamOut`   | `<Out>`                          | `<Handshake, Out>`                       |
| `streamInOut` | `<In, Out>`                      | `<Handshake, In, Out>`                   |

O handshake é **opcional**, mas a tipagem das mensagens é **obrigatória**.

O handshake suporta: **path parameters**, **query parameters**, **headers** e
**dados de autenticação**.

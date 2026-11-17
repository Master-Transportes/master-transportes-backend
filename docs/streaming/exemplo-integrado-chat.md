# Exemplo integrado: chat com persistência

Exemplo de componente de mensagens para **uma única instância** do servidor.
Combina: streaming autenticado + registro de conexões + persistência no PostgreSQL +
idempotência de reenvio.

> **Pré-requisitos assumidos:**
> - `AuthHandler` configurado (neste projeto: `src/auth/`); o código usa `auth.userID` —
>   adapte ao `AuthData` real.
> - Conversas e participantes são criados por uma operação autorizada (endpoint REST).
>
> **Adaptação a este projeto:** as queries diretas (`db.queryRow` do `SQLDatabase`)
> devem virar métodos em `src/repositories/` com Drizzle; as tabelas entram em
> `src/infra/database/schema.ts` com migration via `drizzle-kit`.

## Por que persistir?

O WebSocket não é armazenamento. Se o destinatário está offline, a mensagem precisa
estar no banco para ser recuperada depois. **O PostgreSQL é a fonte de verdade.**

## Modelo de dados (resumo)

Três tabelas:

- `conversations` — identifica a conversa.
- `conversation_members` — define quem participa.
- `messages` — histórico e remetente.

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id UUID NOT NULL
        REFERENCES conversations(id),
    sender_id TEXT NOT NULL,
    client_message_id UUID NOT NULL,
    body TEXT NOT NULL
        CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (sender_id, client_message_id),

    FOREIGN KEY (conversation_id, sender_id)
        REFERENCES conversation_members(
            conversation_id, user_id
        )
);

CREATE INDEX messages_history_idx
    ON messages (conversation_id, id DESC);
```

Pontos-chave do modelo:

- **FK composta** `(conversation_id, sender_id) → conversation_members`: o banco **rejeita**
  uma mensagem cujo remetente não é participante da conversa.
- **`client_message_id`** = identificador criado pelo cliente para **idempotência**:
  se a mesma mensagem for reenviada após queda de conexão, não é gravada duplicada
  (`UNIQUE (sender_id, client_message_id)`).
- `user_id` é **referência lógica** quando o serviço de identidade usa outro banco —
  não presumir FK entre bancos independentes.
- Para produção: controlar criação de conversas (individual = 2 participantes; grupo = N),
  permissões de adicionar/remover participantes e encerramento de conversas.

## Código

### `chat/encore.service.ts`

```ts
import { Service } from "encore.dev/service";

export default new Service("chat");
```

### `chat/db.ts`

```ts
import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("chat", {
  migrations: "./migrations",
});
```

### `chat/realtime.ts` — streaming autenticado

```ts
import { api, APIError, StreamInOut } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./db";

interface Incoming {
  conversationId: string;
  clientMessageId: string;
  text: string;
}

interface Outgoing {
  type: "message";
  messageId: string;
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

interface StoredMessage {
  id: string;
  conversationId: string;
  clientMessageId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

interface MemberRow {
  user_id: string;
}

type Connection = StreamInOut<Incoming, Outgoing>;

const connections = new Map<string, Set<Connection>>();

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function register(userId: string, stream: Connection) {
  let streams = connections.get(userId);

  if (!streams) {
    streams = new Set();
    connections.set(userId, streams);
  }

  streams.add(stream);
}

function unregister(userId: string, stream: Connection) {
  const streams = connections.get(userId);
  if (!streams) return;

  streams.delete(stream);

  if (streams.size === 0) {
    connections.delete(userId);
  }
}

async function deliver(userId: string, message: Outgoing): Promise<void> {
  const streams = connections.get(userId);
  if (!streams) return;

  for (const stream of [...streams]) {
    try {
      await stream.send(message);
    } catch {
      unregister(userId, stream);
    }
  }
}

function toEvent(row: StoredMessage): Outgoing {
  return {
    type: "message",
    messageId: row.id,
    clientMessageId: row.clientMessageId,
    conversationId: row.conversationId,
    senderId: row.senderId,
    text: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export const connect = api.streamInOut<Incoming, Outgoing>(
  {
    path: "/realtime",
    expose: true,
    auth: true,
    sensitive: true,
  },
  async (stream) => {
    const senderId = getAuthData()?.userID;

    if (!senderId) {
      throw APIError.unauthenticated("Sessão inválida");
    }

    register(senderId, stream);

    try {
      for await (const incoming of stream) {
        const conversationId = incoming.conversationId;
        const clientMessageId = incoming.clientMessageId;
        const body = incoming.text.trim();

        if (
          !UUID_PATTERN.test(conversationId) ||
          !UUID_PATTERN.test(clientMessageId) ||
          body.length === 0 ||
          body.length > 4000
        ) {
          throw APIError.invalidArgument("Mensagem inválida");
        }

        // O remetente é obtido da autenticação.
        // NÃO confiamos em um senderId vindo do cliente.
        const inserted = await db.queryRow<StoredMessage>`
          INSERT INTO messages (
            conversation_id,
            sender_id,
            client_message_id,
            body
          )
          SELECT
            ${conversationId}::uuid,
            ${senderId},
            ${clientMessageId}::uuid,
            ${body}
          WHERE EXISTS (
            SELECT 1
            FROM conversation_members cm
            WHERE cm.conversation_id = ${conversationId}::uuid
              AND cm.user_id = ${senderId}
          )
          ON CONFLICT (sender_id, client_message_id)
          DO NOTHING
          RETURNING
            id::text AS "id",
            conversation_id::text AS "conversationId",
            client_message_id::text AS "clientMessageId",
            sender_id AS "senderId",
            body,
            created_at AS "createdAt"
        `;

        // Se o cliente reenviou o mesmo ID, reutilizamos
        // a mensagem persistida, sem criar outra.
        const saved = inserted ??
          await db.queryRow<StoredMessage>`
            SELECT
              id::text AS "id",
              conversation_id::text AS "conversationId",
              client_message_id::text AS "clientMessageId",
              sender_id AS "senderId",
              body,
              created_at AS "createdAt"
            FROM messages
            WHERE sender_id = ${senderId}
              AND client_message_id = ${clientMessageId}::uuid
          `;

        if (!saved) {
          throw APIError.permissionDenied("Você não participa desta conversa");
        }

        if (
          saved.conversationId !== conversationId ||
          saved.body !== body
        ) {
          throw APIError.failedPrecondition(
            "Identificador reutilizado com outro conteúdo",
          );
        }

        const event = toEvent(saved);

        if (!inserted) {
          // Reenvio: confirmação apenas para esta conexão.
          await stream.send(event);
          continue;
        }

        // Só encaminhamos mensagens recém-persistidas.
        const members = await db.queryAll<MemberRow>`
          SELECT user_id
          FROM conversation_members
          WHERE conversation_id = ${conversationId}::uuid
        `;

        for (const member of members) {
          await deliver(member.user_id, event);
        }
      }
    } finally {
      unregister(senderId, stream);
    }
  },
);
```

## O que este exemplo já resolve

- Cada conexão é associada ao **usuário autenticado**.
- O remetente **não é escolhido pelo cliente**.
- A **participação na conversa é verificada no banco**.
- A mensagem é **persistida antes de ser encaminhada**.
- Mensagens reenviadas com o mesmo identificador **não são duplicadas**.
- **Todos os dispositivos** conectados dos participantes recebem o evento.
- As conexões são **removidas do registro** quando encerradas (`finally`).

## O que ainda falta para produção

Tratamento de erro por mensagem, limites de frequência, controle de concorrência,
recuperação de lacunas (veja [`confiabilidade.md`](./confiabilidade.md)), observabilidade
e distribuição entre réplicas (veja [`redis-e-distribuicao.md`](./redis-e-distribuicao.md)).

> ⚠️ O evento recebido pelo remetente confirma que o servidor **encontrou a mensagem
> persistida** — **não comprova** que o destinatário a recebeu, leu ou visualizou.
> Estados de entrega em [`confiabilidade.md`](./confiabilidade.md).

## Histórico (recuperar mensagens perdidas)

Se Y estava offline quando X enviou, a mensagem está no banco. Ao reconectar, Y consulta
via **endpoint REST** com **paginação por cursor** (`chat/history.ts`):

```ts
import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./db";

interface HistoryRequest {
  conversationId: string;
  beforeId?: string;
}

interface HistoryResponse {
  messages: {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  }[];
}

interface MessageRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

export const history = api<HistoryRequest, HistoryResponse>(
  {
    method: "GET",
    path: "/conversations/:conversationId/messages",
    expose: true,
    auth: true,
  },
  async ({ conversationId, beforeId }) => {
    const userId = getAuthData()?.userID;

    if (!userId) {
      throw APIError.unauthenticated("Sessão inválida");
    }

    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(conversationId)) {
      throw APIError.invalidArgument("Conversa inválida");
    }

    if (beforeId !== undefined && !/^[1-9]\d*$/.test(beforeId)) {
      throw APIError.invalidArgument("Cursor inválido");
    }

    const cursor = beforeId ?? "9223372036854775807";

    const rows = await db.queryAll<MessageRow>`
      SELECT
        m.id::text AS "id",
        m.sender_id AS "senderId",
        m.body,
        m.created_at AS "createdAt"
      FROM messages m
      WHERE m.conversation_id = ${conversationId}::uuid
        AND m.id < ${cursor}::bigint
        AND EXISTS (
          SELECT 1
          FROM conversation_members cm
          WHERE cm.conversation_id = m.conversation_id
            AND cm.user_id = ${userId}
        )
      ORDER BY m.id DESC
      LIMIT 50
    `;

    return {
      messages: rows.map((row) => ({
        id: row.id,
        senderId: row.senderId,
        text: row.body,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    };
  },
);
```

### Limitações do `beforeId`

- Apropriado para **navegar o histórico para trás**; não é sozinho um mecanismo completo
  de recuperação de eventos perdidos.
- Para sincronização de mensagens novas, manter também um **cursor de eventos** ou
  sequência de sincronização com consulta incremental.
- A sincronização deve lidar com a **corrida** entre consultar o banco e receber um
  evento ao vivo: conectar o stream → consultar a lacuna → **deduplicar por id**.

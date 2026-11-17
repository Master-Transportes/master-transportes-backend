# Consumindo streams no cliente

O cliente TypeScript gerado pelo Encore consome um stream como `AsyncIterator`, envia
dados com `send()` e observa eventos de fechamento ou erro.

## Cliente TypeScript gerado

Gerar o cliente:

```bash
encore gen client --output=./client.ts
```

No frontend, a API aparece como `client.nomeDoServico.nomeDoEndpoint()`, com os tipos
produzidos pelo backend.

Considerando que o cliente gerado já foi inicializado com autenticação:

```ts
const stream = client.chat.connect();

// Receber eventos do servidor.
async function receiveMessages() {
  for await (const message of stream) {
    console.log("Mensagem recebida:", message);
  }
}

void receiveMessages();

// Enviar uma mensagem.
await stream.send({
  conversationId: "9ebd0eb0-675a-4c8f-a1b4-261c8f1eab24",
  clientMessageId: crypto.randomUUID(),
  text: "Olá! Você recebeu minha mensagem?",
});
```

## Android nativo (Kotlin + OkHttp)

O SDK oficial do Encore não oferece cliente Kotlin específico — os formatos listados na
documentação são **TypeScript, JavaScript, Go e OpenAPI (experimental)**. Para app nativo,
use um WebSocket direto (ex.: OkHttp):

```kotlin
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

val client = OkHttpClient.Builder()
    .pingInterval(25, TimeUnit.SECONDS)
    .build()

val request = Request.Builder()
    .url("wss://api.exemplo.com/realtime")
    .header("Authorization", "Bearer $token")
    .build()

val socket = client.newWebSocket(
    request,
    object : WebSocketListener() {

        override fun onOpen(
            webSocket: WebSocket,
            response: Response
        ) {
            println("Conectado")
        }

        override fun onMessage(
            webSocket: WebSocket,
            text: String
        ) {
            println("Mensagem: $text")
        }

        override fun onClosing(
            webSocket: WebSocket,
            code: Int,
            reason: String
        ) {
            webSocket.close(code, reason)
        }

        override fun onFailure(
            webSocket: WebSocket,
            t: Throwable,
            response: Response?
        ) {
            println("Conexão falhou: ${t.message}")
        }
    }
)
```

### Cuidados no Android real

Este é um exemplo do **transporte**, não um app completo. Para uso real:

- Controlar a conexão **fora da interface Compose** (camada de dados).
- Observar o estado por `Flow`/`StateFlow`.
- Renovar a autenticação (token pode expirar com a conexão aberta).
- Recuperar eventos perdidos após reconexão.
- **Nunca** abrir um WebSocket novo a cada recomposição da tela.
- Integrar serialização JSON e gerenciamento de reconexão
  (ver [`confiabilidade.md`](./confiabilidade.md)).

/**
 * Verificação em runtime da revalidação em cada mensagem (sem timer, sem
 * intervalo).
 *
 * Cenários (orquestrados externamente):
 *   - "stay-eligible": conecta, envia heartbeats; a conexão DEVE permanecer
 *     aberta (verificação roda a cada mensagem e o motorista continua
 *     elegível).
 *   - "expect-close": uma ação externa (logout ou suspensão no banco) ocorre
 *     logo após a conexão; o PRÓXIMO heartbeat deve disparar a revalidação e
 *     encerrar a conexão.
 *
 * Uso: bun run scripts/smoke-driver-stream-revalidation.ts <baseURL> <token> <modo>
 */
export {};

const baseURL = process.argv[2] ?? "http://127.0.0.1:4100";
const token = process.argv[3];
const mode = process.argv[4] ?? "stay-eligible";
if (!token) {
  console.error("Token ausente.");
  process.exit(1);
}

const wsURL = baseURL.replace(/^http/, "ws") + "/driver/stream";
const ws = new WebSocket(wsURL, { headers: { Authorization: `Bearer ${token}` } });

ws.addEventListener("message", event => console.log("RECV:", String(event.data)));
ws.addEventListener("error", event => console.log("ERROR:", JSON.stringify(event)));

let closed = false;
ws.addEventListener("close", () => {
  closed = true;
  console.log("CLOSE");
});

ws.addEventListener("open", async () => {
  console.log("OPEN");
  ws.send(JSON.stringify({ type: "heartbeat" }));

  // Espera a janela de revalidação (30 s) + margem; a ação externa
  // (logout/suspensão) ocorre em ~5s, com a conexão já estabelecida.
  await new Promise(resolve => setTimeout(resolve, 32_000));
  console.log("enviando heartbeat pós-janela");
  ws.send(JSON.stringify({ type: "heartbeat" }));

  await new Promise(resolve => setTimeout(resolve, 5_000));

  if (mode === "expect-close") {
    console.log(closed ? "RESULTADO: CLOSED (esperado)" : "RESULTADO: AINDA ABERTO (FALHA)");
    process.exit(closed ? 0 : 1);
  }
  console.log(closed ? "RESULTADO: CLOSED (FALHA)" : "RESULTADO: AINDA ABERTO (esperado)");
  process.exit(closed ? 1 : 0);
});

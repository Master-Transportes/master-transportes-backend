/**
 * Smoke da Etapa 3 — mantém a conexão aberta enviando GPS e heartbeats.
 *
 * Uso: bun run scripts/smoke-driver-presence-hold.ts <baseURL> <token> <segundos>
 * Enquanto estiver aberto, rode scripts/smoke-driver-presence-verify.ts para
 * confirmar presença, posição no GEO e descoberta por proximidade.
 */
export {};

const baseURL = process.argv[2] ?? "http://127.0.0.1:4100";
const token = process.argv[3];
const seconds = Number(process.argv[4] ?? "25");
if (!token) {
  console.error("Token ausente.");
  process.exit(1);
}

const wsURL = baseURL.replace(/^http/, "ws") + "/driver/stream";
const ws = new WebSocket(wsURL, { headers: { Authorization: `Bearer ${token}` } });

ws.addEventListener("message", event => console.log("RECV:", String(event.data)));
ws.addEventListener("error", event => console.log("ERROR:", JSON.stringify(event)));
ws.addEventListener("close", () => console.log("CLOSE"));

ws.addEventListener("open", () => {
  console.log("OPEN — enviando GPS e heartbeat");
  // Manaus: envia GPS fresco (sampledAt = agora, precisão 12 m).
  ws.send(
    JSON.stringify({
      type: "location.updated",
      latitude: -3.119,
      longitude: -60.021,
      accuracyMeters: 12,
      sampledAt: new Date().toISOString(),
    }),
  );
  ws.send(JSON.stringify({ type: "heartbeat" }));

  const gpsTimer = setInterval(() => {
    ws.send(
      JSON.stringify({
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        accuracyMeters: 12,
        sampledAt: new Date().toISOString(),
      }),
    );
  }, 5_000);

  setTimeout(() => {
    clearInterval(gpsTimer);
    console.log("fechando conexão");
    ws.close();
    process.exit(0);
  }, seconds * 1000);
});

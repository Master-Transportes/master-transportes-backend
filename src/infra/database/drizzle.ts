import log from "encore.dev/log";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/config/env";
import * as schema from "./schema";
import * as relations from "./relations";

const appSchema = { ...schema, ...relations };

declare global {
  var db: ReturnType<typeof drizzle<typeof appSchema>> | undefined;
}

const connectionString = getDatabaseUrl();

/**
 * Pool postgres.js com limites explícitos. O Drizzle apenas embrulha o cliente;
 * nenhuma verificação de conexão é disparada no import (conexão é preguiçosa).
 */
const queryClient = postgres(connectionString, {
  max: 20,
  idle_timeout: 5_000,
  connect_timeout: 10,
  fetch_types: false,
  onnotice: notice => {
    log.debug(`PostgreSQL notice: ${notice.message}`);
  },
});

export const db = globalThis.db ?? drizzle({ client: queryClient, schema: appSchema });

if (process.env.NODE_ENV !== "production") {
  globalThis.db = db;
}

/** Encerramento gracioso do pool (usar apenas em scripts/desligamento controlado). */
export async function closeDatabase(): Promise<void> {
  await queryClient.end({ timeout: 5 });
}

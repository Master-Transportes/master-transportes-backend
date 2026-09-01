import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

const queryClient = postgres(process.env.DATABASE_URL as string, {
  max: 20,
  idle_timeout: 5000,
  connect_timeout: 10,
  fetch_types: false,
});
export const db = globalThis.db ?? drizzle({ client: queryClient, schema });

if (process.env.NODE_ENV !== "production") {
  globalThis.db = db;
}

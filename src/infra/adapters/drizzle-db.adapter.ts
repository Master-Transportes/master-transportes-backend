import { db } from "@/infra/db/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/infra/db/schema";

type DrizzleDb = NodePgDatabase<typeof schema>;
type DrizzleTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

export class DrizzleDatabase {
  readonly db: DrizzleDb;

  constructor(database: DrizzleDb) {
    this.db = database;
  }

  async transaction<T>(fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn as (tx: NodePgDatabase<typeof schema>) => Promise<T>);
  }
}

export const drizzleDatabase = new DrizzleDatabase(db as unknown as DrizzleDb);

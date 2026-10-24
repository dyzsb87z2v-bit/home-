import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __brhSql?: postgres.Sql; __brhDb?: Database };

function create(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10), prepare: false });
  globalForDb.__brhSql = sql;
  return drizzle(sql, { schema });
}

/** Lazily created, pooled, server-only database handle. */
export function getDb(): Database {
  if (!globalForDb.__brhDb) globalForDb.__brhDb = create();
  return globalForDb.__brhDb;
}

export async function closeDb() {
  await globalForDb.__brhSql?.end({ timeout: 5 });
  globalForDb.__brhSql = undefined;
  globalForDb.__brhDb = undefined;
}

export { schema };

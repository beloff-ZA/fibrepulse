import pg from "pg";
import { config } from "@fibrepulse/config";

const { Pool } = pg;

export const db = new Pool({
  connectionString: config.DATABASE_URL
});

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const result = await db.query(text, params);
  return result.rows as T[];
}

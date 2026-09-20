import { Pool, type PoolClient } from "pg";

const globalForPg = globalThis as unknown as { yapplyPool?: Pool };

export function db(): Pool {
  if (!globalForPg.yapplyPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    globalForPg.yapplyPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalForPg.yapplyPool;
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const value = await run(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

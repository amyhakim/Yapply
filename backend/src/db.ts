import pg from "pg";

/** The slice of a database client the backend uses, so tests can swap in PGlite. */
export interface Queryable {
  query<R = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[]; rowCount: number }>;
}

export interface Db extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function pgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<R>(text: string, params?: readonly unknown[]) {
      const result = await client.query(text, params as unknown[] | undefined);
      return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(pool),
    async transaction(run) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await run(wrap(client));
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

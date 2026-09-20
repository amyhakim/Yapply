import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const cleared = await client.query(
    `UPDATE pronunciation_attempts SET recognized_text = NULL
      WHERE match_id IN (SELECT id FROM matches WHERE purge_after < now())
        AND recognized_text IS NOT NULL`,
  );
  const deleted = await client.query(
    `DELETE FROM transcript_turns
      WHERE match_id IN (SELECT id FROM matches WHERE purge_after < now())`,
  );
  await client.query("COMMIT");
  console.log(`Cleared ${cleared.rowCount} assessment transcripts and ${deleted.rowCount} turns.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

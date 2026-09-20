import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "../../src/db";
import type { Grader, GradeInput, PlayerGrade } from "../../src/scoring/types";

const dbDir = path.resolve(import.meta.dirname, "../../../db");

const wrap = (client: Pick<PGlite, "query">): Queryable => ({
  async query<R>(text: string, params?: readonly unknown[]) {
    const result = await client.query<R>(text, params as unknown[] | undefined);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
});

/** In-memory Postgres with the repo's real migrations and seed applied. */
export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  for (const file of ["migrations/0001_init.sql", "migrations/0002_pronunciation_attempts.sql", "seed.sql"]) {
    await pg.exec(readFileSync(path.join(dbDir, file), "utf8"));
  }
  return {
    ...wrap(pg),
    transaction: (run) => pg.transaction((tx) => run(wrap(tx))),
    close: () => pg.close(),
  };
}

export const grade = (overrides: Partial<PlayerGrade> = {}): PlayerGrade => ({
  grammar: 80, vocabulary: 70, conversation: 90, targetLanguagePct: 95, followUpQuestions: 2,
  challengeCompleted: false, bonusObjectivesMet: [], mistakes: [], strongMoments: [], tips: [],
  ...overrides,
});

/** Records what it was asked and returns canned grades keyed by label. */
export class StubGrader implements Grader {
  readonly model = "stub";
  readonly version = "test";
  calls: GradeInput[] = [];
  constructor(private readonly grades: Record<string, PlayerGrade> | (() => never)) {}

  async grade(input: GradeInput) {
    this.calls.push(input);
    if (typeof this.grades === "function") this.grades();
    const grades = this.grades as Record<string, PlayerGrade>;
    return Object.fromEntries(input.gradeLabels.map((label) => [label, grades[label] ?? grade()]));
  }
}

export interface SeedOptions {
  mode?: string;
  challengeSlug?: string;
  endedSecsAgo?: number;
  status?: string;
  startedMinsAgo?: number;
}

/** Inserts two users, a finished match, and both participants. Returns their ids. */
export async function seedMatch(db: Queryable, options: SeedOptions = {}) {
  const [a, b] = [randomUUID(), randomUUID()];
  for (const [id, name] of [[a, "alice"], [b, "bob"]] as const) {
    await db.query("INSERT INTO users (id, email, username) VALUES ($1, $2, $3)", [
      id, `${name}+${id}@example.invalid`, `${name}_${id.slice(0, 6)}`,
    ]);
  }
  const challenge = options.challengeSlug
    ? (await db.query<{ id: string }>("SELECT id FROM challenges WHERE slug = $1", [options.challengeSlug])).rows[0]?.id
    : null;
  const matchId = randomUUID();
  const status = options.status ?? "complete";
  await db.query(
    `INSERT INTO matches (id, match_type, mode, language_code, level, challenge_id, livekit_room,
                          status, started_at, ended_at, duration_secs)
     VALUES ($1, 'friend', $2, 'es', 'A1', $3, $4, $5,
             now() - make_interval(mins => $6::int),
             CASE WHEN $8::boolean THEN NULL ELSE now() - make_interval(secs => $7::float8) END, 120)`,
    [matchId, options.mode ?? "challenge", challenge ?? null, `room-${matchId}`, status,
      options.startedMinsAgo ?? 10, options.endedSecsAgo ?? 300, status === "playing"],
  );
  const seat = async (userId: string, n: number) =>
    Number((await db.query<{ id: string }>(
      "INSERT INTO match_participants (match_id, seat, user_id) VALUES ($1, $2, $3) RETURNING id::text AS id",
      [matchId, n, userId],
    )).rows[0].id);
  return { matchId, a, b, seatA: await seat(a, 1), seatB: await seat(b, 2) };
}

export async function addTurn(
  db: Queryable, matchId: string, participantId: number, text: string, startMs: number, endMs: number,
) {
  await db.query(
    `INSERT INTO transcript_turns (match_id, participant_id, text, detected_language, start_ms, end_ms, word_count, stt_provider)
     VALUES ($1, $2, $3, 'es', $4, $5, $6, 'azure')`,
    [matchId, participantId, text, startMs, endMs, text.split(/\s+/).length],
  );
}

export async function addAttempt(
  db: Queryable, matchId: string, userId: string,
  fields: { mode?: string; atMs?: number; durationMs?: number; status?: string; pron?: number | null;
            fluency?: number | null; prosody?: number | null; createdSecsAgo?: number },
) {
  await db.query(
    `INSERT INTO pronunciation_attempts
       (id, match_id, user_id, mode, locale, reference_text, at_ms, duration_ms, status,
        pron_score, accuracy, fluency, prosody, created_at)
     VALUES ($1, $2, $3, $4, 'es-ES', NULL, $5, $6, $7, $8, $8, $9, $10, now() - make_interval(secs => $11::float8))`,
    [randomUUID(), matchId, userId, fields.mode ?? "unscripted", fields.atMs ?? 0, fields.durationMs ?? 3000,
      fields.status ?? "complete", fields.pron ?? null, fields.fluency ?? null, fields.prosody ?? null,
      fields.createdSecsAgo ?? 0],
  );
}

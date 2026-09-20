import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "../src/db";
import { persistResult } from "../src/repo";
import { scoreMatch } from "../src/scoring/engine";
import { GraderError } from "../src/scoring/types";
import { ScoringWorker, type WorkerConfig } from "../src/worker";
import { addAttempt, addTurn, grade, seedMatch, StubGrader, testDb } from "./helpers/pglite";

const config: WorkerConfig = {
  POLL_INTERVAL_MS: 50,
  SCORING_GRACE_SECS: 35,
  PENDING_ATTEMPT_TIMEOUT_SECS: 120,
  SCORING_MAX_ATTEMPTS: 3,
  SCORING_RETRY_BACKOFF_MS: 0,
  MIN_WORDS_TO_SCORE: 5,
  EXPIRY_SWEEP_GRACE_SECS: 15,
};
const quiet = () => undefined;
const worker = (db: Db, grader: StubGrader, overrides: Partial<WorkerConfig> = {}) =>
  new ScoringWorker(db, grader, { ...config, ...overrides }, quiet);

async function talk(db: Db, m: Awaited<ReturnType<typeof seedMatch>>) {
  await addTurn(db, m.matchId, m.seatA, "hola me llamo ana y vivo en madrid", 0, 3000);
  await addTurn(db, m.matchId, m.seatB, "mucho gusto yo soy pedro", 3500, 5000);
  await addTurn(db, m.matchId, m.seatA, "¿y tú de dónde eres", 5200, 7000);
}

const one = async <R>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows[0];
const count = async (db: Db, table: string, matchId: string) =>
  Number((await one<{ n: string }>(db, `SELECT count(*)::int AS n FROM ${table} WHERE match_id = $1`, [matchId])).n);

test("scores a finished ranked match end to end", async () => {
  const db = await testDb();
  const m = await seedMatch(db, { mode: "ranked" });
  await talk(db, m);
  await addAttempt(db, m.matchId, m.a, { pron: 90, fluency: 88 });
  await addAttempt(db, m.matchId, m.b, { pron: 60, fluency: 55 });
  await db.query(
    `INSERT INTO pronunciation_results (match_id, user_id, word, score, error_type, at_ms)
     VALUES ($1, $2, 'desarrollar', 40, 'Mispronunciation', 900)`, [m.matchId, m.a],
  );
  const grader = new StubGrader({
    P1: grade({
      mistakes: [{ original: "yo fue", correction: "yo fui", explanation: "preterite of ir", category: "preterite" }],
      tips: ["Try more connecting phrases."],
    }),
    P2: grade({ conversation: 60, grammar: 60, vocabulary: 60 }),
  });

  assert.equal(await worker(db, grader).runOnce(), "scored");

  const scores = await db.query<{ user_id: string; overall: string; pronunciation: string; fluency: string; xp_earned: number; grader_model: string }>(
    "SELECT user_id::text AS user_id, overall::float8 AS overall, pronunciation::float8 AS pronunciation, fluency::float8 AS fluency, xp_earned, grader_model FROM match_scores WHERE match_id = $1", [m.matchId],
  );
  const byUser = new Map(scores.rows.map((r) => [r.user_id, r]));
  assert.equal(scores.rows.length, 2);
  assert.equal(Number(byUser.get(m.a)!.overall), 84.6); // .25*90 + .2*88 + .2*90 + .2*80 + .15*70
  assert.equal(Number(byUser.get(m.b)!.overall), 59);
  assert.equal(Number(byUser.get(m.a)!.pronunciation), 90);
  assert.equal(byUser.get(m.a)!.xp_earned, 34);
  assert.equal(byUser.get(m.a)!.grader_model, "stub");

  const feedback = await db.query<{ kind: string; rank: number | null }>(
    "SELECT kind::text AS kind, rank FROM match_feedback_items WHERE match_id = $1 AND user_id = $2 AND rank IS NOT NULL ORDER BY rank", [m.matchId, m.a],
  );
  assert.deepEqual(feedback.rows.map((r) => r.kind), ["mistake", "pronunciation", "tip"]);

  const profile = await one<{ xp: string; games_played: number; overall_rating: number; rating_deviation: number }>(
    db, "SELECT xp::int AS xp, games_played, overall_rating, rating_deviation::float8 AS rating_deviation FROM language_profiles WHERE user_id = $1 AND language_code = 'es'", [m.a],
  );
  assert.equal(Number(profile.xp), 34);
  assert.equal(profile.games_played, 1);
  assert.equal(profile.overall_rating, 1020); // won the comparison from 1000
  assert.equal(profile.rating_deviation, 332.5);
  assert.equal((await one<{ overall_rating: number }>(db, "SELECT overall_rating FROM language_profiles WHERE user_id = $1", [m.b])).overall_rating, 980);
  assert.equal(await count(db, "rating_history", m.matchId), 6); // 3 dimensions x 2 players

  const match = await one<{ scored_at: Date | null; scoring_error: string | null; status: string; scoring_attempts: number }>(
    db, "SELECT scored_at, scoring_error, status::text AS status, scoring_attempts FROM matches WHERE id = $1", [m.matchId],
  );
  assert.ok(match.scored_at);
  assert.equal(match.scoring_error, null);
  assert.equal(match.status, "complete", "status is left for the Next.js app to own");
  assert.equal(match.scoring_attempts, 1);

  // Done means done: nothing left to claim, and re-saving the same result is a no-op.
  assert.equal(await worker(db, grader).runOnce(), "idle");
  const input = { matchId: m.matchId };
  const again = await persistResult(db, input.matchId, "es", "ranked", await scoreMatch(
    { match: { id: m.matchId, languageCode: "es", level: "A1", mode: "ranked", durationSecs: 120, challenge: null },
      participants: [], turns: [], attempts: [], pronWords: [] }, grader, { minWords: 5 }));
  assert.equal(again, "already_scored");
  assert.equal(await count(db, "match_scores", m.matchId), 2);
});

test("casual matches award XP but never touch ratings", async () => {
  const db = await testDb();
  const m = await seedMatch(db, { mode: "challenge" });
  await talk(db, m);
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "scored");
  assert.equal(await count(db, "rating_history", m.matchId), 0);
  const p = await one<{ overall_rating: number; xp: string }>(db, "SELECT overall_rating, xp::int AS xp FROM language_profiles WHERE user_id = $1", [m.a]);
  assert.equal(p.overall_rating, 1000);
  assert.ok(Number(p.xp) > 0);
});

test("waits for late Azure clips: grace period and in-flight assessments", async () => {
  const db = await testDb();
  const fresh = await seedMatch(db, { endedSecsAgo: 5 });
  await talk(db, fresh);
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "idle", "still inside the grace window");
  await db.query("UPDATE matches SET ended_at = now() - interval '60 seconds' WHERE id = $1", [fresh.matchId]);
  await addAttempt(db, fresh.matchId, fresh.a, { status: "processing", createdSecsAgo: 10 });
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "idle", "an assessment is still running");
  await db.query("UPDATE pronunciation_attempts SET created_at = now() - interval '10 minutes'");
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "scored", "a stuck assessment stops blocking");
});

test("a match nobody spoke in is closed without scores", async () => {
  const db = await testDb();
  const m = await seedMatch(db);
  await addTurn(db, m.matchId, m.seatA, "hola", 0, 800);
  const grader = new StubGrader({});
  assert.equal(await worker(db, grader).runOnce(), "skipped");
  assert.equal(grader.calls.length, 0, "no grader call is spent on an empty match");
  assert.equal(await count(db, "match_scores", m.matchId), 0);
  const match = await one<{ scored_at: Date | null; scoring_error: string | null }>(db, "SELECT scored_at, scoring_error FROM matches WHERE id = $1", [m.matchId]);
  assert.ok(match.scored_at);
  assert.match(match.scoring_error ?? "", /not enough speech/);
  assert.equal(await worker(db, grader).runOnce(), "idle");
});

test("only the player who spoke enough is scored", async () => {
  const db = await testDb();
  const m = await seedMatch(db);
  await addTurn(db, m.matchId, m.seatA, "hola me llamo ana y vivo en madrid", 0, 3000);
  await addTurn(db, m.matchId, m.seatB, "hola", 3500, 4000);
  const grader = new StubGrader({});
  assert.equal(await worker(db, grader).runOnce(), "scored");
  assert.deepEqual(grader.calls[0].gradeLabels, ["P1"]);
  assert.deepEqual(grader.calls[0].labels, ["P1", "P2"], "the quiet partner is still in the transcript");
  const scored = await db.query<{ user_id: string }>("SELECT user_id::text AS user_id FROM match_scores WHERE match_id = $1", [m.matchId]);
  assert.deepEqual(scored.rows.map((r) => r.user_id), [m.a]);
});

test("grader failures are recorded, retried, and stop at the attempt limit", async () => {
  const db = await testDb();
  const m = await seedMatch(db);
  await talk(db, m);
  const failing = new StubGrader(() => { throw new GraderError("Anthropic API error 529: overloaded", "api"); });
  const w = worker(db, failing, { SCORING_MAX_ATTEMPTS: 2 });

  assert.equal(await w.runOnce(), "failed");
  let match = await one<{ scoring_attempts: number; scoring_error: string; scored_at: Date | null }>(db, "SELECT scoring_attempts, scoring_error, scored_at FROM matches WHERE id = $1", [m.matchId]);
  assert.equal(match.scoring_attempts, 1);
  assert.match(match.scoring_error, /overloaded/);
  assert.equal(match.scored_at, null);
  assert.equal(await count(db, "match_scores", m.matchId), 0, "a failed attempt leaves no partial scores");

  assert.equal(await w.runOnce(), "failed");
  assert.equal(await w.runOnce(), "idle", "gives up after SCORING_MAX_ATTEMPTS");

  await db.query("UPDATE matches SET scoring_attempts = 0 WHERE id = $1", [m.matchId]);
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "scored", "a later retry succeeds and clears the error");
  match = await one(db, "SELECT scoring_attempts, scoring_error, scored_at FROM matches WHERE id = $1", [m.matchId]);
  assert.equal(match.scoring_error, null);
});

test("retries wait out the backoff instead of hammering the grader", async () => {
  const db = await testDb();
  const m = await seedMatch(db);
  await talk(db, m);
  const failing = new StubGrader(() => { throw new GraderError("boom"); });
  const w = worker(db, failing, { SCORING_RETRY_BACKOFF_MS: 60_000 });
  assert.equal(await w.runOnce(), "failed");
  assert.equal(await w.runOnce(), "idle");
  assert.equal(failing.calls.length, 1);
});

test("abandoned matches are closed after their timer and then scored", async () => {
  const db = await testDb();
  const abandoned = await seedMatch(db, { status: "playing", startedMinsAgo: 10 });
  const live = await seedMatch(db, { status: "playing", startedMinsAgo: 1 });
  await talk(db, abandoned);
  assert.equal(await worker(db, new StubGrader({})).runOnce(), "scored");
  const closed = await one<{ status: string; ended_at: Date | null }>(db, "SELECT status::text AS status, ended_at FROM matches WHERE id = $1", [abandoned.matchId]);
  assert.equal(closed.status, "complete");
  assert.ok(closed.ended_at);
  const stillPlaying = await one<{ status: string; ended_at: Date | null }>(db, "SELECT status::text AS status, ended_at FROM matches WHERE id = $1", [live.matchId]);
  assert.equal(stillPlaying.status, "playing");
  assert.equal(stillPlaying.ended_at, null);
});

test("Pronunciation Battle: scripted clips leave the transcript and Azure decides completion", async () => {
  const db = await testDb();
  const m = await seedMatch(db, { challengeSlug: "pronunciation-es-a1" });
  await addTurn(db, m.matchId, m.seatA, "hola me llamo ana y vivo aquí", 0, 3000);
  await addTurn(db, m.matchId, m.seatB, "hola encantado de conocerte ana", 3500, 5500);
  await addTurn(db, m.matchId, m.seatA, "el perro corre por el parque", 10_000, 12_000);
  await addAttempt(db, m.matchId, m.a, { mode: "scripted", atMs: 10_000, durationMs: 2000, pron: 85 });
  const grader = new StubGrader({ P1: grade({ challengeCompleted: false }), P2: grade({ challengeCompleted: true }) });

  assert.equal(await worker(db, grader).runOnce(), "scored");

  const shown = grader.calls[0].turns.map((t) => t.text).join(" | ");
  assert.ok(!shown.includes("perro"), "phrase reading is not conversation");
  assert.ok(shown.includes("hola me llamo ana"));
  const rows = await db.query<{ user_id: string; challenge_completed: boolean; challenge_bonus_xp: number; pronunciation: string | null; integrity_flags: string[] }>(
    "SELECT user_id::text AS user_id, challenge_completed, challenge_bonus_xp, pronunciation::float8 AS pronunciation, integrity_flags FROM match_scores WHERE match_id = $1", [m.matchId],
  );
  const a = rows.rows.find((r) => r.user_id === m.a)!;
  const b = rows.rows.find((r) => r.user_id === m.b)!;
  assert.equal(a.challenge_completed, true, "a scripted attempt of 85 passes even though the grader said no");
  assert.equal(a.challenge_bonus_xp, 10);
  assert.equal(Number(a.pronunciation), 85, "the scripted score still counts toward pronunciation");
  assert.equal(b.challenge_completed, false, "the grader saying yes does not override Azure");
  assert.equal(b.challenge_bonus_xp, 0);
  assert.equal(b.pronunciation, null);
  assert.deepEqual(b.integrity_flags, ["no_pronunciation_data"]);
});

test("the background loop picks up a finished match and stops cleanly", async () => {
  const db = await testDb();
  const m = await seedMatch(db);
  await talk(db, m);
  const w = worker(db, new StubGrader({}));
  w.start();
  const deadline = Date.now() + 10_000;
  let scored = false;
  while (!scored && Date.now() < deadline) {
    scored = (await one<{ scored_at: Date | null }>(db, "SELECT scored_at FROM matches WHERE id = $1", [m.matchId])).scored_at !== null;
    if (!scored) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await w.stop();
  assert.ok(scored, "the loop scored the match");
});

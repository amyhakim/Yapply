import type { Db, Queryable } from "./db";
import type { MatchResult } from "./scoring/engine";
import { nextDeviation, nextRating, outcome } from "./scoring/elo";
import type { Attempt, ChallengeInfo, ScoringInput } from "./scoring/types";

const json = (value: unknown): string => JSON.stringify(value);

/**
 * Closes matches whose timer ran out but that no client ended (both players closed the
 * tab), the same transition getMatch() does lazily in the Next.js app.
 */
export async function sweepExpired(db: Queryable, graceSecs: number): Promise<number> {
  const result = await db.query(
    `UPDATE matches
        SET status = 'complete', ended_at = started_at + duration_secs * interval '1 second'
      WHERE status = 'playing' AND started_at IS NOT NULL
        AND now() >= started_at + duration_secs * interval '1 second' + make_interval(secs => $1::float8)`,
    [graceSecs],
  );
  return result.rowCount;
}

export interface ClaimOptions {
  graceSecs: number;
  maxAttempts: number;
  pendingTimeoutSecs: number;
  excludeIds: string[];
}

/**
 * Picks one finished, unscored match and counts the attempt. Waits out the window in
 * which late Azure clips can still arrive, and any assessment still in flight.
 */
export function claimNext(db: Db, options: ClaimOptions): Promise<string | null> {
  return db.transaction(async (tx) => {
    const found = await tx.query<{ id: string }>(
      `SELECT m.id FROM matches m
        WHERE m.scored_at IS NULL
          AND m.status IN ('processing', 'complete')
          AND m.ended_at IS NOT NULL
          AND m.ended_at <= now() - make_interval(secs => $1::float8)
          AND m.scoring_attempts < $2::int
          AND m.id <> ALL($3::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM pronunciation_attempts a
             WHERE a.match_id = m.id AND a.status = 'processing'
               AND a.created_at > now() - make_interval(secs => $4::float8))
        ORDER BY m.ended_at
        LIMIT 1
        FOR UPDATE OF m SKIP LOCKED`,
      [options.graceSecs, options.maxAttempts, options.excludeIds, options.pendingTimeoutSecs],
    );
    const id = found.rows[0]?.id;
    if (!id) return null;
    await tx.query("UPDATE matches SET scoring_attempts = scoring_attempts + 1 WHERE id = $1", [id]);
    return id;
  });
}

export async function loadScoringInput(db: Queryable, matchId: string): Promise<ScoringInput | null> {
  const match = await db.query<{
    language_code: string; level: string; mode: string; duration_secs: number;
    c_type: string | null; c_prompt: string | null; c_notes: string | null;
    c_bonus: { key?: string; description?: string }[] | null; c_bonus_xp: number | null;
  }>(
    `SELECT m.language_code, m.level::text AS level, m.mode::text AS mode, m.duration_secs,
            c.type::text AS c_type, c.prompt AS c_prompt, c.grader_notes AS c_notes,
            c.bonus_objectives AS c_bonus, c.bonus_xp AS c_bonus_xp
       FROM matches m LEFT JOIN challenges c ON c.id = m.challenge_id
      WHERE m.id = $1`,
    [matchId],
  );
  const row = match.rows[0];
  if (!row) return null;

  const challenge: ChallengeInfo | null = row.c_type
    ? {
        type: row.c_type,
        prompt: row.c_prompt ?? "",
        graderNotes: row.c_notes ?? "",
        bonusObjectives: (row.c_bonus ?? [])
          .filter((b) => typeof b.key === "string")
          .map((b) => ({ key: b.key as string, description: b.description ?? "" })),
        bonusXp: Number(row.c_bonus_xp ?? 0),
      }
    : null;

  const participants = await db.query<{ id: string; seat: number; user_id: string }>(
    `SELECT id::text AS id, seat::int AS seat, user_id::text AS user_id
       FROM match_participants WHERE match_id = $1 AND user_id IS NOT NULL ORDER BY seat`,
    [matchId],
  );
  // Scripted Pronunciation Battle clips also land in transcript_turns; they are phrase
  // reading, not conversation, so they are excluded here (their scores still count).
  const turns = await db.query<{ participant_id: string; start_ms: number; end_ms: number; text: string }>(
    `SELECT t.participant_id::text AS participant_id, t.start_ms, t.end_ms, t.text
       FROM transcript_turns t
       JOIN match_participants p ON p.id = t.participant_id
      WHERE t.match_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM pronunciation_attempts a
           WHERE a.match_id = t.match_id AND a.user_id = p.user_id
             AND a.mode = 'scripted' AND a.at_ms = t.start_ms)
      ORDER BY t.start_ms, t.id`,
    [matchId],
  );
  const attempts = await db.query<{
    user_id: string; mode: Attempt["mode"]; duration_ms: number;
    pron_score: number | null; accuracy: number | null; fluency: number | null; prosody: number | null;
  }>(
    `SELECT user_id::text AS user_id, mode, duration_ms,
            pron_score::float8 AS pron_score, accuracy::float8 AS accuracy,
            fluency::float8 AS fluency, prosody::float8 AS prosody
       FROM pronunciation_attempts WHERE match_id = $1 AND status = 'complete'`,
    [matchId],
  );
  const words = await db.query<{ user_id: string; word: string; score: number }>(
    `SELECT user_id::text AS user_id, word, score::float8 AS score
       FROM pronunciation_results WHERE match_id = $1 AND phoneme IS NULL ORDER BY score`,
    [matchId],
  );

  const num = (v: number | null) => (v === null ? null : Number(v));
  return {
    match: {
      id: matchId, languageCode: row.language_code, level: row.level, mode: row.mode,
      durationSecs: Number(row.duration_secs), challenge,
    },
    participants: participants.rows.map((p) => ({
      participantId: Number(p.id), userId: p.user_id, seat: Number(p.seat),
    })),
    turns: turns.rows.map((t) => ({
      participantId: Number(t.participant_id), startMs: Number(t.start_ms), endMs: Number(t.end_ms), text: t.text,
    })),
    attempts: attempts.rows.map((a) => ({
      userId: a.user_id, mode: a.mode, durationMs: Number(a.duration_ms),
      pronScore: num(a.pron_score), accuracy: num(a.accuracy), fluency: num(a.fluency), prosody: num(a.prosody),
    })),
    pronWords: words.rows.map((w) => ({ userId: w.user_id, word: w.word, score: Number(w.score) })),
  };
}

/** Marks a match done when nobody said enough to score. No score rows are written. */
export async function finishWithoutScores(db: Queryable, matchId: string, reason: string): Promise<void> {
  await db.query(
    "UPDATE matches SET scored_at = now(), scoring_error = $2 WHERE id = $1 AND scored_at IS NULL",
    [matchId, reason],
  );
}

export async function recordFailure(db: Queryable, matchId: string, message: string): Promise<void> {
  await db.query("UPDATE matches SET scoring_error = $2 WHERE id = $1 AND scored_at IS NULL", [
    matchId, message.slice(0, 500),
  ]);
}

/**
 * Writes scores, feedback, XP and (ranked only) ratings in one transaction. Safe to call
 * twice for the same match: a match that already has scored_at set is left untouched.
 */
export function persistResult(
  db: Db, matchId: string, languageCode: string, mode: string, result: MatchResult,
): Promise<"saved" | "already_scored"> {
  return db.transaction(async (tx) => {
    const locked = await tx.query<{ scored_at: Date | null }>(
      "SELECT scored_at FROM matches WHERE id = $1 FOR UPDATE", [matchId],
    );
    if (!locked.rows[0] || locked.rows[0].scored_at) return "already_scored";

    for (const p of result.players) {
      await tx.query(
        `INSERT INTO match_scores
           (match_id, user_id, overall, conversation, fluency, pronunciation, grammar, vocabulary,
            pron_accuracy, pron_fluency, pron_prosody, target_language_pct, speaking_ms, turn_count,
            avg_response_ms, word_count, unique_words, follow_up_questions, words_per_minute,
            challenge_completed, bonus_objectives_met, challenge_bonus_xp, xp_earned,
            weights, grader_model, grader_version, grader_output, integrity_flags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21::jsonb,$22,$23,$24::jsonb,$25,$26,$27::jsonb,$28::text[])
         ON CONFLICT (match_id, user_id) DO NOTHING`,
        [
          matchId, p.userId, p.overall, p.dimensions.conversation, p.dimensions.fluency,
          p.dimensions.pronunciation, p.dimensions.grammar, p.dimensions.vocabulary,
          p.pronunciation.accuracy, p.pronunciation.fluency, p.pronunciation.prosody,
          p.grade.targetLanguagePct, p.metrics.speakingMs, p.metrics.turnCount,
          p.metrics.avgResponseMs, p.metrics.wordCount, p.metrics.uniqueWords, p.grade.followUpQuestions,
          p.metrics.wordsPerMinute, p.challengeCompleted, json(p.bonusObjectivesMet),
          p.challengeBonusXp, p.xpEarned, json(p.weights), result.graderModel, result.graderVersion,
          json(p.grade), p.integrityFlags,
        ],
      );
      for (const item of p.feedback) {
        await tx.query(
          `INSERT INTO match_feedback_items
             (match_id, user_id, kind, original, correction, explanation, category, rank)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [matchId, p.userId, item.kind, item.original, item.correction, item.explanation, item.category, item.rank],
        );
      }
      await tx.query(
        `INSERT INTO language_profiles (user_id, language_code, xp, games_played, last_played_at)
         VALUES ($1, $2, $3, 1, now())
         ON CONFLICT (user_id, language_code) DO UPDATE
           SET xp = language_profiles.xp + EXCLUDED.xp,
               games_played = language_profiles.games_played + 1,
               last_played_at = now()`,
        [p.userId, languageCode, p.xpEarned],
      );
    }

    if (mode === "ranked" && result.players.length === 2) await applyRatings(tx, matchId, languageCode, result);

    await tx.query("UPDATE matches SET scored_at = now(), scoring_error = NULL WHERE id = $1", [matchId]);
    return "saved";
  });
}

const RATING_COLUMN = {
  overall: "overall_rating", conversation: "conversation_rating", pronunciation: "pronunciation_rating",
} as const;

async function applyRatings(tx: Queryable, matchId: string, languageCode: string, result: MatchResult) {
  const [a, b] = result.players;
  const rows = await tx.query<{
    user_id: string; overall_rating: number; conversation_rating: number;
    pronunciation_rating: number; rating_deviation: number;
  }>(
    `SELECT user_id::text AS user_id, overall_rating, conversation_rating, pronunciation_rating,
            rating_deviation::float8 AS rating_deviation
       FROM language_profiles WHERE language_code = $1 AND user_id = ANY($2::uuid[]) FOR UPDATE`,
    [languageCode, [a.userId, b.userId]],
  );
  const profile = (userId: string) => rows.rows.find((r) => r.user_id === userId);
  const pa = profile(a.userId);
  const pb = profile(b.userId);
  if (!pa || !pb) return;

  const scores = {
    overall: [a.overall, b.overall],
    conversation: [a.dimensions.conversation, b.dimensions.conversation],
    // Only rated when both players have Azure data, so nobody is compared against a gap.
    pronunciation: [a.dimensions.pronunciation, b.dimensions.pronunciation],
  } as const;

  const updates: Record<string, { a: number; b: number }> = {};
  for (const dimension of Object.keys(RATING_COLUMN) as (keyof typeof RATING_COLUMN)[]) {
    const [scoreA, scoreB] = scores[dimension];
    if (scoreA === null || scoreB === null) continue;
    const column = RATING_COLUMN[dimension];
    const before = { a: pa[column], b: pb[column] };
    const after = {
      a: nextRating(before.a, before.b, pa.rating_deviation, outcome(scoreA, scoreB)),
      b: nextRating(before.b, before.a, pb.rating_deviation, outcome(scoreB, scoreA)),
    };
    updates[column] = after;
    for (const [player, key] of [[a, "a"], [b, "b"]] as const) {
      await tx.query(
        `INSERT INTO rating_history (user_id, language_code, match_id, dimension, rating_before, rating_after)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (match_id, user_id, dimension) DO NOTHING`,
        [player.userId, languageCode, matchId, dimension, before[key], after[key]],
      );
    }
  }

  for (const [player, key, current] of [[a, "a", pa], [b, "b", pb]] as const) {
    const sets = Object.keys(updates).map((column, i) => `${column} = $${i + 3}`);
    await tx.query(
      `UPDATE language_profiles SET ${sets.length ? sets.join(", ") + "," : ""}
              rating_deviation = $${sets.length + 3}
        WHERE user_id = $1 AND language_code = $2`,
      [player.userId, languageCode, ...Object.values(updates).map((u) => u[key]), nextDeviation(current.rating_deviation)],
    );
  }
}

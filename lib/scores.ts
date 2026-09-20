import { db } from "./db";

// Written by the scoring worker in backend/. See backend/README.md.
export type ScoreStatus = "not_finished" | "pending" | "unavailable" | "ready";

export interface ScoreRow {
  overall: number;
  conversation: number;
  fluency: number;
  pronunciation: number | null;
  grammar: number;
  vocabulary: number;
  target_language_pct: number;
  speaking_ms: number;
  turn_count: number;
  follow_up_questions: number;
  unique_words: number;
  challenge_completed: boolean;
  challenge_bonus_xp: number;
  xp_earned: number;
}

export interface FeedbackRow {
  kind: "mistake" | "pronunciation" | "tip" | "strong_moment";
  original: string | null;
  correction: string | null;
  explanation: string | null;
  category: string | null;
  rank: number | null;
}

// Shape follows the design document's example score object (section 17).
export interface ScoreView {
  overall: number;
  dimensions: {
    conversation: number;
    fluency: number;
    pronunciation: number | null; // null when Azure could not score the speech
    grammar: number;
    vocabulary: number;
  };
  metrics: {
    targetLanguagePercentage: number;
    speakingSeconds: number;
    turns: number;
    followUpQuestions: number;
    uniqueWords: number;
  };
  challenge: { completed: boolean; bonusXp: number };
  xpEarned: number;
  feedback: {
    /** The "things to improve", best first (at most three). */
    improve: { kind: string; original: string | null; correction: string | null; explanation: string | null }[];
    strongMoments: { text: string; reason: string | null }[];
  };
}

export interface ScoreResponse {
  status: ScoreStatus;
  score?: ScoreView;
}

const round = (value: number): number => Math.round(value);

export function toScoreView(row: ScoreRow, feedback: FeedbackRow[]): ScoreView {
  return {
    overall: round(row.overall),
    dimensions: {
      conversation: round(row.conversation),
      fluency: round(row.fluency),
      pronunciation: row.pronunciation === null ? null : round(row.pronunciation),
      grammar: round(row.grammar),
      vocabulary: round(row.vocabulary),
    },
    metrics: {
      targetLanguagePercentage: round(row.target_language_pct),
      speakingSeconds: round(row.speaking_ms / 1000),
      turns: row.turn_count,
      followUpQuestions: row.follow_up_questions,
      uniqueWords: row.unique_words,
    },
    challenge: { completed: row.challenge_completed, bonusXp: row.challenge_bonus_xp },
    xpEarned: row.xp_earned,
    feedback: {
      improve: feedback
        .filter((item) => item.rank !== null && item.kind !== "strong_moment")
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .map(({ kind, original, correction, explanation }) => ({ kind, original, correction, explanation })),
      strongMoments: feedback
        .filter((item) => item.kind === "strong_moment" && item.original)
        .map((item) => ({ text: item.original as string, reason: item.explanation })),
    },
  };
}

const FINISHED = ["complete", "processing", "results"];

/**
 * The caller's own score only. A player never sees their partner's score, and
 * the caller must already have passed getMatch() so membership is checked.
 */
export async function getScoreView(
  matchId: string,
  userId: string,
  match: { status: string },
): Promise<ScoreResponse> {
  const scores = await db().query<ScoreRow>(
    `SELECT overall::float8 AS overall, conversation::float8 AS conversation,
            fluency::float8 AS fluency, pronunciation::float8 AS pronunciation,
            grammar::float8 AS grammar, vocabulary::float8 AS vocabulary,
            target_language_pct::float8 AS target_language_pct, speaking_ms, turn_count,
            follow_up_questions, unique_words, challenge_completed, challenge_bonus_xp, xp_earned
       FROM match_scores WHERE match_id = $1 AND user_id = $2`,
    [matchId, userId],
  );
  const row = scores.rows[0];
  if (row) {
    const feedback = await db().query<FeedbackRow>(
      `SELECT kind::text AS kind, original, correction, explanation, category, rank
         FROM match_feedback_items WHERE match_id = $1 AND user_id = $2 ORDER BY id`,
      [matchId, userId],
    );
    return { status: "ready", score: toScoreView(row, feedback.rows) };
  }
  if (!FINISHED.includes(match.status)) return { status: "not_finished" };
  // The worker stamps scored_at even when it wrote no score (not enough speech).
  const scored = await db().query<{ scored_at: Date | null }>(
    "SELECT scored_at FROM matches WHERE id = $1", [matchId],
  );
  return { status: scored.rows[0]?.scored_at ? "unavailable" : "pending" };
}

import { conversationBreakdown, type ClipScores } from "./conversation-score";
import { db } from "./db";

// See backend/README.md for the optional scoring worker that adds XP and language feedback.
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

export type Outcome = "win" | "loss" | "tie";

/** Who won, decided by comparing the two players' conversation scores. */
export interface MatchResult {
  outcome: Outcome;
  yourScore: number;
  opponentScore: number;
}

// Shape follows the design document's example score object (section 17).
export interface ScoreView {
  /** The conversation score. */
  overall: number;
  /** Named scores that make up the result, e.g. fluency and accuracy. null = not assessed. */
  dimensions: Record<string, number | null>;
  metrics?: {
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
  /** Present once both players' scores are known. */
  matchResult?: MatchResult;
}

export interface ScoreResponse {
  status: ScoreStatus;
  score?: ScoreView;
}

const round = (value: number): number => Math.round(value);

/** A score written by the optional scoring worker (language-model grading plus Azure). */
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

const NO_EXTRAS = {
  challenge: { completed: false, bonusXp: 0 },
  xpEarned: 0,
  feedback: { improve: [], strongMoments: [] },
} satisfies Pick<ScoreView, "challenge" | "xpEarned" | "feedback">;

/**
 * The conversation score players see: the average of their fluency and accuracy scores from
 * Azure. It needs no scoring worker. If the worker has also scored the match, its XP,
 * challenge result, metrics and feedback are kept; only the headline number and the named
 * scores come from Azure. Returns null until at least one clip has been scored.
 */
export function azureScoreView(clips: ClipScores[], worker: ScoreView | null): ScoreView | null {
  const { fluency, accuracy, score } = conversationBreakdown(clips);
  if (score === null) return null;
  const dimensions: Record<string, number | null> = {};
  if (fluency !== null) dimensions.fluency = fluency;
  if (accuracy !== null) dimensions.accuracy = accuracy;
  return { ...(worker ?? NO_EXTRAS), overall: score, dimensions };
}

/** A player with nothing scored (silent, or a dead microphone) has a conversation score of 0. */
export function noSpeechScoreView(worker: ScoreView | null): ScoreView {
  return { ...(worker ?? NO_EXTRAS), overall: 0, dimensions: {} };
}

/** Higher conversation score wins; equal scores are a tie. */
export function decideOutcome(yourScore: number, opponentScore: number): Outcome {
  if (yourScore > opponentScore) return "win";
  if (yourScore < opponentScore) return "loss";
  return "tie";
}

const FINISHED = ["complete", "processing", "results"];
// Clips are still being sent for a moment after the match ends; wait so the score is complete.
const SETTLE_MS = 8_000;
// The assess route accepts clips for this long after the match ends.
const UPLOAD_WINDOW_MS = 35_000;

/**
 * The caller's own score and whether they won, and only once the match is over. The caller must
 * already have passed getMatch() so membership is checked. The result is decided from both
 * players' conversation scores, so it waits until neither player has a clip still being scored.
 */
export async function getScoreView(
  matchId: string,
  userId: string,
  match: { status: string },
): Promise<ScoreResponse> {
  if (!FINISHED.includes(match.status)) return { status: "not_finished" };

  const state = await db().query<{
    scored_at: Date | null; ended_at: Date | null; clips_in_flight: boolean;
  }>(
    // A clip stuck 'processing' for minutes (e.g. a crashed request) must not block results forever.
    `SELECT m.scored_at, m.ended_at,
            EXISTS (SELECT 1 FROM pronunciation_attempts a
                     WHERE a.match_id = m.id AND a.status = 'processing'
                       AND a.created_at > now() - interval '2 minutes') AS clips_in_flight
       FROM matches m WHERE m.id = $1`, [matchId],
  );
  const info = state.rows[0];
  const sinceEnd = info?.ended_at ? Date.now() - new Date(info.ended_at).getTime() : null;

  // Someone's clip is still being scored: a number now would leave it out.
  if (info?.clips_in_flight) return { status: "pending" };

  const clipsOf = (who: "me" | "opponent") => db().query<ClipScores>(
    `SELECT status, accuracy::float8 AS accuracy, fluency::float8 AS fluency
       FROM pronunciation_attempts
      WHERE match_id = $1 AND status = 'complete' AND user_id ${who === "me" ? "=" : "<>"} $2`,
    [matchId, userId],
  );
  const [mine, theirs] = [(await clipsOf("me")).rows, (await clipsOf("opponent")).rows];

  const scores = await db().query<ScoreRow>(
    `SELECT overall::float8 AS overall, conversation::float8 AS conversation,
            fluency::float8 AS fluency, pronunciation::float8 AS pronunciation,
            grammar::float8 AS grammar, vocabulary::float8 AS vocabulary,
            target_language_pct::float8 AS target_language_pct, speaking_ms, turn_count,
            follow_up_questions, unique_words, challenge_completed, challenge_bonus_xp, xp_earned
       FROM match_scores WHERE match_id = $1 AND user_id = $2`,
    [matchId, userId],
  );
  let worker: ScoreView | null = null;
  if (scores.rows[0]) {
    const feedback = await db().query<FeedbackRow>(
      `SELECT kind::text AS kind, original, correction, explanation, category, rank
         FROM match_feedback_items WHERE match_id = $1 AND user_id = $2 ORDER BY id`,
      [matchId, userId],
    );
    worker = toScoreView(scores.rows[0], feedback.rows);
  }

  const myScore = conversationBreakdown(mine).score;
  const opponentScore = conversationBreakdown(theirs).score;
  if (myScore !== null || opponentScore !== null) {
    if (sinceEnd !== null && sinceEnd < SETTLE_MS) return { status: "pending" };
    const view = azureScoreView(mine, worker) ?? noSpeechScoreView(worker);
    const opponent = opponentScore ?? 0;
    return {
      status: "ready",
      score: {
        ...view,
        matchResult: {
          outcome: decideOutcome(view.overall, opponent),
          yourScore: view.overall,
          opponentScore: opponent,
        },
      },
    };
  }
  if (worker) return { status: "ready", score: worker };
  // Nobody has anything scored: report it once the upload window has closed, so a match with no
  // usable speech does not look as though it is still being graded.
  const windowClosed = sinceEnd !== null && sinceEnd >= UPLOAD_WINDOW_MS;
  return { status: info?.scored_at || windowClosed ? "unavailable" : "pending" };
}

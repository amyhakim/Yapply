import { buildFeedback, type FeedbackItem } from "./feedback";
import { playerMetrics, type PlayerMetrics } from "./metrics";
import {
  aggregatePronunciation, fluencyFromPace, pronunciationBattlePassed,
  type PronunciationAggregate,
} from "./pronunciation";
import type { Dimensions, Grader, PlayerGrade, ScoringInput, Weights } from "./types";
import { combine, DEFAULT_WEIGHTS } from "./weights";
import { xpFor } from "./xp";

export interface PlayerResult {
  userId: string;
  participantId: number;
  seat: number;
  dimensions: Dimensions;
  overall: number;
  weights: Weights; // as applied, after renormalising for missing dimensions
  pronunciation: PronunciationAggregate;
  metrics: PlayerMetrics;
  grade: PlayerGrade;
  challengeCompleted: boolean;
  bonusObjectivesMet: string[];
  challengeBonusXp: number;
  xpEarned: number;
  feedback: FeedbackItem[];
  integrityFlags: string[];
}

export interface MatchResult {
  players: PlayerResult[];
  skipped: { userId: string; reason: string }[];
  graderModel: string;
  graderVersion: string;
}

export interface EngineOptions {
  /** A player who said fewer words than this is not scored (nothing to grade). */
  minWords: number;
  weights?: Weights;
}

export async function scoreMatch(
  input: ScoringInput,
  grader: Grader,
  options: EngineOptions,
): Promise<MatchResult> {
  const seats = [...input.participants].sort((a, b) => a.seat - b.seat);
  const label = new Map(seats.map((p) => [p.participantId, `P${p.seat}`]));
  const metrics = new Map(seats.map((p) => [p.participantId, playerMetrics(input.turns, p.participantId)]));

  const eligible = seats.filter((p) => (metrics.get(p.participantId)?.wordCount ?? 0) >= options.minWords);
  const skipped = seats
    .filter((p) => !eligible.includes(p))
    .map((p) => ({ userId: p.userId, reason: "not_enough_speech" }));
  const result: MatchResult = {
    players: [], skipped, graderModel: grader.model, graderVersion: grader.version,
  };
  if (!eligible.length) return result;

  const grades = await grader.grade({
    match: input.match,
    labels: seats.map((p) => `P${p.seat}`),
    gradeLabels: eligible.map((p) => `P${p.seat}`),
    turns: [...input.turns]
      .sort((a, b) => a.startMs - b.startMs)
      .map((turn) => ({ speaker: label.get(turn.participantId) ?? "?", text: turn.text })),
  });

  const { challenge } = input.match;
  for (const participant of eligible) {
    const grade = grades[`P${participant.seat}`];
    const m = metrics.get(participant.participantId) as PlayerMetrics;
    const attempts = input.attempts.filter((a) => a.userId === participant.userId);
    const pron = aggregatePronunciation(attempts);

    const dimensions: Dimensions = {
      conversation: grade.conversation,
      fluency: pron.fluency ?? fluencyFromPace(m.wordsPerMinute),
      pronunciation: pron.pronunciation,
      grammar: grade.grammar,
      vocabulary: grade.vocabulary,
    };
    const { overall, effective } = combine(dimensions, options.weights ?? DEFAULT_WEIGHTS);

    // A Pronunciation Battle is decided by Azure, not by a judgement of the transcript.
    const completed = challenge
      ? challenge.type === "pronunciation_battle" ? pronunciationBattlePassed(attempts) : grade.challengeCompleted
      : false;
    const knownKeys = new Set(challenge?.bonusObjectives.map((b) => b.key));
    const xp = xpFor(overall, completed, challenge?.bonusXp ?? 0);
    const weakWords = input.pronWords
      .filter((w) => w.userId === participant.userId)
      .sort((a, b) => a.score - b.score);

    result.players.push({
      userId: participant.userId,
      participantId: participant.participantId,
      seat: participant.seat,
      dimensions, overall, weights: effective,
      pronunciation: pron, metrics: m, grade,
      challengeCompleted: completed,
      bonusObjectivesMet: grade.bonusObjectivesMet.filter((key) => knownKeys.has(key)),
      challengeBonusXp: xp.bonus,
      xpEarned: xp.total,
      feedback: buildFeedback(grade, weakWords),
      integrityFlags: pron.pronunciation === null ? ["no_pronunciation_data"] : [],
    });
  }
  return result;
}

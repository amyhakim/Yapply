export type Dimension = "conversation" | "fluency" | "pronunciation" | "grammar" | "vocabulary";

export interface Dimensions {
  conversation: number;
  fluency: number;
  pronunciation: number | null; // NULL when Azure produced nothing usable
  grammar: number;
  vocabulary: number;
}

export type Weights = Record<Dimension, number>;

export interface ChallengeInfo {
  type: string;
  prompt: string;
  graderNotes: string;
  bonusObjectives: { key: string; description: string }[];
  bonusXp: number;
}

export interface MatchInfo {
  id: string;
  languageCode: string;
  level: string;
  mode: string;
  durationSecs: number;
  challenge: ChallengeInfo | null;
}

export interface Participant {
  participantId: number;
  userId: string;
  seat: number;
}

export interface Turn {
  participantId: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Attempt {
  userId: string;
  mode: "scripted" | "unscripted";
  durationMs: number;
  pronScore: number | null;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
}

export interface PronWord {
  userId: string;
  word: string;
  score: number;
}

/** Everything the score engine needs about one finished match. */
export interface ScoringInput {
  match: MatchInfo;
  participants: Participant[];
  /** Conversation turns only: scripted Pronunciation Battle clips are removed. */
  turns: Turn[];
  /** Completed Azure assessments (both modes). */
  attempts: Attempt[];
  pronWords: PronWord[];
}

export interface Mistake {
  original: string;
  correction: string;
  explanation: string;
  category: string;
}

export interface PlayerGrade {
  grammar: number;
  vocabulary: number;
  conversation: number;
  targetLanguagePct: number;
  followUpQuestions: number;
  challengeCompleted: boolean;
  bonusObjectivesMet: string[];
  mistakes: Mistake[];
  strongMoments: { text: string; reason: string }[];
  tips: string[];
}

export interface GradeInput {
  match: MatchInfo;
  /** Labels ("P1", "P2") of every player in the match, in seat order. */
  labels: string[];
  /** Labels the grader must return a grade for. */
  gradeLabels: string[];
  turns: { speaker: string; text: string }[];
}

export interface Grader {
  readonly model: string;
  readonly version: string;
  /** Returns one grade per label in `gradeLabels`. Throws GraderError on any failure. */
  grade(input: GradeInput): Promise<Record<string, PlayerGrade>>;
}

export class GraderError extends Error {
  constructor(message: string, public readonly kind: "refusal" | "truncated" | "invalid" | "api" = "invalid") {
    super(message);
  }
}

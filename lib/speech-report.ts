export interface ReportAttempt {
  status: string;
  recognized_text: string | null;
  at_ms: number;
  duration_ms: number;
  pron_score: string | number | null;
  fluency: string | number | null;
}

export interface SpeechReport {
  uniqueWords: number;
  challengeWords: string[];
  challengeWordTotal: number;
  topicScore: number | null;
  flowScore: number | null;
  pronunciationScore: number | null;
  fillerCount: number;
  longPauseCount: number;
  fillerPenalty: number;
  pausePenalty: number;
}

const FILLERS = new Set(["um", "uh", "umm", "uhh", "erm", "hmm", "mmm", "eh", "em"]);
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "de", "del", "el", "en", "es", "in", "is", "la", "las",
  "los", "of", "on", "or", "the", "to", "un", "una", "y",
]);

export function speechTokens(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function numeric(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundedAverage(values: (string | number | null)[]): number | null {
  const usable = values.map(numeric).filter((value): value is number => value !== null);
  const result = average(usable);
  return result === null ? null : Math.round(result);
}

function challengeTerms(prompt: string | null): string[] {
  if (!prompt) return [];
  return [...new Set(speechTokens(prompt).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))];
}

function longPauseCount(attempts: ReportAttempt[]): number {
  const ordered = attempts
    .filter((attempt) => attempt.status === "complete")
    .sort((a, b) => a.at_ms - b.at_ms);
  let count = 0;
  for (let index = 1; index < ordered.length; index++) {
    const previousEnd = ordered[index - 1].at_ms + ordered[index - 1].duration_ms;
    const gap = ordered[index].at_ms - previousEnd;
    // Very long gaps generally mean the partner was taking a turn. Count only a
    // hesitation-sized gap between this player's analyzed clips.
    if (gap >= 2_000 && gap <= 8_000) count++;
  }
  return count;
}

export function buildSpeechReport(attempts: ReportAttempt[], prompt: string | null): SpeechReport {
  const completed = attempts.filter((attempt) => attempt.status === "complete");
  const words = completed.flatMap((attempt) => speechTokens(attempt.recognized_text ?? ""));
  const meaningful = words.filter((word) => !FILLERS.has(word));
  const uniqueWords = new Set(meaningful).size;
  const targetWords = challengeTerms(prompt);
  const spoken = new Set(words);
  const challengeWords = targetWords.filter((word) => spoken.has(word));
  const topicScore = targetWords.length
    ? Math.round(challengeWords.length / targetWords.length * 100)
    : null;
  const fillerCount = words.filter((word) => FILLERS.has(word)).length;
  const pauses = longPauseCount(completed);
  const fillerPenalty = Math.min(20, fillerCount * 2);
  const pausePenalty = Math.min(20, pauses * 3);
  const baseFluency = roundedAverage(completed.map((attempt) => attempt.fluency));

  return {
    uniqueWords,
    challengeWords,
    challengeWordTotal: targetWords.length,
    topicScore,
    flowScore: baseFluency === null ? null : Math.max(0, baseFluency - fillerPenalty - pausePenalty),
    pronunciationScore: roundedAverage(completed.map((attempt) => attempt.pron_score)),
    fillerCount,
    longPauseCount: pauses,
    fillerPenalty,
    pausePenalty,
  };
}

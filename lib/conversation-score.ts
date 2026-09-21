export interface ClipScores {
  status: string;
  // Postgres numeric columns arrive from the API as strings.
  accuracy: string | number | null;
  fluency: string | number | null;
}

export interface ConversationBreakdown {
  fluency: number | null;
  accuracy: number | null;
  /** The conversation score: the average of fluency and accuracy. */
  score: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function scoresFor(clips: ClipScores[], key: "accuracy" | "fluency"): number[] {
  return clips
    .filter((clip) => clip.status === "complete" && clip[key] !== null)
    .map((clip) => Number(clip[key]))
    .filter(Number.isFinite);
}

const rounded = (value: number | null): number | null => (value === null ? null : Math.round(value));

/**
 * The player's fluency and accuracy, each averaged over their scored clips, and the
 * conversation score: the average of those two. If Azure returned only one of the two, that
 * one is used. Everything is null until a clip has been scored.
 */
export function conversationBreakdown(clips: ClipScores[]): ConversationBreakdown {
  const fluency = average(scoresFor(clips, "fluency"));
  const accuracy = average(scoresFor(clips, "accuracy"));
  const combined = average([fluency, accuracy].filter((value): value is number => value !== null));
  return { fluency: rounded(fluency), accuracy: rounded(accuracy), score: rounded(combined) };
}

export function conversationScore(clips: ClipScores[]): number | null {
  return conversationBreakdown(clips).score;
}

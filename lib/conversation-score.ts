export interface ClipScores {
  status: string;
  // Postgres numeric columns arrive from the API as strings.
  accuracy: string | number | null;
  fluency: string | number | null;
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

/**
 * The conversation score: the average of the player's fluency score and accuracy score,
 * each averaged over their scored clips. If Azure returned only one of the two, that one
 * is used. Returns null when no clip has been scored yet.
 */
export function conversationScore(clips: ClipScores[]): number | null {
  const parts = [average(scoresFor(clips, "fluency")), average(scoresFor(clips, "accuracy"))]
    .filter((value): value is number => value !== null);
  const combined = average(parts);
  return combined === null ? null : Math.round(combined);
}

import type { Attempt } from "./types";
import { round2 } from "./weights";

export interface PronunciationAggregate {
  pronunciation: number | null;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
}

function weightedMean(items: { value: number | null; weight: number }[]): number | null {
  const usable = items.filter((item): item is { value: number; weight: number } => item.value !== null);
  const weight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return null;
  return round2(usable.reduce((sum, item) => sum + item.value * item.weight, 0) / weight);
}

/** Duration-weighted mean of a player's Azure assessments, per metric. */
export function aggregatePronunciation(attempts: Attempt[]): PronunciationAggregate {
  const mean = (pick: (a: Attempt) => number | null) =>
    weightedMean(attempts.map((a) => ({ value: pick(a), weight: a.durationMs })));
  return {
    pronunciation: mean((a) => a.pronScore),
    accuracy: mean((a) => a.accuracy),
    fluency: mean((a) => a.fluency),
    prosody: mean((a) => a.prosody),
  };
}

// Only used when Azure gave no fluency score. Rough learner-speech pace bands.
const PACE_POINTS: [number, number][] = [[0, 20], [30, 40], [60, 65], [90, 80], [120, 92], [150, 100]];
const UNKNOWN_PACE_FLUENCY = 40;

export function fluencyFromPace(wordsPerMinute: number | null): number {
  if (wordsPerMinute === null) return UNKNOWN_PACE_FLUENCY;
  if (wordsPerMinute >= 150) return 100;
  for (let i = 1; i < PACE_POINTS.length; i++) {
    const [x1, y1] = PACE_POINTS[i];
    const [x0, y0] = PACE_POINTS[i - 1];
    if (wordsPerMinute <= x1) return round2(y0 + ((wordsPerMinute - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 100;
}

/** A Pronunciation Battle is complete when a scripted attempt scored well enough. */
export const PRONUNCIATION_BATTLE_PASS = 70;

export function pronunciationBattlePassed(attempts: Attempt[]): boolean {
  return attempts.some((a) => a.mode === "scripted" && (a.pronScore ?? 0) >= PRONUNCIATION_BATTLE_PASS);
}

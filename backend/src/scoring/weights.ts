import type { Dimension, Dimensions, Weights } from "./types";

// Design doc §6.
export const DEFAULT_WEIGHTS: Weights = {
  conversation: 0.25,
  fluency: 0.2,
  pronunciation: 0.2,
  grammar: 0.2,
  vocabulary: 0.15,
};

export const round2 = (value: number): number => Math.round(value * 100) / 100;
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Weighted average of the dimensions. A missing dimension (pronunciation when Azure
 * had nothing) is dropped and the remaining weights are renormalised, so a player is
 * never penalised for a provider gap. `effective` is what was actually applied.
 */
export function combine(
  dims: Dimensions,
  weights: Weights = DEFAULT_WEIGHTS,
): { overall: number; effective: Weights } {
  const keys = Object.keys(weights) as Dimension[];
  const present = keys.filter((key) => dims[key] !== null);
  const total = present.reduce((sum, key) => sum + weights[key], 0);
  const effective = { ...weights };
  let overall = 0;
  for (const key of keys) {
    if (dims[key] === null) {
      effective[key] = 0;
      continue;
    }
    effective[key] = round2(weights[key] / total);
    overall += (dims[key] as number) * (weights[key] / total);
  }
  return { overall: round2(clamp(overall, 0, 100)), effective };
}

// Elo-style rating for ranked matches (design doc §22). Players are compared on the
// same score dimension, and scores within DRAW_MARGIN points count as a draw.
const DRAW_MARGIN = 3;
const MIN_DEVIATION = 80;

export const expectedScore = (rating: number, opponent: number): number =>
  1 / (1 + 10 ** ((opponent - rating) / 400));

export function outcome(score: number, opponentScore: number): 0 | 0.5 | 1 {
  if (Math.abs(score - opponentScore) <= DRAW_MARGIN) return 0.5;
  return score > opponentScore ? 1 : 0;
}

/** Newer players (high deviation) move faster: K runs from 40 down to 16. */
export const kFactor = (deviation: number): number =>
  Math.min(40, Math.max(16, 16 + 24 * (deviation / 350)));

export const nextDeviation = (deviation: number): number => Math.max(MIN_DEVIATION, deviation * 0.95);

export function nextRating(rating: number, opponent: number, deviation: number, result: number): number {
  return Math.round(rating + kFactor(deviation) * (result - expectedScore(rating, opponent)));
}

import type { PlayerGrade } from "./types";

export interface FeedbackItem {
  kind: "mistake" | "pronunciation" | "tip" | "strong_moment";
  original: string | null;
  correction: string | null;
  explanation: string | null;
  category: string | null;
  /** 1-3 marks the "3 things to improve" shown on the results screen (§23). */
  rank: number | null;
}

const TOP_N = 3;
const MAX_WEAK_WORDS = 2;

/**
 * Picks the three things to show first, mixing kinds so the screen isn't three
 * grammar points: mistake, pronunciation word, mistake, tip, mistake, ...
 */
export function buildFeedback(
  grade: PlayerGrade,
  weakWords: { word: string; score: number }[],
): FeedbackItem[] {
  const mistakes: FeedbackItem[] = grade.mistakes.map((m) => ({
    kind: "mistake", original: m.original, correction: m.correction,
    explanation: m.explanation, category: m.category, rank: null,
  }));
  const seen = new Set<string>();
  const pronunciation: FeedbackItem[] = weakWords
    .filter((w) => !seen.has(w.word.toLowerCase()) && !!seen.add(w.word.toLowerCase()))
    .slice(0, MAX_WEAK_WORDS)
    .map((w) => ({
      kind: "pronunciation", original: w.word, correction: null,
      explanation: `Pronunciation scored ${Math.round(w.score)}/100.`, category: "pronunciation", rank: null,
    }));
  const tips: FeedbackItem[] = grade.tips.map((tip) => ({
    kind: "tip", original: null, correction: null, explanation: tip, category: null, rank: null,
  }));
  const strong: FeedbackItem[] = grade.strongMoments.map((s) => ({
    kind: "strong_moment", original: s.text, correction: null, explanation: s.reason, category: null, rank: null,
  }));

  const order = [mistakes[0], pronunciation[0], mistakes[1], tips[0], mistakes[2], pronunciation[1], tips[1]];
  order.filter((item): item is FeedbackItem => !!item).slice(0, TOP_N).forEach((item, index) => {
    item.rank = index + 1;
  });
  return [...mistakes, ...pronunciation, ...tips, ...strong];
}

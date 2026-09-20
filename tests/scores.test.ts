import assert from "node:assert/strict";
import test from "node:test";
import { toScoreView, type FeedbackRow, type ScoreRow } from "../lib/scores";

const row: ScoreRow = {
  overall: 84.6, conversation: 90, fluency: 88, pronunciation: 89.5, grammar: 80, vocabulary: 70,
  target_language_pct: 95.4, speaking_ms: 54_400, turn_count: 7, follow_up_questions: 4,
  unique_words: 63, challenge_completed: true, challenge_bonus_xp: 12, xp_earned: 46,
};

const item = (overrides: Partial<FeedbackRow>): FeedbackRow => ({
  kind: "mistake", original: null, correction: null, explanation: null, category: null, rank: null,
  ...overrides,
});

test("a score becomes the design-document score object", () => {
  const view = toScoreView(row, []);
  assert.equal(view.overall, 85);
  assert.deepEqual(view.dimensions, { conversation: 90, fluency: 88, pronunciation: 90, grammar: 80, vocabulary: 70 });
  assert.deepEqual(view.metrics, {
    targetLanguagePercentage: 95, speakingSeconds: 54, turns: 7, followUpQuestions: 4, uniqueWords: 63,
  });
  assert.deepEqual(view.challenge, { completed: true, bonusXp: 12 });
  assert.equal(view.xpEarned, 46);
});

test("a missing pronunciation score stays null instead of becoming zero", () => {
  assert.equal(toScoreView({ ...row, pronunciation: null }, []).dimensions.pronunciation, null);
});

test("feedback: ranked items come first in rank order, strong moments are separate", () => {
  const view = toScoreView(row, [
    item({ kind: "tip", explanation: "Use more connectors", rank: 3 }),
    item({ kind: "mistake", original: "yo fue", correction: "yo fui", explanation: "preterite", rank: 1 }),
    item({ kind: "mistake", original: "unranked mistake" }), // not one of the top three
    item({ kind: "pronunciation", original: "desarrollar", rank: 2 }),
    item({ kind: "strong_moment", original: "¿y qué hiciste?", explanation: "natural follow-up" }),
  ]);
  assert.deepEqual(view.feedback.improve.map((i) => i.kind), ["mistake", "pronunciation", "tip"]);
  assert.equal(view.feedback.improve[0].correction, "yo fui");
  assert.deepEqual(view.feedback.strongMoments, [{ text: "¿y qué hiciste?", reason: "natural follow-up" }]);
});

test("feedback with nothing in it is empty, not an error", () => {
  assert.deepEqual(toScoreView(row, []).feedback, { improve: [], strongMoments: [] });
});

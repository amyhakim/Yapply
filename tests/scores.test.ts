import assert from "node:assert/strict";
import test from "node:test";
import {
  azureScoreView, decideOutcome, noSpeechScoreView, resolveOutcome, toScoreView,
  type FeedbackRow, type ScoreRow,
} from "../lib/scores";

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

const clip = (accuracy: number | null, fluency: number | null, status = "complete") =>
  ({ status, accuracy, fluency });

test("without the scoring worker, the score is the average of fluency and accuracy", () => {
  const view = azureScoreView([clip(88, 76), clip(92, 80)], null)!;
  assert.equal(view.overall, 84); // (90 + 78) / 2
  assert.deepEqual(view.dimensions, { fluency: 78, accuracy: 90 });
  assert.equal(view.xpEarned, 0);
  assert.deepEqual(view.feedback, { improve: [], strongMoments: [] });
});

test("when the worker also scored, only the headline and named scores come from Azure", () => {
  const worker = toScoreView(row, [item({ kind: "mistake", original: "yo fue", correction: "yo fui", rank: 1 })]);
  const view = azureScoreView([clip(70, 50)], worker)!;
  assert.equal(view.overall, 60);
  assert.deepEqual(view.dimensions, { fluency: 50, accuracy: 70 });
  assert.equal(view.xpEarned, 46, "XP still comes from the worker");
  assert.equal(view.feedback.improve[0].correction, "yo fui");
});

test("no scored clips means no Azure score", () => {
  assert.equal(azureScoreView([], null), null);
  assert.equal(azureScoreView([clip(80, 90, "processing"), clip(null, null)], null), null);
});

test("the higher conversation score wins and equal scores tie", () => {
  assert.equal(decideOutcome(84, 71), "win");
  assert.equal(decideOutcome(60, 71), "loss");
  assert.equal(decideOutcome(75, 75), "tie");
  assert.equal(decideOutcome(0, 0), "tie");
});

test("a player with nothing scored has a conversation score of 0", () => {
  const view = noSpeechScoreView(null);
  assert.equal(view.overall, 0);
  assert.deepEqual(view.dimensions, {});
  assert.equal(view.xpEarned, 0);
  assert.equal(noSpeechScoreView(toScoreView(row, [])).xpEarned, 46, "worker XP is kept");
});

test("speaking the wrong language is an automatic loss, whatever the scores", () => {
  // The offender is 'a'. They lose even with the higher score, and the other player wins.
  assert.deepEqual(resolveOutcome(95, 40, "a", "a"), { outcome: "loss", forfeit: "language_switch" });
  assert.deepEqual(resolveOutcome(40, 95, "a", "b"), { outcome: "win", forfeit: "language_switch" });
});

test("with no rule broken the higher score decides", () => {
  assert.deepEqual(resolveOutcome(84, 60, null, "a"), { outcome: "win" });
  assert.deepEqual(resolveOutcome(60, 60, null, "a"), { outcome: "tie" });
});

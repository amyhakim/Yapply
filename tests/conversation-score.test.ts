import assert from "node:assert/strict";
import test from "node:test";
import { conversationBreakdown, conversationScore, type ClipScores } from "../lib/conversation-score";

const clip = (accuracy: string | number | null, fluency: string | number | null,
  status = "complete"): ClipScores => ({ status, accuracy, fluency });

test("the conversation score is the average of fluency and accuracy", () => {
  assert.equal(conversationScore([clip(80, 90)]), 85);
  assert.equal(conversationScore([clip(70, 50)]), 60);
});

test("each metric is averaged over the clips before the two are combined", () => {
  // accuracy (60 + 100) / 2 = 80, fluency (70 + 90) / 2 = 80
  assert.equal(conversationScore([clip(60, 70), clip(100, 90)]), 80);
});

test("numeric strings from the API are handled and the result is rounded", () => {
  assert.equal(conversationScore([clip("81.50", "88.25")]), 85); // 84.875
});

test("clips that are still scoring or failed are ignored", () => {
  assert.equal(conversationScore([clip(80, 90), clip(10, 10, "processing"), clip(0, 0, "failed")]), 85);
});

test("if only one metric was returned, that one is used", () => {
  assert.equal(conversationScore([clip(null, 72)]), 72);
  assert.equal(conversationScore([clip(64, null)]), 64);
});

test("the breakdown reports fluency and accuracy alongside the score", () => {
  assert.deepEqual(conversationBreakdown([clip(88, 76), clip(92, 80)]), { fluency: 78, accuracy: 90, score: 84 });
  assert.deepEqual(conversationBreakdown([clip(null, 72)]), { fluency: 72, accuracy: null, score: 72 });
  assert.deepEqual(conversationBreakdown([]), { fluency: null, accuracy: null, score: null });
});

test("no scored clips means no score yet, not zero", () => {
  assert.equal(conversationScore([]), null);
  assert.equal(conversationScore([clip(null, null)]), null);
  assert.equal(conversationScore([clip(80, 90, "processing")]), null);
});

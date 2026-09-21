import assert from "node:assert/strict";
import test from "node:test";
import { buildSpeechReport, type ReportAttempt } from "../lib/speech-report";

const attempt = (overrides: Partial<ReportAttempt> = {}): ReportAttempt => ({
  status: "complete",
  recognized_text: "The little bird sings in the morning",
  at_ms: 1_000,
  duration_ms: 3_000,
  pron_score: "82",
  fluency: "90",
  ...overrides,
});

test("reports unique vocabulary and challenge words used", () => {
  const report = buildSpeechReport([attempt()], "The little bird sings in the morning");
  assert.equal(report.uniqueWords, 6);
  assert.deepEqual(report.challengeWords, ["little", "bird", "sings", "morning"]);
  assert.equal(report.challengeWordTotal, 4);
  assert.equal(report.topicScore, 100);
  assert.equal(report.pronunciationScore, 82);
});

test("flow deducts points for fillers and hesitation-sized gaps", () => {
  const report = buildSpeechReport([
    attempt({ recognized_text: "um the little bird", fluency: 90 }),
    attempt({ recognized_text: "uh sings", at_ms: 7_500, duration_ms: 1_000, fluency: 80 }),
  ], "The little bird sings in the morning");
  assert.equal(report.fillerCount, 2);
  assert.equal(report.longPauseCount, 1);
  assert.equal(report.fillerPenalty, 4);
  assert.equal(report.pausePenalty, 3);
  assert.equal(report.flowScore, 78);
});

test("failed clips and partner-sized gaps do not distort the report", () => {
  const report = buildSpeechReport([
    attempt(),
    attempt({ status: "failed", recognized_text: "um um", fluency: 0, pron_score: 0 }),
    attempt({ at_ms: 40_000, recognized_text: "morning", duration_ms: 1_000 }),
  ], "little bird morning");
  assert.equal(report.fillerCount, 0);
  assert.equal(report.longPauseCount, 0);
  assert.equal(report.flowScore, 90);
});

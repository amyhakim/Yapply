import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeedback } from "../src/scoring/feedback";
import { expectedScore, kFactor, nextDeviation, nextRating, outcome } from "../src/scoring/elo";
import { playerMetrics, tokenize } from "../src/scoring/metrics";
import {
  aggregatePronunciation, fluencyFromPace, pronunciationBattlePassed,
} from "../src/scoring/pronunciation";
import { combine } from "../src/scoring/weights";
import { xpFor } from "../src/scoring/xp";
import { grade } from "./helpers/pglite";

test("combine applies the design-doc weights", () => {
  const { overall, effective } = combine({
    conversation: 80, fluency: 70, pronunciation: 60, grammar: 90, vocabulary: 50,
  });
  assert.equal(overall, 71.5);
  assert.deepEqual(effective, { conversation: 0.25, fluency: 0.2, pronunciation: 0.2, grammar: 0.2, vocabulary: 0.15 });
});

test("combine drops missing pronunciation and renormalises instead of scoring it as zero", () => {
  const { overall, effective } = combine({
    conversation: 80, fluency: 70, pronunciation: null, grammar: 90, vocabulary: 50,
  });
  assert.equal(overall, 74.38); // (20 + 14 + 18 + 7.5) / 0.8
  assert.equal(effective.pronunciation, 0);
});

test("tokenize handles accents, punctuation and contractions", () => {
  assert.deepEqual(tokenize("¡Hola! ¿Cómo estás?"), ["hola", "cómo", "estás"]);
  assert.deepEqual(tokenize("I don't know"), ["i", "don't", "know"]);
  assert.deepEqual(tokenize("  ...  "), []);
});

test("playerMetrics: words, merged speaking time, turns and response time", () => {
  const turns = [
    { participantId: 1, startMs: 0, endMs: 1000, text: "hola me llamo ana" },
    { participantId: 1, startMs: 1000, endMs: 2000, text: "y vivo en madrid" }, // same turn as above
    { participantId: 2, startMs: 2500, endMs: 4000, text: "mucho gusto ana" },
    { participantId: 1, startMs: 4200, endMs: 6000, text: "igualmente ¿y tú" },
  ];
  const a = playerMetrics(turns, 1);
  assert.equal(a.wordCount, 11);
  assert.equal(a.uniqueWords, 10); // "y" is said twice
  assert.equal(a.speakingMs, 3800);
  assert.equal(a.turnCount, 2);
  assert.equal(a.avgResponseMs, 200); // replied 200ms after bob finished
  assert.equal(a.wordsPerMinute, 173.7);
  const b = playerMetrics(turns, 2);
  assert.equal(b.turnCount, 1);
  assert.equal(b.avgResponseMs, 500);
  assert.equal(b.wordsPerMinute, null); // 1.5s of speech is too little to call a pace
});

test("playerMetrics ignores a very long gap as a response time", () => {
  const turns = [
    { participantId: 1, startMs: 0, endMs: 1000, text: "hola" },
    { participantId: 2, startMs: 60_000, endMs: 61_000, text: "hola" },
  ];
  assert.equal(playerMetrics(turns, 2).avgResponseMs, null);
});

test("aggregatePronunciation weights by clip duration and skips missing metrics", () => {
  const base = { userId: "u", mode: "unscripted" as const, accuracy: null };
  const agg = aggregatePronunciation([
    { ...base, durationMs: 1000, pronScore: 80, fluency: 90, prosody: null },
    { ...base, durationMs: 3000, pronScore: 60, fluency: null, prosody: null },
  ]);
  assert.equal(agg.pronunciation, 65);
  assert.equal(agg.fluency, 90);
  assert.equal(agg.prosody, null);
  assert.deepEqual(aggregatePronunciation([]), { pronunciation: null, accuracy: null, fluency: null, prosody: null });
});

test("fluencyFromPace interpolates and caps", () => {
  assert.equal(fluencyFromPace(0), 20);
  assert.equal(fluencyFromPace(45), 52.5);
  assert.equal(fluencyFromPace(150), 100);
  assert.equal(fluencyFromPace(400), 100);
  assert.equal(fluencyFromPace(null), 40);
});

test("a Pronunciation Battle needs a scripted attempt at 70 or better", () => {
  const attempt = { userId: "u", durationMs: 2000, accuracy: null, fluency: null, prosody: null };
  assert.equal(pronunciationBattlePassed([{ ...attempt, mode: "scripted", pronScore: 69 }]), false);
  assert.equal(pronunciationBattlePassed([{ ...attempt, mode: "scripted", pronScore: 70 }]), true);
  assert.equal(pronunciationBattlePassed([{ ...attempt, mode: "unscripted", pronScore: 95 }]), false);
});

test("xpFor: base from score plus the challenge bonus only when completed", () => {
  assert.deepEqual(xpFor(82, true, 12), { bonus: 12, total: 45 });
  assert.deepEqual(xpFor(82, false, 12), { bonus: 0, total: 33 });
});

test("elo: outcomes, K factor and rating movement", () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
  assert.equal(outcome(80, 78), 0.5);
  assert.equal(outcome(85, 78), 1);
  assert.equal(outcome(70, 78), 0);
  assert.equal(kFactor(350), 40);
  assert.ok(kFactor(80) < 22 && kFactor(80) >= 16);
  assert.equal(nextRating(1000, 1000, 350, 1), 1020);
  assert.equal(nextRating(1000, 1000, 350, 0), 980);
  assert.equal(nextRating(1000, 1000, 350, 0.5), 1000);
  assert.equal(nextDeviation(80), 80);
  assert.equal(nextDeviation(350), 332.5);
});

test("buildFeedback ranks a mixed top three and keeps the rest unranked", () => {
  const items = buildFeedback(
    grade({
      mistakes: [1, 2, 3].map((n) => ({ original: `o${n}`, correction: `c${n}`, explanation: "e", category: "cat" })),
      tips: ["use more connectors"],
      strongMoments: [{ text: "nice question", reason: "natural" }],
    }),
    [{ word: "desarrollar", score: 40 }, { word: "Desarrollar", score: 45 }, { word: "alrededor", score: 50 }],
  );
  const ranked = items.filter((i) => i.rank !== null).sort((a, b) => a.rank! - b.rank!);
  assert.deepEqual(ranked.map((i) => `${i.kind}:${i.original ?? i.explanation}`), [
    "mistake:o1", "pronunciation:desarrollar", "mistake:o2",
  ]);
  assert.equal(items.filter((i) => i.kind === "pronunciation").length, 2); // duplicate word collapsed
  assert.equal(items.filter((i) => i.kind === "strong_moment").length, 1);
  assert.equal(items.filter((i) => i.rank === null).length, items.length - 3);
});

test("buildFeedback with nothing to say returns nothing", () => {
  assert.deepEqual(buildFeedback(grade(), []), []);
});

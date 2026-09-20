import assert from "node:assert/strict";
import test from "node:test";
import { parseAzureResult } from "../lib/azure";

const raw = JSON.stringify({
  DisplayText: "Perro.",
  NBest: [{
    PronunciationAssessment: {
      PronScore: 72, AccuracyScore: 68, FluencyScore: 81, ProsodyScore: 90,
    },
    Words: [{
      Word: "perro", Offset: 12_000_000,
      PronunciationAssessment: { AccuracyScore: 58, ErrorType: "Mispronunciation" },
      Phonemes: [{
        Phoneme: "r", Offset: 13_000_000,
        PronunciationAssessment: { AccuracyScore: 43 },
      }],
    }],
  }],
});

test("Azure word and phoneme timing converts from 100 ns ticks to ms", () => {
  const parsed = parseAzureResult(raw, "en-US");
  assert.equal(parsed.pronScore, 72);
  assert.equal(parsed.prosody, 90);
  assert.equal(parsed.words[0].atMs, 1200);
  assert.equal(parsed.words[0].phonemes[0].atMs, 1300);
  assert.equal(parsed.words[0].errorType, "Mispronunciation");
});

test("Spanish results do not expose an unsupported prosody score", () => {
  const parsed = parseAzureResult(raw, "es-ES");
  assert.equal(parsed.prosody, null);
  assert.equal(parsed.accuracy, 68);
});

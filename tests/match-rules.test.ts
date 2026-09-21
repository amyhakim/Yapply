import assert from "node:assert/strict";
import test from "node:test";
import { isOtherLanguage, otherLocaleFor } from "../lib/language-id";
import { allPresent } from "../lib/livekit-presence";
import { SilenceWatch } from "../lib/silence-watch";

test("each match language has a different language to watch for", () => {
  assert.equal(otherLocaleFor("es-ES"), "en-US");
  assert.equal(otherLocaleFor("en-US"), "es-ES");
  assert.equal(otherLocaleFor("fr-FR"), null);
  assert.equal(otherLocaleFor(null), null);
});

test("only a confident identification of the other language counts", () => {
  const other = "en-US";
  assert.equal(isOtherLanguage({ language: "en-US", confidence: "High" }, other), true);
  assert.equal(isOtherLanguage({ language: "EN-us", confidence: "high" }, other), true);
  assert.equal(isOtherLanguage({ language: "en-US", confidence: "Medium" }, other), false);
  assert.equal(isOtherLanguage({ language: "en-US", confidence: "Low" }, other), false);
  assert.equal(isOtherLanguage({ language: "en-US", confidence: null }, other), false);
  assert.equal(isOtherLanguage({ language: "es-ES", confidence: "High" }, other), false, "the match language is fine");
  assert.equal(isOtherLanguage({ language: null, confidence: null }, other), false);
  assert.equal(isOtherLanguage(null, other), false);
  assert.equal(isOtherLanguage({ language: "en-US", confidence: "High" }, null), false);
});

test("a mic with no sound at all trips after the limit", () => {
  const watch = new SilenceWatch(1_000, 0.001);
  assert.equal(watch.feed(0, 400), false);
  assert.equal(watch.feed(0.0005, 400), false);
  assert.equal(watch.feed(0, 400), true); // 1200 ms of nothing
});

test("any real sound resets the silence clock", () => {
  const watch = new SilenceWatch(1_000, 0.001);
  watch.feed(0, 800);
  assert.equal(watch.feed(0.02, 100), false); // someone spoke or the room made noise
  assert.equal(watch.feed(0, 800), false, "the count started again");
});

test("muting resets the clock so a muted player is never treated as a dead mic", () => {
  const watch = new SilenceWatch(1_000, 0.001);
  watch.feed(0, 900);
  watch.reset();
  assert.equal(watch.feed(0, 900), false);
});

test("the default limits are long and quiet enough not to fire on a listener", () => {
  const watch = new SilenceWatch();
  // A player listening in a normal room: low but nonzero noise for a full minute.
  let tripped = false;
  for (let i = 0; i < 700; i++) tripped = watch.feed(0.003, 93) || tripped;
  assert.equal(tripped, false);
  // A dead mic for 13 seconds does trip.
  const dead = new SilenceWatch();
  let deadTripped = false;
  for (let i = 0; i < 140; i++) deadTripped = dead.feed(0, 93) || deadTripped;
  assert.equal(deadTripped, true);
});

test("the match can start only when every player is in the live call", () => {
  assert.equal(allPresent(["a", "b"], ["a", "b"]), true);
  assert.equal(allPresent(["a", "b"], ["b", "a", "agent"]), true);
  assert.equal(allPresent(["a", "b"], ["a"]), false);
  assert.equal(allPresent(["a", "b"], []), false);
  assert.equal(allPresent(["a", "b"], null), true, "if LiveKit cannot be checked, do not block the game");
});

import assert from "node:assert/strict";
import test from "node:test";
import { clientEndReason } from "../lib/end-reason";
import { isOtherLanguage, otherLocaleFor } from "../lib/language-id";
import { allPresent } from "../lib/livekit-presence";
import { LONG_PAUSE_MS, PauseWatch } from "../lib/pause-watch";
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

test("a pause only counts once someone has spoken, and needs the full 10 seconds", () => {
  const watch = new PauseWatch(10_000);
  assert.equal(watch.update(false, 0), false, "a quiet start is not a pause");
  assert.equal(watch.update(false, 60_000), false, "even a long quiet start");
  assert.equal(watch.update(true, 61_000), false, "someone speaks");
  assert.equal(watch.update(false, 65_000), false, "4 seconds of quiet");
  assert.equal(watch.update(false, 70_999), false, "just under 10 seconds");
  assert.equal(watch.update(false, 71_000), true, "10 seconds of quiet");
});

test("any speech, from either player, restarts the pause clock", () => {
  const watch = new PauseWatch(10_000);
  watch.update(true, 0);
  assert.equal(watch.update(false, 9_000), false);
  assert.equal(watch.update(true, 9_500), false, "the partner starts talking");
  assert.equal(watch.update(false, 19_000), false, "9.5 seconds since they stopped");
  assert.equal(watch.update(false, 19_500), true);
});

test("the default pause limit is 10 seconds", () => {
  assert.equal(LONG_PAUSE_MS, 10_000);
  const watch = new PauseWatch();
  watch.update(true, 0);
  assert.equal(watch.update(false, 9_999), false);
  assert.equal(watch.update(false, 10_000), true);
});

test("a browser may report a silent mic or a long pause, and nothing else", () => {
  assert.equal(clientEndReason('{"reason":"silent_mic"}'), "silent_mic");
  assert.equal(clientEndReason('{"reason":"long_pause"}'), "long_pause");
  assert.equal(clientEndReason('{"reason":"anything"}'), null);
  assert.equal(clientEndReason(""), null, "an ordinary end has no body");
  assert.equal(clientEndReason("not json"), null);
  assert.equal(clientEndReason("null"), null);
});

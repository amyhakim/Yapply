import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config";

const base = { DATABASE_URL: "postgres://app:app@localhost:5433/langgame" };

test("defaults to Gemini and asks for a key when there isn't one", () => {
  assert.throws(() => loadConfig(base), /GEMINI_API_KEY is required unless GRADER=mock/);
});

test("a Gemini key is enough; the model and thinking defaults are sensible", () => {
  const config = loadConfig({ ...base, GEMINI_API_KEY: "key" });
  assert.equal(config.GRADER, "gemini");
  assert.equal(config.GRADER_MODEL, "gemini-2.5-flash");
  assert.equal(config.GRADER_THINKING, undefined, "thinking is left to the model unless set");
});

test("the mock grader needs no key", () => {
  assert.equal(loadConfig({ ...base, GRADER: "mock" }).GRADER, "mock");
});

test("an old provider setting is rejected instead of silently ignored", () => {
  assert.throws(() => loadConfig({ ...base, GRADER: "anthropic", GEMINI_API_KEY: "key" }), /Invalid configuration/);
});

test("a missing database url is reported", () => {
  assert.throws(() => loadConfig({ GEMINI_API_KEY: "key" }), /DATABASE_URL/);
});

test("optional settings are validated", () => {
  const config = loadConfig({ ...base, GEMINI_API_KEY: "key", GRADER_MODEL: "gemini-2.5-flash-lite", GRADER_THINKING: "low" });
  assert.equal(config.GRADER_MODEL, "gemini-2.5-flash-lite");
  assert.equal(config.GRADER_THINKING, "low");
  assert.throws(() => loadConfig({ ...base, GEMINI_API_KEY: "key", GRADER_THINKING: "extreme" }), /Invalid configuration/);
});

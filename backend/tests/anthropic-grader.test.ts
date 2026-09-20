import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicGrader } from "../src/scoring/anthropic-grader";
import { SYSTEM_PROMPT, type GradeOutput } from "../src/scoring/grader";
import { GraderError, type GradeInput } from "../src/scoring/types";

const input: GradeInput = {
  match: { id: "m", languageCode: "es", level: "B1", mode: "challenge", durationSecs: 120, challenge: null },
  labels: ["P1", "P2"],
  gradeLabels: ["P1", "P2"],
  turns: [{ speaker: "P1", text: "hola" }, { speaker: "P2", text: "hola ana" }],
};

const answer: GradeOutput = {
  players: ["P1", "P2"].map((player) => ({
    player, grammar: 81, vocabulary: 77, conversation: 92, target_language_pct: 96, follow_up_questions: 4,
    challenge_completed: true, bonus_objectives_met: [],
    mistakes: [{ original: "Yo fue", correction: "Yo fui", explanation: "Preterite of ir.", category: "preterite" }],
    strong_moments: [], tips: [],
  })),
};

/** An Anthropic client whose network layer is a function we control. */
function fakeClient(respond: (body: any) => { status?: number; json: unknown }) {
  const requests: any[] = [];
  const client = new Anthropic({
    apiKey: "test-key", maxRetries: 0,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const { status = 200, json } = respond(body);
      return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    },
  });
  return { client, requests };
}

const message = (text: string, stopReason = "end_turn") => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5",
  content: [{ type: "text", text }], stop_reason: stopReason, stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

test("sends the rubric, the transcript and a JSON schema, and returns sanitized grades", async () => {
  const { client, requests } = fakeClient(() => ({ json: message(JSON.stringify(answer)) }));
  const grades = await new AnthropicGrader("claude-opus-5", "medium", client).grade(input);

  assert.equal(grades.P1.grammar, 81);
  assert.equal(grades.P2.followUpQuestions, 4);
  assert.equal(grades.P1.mistakes[0].category, "preterite");

  const [request] = requests;
  assert.equal(request.model, "claude-opus-5");
  assert.equal(request.output_config.effort, "medium");
  assert.equal(request.output_config.format.type, "json_schema");
  assert.deepEqual(request.output_config.format.schema.required, ["players"]);
  assert.equal(request.system, SYSTEM_PROMPT);
  assert.match(request.messages[0].content, /^Grade these players: P1, P2\./);
  assert.match(request.messages[0].content, /<match>/);
  assert.equal(request.thinking, undefined, "leaves thinking at the model default");
  assert.equal(request.temperature, undefined, "no sampling parameters (rejected by Opus 5)");
});

test("uses whatever model and effort it is configured with", async () => {
  const { client, requests } = fakeClient(() => ({ json: message(JSON.stringify(answer)) }));
  await new AnthropicGrader("claude-sonnet-5", "low", client).grade(input);
  assert.equal(requests[0].model, "claude-sonnet-5");
  assert.equal(requests[0].output_config.effort, "low");
});

test("a refusal becomes a GraderError instead of a score", async () => {
  const { client } = fakeClient(() => ({ json: message("", "refusal") }));
  await assert.rejects(
    new AnthropicGrader("claude-opus-5", "medium", client).grade(input),
    (error) => error instanceof GraderError && error.kind === "refusal",
  );
});

test("truncated output is never scored", async () => {
  const { client } = fakeClient(() => ({ json: message('{"players": [', "max_tokens") }));
  await assert.rejects(
    new AnthropicGrader("claude-opus-5", "medium", client).grade(input),
    (error) => error instanceof GraderError && error.kind === "truncated",
  );
});

test("malformed JSON from the model is a GraderError", async () => {
  const { client } = fakeClient(() => ({ json: message("not json at all") }));
  await assert.rejects(
    new AnthropicGrader("claude-opus-5", "medium", client).grade(input),
    (error) => error instanceof GraderError,
  );
});

test("an API outage is reported with its status", async () => {
  const { client } = fakeClient(() => ({
    status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
  }));
  await assert.rejects(
    new AnthropicGrader("claude-opus-5", "medium", client).grade(input),
    (error) => error instanceof GraderError && error.kind === "api" && /529/.test(error.message),
  );
});

test("a reply that skips a requested player is rejected", async () => {
  const { client } = fakeClient(() => ({ json: message(JSON.stringify({ players: [answer.players[0]] })) }));
  await assert.rejects(
    new AnthropicGrader("claude-opus-5", "medium", client).grade(input),
    (error) => error instanceof GraderError && /no grade for P2/.test(error.message),
  );
});

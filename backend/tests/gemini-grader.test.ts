import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { GoogleGenAI } from "@google/genai";
import { GeminiGrader, type ThinkingSetting } from "../src/scoring/gemini-grader";
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

interface Captured { path: string; headers: http.IncomingHttpHeaders; body: any }
type Reply = { status?: number; json: unknown };

/** Runs the real Google SDK against a local HTTP server we control. */
async function withGemini(
  respond: (request: Captured) => Reply,
  run: (ai: GoogleGenAI, requests: Captured[]) => Promise<void>,
) {
  const requests: Captured[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const captured = { path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : null };
      requests.push(captured);
      const { status = 200, json } = respond(captured);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const ai = new GoogleGenAI({ apiKey: "test-key", httpOptions: { baseUrl: `http://127.0.0.1:${port}` } });
  try {
    await run(ai, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const reply = (text: string, finishReason = "STOP"): Reply => ({
  json: {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    modelVersion: "gemini-2.5-flash",
  },
});

const grader = (ai: GoogleGenAI, thinking?: ThinkingSetting, model = "gemini-2.5-flash") =>
  new GeminiGrader(model, thinking, ai);

test("sends the rubric, the transcript and a JSON schema, and returns sanitized grades", async () => {
  await withGemini(() => reply(JSON.stringify(answer)), async (ai, requests) => {
    const grades = await grader(ai).grade(input);

    assert.equal(grades.P1.grammar, 81);
    assert.equal(grades.P2.followUpQuestions, 4);
    assert.equal(grades.P1.mistakes[0].category, "preterite");

    const [request] = requests;
    assert.match(request.path, /models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(request.headers["x-goog-api-key"], "test-key");
    const { body } = request;
    assert.equal(body.systemInstruction.parts[0].text, SYSTEM_PROMPT);
    assert.match(body.contents[0].parts[0].text, /^Grade these players: P1, P2\./);
    assert.match(body.contents[0].parts[0].text, /<match>/);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.maxOutputTokens, 8000);
    const schema = body.generationConfig.responseJsonSchema;
    assert.deepEqual(schema.required, ["players"]);
    assert.equal(schema.$schema, undefined, "the JSON Schema draft marker is stripped");
    assert.equal(schema.properties.players.type, "array");
    assert.equal(body.generationConfig.thinkingConfig, undefined, "thinking is untouched unless configured");
  });
});

test("uses the configured model and passes a thinking level through", async () => {
  await withGemini(() => reply(JSON.stringify(answer)), async (ai, requests) => {
    await grader(ai, "low", "gemini-3.5-flash-lite").grade(input);
    assert.match(requests[0].path, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(requests[0].body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
  });
});

test("a blocked or policy-stopped reply becomes a refusal, not a score", async () => {
  await withGemini(() => reply("", "SAFETY"), async (ai) => {
    await assert.rejects(grader(ai).grade(input), (e) => e instanceof GraderError && e.kind === "refusal");
  });
  await withGemini(
    () => ({ json: { promptFeedback: { blockReason: "SAFETY" } } }),
    async (ai) => {
      await assert.rejects(grader(ai).grade(input), (e) => e instanceof GraderError && e.kind === "refusal");
    },
  );
});

test("truncated output is never scored", async () => {
  await withGemini(() => reply('{"players": [', "MAX_TOKENS"), async (ai) => {
    await assert.rejects(grader(ai).grade(input), (e) => e instanceof GraderError && e.kind === "truncated");
  });
});

test("malformed JSON from the model is a GraderError", async () => {
  await withGemini(() => reply("not json at all"), async (ai) => {
    await assert.rejects(grader(ai).grade(input), (e) => e instanceof GraderError && e.kind === "invalid");
  });
});

test("JSON that breaks the schema is rejected", async () => {
  await withGemini(() => reply(JSON.stringify({ players: [{ player: "P1", grammar: "high" }] })), async (ai) => {
    await assert.rejects(grader(ai).grade(input), (e) => e instanceof GraderError);
  });
});

test("an API outage is reported with its status", async () => {
  await withGemini(
    () => ({ status: 503, json: { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } } }),
    async (ai) => {
      await assert.rejects(
        grader(ai).grade(input),
        (e) => e instanceof GraderError && e.kind === "api" && /503/.test(e.message),
      );
    },
  );
});

test("a bad API key is an api error, not a crash", async () => {
  await withGemini(
    () => ({ status: 400, json: { error: { code: 400, message: "API key not valid.", status: "INVALID_ARGUMENT" } } }),
    async (ai) => {
      await assert.rejects(
        grader(ai).grade(input),
        (e) => e instanceof GraderError && e.kind === "api" && /400/.test(e.message),
      );
    },
  );
});

test("a reply that skips a requested player is rejected", async () => {
  await withGemini(() => reply(JSON.stringify({ players: [answer.players[0]] })), async (ai) => {
    await assert.rejects(
      grader(ai).grade(input),
      (e) => e instanceof GraderError && /no grade for P2/.test(e.message),
    );
  });
});

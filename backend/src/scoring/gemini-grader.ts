import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import {
  buildUserMessage, GRADER_VERSION, GradeOutputSchema, sanitizeGrade, SYSTEM_PROMPT,
} from "./grader";
import { GraderError, type Grader, type GradeInput, type PlayerGrade } from "./types";

export type ThinkingSetting = "minimal" | "low" | "medium" | "high";

const THINKING_LEVELS: Record<ThinkingSetting, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Gemini takes plain JSON Schema; the draft marker is not part of its supported subset.
const { $schema: _draft, ...responseJsonSchema } = z.toJSONSchema(GradeOutputSchema);

// The model stopped because of a content policy, not because it ran out of room or finished.
const BLOCKED = new Set<string>([
  FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST,
  FinishReason.SPII, FinishReason.RECITATION,
]);

export class GeminiGrader implements Grader {
  readonly version = GRADER_VERSION;

  constructor(
    readonly model: string,
    private readonly thinking: ThinkingSetting | undefined,
    private readonly ai: GoogleGenAI,
  ) {}

  async grade(input: GradeInput): Promise<Record<string, PlayerGrade>> {
    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: buildUserMessage(input),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema,
          maxOutputTokens: 8000,
          // Left unset unless asked for: which thinking options a model accepts varies by model.
          ...(this.thinking ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.thinking] } } : {}),
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new GraderError(`Gemini API error ${error.status}: ${error.message}`, "api");
      }
      throw error;
    }

    if (response.promptFeedback?.blockReason) {
      throw new GraderError(`The transcript was blocked (${response.promptFeedback.blockReason})`, "refusal");
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish && BLOCKED.has(finish)) {
      throw new GraderError(`The grader declined to score this transcript (${finish})`, "refusal");
    }
    if (finish === FinishReason.MAX_TOKENS) {
      throw new GraderError("The grader output was cut off", "truncated");
    }

    let parsed;
    try {
      parsed = GradeOutputSchema.parse(JSON.parse(response.text ?? ""));
    } catch (error) {
      throw new GraderError(`The grader returned malformed output: ${(error as Error).message.slice(0, 200)}`);
    }
    return sanitizeGrade(parsed, input.gradeLabels);
  }
}

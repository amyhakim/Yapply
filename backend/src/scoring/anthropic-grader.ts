import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  buildUserMessage, GRADER_VERSION, GradeOutputSchema, sanitizeGrade, SYSTEM_PROMPT,
} from "./grader";
import { GraderError, type Grader, type GradeInput, type PlayerGrade } from "./types";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const outputFormat = zodOutputFormat(GradeOutputSchema);

export class AnthropicGrader implements Grader {
  readonly version = GRADER_VERSION;

  constructor(
    readonly model: string,
    private readonly effort: Effort,
    // Credentials come from ANTHROPIC_API_KEY or an `ant auth login` profile.
    private readonly client: Anthropic = new Anthropic(),
  ) {}

  async grade(input: GradeInput): Promise<Record<string, PlayerGrade>> {
    let response;
    try {
      // messages.create rather than messages.parse: parse throws on a refusal or a
      // truncated reply before stop_reason can be read, which would hide the real cause.
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
        output_config: {
          effort: this.effort,
          format: { type: outputFormat.type, schema: outputFormat.schema },
        },
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new GraderError(`Anthropic API error ${error.status ?? ""}: ${error.message}`, "api");
      }
      throw error;
    }
    if (response.stop_reason === "refusal") {
      throw new GraderError("The grader declined to score this transcript", "refusal");
    }
    if (response.stop_reason === "max_tokens") {
      throw new GraderError("The grader output was cut off", "truncated");
    }

    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let parsed;
    try {
      parsed = GradeOutputSchema.parse(JSON.parse(text));
    } catch (error) {
      throw new GraderError(`The grader returned malformed output: ${(error as Error).message.slice(0, 200)}`);
    }
    return sanitizeGrade(parsed, input.gradeLabels);
  }
}

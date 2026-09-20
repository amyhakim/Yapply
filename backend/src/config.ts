import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GRADER: z.enum(["anthropic", "mock"]).default("anthropic"),
  GRADER_MODEL: z.string().min(1).default("claude-opus-5"),
  GRADER_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
  // The Next.js assess route still accepts clips for 30s after a match ends.
  SCORING_GRACE_SECS: z.coerce.number().int().min(0).default(35),
  // An assessment stuck in 'processing' longer than this stops blocking scoring.
  PENDING_ATTEMPT_TIMEOUT_SECS: z.coerce.number().int().min(1).default(120),
  SCORING_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  SCORING_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(30_000),
  MIN_WORDS_TO_SCORE: z.coerce.number().int().min(1).default(5),
  // Grace beyond the timer before an abandoned 'playing' match is closed for scoring.
  EXPIRY_SWEEP_GRACE_SECS: z.coerce.number().int().min(0).default(15),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}

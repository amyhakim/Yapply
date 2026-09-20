import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    GRADER: z.enum(["gemini", "mock"]).default("gemini"),
    // Get one at https://aistudio.google.com/apikey
    GEMINI_API_KEY: z.string().min(1).optional(),
    GRADER_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    // Optional. Leave unset unless the chosen model documents thinking levels.
    GRADER_THINKING: z.enum(["minimal", "low", "medium", "high"]).optional(),
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
  })
  .refine((env) => env.GRADER !== "gemini" || !!env.GEMINI_API_KEY, {
    path: ["GEMINI_API_KEY"],
    message: "GEMINI_API_KEY is required unless GRADER=mock",
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

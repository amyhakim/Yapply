import type { Db } from "./db";
import type { Logger } from "./log";
import {
  claimNext, finishWithoutScores, loadScoringInput, persistResult, recordFailure, sweepExpired,
} from "./repo";
import { scoreMatch } from "./scoring/engine";
import type { Grader } from "./scoring/types";

export interface WorkerConfig {
  POLL_INTERVAL_MS: number;
  SCORING_GRACE_SECS: number;
  PENDING_ATTEMPT_TIMEOUT_SECS: number;
  SCORING_MAX_ATTEMPTS: number;
  SCORING_RETRY_BACKOFF_MS: number;
  MIN_WORDS_TO_SCORE: number;
  EXPIRY_SWEEP_GRACE_SECS: number;
}

export type TickResult = "idle" | "scored" | "skipped" | "failed";

/**
 * Turns finished matches into scores. Everything it needs is in Postgres, so it can be
 * restarted at any time: a claimed match that never finished is retried until
 * SCORING_MAX_ATTEMPTS. Run a single instance; a second one would only waste grader calls
 * (writes are idempotent).
 */
export class ScoringWorker {
  private running = false;
  private loop: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly retryAfter = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly grader: Grader,
    private readonly config: WorkerConfig,
    private readonly log: Logger,
  ) {}

  async runOnce(): Promise<TickResult> {
    const swept = await sweepExpired(this.db, this.config.EXPIRY_SWEEP_GRACE_SECS);
    if (swept) this.log("info", "closed abandoned matches", { count: swept });

    const now = Date.now();
    const blocked = [...this.retryAfter].filter(([, until]) => until > now).map(([id]) => id);
    const matchId = await claimNext(this.db, {
      graceSecs: this.config.SCORING_GRACE_SECS,
      maxAttempts: this.config.SCORING_MAX_ATTEMPTS,
      pendingTimeoutSecs: this.config.PENDING_ATTEMPT_TIMEOUT_SECS,
      excludeIds: blocked,
    });
    if (!matchId) return "idle";

    const started = Date.now();
    try {
      const input = await loadScoringInput(this.db, matchId);
      if (!input) throw new Error("match disappeared");
      const result = await scoreMatch(input, this.grader, { minWords: this.config.MIN_WORDS_TO_SCORE });
      if (!result.players.length) {
        await finishWithoutScores(this.db, matchId, "not enough speech to score");
        this.log("info", "match skipped", { matchId, reason: "not enough speech" });
        return "skipped";
      }
      const saved = await persistResult(this.db, matchId, input.match.languageCode, input.match.mode, result);
      this.retryAfter.delete(matchId);
      this.log("info", "match scored", {
        matchId, saved, players: result.players.length, skipped: result.skipped.length,
        ms: Date.now() - started,
      });
      return "scored";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordFailure(this.db, matchId, message).catch(() => undefined);
      this.retryAfter.set(matchId, Date.now() + this.config.SCORING_RETRY_BACKOFF_MS);
      this.log("error", "scoring failed", { matchId, error: message });
      return "failed";
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      let result: TickResult = "idle";
      try {
        result = await this.runOnce();
      } catch (error) {
        this.log("error", "worker tick failed", { error: error instanceof Error ? error.message : String(error) });
      }
      if (!this.running) return;
      // Keep draining while there is work; otherwise wait for the next poll.
      const delay = result === "idle" || result === "failed" ? this.config.POLL_INTERVAL_MS : 0;
      this.timer = setTimeout(() => { this.loop = tick(); }, delay);
    };
    this.loop = tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.loop;
  }
}

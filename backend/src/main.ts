import { loadConfig } from "./config";
import { pgDb } from "./db";
import { log } from "./log";
import { AnthropicGrader } from "./scoring/anthropic-grader";
import { MockGrader } from "./scoring/mock-grader";
import { ScoringWorker } from "./worker";

const config = loadConfig();
const db = pgDb(config.DATABASE_URL);

if (config.GRADER === "mock") {
  log("warn", "GRADER=mock: scores are FAKE. Never run this against real players.");
}
const grader = config.GRADER === "mock"
  ? new MockGrader()
  : new AnthropicGrader(config.GRADER_MODEL, config.GRADER_EFFORT);

const worker = new ScoringWorker(db, grader, config, log);
worker.start();
log("info", "scoring worker started", {
  grader: grader.model, version: grader.version, pollMs: config.POLL_INTERVAL_MS,
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log("info", "shutting down", { signal });
  await worker.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

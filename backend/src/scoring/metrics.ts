import type { Turn } from "./types";

export interface PlayerMetrics {
  wordCount: number;
  uniqueWords: number;
  speakingMs: number;
  turnCount: number;
  avgResponseMs: number | null;
  wordsPerMinute: number | null;
}

// A response slower than this is a fresh topic, not a reply.
const MAX_RESPONSE_GAP_MS = 30_000;
const MIN_SPEAKING_MS_FOR_PACE = 3_000;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

interface Run { participantId: number; startMs: number; endMs: number }

/** Consecutive segments by the same speaker are one conversational turn. */
function runs(turns: Turn[]): Run[] {
  const ordered = [...turns].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const out: Run[] = [];
  for (const turn of ordered) {
    const last = out[out.length - 1];
    if (last && last.participantId === turn.participantId) {
      last.endMs = Math.max(last.endMs, turn.endMs);
    } else {
      out.push({ participantId: turn.participantId, startMs: turn.startMs, endMs: turn.endMs });
    }
  }
  return out;
}

function mergedDuration(turns: Turn[]): number {
  const spans = turns.map((t) => [t.startMs, t.endMs] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [start, end] of spans) {
    if (curEnd < 0 || start > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  return curEnd >= 0 ? total + (curEnd - curStart) : 0;
}

export function playerMetrics(turns: Turn[], participantId: number): PlayerMetrics {
  const own = turns.filter((t) => t.participantId === participantId);
  const words = own.flatMap((t) => tokenize(t.text));
  const speakingMs = mergedDuration(own);
  const allRuns = runs(turns);

  const gaps: number[] = [];
  allRuns.forEach((run, index) => {
    const previous = allRuns[index - 1];
    if (run.participantId !== participantId || !previous) return;
    const gap = Math.max(0, run.startMs - previous.endMs);
    if (gap <= MAX_RESPONSE_GAP_MS) gaps.push(gap);
  });

  return {
    wordCount: words.length,
    uniqueWords: new Set(words).size,
    speakingMs,
    turnCount: allRuns.filter((run) => run.participantId === participantId).length,
    avgResponseMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    wordsPerMinute:
      speakingMs >= MIN_SPEAKING_MS_FOR_PACE
        ? Math.round((words.length / (speakingMs / 60_000)) * 10) / 10
        : null,
  };
}

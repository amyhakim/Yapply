import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assessWav } from "@/lib/azure";
import { db, transaction } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";
import { wavDurationMs } from "@/lib/wav";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const MAX_BYTES = 700_000;

export async function POST(request: NextRequest, context: Context) {
  let claimedId: string | null = null;
  try {
    const user = await requireUser(request);
    const { id: matchId } = await context.params;
    const match = await getMatch(matchId, user.id);
    const justEnded = match.status === "complete" && match.ended_at &&
      Date.now() - new Date(match.ended_at).getTime() < 30_000;
    if ((match.status !== "playing" && !justEnded) || !match.started_at) {
      throw new ApiError(409, "The match is not accepting speech");
    }
    if (!match.azure_locale) throw new ApiError(422, "Pronunciation is unavailable for this language");
    const declaredSize = Number(request.headers.get("content-length"));
    if (declaredSize > MAX_BYTES + 10_000) throw new ApiError(413, "Audio clip is too large");
    const form = await request.formData();
    const mode = form.get("mode");
    const id = form.get("attemptId");
    const atMs = Number(form.get("atMs"));
    const file = form.get("audio");
    if ((mode !== "scripted" && mode !== "unscripted") ||
        typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) ||
        !Number.isInteger(atMs) || atMs < 0 ||
        atMs > match.duration_secs * 1000 + 2_000 ||
        !(file instanceof File) || file.size > MAX_BYTES || file.size < 44) {
      throw new ApiError(400, "Invalid assessment request");
    }
    if (mode === "scripted" && !match.challenge_prompt) {
      throw new ApiError(422, "No reference phrase is configured");
    }
    const usage = await db().query<{ count: string }>(
      "SELECT count(*) FROM pronunciation_attempts WHERE match_id = $1 AND user_id = $2",
      [matchId, user.id],
    );
    if (Number(usage.rows[0].count) >= 40) {
      throw new ApiError(429, "Assessment limit reached for this match");
    }
    const wav = new Uint8Array(await file.arrayBuffer());
    let durationMs: number;
    try { durationMs = wavDurationMs(wav); }
    catch { throw new ApiError(400, "Expected mono 16 kHz PCM WAV"); }
    if (durationMs < 500 || durationMs > 20_000) {
      throw new ApiError(400, "Audio clip must be between 0.5 and 20 seconds");
    }
    const reference = mode === "scripted" ? match.challenge_prompt : null;
    const claim = await db().query(
      `INSERT INTO pronunciation_attempts
         (id, match_id, user_id, mode, locale, reference_text, at_ms, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, matchId, user.id, mode, match.azure_locale, reference, atMs, durationMs],
    );
    if (!claim.rowCount) throw new ApiError(409, "This attempt has already been submitted");
    claimedId = id;
    const assessed = await assessWav(wav, match.azure_locale, reference);
    await transaction(async (client) => {
      await client.query(
        `UPDATE pronunciation_attempts SET status = 'complete',
           recognized_text = $2, pron_score = $3, accuracy = $4,
           fluency = $5, prosody = $6, completed_at = now()
         WHERE id = $1`,
        [id, assessed.recognizedText, assessed.pronScore, assessed.accuracy,
          assessed.fluency, assessed.prosody],
      );
      if (assessed.recognizedText) {
        const participant = await client.query<{ id: string }>(
          "SELECT id FROM match_participants WHERE match_id = $1 AND user_id = $2",
          [matchId, user.id],
        );
        await client.query(
          `INSERT INTO transcript_turns
             (match_id, participant_id, text, detected_language, start_ms, end_ms,
              word_count, stt_provider)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'azure')`,
          [matchId, participant.rows[0].id, assessed.recognizedText, match.language_code,
            atMs, atMs + durationMs,
            assessed.recognizedText.trim().split(/\s+/).length],
        );
      }
      for (const word of assessed.words) {
        const wordAtMs = atMs + word.atMs;
        if (word.score < 80 || (word.errorType && word.errorType !== "None")) {
          await client.query(
            `INSERT INTO pronunciation_results
               (match_id, user_id, attempt_id, word, score, error_type, at_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [matchId, user.id, id, word.word, word.score, word.errorType, wordAtMs],
          );
        }
        for (const part of word.phonemes.filter((item) => item.score < 80)) {
          await client.query(
            `INSERT INTO pronunciation_results
               (match_id, user_id, attempt_id, word, phoneme, score, at_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [matchId, user.id, id, word.word, part.phoneme, part.score, atMs + part.atMs],
          );
        }
      }
    });
    return NextResponse.json({
      id, mode, recognizedText: assessed.recognizedText,
      pronScore: assessed.pronScore, accuracy: assessed.accuracy,
      fluency: assessed.fluency, prosody: assessed.prosody,
      notableWords: assessed.words.filter((word) => word.score < 80 ||
        (word.errorType && word.errorType !== "None")),
    });
  } catch (error) {
    if (claimedId) {
      await db().query(
        `UPDATE pronunciation_attempts SET status = 'failed', error = $2, completed_at = now()
          WHERE id = $1 AND status = 'processing'`,
        [claimedId, error instanceof Error ? error.message.slice(0, 500) : "Unknown error"],
      ).catch(console.error);
    }
    if (claimedId && !(error instanceof ApiError)) {
      console.error(error);
      return NextResponse.json({ error: "Assessment failed. Try another attempt." }, { status: 502 });
    }
    return jsonError(error);
  }
}

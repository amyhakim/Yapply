import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assessPcmStream, assessWav, InvalidPcmStreamError } from "@/lib/azure";
import { db, transaction } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
import { isOtherLanguage, otherLocaleFor } from "@/lib/language-id";
import { endMatch, getMatch } from "@/lib/matches";
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
    const streaming = request.headers.get("content-type") === "application/octet-stream";
    const form = streaming ? null : await request.formData();
    const mode = streaming ? request.headers.get("x-assessment-mode") : form!.get("mode");
    const id = streaming ? request.headers.get("x-attempt-id") : form!.get("attemptId");
    const atValue = streaming ? request.headers.get("x-at-ms") : form!.get("atMs");
    const atMs = Number(atValue);
    const file = streaming ? null : form!.get("audio");
    if ((mode !== "scripted" && mode !== "unscripted") ||
        typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) ||
        atValue === null ||
        !Number.isInteger(atMs) || atMs < 0 ||
        atMs > match.duration_secs * 1000 + 2_000 ||
        (streaming ? !request.body : !(file instanceof File) || file.size > MAX_BYTES || file.size < 44)) {
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
    let wav: Uint8Array | null = null;
    let durationMs = 1; // A stream's final duration is known only after its last chunk.
    if (!streaming) {
      wav = new Uint8Array(await (file as File).arrayBuffer());
      try { durationMs = wavDurationMs(wav); }
      catch { throw new ApiError(400, "Expected mono 16 kHz PCM WAV"); }
      if (durationMs < 500 || durationMs > 20_000) {
        throw new ApiError(400, "Audio clip must be between 0.5 and 20 seconds");
      }
    }
    const reference = mode === "scripted" ? match.challenge_prompt : null;
    // Conversation clips are also checked for the wrong language. Reading a set phrase is not.
    const otherLocale = mode === "unscripted" ? otherLocaleFor(match.azure_locale) : null;
    const languageCandidates = otherLocale && match.azure_locale
      ? [match.azure_locale, otherLocale] : undefined;
    const claim = await db().query(
      `INSERT INTO pronunciation_attempts
         (id, match_id, user_id, mode, locale, reference_text, at_ms, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, matchId, user.id, mode, match.azure_locale, reference, atMs, durationMs],
    );
    if (!claim.rowCount) throw new ApiError(409, "This attempt has already been submitted");
    claimedId = id;
    let assessed;
    if (streaming) {
      try {
        const streamed = await assessPcmStream(
          request.body!, match.azure_locale, reference, languageCandidates);
        assessed = streamed.assessment;
        durationMs = streamed.durationMs;
      } catch (error) {
        if (error instanceof InvalidPcmStreamError) throw new ApiError(400, error.message);
        throw error;
      }
    } else {
      assessed = await assessWav(wav!, match.azure_locale, reference, languageCandidates);
    }
    await transaction(async (client) => {
      await client.query(
        `UPDATE pronunciation_attempts SET status = 'complete',
           recognized_text = $2, pron_score = $3, accuracy = $4,
           fluency = $5, prosody = $6, duration_ms = $7, completed_at = now()
         WHERE id = $1`,
        [id, assessed.recognizedText, assessed.pronScore, assessed.accuracy,
          assessed.fluency, assessed.prosody, durationMs],
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
    // Azure is confident this clip is in the other language: the match ends for both players and
    // the winner is decided by score. A failure to end must not lose the assessment just stored.
    let matchEnded: "language_switch" | null = null;
    if (isOtherLanguage(assessed.language, otherLocale)) {
      try {
        if (await endMatch(matchId, { reason: "language_switch", userId: user.id })) {
          matchEnded = "language_switch";
        }
      } catch (error) {
        console.error("Could not end the match after a language switch", error);
      }
    }
    return NextResponse.json({
      id, mode, recognizedText: assessed.recognizedText,
      pronScore: assessed.pronScore, accuracy: assessed.accuracy,
      fluency: assessed.fluency, prosody: assessed.prosody,
      notableWords: assessed.words.filter((word) => word.score < 80 ||
        (word.errorType && word.errorType !== "None")),
      matchEnded,
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

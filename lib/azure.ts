import * as speech from "microsoft-cognitiveservices-speech-sdk";
import { MIN_LANGUAGE_CHECK_MS, type LanguageCheck } from "./language-id";

export interface AssessedWord {
  word: string;
  score: number;
  errorType: string | null;
  atMs: number;
  phonemes: { phoneme: string; score: number; atMs: number }[];
}

export interface Assessment {
  recognizedText: string;
  pronScore: number | null;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  words: AssessedWord[];
  /** Set only when language identification was requested and produced an answer. */
  language?: LanguageCheck | null;
}

export class InvalidPcmStreamError extends Error {}

const PCM_BYTES_PER_MS = 32; // 16 kHz, 16-bit, mono

/**
 * Asks Azure which of the candidate languages a clip is in. This is a separate pass from the
 * pronunciation scoring, because Azure documents no way to combine the two. It never throws: if
 * identification fails for any reason we simply learn nothing, and the game carries on.
 */
export async function identifyLanguage(
  pcm: Uint8Array, candidates: string[],
): Promise<LanguageCheck | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;
  const config = speech.SpeechConfig.fromSubscription(key, region);
  config.outputFormat = speech.OutputFormat.Detailed;
  const input = speech.AudioInputStream.createPushStream();
  const audio = speech.AudioConfig.fromStreamInput(input);
  const recognizer = speech.SpeechRecognizer.FromConfig(
    config, speech.AutoDetectSourceLanguageConfig.fromLanguages(candidates), audio,
  );
  try {
    input.write(Uint8Array.from(pcm).buffer);
    input.close();
    const result = await new Promise<speech.SpeechRecognitionResult>((resolve, reject) => {
      recognizer.recognizeOnceAsync(resolve, reject);
    });
    if (result.reason !== speech.ResultReason.RecognizedSpeech) return null;
    const detected = speech.AutoDetectSourceLanguageResult.fromResult(result);
    return {
      language: detected.language || null,
      confidence: detected.languageDetectionConfidence || null,
    };
  } catch (error) {
    console.error("Language identification failed", error);
    return null;
  } finally {
    recognizer.close();
    // AudioConfig.close() throws for SDK push streams, as in assessPcmStream below.
    config.close();
  }
}

const MAX_PCM_BYTES = 20_000 * 16_000 * 2 / 1_000;

type AzureWord = {
  Word?: unknown;
  Offset?: unknown;
  PronunciationAssessment?: { AccuracyScore?: unknown; ErrorType?: unknown };
  Phonemes?: Array<{
    Phoneme?: unknown; Offset?: unknown;
    PronunciationAssessment?: { AccuracyScore?: unknown };
  }>;
};

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value : null;
}

function offsetMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value / 10_000)) : 0;
}

export function parseAzureResult(raw: string, locale: string): Assessment {
  const data = JSON.parse(raw) as {
    DisplayText?: unknown;
    NBest?: Array<{
      PronunciationAssessment?: {
        PronScore?: unknown; AccuracyScore?: unknown; FluencyScore?: unknown;
        ProsodyScore?: unknown;
      };
      Words?: AzureWord[];
    }>;
  };
  const best = data.NBest?.[0];
  if (!best?.PronunciationAssessment) throw new Error("Azure returned no pronunciation assessment");
  const metrics = best.PronunciationAssessment;
  return {
    recognizedText: typeof data.DisplayText === "string" ? data.DisplayText : "",
    pronScore: score(metrics.PronScore),
    accuracy: score(metrics.AccuracyScore),
    fluency: score(metrics.FluencyScore),
    prosody: locale === "en-US" ? score(metrics.ProsodyScore) : null,
    words: (best.Words ?? []).flatMap((item) => {
      const wordScore = score(item.PronunciationAssessment?.AccuracyScore);
      if (typeof item.Word !== "string" || wordScore === null) return [];
      return [{
        word: item.Word,
        score: wordScore,
        errorType: typeof item.PronunciationAssessment?.ErrorType === "string"
          ? item.PronunciationAssessment.ErrorType : null,
        atMs: offsetMs(item.Offset),
        phonemes: (item.Phonemes ?? []).flatMap((part) => {
          const partScore = score(part.PronunciationAssessment?.AccuracyScore);
          return typeof part.Phoneme === "string" && partScore !== null
            ? [{ phoneme: part.Phoneme, score: partScore, atMs: offsetMs(part.Offset) }]
            : [];
        }),
      }];
    }),
  };
}

export async function assessWav(
  wav: Uint8Array, locale: string, referenceText: string | null,
  languageCandidates?: string[],
): Promise<Assessment> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure Speech credentials are required");
  const config = speech.SpeechConfig.fromSubscription(key, region);
  config.speechRecognitionLanguage = locale;
  config.outputFormat = speech.OutputFormat.Detailed;
  const audio = speech.AudioConfig.fromWavFileInput(Buffer.from(wav));
  const recognizer = new speech.SpeechRecognizer(config, audio);
  const assessment = new speech.PronunciationAssessmentConfig(
    referenceText ?? "",
    speech.PronunciationAssessmentGradingSystem.HundredMark,
    speech.PronunciationAssessmentGranularity.Phoneme,
    referenceText !== null,
  );
  if (locale === "en-US") assessment.enableProsodyAssessment = true;
  assessment.applyTo(recognizer);
  // Runs alongside the scoring so it adds no waiting. The WAV header is 44 bytes.
  const language = languageCandidates && wav.byteLength - 44 >= MIN_LANGUAGE_CHECK_MS * PCM_BYTES_PER_MS
    ? identifyLanguage(wav.subarray(44), languageCandidates) : null;
  try {
    const result = await new Promise<speech.SpeechRecognitionResult>((resolve, reject) => {
      recognizer.recognizeOnceAsync(resolve, reject);
    });
    if (result.reason !== speech.ResultReason.RecognizedSpeech) {
      throw new Error(`Azure did not recognize speech (${result.reason})`);
    }
    const raw = result.properties.getProperty(speech.PropertyId.SpeechServiceResponse_JsonResult);
    const assessed = parseAzureResult(raw, locale);
    assessed.language = language ? await language : null;
    return assessed;
  } finally {
    recognizer.close();
    audio.close();
    config.close();
  }
}

// Start recognition before the browser has finished sending the utterance.
// The stream contains headerless, mono 16 kHz, signed 16-bit PCM.
export async function assessPcmStream(
  body: ReadableStream<Uint8Array>, locale: string, referenceText: string | null,
  languageCandidates?: string[],
): Promise<{ assessment: Assessment; durationMs: number }> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure Speech credentials are required");
  const config = speech.SpeechConfig.fromSubscription(key, region);
  config.speechRecognitionLanguage = locale;
  config.outputFormat = speech.OutputFormat.Detailed;
  const input = speech.AudioInputStream.createPushStream();
  const audio = speech.AudioConfig.fromStreamInput(input);
  const recognizer = new speech.SpeechRecognizer(config, audio);
  const assessment = new speech.PronunciationAssessmentConfig(
    referenceText ?? "",
    speech.PronunciationAssessmentGradingSystem.HundredMark,
    speech.PronunciationAssessmentGranularity.Phoneme,
    referenceText !== null,
  );
  if (locale === "en-US") assessment.enableProsodyAssessment = true;
  assessment.applyTo(recognizer);
  const recognized = new Promise<speech.SpeechRecognitionResult>((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject);
  });
  // A connection error can arrive before the request body has finished uploading.
  void recognized.catch(() => {});
  const reader = body.getReader();
  let bytes = 0;
  let carry: number | null = null;
  let inputClosed = false;
  const collected: Uint8Array[] = []; // kept so the clip can also be sent to language identification
  try {
    while (true) {
      const read = await reader.read();
      const { done } = read;
      if (done) break;
      let value = read.value;
      bytes += value.byteLength;
      if (bytes > MAX_PCM_BYTES) throw new InvalidPcmStreamError("Audio clip is too large");
      if (carry !== null) {
        const aligned = new Uint8Array(value.byteLength + 1);
        aligned[0] = carry;
        aligned.set(value, 1);
        value = aligned;
        carry = null;
      }
      if (value.byteLength % 2) {
        carry = value[value.byteLength - 1];
        value = value.subarray(0, value.byteLength - 1);
      }
      if (value.byteLength) {
        const copy = Uint8Array.from(value);
        collected.push(copy);
        input.write(copy.buffer);
      }
    }
    if (carry !== null || bytes < 16_000) {
      throw new InvalidPcmStreamError("Audio clip must be 0.5 to 20 seconds of PCM audio");
    }
    input.close();
    inputClosed = true;
    const language = languageCandidates && bytes >= MIN_LANGUAGE_CHECK_MS * PCM_BYTES_PER_MS
      ? identifyLanguage(Buffer.concat(collected), languageCandidates) : null;
    const result = await recognized;
    if (result.reason !== speech.ResultReason.RecognizedSpeech) {
      throw new Error(`Azure did not recognize speech (${result.reason})`);
    }
    const raw = result.properties.getProperty(speech.PropertyId.SpeechServiceResponse_JsonResult);
    const assessed = parseAzureResult(raw, locale);
    assessed.language = language ? await language : null;
    return { assessment: assessed, durationMs: Math.round(bytes / PCM_BYTES_PER_MS) };
  } finally {
    await reader.cancel().catch(() => {});
    if (!inputClosed) input.close();
    recognizer.close();
    // AudioConfig.close() throws for SDK push streams (turnOff returns void).
    config.close();
  }
}

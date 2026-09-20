import * as speech from "microsoft-cognitiveservices-speech-sdk";

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
}

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
  try {
    const result = await new Promise<speech.SpeechRecognitionResult>((resolve, reject) => {
      recognizer.recognizeOnceAsync(resolve, reject);
    });
    if (result.reason !== speech.ResultReason.RecognizedSpeech) {
      throw new Error(`Azure did not recognize speech (${result.reason})`);
    }
    const raw = result.properties.getProperty(speech.PropertyId.SpeechServiceResponse_JsonResult);
    return parseAzureResult(raw, locale);
  } finally {
    recognizer.close();
    audio.close();
    config.close();
  }
}

// Rules for spotting a player who is speaking the wrong language. The Azure call itself lives in
// lib/azure.ts; this file holds only the decisions, so they can be tested without Azure.

export interface LanguageCheck {
  /** Locale Azure identified, e.g. "en-US"; null when it could not tell. */
  language: string | null;
  /** "High", "Medium", "Low" or "Unknown" as reported by Azure. */
  confidence: string | null;
}

// For each match language, the other language a player might slip into.
const OTHER_LOCALE: Record<string, string> = { "es-ES": "en-US", "en-US": "es-ES" };

// At-start identification needs a few seconds of speech; very short clips are not reliable.
export const MIN_LANGUAGE_CHECK_MS = 1_500;

export function otherLocaleFor(matchLocale: string | null): string | null {
  return (matchLocale && OTHER_LOCALE[matchLocale]) || null;
}

/**
 * True only when Azure is confident the clip is in the other language. A wrong "yes" ends a match
 * unfairly, while a missed detection costs nothing, so anything uncertain counts as "no".
 */
export function isOtherLanguage(check: LanguageCheck | null | undefined, otherLocale: string | null): boolean {
  if (!check || !otherLocale || !check.language) return false;
  return check.language.toLowerCase() === otherLocale.toLowerCase() &&
    (check.confidence ?? "").toLowerCase() === "high";
}

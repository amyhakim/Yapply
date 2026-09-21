// Reasons a browser is allowed to give when it ends a match. The wrong-language rule is decided on
// the server from the audio and cannot be claimed from here.
export type ClientEndReason = "silent_mic" | "long_pause";

export function clientEndReason(bodyText: string): ClientEndReason | null {
  try {
    const reason = (JSON.parse(bodyText) as { reason?: unknown } | null)?.reason;
    return reason === "silent_mic" || reason === "long_pause" ? reason : null;
  } catch {
    return null;
  }
}

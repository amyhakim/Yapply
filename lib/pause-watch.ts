// Detects a long pause in the conversation: nobody, on either side of the call, has spoken for a
// while. The clock only starts once someone has spoken, so a slow start to a match is never
// mistaken for a pause. Tripping ends the match, so the limit is a rule, not a guess.
export const LONG_PAUSE_MS = 10_000;

export class PauseWatch {
  private lastSpeechAt: number | null = null;

  constructor(private readonly limitMs: number = LONG_PAUSE_MS) {}

  /** Call regularly with the current time and whether anyone is speaking. True = pause too long. */
  update(anyoneSpeaking: boolean, now: number): boolean {
    if (anyoneSpeaking) {
      this.lastSpeechAt = now;
      return false;
    }
    return this.lastSpeechAt !== null && now - this.lastSpeechAt >= this.limitMs;
  }

  reset(): void {
    this.lastSpeechAt = null;
  }
}

// Detects a microphone that is not picking up any sound at all (unplugged, dead, or fully gated),
// as opposed to a player who is simply not talking: a live mic in a real room always shows some
// noise. The thresholds are deliberately conservative because tripping ends the match for both players.
export const SILENT_FLOOR = 0.0001;      // frame level (RMS, 0-1) below this counts as no sound at all
export const SILENT_LIMIT_MS = 12_000;   // how long that has to last

export class SilenceWatch {
  private silentMs = 0;

  constructor(
    private readonly limitMs: number = SILENT_LIMIT_MS,
    private readonly floor: number = SILENT_FLOOR,
  ) {}

  /** Feed one audio frame. Returns true once the mic has produced no sound for the whole limit. */
  feed(rms: number, frameMs: number): boolean {
    if (rms > this.floor) {
      this.silentMs = 0;
      return false;
    }
    this.silentMs += frameMs;
    return this.silentMs >= this.limitMs;
  }

  /** Call when the mic is muted or the track restarts, so muting is never mistaken for a dead mic. */
  reset(): void {
    this.silentMs = 0;
  }
}

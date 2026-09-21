/**
 * True when every expected player is currently in the live call. `present` is null when LiveKit
 * could not be checked (not configured, or the lookup failed); we then allow the start rather than
 * make the whole game unplayable over a missing check.
 */
export function allPresent(expected: string[], present: string[] | null): boolean {
  if (present === null) return true;
  const inCall = new Set(present);
  return expected.every((id) => inCall.has(id));
}

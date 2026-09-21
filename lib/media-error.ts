export function mediaErrorMessage(error: unknown, device = 'Camera'): string {
  const name = error instanceof Error ? error.name : '';
  const advice: Record<string, string> = {
    NotAllowedError: 'Access was blocked. Allow access in browser site permissions and system privacy settings, then retry.',
    PermissionDeniedError: 'Access was blocked. Allow access in browser site permissions, then retry.',
    NotFoundError: 'No device was found. Connect a camera or microphone and retry.',
    NotReadableError: 'The device could not be opened. Close other apps using it and retry.',
    OverconstrainedError: 'The device does not support the requested settings. Try another device.',
    SecurityError: 'Device access is blocked. Open the HTTPS site in a regular browser tab.',
  };
  return `${device}: ${advice[name] ?? (error instanceof Error ? error.message : 'Could not enable the device. Try again.')}`;
}

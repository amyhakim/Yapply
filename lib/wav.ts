export const TARGET_SAMPLE_RATE = 16_000;

// Convert browser Float32 PCM to mono 16 kHz PCM WAV for Azure Speech.
export function encodeWav(chunks: Float32Array[], inputRate: number): Uint8Array {
  if (!Number.isFinite(inputRate) || inputRate < TARGET_SAMPLE_RATE) {
    throw new Error("Unsupported microphone sample rate");
  }
  const inputLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(inputLength);
  let position = 0;
  for (const chunk of chunks) {
    input.set(chunk, position);
    position += chunk.length;
  }
  const outputLength = Math.floor(inputLength * TARGET_SAMPLE_RATE / inputRate);
  const bytes = new Uint8Array(44 + outputLength * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, outputLength * 2, true);
  for (let i = 0; i < outputLength; i++) {
    const source = i * inputRate / TARGET_SAMPLE_RATE;
    const left = Math.floor(source);
    const fraction = source - left;
    const sample = Math.max(-1, Math.min(1,
      (input[left] ?? 0) * (1 - fraction) + (input[left + 1] ?? input[left] ?? 0) * fraction,
    ));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return bytes;
}

export function wavDurationMs(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || text(0) !== "RIFF" || text(8) !== "WAVE" ||
      text(12) !== "fmt " || view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== TARGET_SAMPLE_RATE ||
      view.getUint16(34, true) !== 16 || text(36) !== "data") {
    throw new Error("Expected mono 16 kHz, 16-bit PCM WAV");
  }
  const dataBytes = view.getUint32(40, true);
  if (dataBytes !== bytes.length - 44 || dataBytes % 2 !== 0) {
    throw new Error("Invalid WAV length");
  }
  return Math.round(dataBytes / (TARGET_SAMPLE_RATE * 2) * 1000);
}

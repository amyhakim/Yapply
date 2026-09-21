import assert from "node:assert/strict";
import test from "node:test";
import { encodeWav, Pcm16StreamEncoder, wavDurationMs } from "../lib/wav";

test("browser PCM becomes a valid 16 kHz mono WAV", () => {
  const samples = new Float32Array(48_000).fill(0.25);
  const wav = encodeWav([samples.subarray(0, 24_000), samples.subarray(24_000)], 48_000);
  assert.equal(wavDurationMs(wav), 1000);
  assert.equal(wav.length, 32_044);
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getInt16(44, true), 8191);
});

test("invalid WAV length is rejected before Azure is called", () => {
  const wav = encodeWav([new Float32Array(16_000)], 16_000);
  assert.throws(() => wavDurationMs(wav.subarray(0, wav.length - 2)), /Invalid WAV length/);
});

test("streamed PCM matches the completed WAV across frame boundaries", () => {
  for (const rate of [16_000, 44_100, 48_000]) {
    const samples = Float32Array.from({ length: rate * 2 + 23 }, (_, i) =>
      Math.sin(i / 31) * 0.6);
    const encoder = new Pcm16StreamEncoder(rate);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += 2048) {
      chunks.push(encoder.write(samples.subarray(i, i + 2048)));
    }
    chunks.push(encoder.finish());
    const streamed = Buffer.concat(chunks);
    const wav = encodeWav([samples], rate);
    assert.equal(streamed.compare(Buffer.from(wav.subarray(44))), 0, `rate ${rate}`);
  }
});

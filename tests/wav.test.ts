import assert from "node:assert/strict";
import test from "node:test";
import { encodeWav, wavDurationMs } from "../lib/wav";

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

import assert from "node:assert/strict";
import test from "node:test";
import { frameCount, songSeconds } from "./audio-math.ts";
import { encodeWav, floatToInt16, readWavHeader, wavByteLength } from "./wav.ts";

test("the WAV file has a valid 16-bit PCM RIFF header", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2, Number.NaN]);
  const wav = encodeWav([samples], 44100);
  assert.equal(wav.byteLength, 44 + samples.length * 2);
  const h = readWavHeader(wav);
  assert.equal(h.riff, "RIFF");
  assert.equal(h.riffSize, wav.byteLength - 8);
  assert.equal(h.wave, "WAVE");
  assert.equal(h.fmt, "fmt ");
  assert.equal(h.fmtSize, 16);
  assert.equal(h.format, 1);
  assert.equal(h.channels, 1);
  assert.equal(h.sampleRate, 44100);
  assert.equal(h.byteRate, 88200);
  assert.equal(h.blockAlign, 2);
  assert.equal(h.bitsPerSample, 16);
  assert.equal(h.data, "data");
  assert.equal(h.dataBytes, samples.length * 2);
  const view = new DataView(wav);
  assert.deepEqual(
    Array.from({ length: samples.length }, (_, i) => view.getInt16(44 + i * 2, true)),
    [0, 16384, -16384, 32767, -32768, 32767, -32768, 0],
  );
});

test("stereo interleaves channels", () => {
  const wav = encodeWav([new Float32Array([1, 0]), new Float32Array([-1, 0])], 48000);
  const h = readWavHeader(wav);
  assert.equal(h.channels, 2);
  assert.equal(h.blockAlign, 4);
  assert.equal(h.byteRate, 192000);
  const view = new DataView(wav);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test("byte length matches loops × 16 steps × 16th-note length", () => {
  for (const [bpm, loops] of [
    [120, 1],
    [120, 8],
    [97, 3],
    [240, 2],
    [60, 1],
  ] as const) {
    const seconds = songSeconds(bpm, loops);
    const frames = frameCount(seconds, 44100);
    const wav = encodeWav([new Float32Array(frames)], 44100);
    assert.equal(wav.byteLength, wavByteLength(frames, 1));
    const h = readWavHeader(wav);
    assert.ok(Math.abs(h.seconds - loops * 16 * (60 / bpm / 4)) < 1 / 44100, `${bpm} ${loops}`);
  }
  assert.equal(wavByteLength(176400, 1), 44 + 352800);
});

test("float to int16 clips and rounds", () => {
  assert.equal(floatToInt16(0), 0);
  assert.equal(floatToInt16(1.5), 32767);
  assert.equal(floatToInt16(-1.5), -32768);
  assert.equal(floatToInt16(Number.POSITIVE_INFINITY), 0);
});

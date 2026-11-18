import assert from "node:assert/strict";
import test from "node:test";
import {
  clampLoops,
  frameCount,
  lfsrNoise,
  midiToFreq,
  noiseRate,
  noteName,
  pulseCoefficients,
  songSeconds,
  stepSeconds,
} from "./audio-math.ts";
import { DUTIES } from "./model.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("notes map to equal-tempered frequencies", () => {
  close(midiToFreq(69), 440);
  close(midiToFreq(57), 220);
  close(midiToFreq(81), 880);
  close(midiToFreq(60), 261.6255653, 1e-4);
  assert.equal(noteName(60), "C4");
  assert.equal(noteName(69), "A4");
  assert.equal(noteName(61), "C#4");
  assert.equal(noteName(36), "C2");
  assert.equal(noteName(96), "C7");
});

test("duty cycles are 12.5, 25 and 50 percent", () => {
  assert.deepEqual([...DUTIES], [0.125, 0.25, 0.5]);
});

test("pulse coefficients follow the Fourier series of a pulse wave", () => {
  const half = pulseCoefficients(0.5, 8);
  assert.equal(half.real.length, 9);
  assert.equal(half.real[0], 0);
  assert.equal(half.imag[0], 0);
  for (let n = 1; n <= 8; n += 1) {
    close(half.real[n]!, 0, 1e-6);
    close(half.imag[n]!, n % 2 ? 2 / (Math.PI * n) : 0, 1e-6);
  }
  for (const duty of [0.125, 0.25]) {
    const { real, imag } = pulseCoefficients(duty, 16);
    for (let n = 1; n <= 16; n += 1) {
      close(real[n]!, Math.sin(2 * Math.PI * n * duty) / (Math.PI * n), 1e-6);
      close(imag[n]!, (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n), 1e-6);
    }
  }
  // 25 % duty has no 4th harmonic, 12.5 % none at the 8th.
  const quarter = pulseCoefficients(0.25, 8);
  close(Math.hypot(quarter.real[4]!, quarter.imag[4]!), 0, 1e-6);
  const eighth = pulseCoefficients(0.125, 8);
  close(Math.hypot(eighth.real[8]!, eighth.imag[8]!), 0, 1e-6);
  // Narrower pulses are brighter: more energy above the fundamental.
  const ratio = (d: number) => {
    const c = pulseCoefficients(d, 8);
    return Math.hypot(c.real[2]!, c.imag[2]!) / Math.hypot(c.real[1]!, c.imag[1]!);
  };
  assert.ok(ratio(0.125) > ratio(0.25));
  assert.ok(ratio(0.25) > ratio(0.5));
});

test("LFSR noise is ±1, deterministic, and repeats after 32767 samples", () => {
  const a = lfsrNoise(40000);
  const b = lfsrNoise(40000);
  assert.deepEqual(a, b);
  for (const v of a) assert.ok(v === 1 || v === -1);
  for (let i = 0; i < 100; i += 1) assert.equal(a[i + 32767], a[i]);
  const ones = a.slice(0, 32767).filter((v) => v === 1).length;
  assert.ok(Math.abs(ones - 32767 / 2) < 200, "roughly balanced");
  assert.notDeepEqual(lfsrNoise(200, true), lfsrNoise(200, false));
});

test("noise pitch 0 plays at full rate and gets darker", () => {
  assert.equal(noiseRate(0), 1);
  close(noiseRate(2), 0.5);
  assert.ok(noiseRate(15) < noiseRate(14));
  assert.equal(noiseRate(99), noiseRate(15));
});

test("duration math: a step is a 16th note", () => {
  close(stepSeconds(120), 0.125);
  close(stepSeconds(60), 0.25);
  close(stepSeconds(240), 0.0625);
  close(songSeconds(120, 1), 2);
  close(songSeconds(120, 8), 16);
  close(songSeconds(90, 3), 3 * 16 * (60 / 90 / 4));
  assert.equal(frameCount(songSeconds(120, 2), 44100), 176400);
  assert.equal(clampLoops(0), 1);
  assert.equal(clampLoops(12), 8);
  assert.equal(clampLoops(3.4), 3);
});

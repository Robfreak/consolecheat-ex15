// Pure sound math: pitches, pulse wave coefficients, noise, and timing.
// Nothing here touches the Web Audio API, so it runs in the node test runner.

import { STEPS } from "./model.ts";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** MIDI 60 is "C4". */
export function noteName(note: number): string {
  const n = Math.round(note);
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** Playback rate of the noise buffer for a noise pitch index 0 (bright) to 15 (dark). */
export function noiseRate(index: number): number {
  const i = Math.min(15, Math.max(0, Math.round(index)));
  return 2 ** (-i / 2);
}

export const HARMONICS = 64;

/**
 * Fourier coefficients of a pulse wave that is high for `duty` of the period.
 * f(t) = 1 for 0 <= t < duty, else 0 (period 1). With the DC term dropped:
 *   real[n] = sin(2πnd) / (πn), imag[n] = (1 - cos(2πnd)) / (πn).
 * These go straight into BaseAudioContext.createPeriodicWave(real, imag).
 */
export function pulseCoefficients(duty: number, harmonics = HARMONICS): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n += 1) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
  }
  return { real, imag };
}

/**
 * NES-style 15-bit linear feedback shift register.
 * Each output sample is +1 or -1. Long mode taps bits 0 and 1, short mode taps bits 0 and 6.
 */
export function lfsrNoise(length: number, short = false, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let reg = seed & 0x7fff || 1;
  const tap = short ? 6 : 1;
  for (let i = 0; i < length; i += 1) {
    out[i] = reg & 1 ? -1 : 1;
    const bit = (reg ^ (reg >> tap)) & 1;
    reg = (reg >> 1) | (bit << 14);
  }
  return out;
}

/** Length of one step in seconds. A step is a 16th note: a quarter note (60 / BPM) split in four. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/** Length of the WAV export: loops × 16 steps × step length. */
export function songSeconds(bpm: number, loops: number, steps = STEPS): number {
  return loops * steps * stepSeconds(bpm);
}

/** Number of sample frames for a duration, rounded to the nearest frame. */
export function frameCount(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export const LOOPS_MIN = 1;
export const LOOPS_MAX = 8;

export function clampLoops(value: number): number {
  if (!Number.isFinite(value)) return LOOPS_MIN;
  return Math.min(LOOPS_MAX, Math.max(LOOPS_MIN, Math.round(value)));
}

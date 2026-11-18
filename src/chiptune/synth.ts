// Turns a song into note events (pure), and note events into Web Audio nodes.
// The same functions drive live playback (AudioContext) and the WAV export
// (OfflineAudioContext), so the export sounds like the page.

import { frameCount, lfsrNoise, midiToFreq, noiseRate, pulseCoefficients, songSeconds, stepSeconds } from "./audio-math.ts";
import { STEPS, type Duty, type Song, type TrackId } from "./model.ts";

/** Per-channel level so four full-volume tracks stay below clipping. */
export const TRACK_LEVEL: Record<TrackId, number> = {
  pulse1: 0.16,
  pulse2: 0.16,
  triangle: 0.3,
  noise: 0.16,
};

export const MASTER_GAIN = 0.9;
export const GATE = 0.9; // tonal notes sound for 90 % of a step
export const NOISE_GATE = 0.7;
export const ATTACK = 0.003;
export const RELEASE = 0.012;

export type NoteEvent =
  | { track: number; kind: "pulse"; time: number; length: number; gain: number; freq: number; duty: Duty }
  | { track: number; kind: "triangle"; time: number; length: number; gain: number; freq: number }
  | { track: number; kind: "noise"; time: number; length: number; gain: number; rate: number };

/** Every note that starts on `step`, at audio time `time`. Muted or silent tracks give none. */
export function stepNotes(song: Song, step: number, time: number): NoteEvent[] {
  const dur = stepSeconds(song.bpm);
  const out: NoteEvent[] = [];
  song.tracks.forEach((track, index) => {
    const cell = track.steps[step];
    if (!cell?.on || track.mute || track.volume <= 0) return;
    const gain = track.volume * TRACK_LEVEL[track.id];
    if (track.id === "noise") {
      out.push({ track: index, kind: "noise", time, length: dur * NOISE_GATE, gain, rate: noiseRate(cell.note) });
    } else if (track.id === "triangle") {
      out.push({ track: index, kind: "triangle", time, length: dur * GATE, gain, freq: midiToFreq(cell.note) });
    } else {
      out.push({ track: index, kind: "pulse", time, length: dur * GATE, gain, freq: midiToFreq(cell.note), duty: track.duty });
    }
  });
  return out;
}

/** All notes of an export with `loops` passes through the 16 steps, starting at time 0. */
export function songNotes(song: Song, loops: number): NoteEvent[] {
  const dur = stepSeconds(song.bpm);
  const out: NoteEvent[] = [];
  for (let pass = 0; pass < loops; pass += 1) {
    for (let step = 0; step < STEPS; step += 1) out.push(...stepNotes(song, step, (pass * STEPS + step) * dur));
  }
  return out;
}

type Cache = { waves: Map<number, PeriodicWave>; noise: AudioBuffer | null };
const caches = new WeakMap<BaseAudioContext, Cache>();

function cacheFor(ctx: BaseAudioContext): Cache {
  let cache = caches.get(ctx);
  if (!cache) {
    cache = { waves: new Map(), noise: null };
    caches.set(ctx, cache);
  }
  return cache;
}

export function pulseWave(ctx: BaseAudioContext, duty: Duty): PeriodicWave {
  const cache = cacheFor(ctx);
  let wave = cache.waves.get(duty);
  if (!wave) {
    const { real, imag } = pulseCoefficients(duty);
    wave = ctx.createPeriodicWave(real, imag);
    cache.waves.set(duty, wave);
  }
  return wave;
}

/** One second of LFSR noise, generated locally. No sample is loaded from anywhere. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cache = cacheFor(ctx);
  if (!cache.noise) {
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.getChannelData(0).set(lfsrNoise(length));
    cache.noise = buffer;
  }
  return cache.noise;
}

/** Schedules one note on `ctx`, routed into `dest`. */
export function playNote(ctx: BaseAudioContext, dest: AudioNode, note: NoteEvent) {
  const amp = ctx.createGain();
  const start = Math.max(note.time, 0);
  const end = start + Math.max(note.length, ATTACK + RELEASE);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(note.gain, start + ATTACK);
  if (note.kind === "noise") {
    amp.gain.linearRampToValueAtTime(0, end);
  } else {
    amp.gain.setValueAtTime(note.gain, end - RELEASE);
    amp.gain.linearRampToValueAtTime(0, end);
  }
  amp.connect(dest);
  let source: AudioScheduledSourceNode;
  if (note.kind === "noise") {
    const node = ctx.createBufferSource();
    node.buffer = noiseBuffer(ctx);
    node.loop = true;
    node.playbackRate.setValueAtTime(note.rate, start);
    source = node;
  } else {
    const osc = ctx.createOscillator();
    if (note.kind === "pulse") osc.setPeriodicWave(pulseWave(ctx, note.duty));
    else osc.type = "triangle";
    osc.frequency.setValueAtTime(note.freq, start);
    source = osc;
  }
  source.connect(amp);
  source.start(start);
  source.stop(end + 0.01);
  source.onended = () => {
    source.disconnect();
    amp.disconnect();
  };
}

export function createMaster(ctx: BaseAudioContext): GainNode {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  return master;
}

export const EXPORT_RATE = 44100;

/** Renders `loops` passes of the song with OfflineAudioContext and returns mono samples. */
export async function renderSong(song: Song, loops: number, sampleRate = EXPORT_RATE): Promise<Float32Array> {
  const frames = frameCount(songSeconds(song.bpm, loops), sampleRate);
  const ctx = new OfflineAudioContext(1, frames, sampleRate);
  const master = createMaster(ctx);
  for (const note of songNotes(song, loops)) playNote(ctx, master, note);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

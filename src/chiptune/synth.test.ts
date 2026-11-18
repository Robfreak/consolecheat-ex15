import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { midiToFreq, noiseRate, pulseCoefficients, stepSeconds } from "./audio-math.ts";
import { demoSong, emptySong, setTrack, toggleStep } from "./model.ts";
import { GATE, TRACK_LEVEL, noiseBuffer, playNote, pulseWave, songNotes, stepNotes } from "./synth.ts";

test("one step becomes one note per active track with the right pitch, duty and level", () => {
  let song = emptySong();
  for (let t = 0; t < 4; t += 1) song = toggleStep(song, { track: t, step: 2 });
  song = setTrack(song, 1, { duty: 0.125, volume: 0.5 });
  const notes = stepNotes(song, 2, 3);
  assert.equal(notes.length, 4);
  const [p1, p2, tri, noise] = notes;
  assert.equal(p1!.kind, "pulse");
  assert.equal(p2!.kind === "pulse" && p2!.duty, 0.125);
  assert.equal(tri!.kind, "triangle");
  assert.equal(noise!.kind, "noise");
  if (p1!.kind === "pulse") assert.equal(p1!.freq, midiToFreq(song.tracks[0]!.note));
  if (noise!.kind === "noise") assert.equal(noise!.rate, noiseRate(song.tracks[3]!.note));
  assert.equal(p2!.gain, 0.5 * TRACK_LEVEL.pulse2);
  for (const note of notes) assert.equal(note.time, 3);
  assert.equal(p1!.length, stepSeconds(120) * GATE);
  assert.deepEqual(stepNotes(song, 3, 0), [], "empty steps are silent");
});

test("muted or silent tracks make no notes", () => {
  let song = toggleStep(emptySong(), { track: 0, step: 0 });
  song = setTrack(song, 0, { mute: true });
  assert.deepEqual(stepNotes(song, 0, 0), []);
  song = setTrack(song, 0, { mute: false, volume: 0 });
  assert.deepEqual(stepNotes(song, 0, 0), []);
});

test("an export with N loops repeats the pattern N times, back to back", () => {
  const song = demoSong();
  const once = songNotes(song, 1);
  const thrice = songNotes(song, 3);
  assert.equal(thrice.length, once.length * 3);
  const pass = 16 * stepSeconds(song.bpm);
  assert.ok(Math.abs(thrice[once.length]!.time - (once[0]!.time + pass)) < 1e-9);
  assert.ok(Math.max(...thrice.map((n) => n.time)) < 3 * pass);
});

// A tiny fake of the Web Audio graph, enough to see which nodes playNote builds.
function fakeContext() {
  const log: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => log.push(`set ${v} @${t}`),
    linearRampToValueAtTime: (v: number, t: number) => log.push(`ramp ${v} @${t}`),
  });
  const node = (kind: string) => ({
    kind,
    gain: param(),
    frequency: param(),
    playbackRate: param(),
    type: "",
    loop: false,
    buffer: null as unknown,
    onended: null as unknown,
    connect: () => log.push(`connect ${kind}`),
    disconnect: () => {},
    setPeriodicWave: () => log.push(`wave ${kind}`),
    start: (t: number) => log.push(`start ${kind} @${t}`),
    stop: (t: number) => log.push(`stop ${kind} @${t}`),
  });
  const waves: { real: Float32Array; imag: Float32Array }[] = [];
  const ctx = {
    sampleRate: 8000,
    destination: node("destination"),
    createGain: () => node("gain"),
    createOscillator: () => node("oscillator"),
    createBufferSource: () => node("buffer"),
    createBuffer: (_c: number, length: number) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => {
      waves.push({ real, imag });
      return { real, imag };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, log, waves };
}

test("pulse notes use a PeriodicWave built from the duty coefficients, cached per duty", () => {
  const { ctx, log, waves } = fakeContext();
  const dest = ctx.destination;
  playNote(ctx, dest, { track: 0, kind: "pulse", time: 1, length: 0.1, gain: 0.2, freq: 440, duty: 0.25 });
  playNote(ctx, dest, { track: 0, kind: "pulse", time: 2, length: 0.1, gain: 0.2, freq: 440, duty: 0.25 });
  assert.equal(waves.length, 1);
  assert.deepEqual(waves[0]!.real, pulseCoefficients(0.25).real);
  assert.equal(pulseWave(ctx, 0.25), pulseWave(ctx, 0.25));
  assert.ok(log.includes("wave oscillator"));
  assert.ok(log.includes("start oscillator @1"));
  assert.ok(log.includes("set 440 @1"));
  assert.ok(log.some((line) => line.startsWith("ramp 0 @")), "the note fades out, no click");
});

test("noise plays a locally generated LFSR buffer", () => {
  const { ctx, log } = fakeContext();
  playNote(ctx, ctx.destination, { track: 3, kind: "noise", time: 0.5, length: 0.05, gain: 0.1, rate: 0.5 });
  assert.ok(log.includes("start buffer @0.5"));
  const buffer = noiseBuffer(ctx);
  assert.equal(buffer.length, 8000);
  const data = buffer.getChannelData(0);
  assert.ok(data.every((v) => v === 1 || v === -1));
  assert.equal(noiseBuffer(ctx), buffer, "generated once per context");
});

test("sound is only synthesized: no fetch, no decoded samples, and the context starts from a gesture", () => {
  const files = ["synth.ts", "engine.ts", "sequencer.tsx", "audio-math.ts"].map((name) =>
    readFileSync(new URL(`./${name}`, import.meta.url), "utf8"),
  );
  const all = files.join("\n");
  assert.doesNotMatch(all, /fetch\(|XMLHttpRequest|decodeAudioData|new Audio\(|\.mp3|\.ogg|import\.meta\.glob/);
  assert.match(all, /createPeriodicWave/);
  assert.match(all, /osc\.type = "triangle"/);
  assert.match(all, /new OfflineAudioContext\(/);
  assert.match(all, /startRendering\(\)/);
  const engine = files[1]!;
  assert.equal(engine.match(/new Ctor\(\)/g)?.length, 1);
  assert.doesNotMatch(all, /new AudioContext\(/, "the context is only built inside ensureContext");
  const body = engine.slice(engine.indexOf("async ensureContext"), engine.indexOf("async start"));
  assert.match(body, /new Ctor\(\)/);
  assert.match(body, /resume\(\)/);
  const ui = files[2]!;
  assert.doesNotMatch(ui.slice(0, ui.indexOf("export function Sequencer")), /ensureContext|engine\.start/);
  assert.match(ui, /AudioContext\.currentTime|engine\.step\(\)/);
  const scheduler = readFileSync(new URL("./scheduler.ts", import.meta.url), "utf8");
  assert.doesNotMatch(scheduler, /setInterval|Date\.now|performance\.now/, "note times come from the audio clock only");
});

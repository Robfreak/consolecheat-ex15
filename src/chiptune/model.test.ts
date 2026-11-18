import assert from "node:assert/strict";
import test from "node:test";
import {
  BPM_MAX,
  BPM_MIN,
  STEPS,
  TRACK_IDS,
  clampBpm,
  clampNote,
  clearTrack,
  countOn,
  demoSong,
  emptySong,
  moveCursor,
  setStepNote,
  setTrack,
  shiftStepNote,
  toggleStep,
} from "./model.ts";

test("a new song has 4 tracks in order with 16 empty steps each", () => {
  const song = emptySong();
  assert.deepEqual(song.tracks.map((track) => track.id), ["pulse1", "pulse2", "triangle", "noise"]);
  assert.deepEqual([...TRACK_IDS], ["pulse1", "pulse2", "triangle", "noise"]);
  for (const track of song.tracks) assert.equal(track.steps.length, STEPS);
  assert.equal(countOn(song), 0);
  assert.equal(song.bpm, 120);
  assert.equal(song.loop, true);
});

test("toggling a step switches it on with the track note and off again, without touching others", () => {
  const song = emptySong();
  const on = toggleStep(song, { track: 0, step: 3 });
  assert.equal(on.tracks[0]!.steps[3]!.on, true);
  assert.equal(on.tracks[0]!.steps[3]!.note, song.tracks[0]!.note);
  assert.equal(countOn(on), 1);
  assert.equal(song.tracks[0]!.steps[3]!.on, false, "the input song is not mutated");
  const off = toggleStep(on, { track: 0, step: 3 });
  assert.equal(off.tracks[0]!.steps[3]!.on, false);
  assert.equal(countOn(off), 0);
  assert.equal(toggleStep(song, { track: 9, step: 0 }), song, "an unknown track changes nothing");
});

test("the cursor moves with wrap-around in both directions", () => {
  assert.deepEqual(moveCursor({ track: 0, step: 0 }, "left"), { track: 0, step: 15 });
  assert.deepEqual(moveCursor({ track: 0, step: 15 }, "right"), { track: 0, step: 0 });
  assert.deepEqual(moveCursor({ track: 0, step: 5 }, "up"), { track: 3, step: 5 });
  assert.deepEqual(moveCursor({ track: 3, step: 5 }, "down"), { track: 0, step: 5 });
  assert.deepEqual(moveCursor({ track: 1, step: 5 }, "nextTrack"), { track: 2, step: 5 });
  assert.deepEqual(moveCursor({ track: 1, step: 5 }, "prevTrack"), { track: 0, step: 5 });
  assert.deepEqual(moveCursor({ track: 2, step: 7 }, "home"), { track: 2, step: 0 });
  assert.deepEqual(moveCursor({ track: 2, step: 7 }, "end"), { track: 2, step: 15 });
});

test("step notes are clamped per track and remembered for new steps", () => {
  let song = emptySong();
  song = setStepNote(song, { track: 0, step: 0 }, 200);
  assert.equal(song.tracks[0]!.steps[0]!.note, 96);
  assert.equal(song.tracks[0]!.note, 96);
  song = setStepNote(song, { track: 3, step: 0 }, 40);
  assert.equal(song.tracks[3]!.steps[0]!.note, 15);
  song = shiftStepNote(song, { track: 2, step: 4 }, 1);
  assert.equal(song.tracks[2]!.steps[4]!.note, 49);
  song = toggleStep(song, { track: 2, step: 9 });
  assert.equal(song.tracks[2]!.steps[9]!.note, 49);
  assert.equal(clampNote("triangle", 10), 36);
  assert.equal(clampNote("noise", -3), 0);
});

test("track settings: volume, mute, duty, clear", () => {
  let song = demoSong();
  assert.ok(countOn(song) > 10, "the demo has notes");
  song = setTrack(song, 0, { volume: 2, mute: true, duty: 0.125 });
  assert.equal(song.tracks[0]!.volume, 1);
  assert.equal(song.tracks[0]!.mute, true);
  assert.equal(song.tracks[0]!.duty, 0.125);
  song = setTrack(song, 0, { duty: 0.3 as 0.5 });
  assert.equal(song.tracks[0]!.duty, 0.125, "an unknown duty is ignored");
  song = clearTrack(song, 0);
  assert.equal(song.tracks[0]!.steps.filter((step) => step.on).length, 0);
  assert.ok(song.tracks[1]!.steps.some((step) => step.on));
});

test("BPM stays between 60 and 240", () => {
  assert.equal(clampBpm(10), BPM_MIN);
  assert.equal(clampBpm(999), BPM_MAX);
  assert.equal(clampBpm(133.6), 134);
  assert.equal(clampBpm(Number.NaN), BPM_MIN);
});

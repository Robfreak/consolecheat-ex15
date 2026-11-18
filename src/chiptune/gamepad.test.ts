import assert from "node:assert/strict";
import test from "node:test";
import { edgeActions, firstPad, pollPad, readButtons, risingEdges, type PadLike, type PadMemory } from "./gamepad.ts";

function pad(pressed: number[], axes: number[] = [0, 0]): PadLike {
  return {
    connected: true,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

test("a held button fires once, on the press edge", () => {
  const frames = [pad([]), pad([0]), pad([0]), pad([0]), pad([]), pad([0])].map(readButtons);
  const fired: number[] = [];
  let prev: boolean[] = [];
  for (const next of frames) {
    fired.push(...risingEdges(prev, next));
    prev = next;
  }
  assert.deepEqual(fired, [0, 0]);
});

test("buttons map to sequencer actions", () => {
  const none = readButtons(pad([]));
  assert.deepEqual(edgeActions(none, readButtons(pad([12]))), ["up"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([13]))), ["down"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([14]))), ["left"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([15]))), ["right"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([0]))), ["toggle"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([9]))), ["play"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([4]))), ["prevTrack"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([5]))), ["nextTrack"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([1, 2, 3, 16]))), [], "other buttons do nothing");
});

test("the left stick acts as a D-pad beyond the dead zone", () => {
  const none = readButtons(pad([]));
  assert.deepEqual(edgeActions(none, readButtons(pad([], [0.3, -0.4]))), []);
  assert.deepEqual(edgeActions(none, readButtons(pad([], [0.9, 0]))), ["right"]);
  assert.deepEqual(edgeActions(none, readButtons(pad([], [0, -0.8]))), ["up"]);
  // Holding the stick does not repeat.
  const held = readButtons(pad([], [0.9, 0]));
  assert.deepEqual(edgeActions(held, readButtons(pad([], [0.95, 0]))), []);
});

test("the first connected pad is used", () => {
  assert.equal(firstPad(null), null);
  assert.equal(firstPad([null, null]), null);
  const a = { ...pad([]), connected: false };
  const b = pad([0]);
  assert.equal(firstPad([null, a, b]), b);
});

test("holding × on the first poll does nothing; release then press fires once", () => {
  let memory: PadMemory | null = null;
  const fired: string[] = [];
  for (const frame of [pad([0]), pad([0]), pad([0]), pad([]), pad([0]), pad([0])]) {
    const result = pollPad(frame, memory);
    memory = result.memory;
    fired.push(...result.actions);
  }
  assert.deepEqual(fired, ["toggle"]);
});

test("after a disconnect and reconnect the first poll only initializes again", () => {
  let memory = pollPad(pad([]), null).memory;
  assert.deepEqual(pollPad(pad([9]), memory).actions, ["play"], "a normal press still fires");
  memory = pollPad(null, memory).memory;
  assert.equal(memory, null, "no pad clears the memory");
  const first = pollPad(pad([0, 9]), memory);
  assert.deepEqual(first.actions, [], "held buttons at reconnect do nothing");
  assert.deepEqual(pollPad(pad([0, 9]), first.memory).actions, []);
  const released = pollPad(pad([]), first.memory);
  assert.deepEqual(pollPad(pad([0]), released.memory).actions, ["toggle"]);
  // A different pad counts as a new connection too.
  const other = { ...pad([0]), id: "Other Pad", index: 1 } as PadLike;
  assert.deepEqual(pollPad(other, released.memory).actions, []);
});

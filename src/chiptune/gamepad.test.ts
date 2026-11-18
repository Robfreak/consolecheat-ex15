import assert from "node:assert/strict";
import test from "node:test";
import { edgeActions, firstPad, readButtons, risingEdges, type PadLike } from "./gamepad.ts";

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

import assert from "node:assert/strict";
import test from "node:test";
import { advance, currentStep, pruneEvents, startState } from "./scheduler.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("steps are 0.125 s apart at 120 BPM and only the lookahead window is scheduled", () => {
  const start = startState(10, 0);
  const first = advance(start, 10, 120, true, 0.3);
  assert.deepEqual(first.events.map((e) => e.step), [0, 1, 2]);
  first.events.forEach((event, i) => close(event.time, 10 + i * 0.125));
  const again = advance(first.state, 10.01, 120, true, 0.3);
  assert.deepEqual(again.events, [], "nothing is scheduled twice");
  const later = advance(first.state, 10.2, 120, true, 0.3);
  assert.deepEqual(later.events.map((e) => e.step), [3]);
  close(later.events[0]!.time, 10.375);
});

test("timing comes from the audio clock, not from how often the timer wakes", () => {
  // Waking at irregular times gives the same note times as one big call.
  let state = startState(0, 0);
  const times: number[] = [];
  for (const now of [0, 0.013, 0.04, 0.09, 0.15, 0.21, 0.3, 0.33, 0.41, 0.5, 0.58, 0.6]) {
    const result = advance(state, now, 150, true, 0.1);
    state = result.state;
    times.push(...result.events.map((e) => e.time));
  }
  const dur = 60 / 150 / 4;
  times.forEach((time, i) => close(time, i * dur));
});

test("loop wraps after 16 steps; without loop the run ends", () => {
  const looped = advance(startState(0, 0), 0, 240, true, 1.1);
  assert.equal(looped.events.length, 18);
  assert.equal(looped.events[16]!.step, 0);
  close(looped.events[16]!.time, 1);
  const once = advance(startState(0, 0), 0, 240, false, 5);
  assert.equal(once.events.length, 16);
  assert.equal(once.state.done, true);
  assert.deepEqual(advance(once.state, 10, 240, false, 5).events, []);
});

test("a tempo change applies from the next step", () => {
  const first = advance(startState(0, 0), 0, 120, true, 0.2);
  assert.equal(first.events.length, 2);
  const next = advance(first.state, 0.2, 60, true, 0.31);
  close(next.events[0]!.time, 0.25);
  close(next.events[1]!.time, 0.5);
});

test("after a stall the scheduler skips ahead instead of bursting late notes", () => {
  const first = advance(startState(0, 0), 0, 120, true, 0.1);
  const late = advance(first.state, 5, 120, true, 0.1);
  assert.ok(late.events.length <= 2);
  for (const event of late.events) assert.ok(event.time >= 5 - 0.1);
});

test("the highlighted step is the last one that started", () => {
  const events = [
    { step: 4, time: 1 },
    { step: 5, time: 1.125 },
    { step: 6, time: 1.25 },
  ];
  assert.equal(currentStep(events, 0.9), null);
  assert.equal(currentStep(events, 1.13), 5);
  assert.equal(currentStep(events, 2), 6);
  assert.deepEqual(pruneEvents(events, 1.2).map((e) => e.step), [5, 6]);
});

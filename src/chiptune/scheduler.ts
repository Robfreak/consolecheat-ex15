// Lookahead scheduler, after "A Tale of Two Clocks".
// A timer only wakes the scheduler up. Every note time comes from AudioContext.currentTime,
// so timer jitter or drift never moves a note. This module is pure: it takes the audio
// clock as a number and returns the steps to schedule.

import { STEPS } from "./model.ts";
import { stepSeconds } from "./audio-math.ts";

export const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
export const WAKE_MS = 25; // how often the timer wakes the scheduler
export const START_DELAY = 0.06; // first step starts this far after Play

export type SchedState = {
  nextStep: number;
  nextTime: number;
  done: boolean;
};

export type StepEvent = { step: number; time: number };

export function startState(now: number, delay = START_DELAY, step = 0): SchedState {
  return { nextStep: step, nextTime: now + delay, done: false };
}

/**
 * Returns every step whose start falls before `now + lookahead`, and the new state.
 * The BPM is read per step, so a tempo change applies from the next unscheduled step.
 * Without loop, the run ends after step 16.
 */
export function advance(
  state: SchedState,
  now: number,
  bpm: number,
  loop: boolean,
  lookahead = LOOKAHEAD,
  steps = STEPS,
): { state: SchedState; events: StepEvent[] } {
  const events: StepEvent[] = [];
  let { nextStep, nextTime, done } = state;
  // After a long stall (tab in background), skip ahead instead of firing a burst of late notes.
  if (!done && nextTime < now - lookahead) {
    const dur = stepSeconds(bpm);
    const behind = Math.ceil((now - nextTime) / dur);
    nextTime += behind * dur;
    if (loop) nextStep = (nextStep + behind) % steps;
    else if (nextStep + behind >= steps) done = true;
    else nextStep += behind;
  }
  while (!done && nextTime < now + lookahead) {
    events.push({ step: nextStep, time: nextTime });
    nextTime += stepSeconds(bpm);
    nextStep += 1;
    if (nextStep >= steps) {
      if (loop) nextStep = 0;
      else done = true;
    }
  }
  return { state: { nextStep, nextTime, done }, events };
}

/** The step to highlight: the last scheduled step that has already started. */
export function currentStep(events: readonly StepEvent[], now: number): number | null {
  let found: number | null = null;
  for (const event of events) {
    if (event.time <= now) found = event.step;
    else break;
  }
  return found;
}

/** Drops events that are older than the one now playing, so the queue stays short. */
export function pruneEvents(events: StepEvent[], now: number): StepEvent[] {
  let keepFrom = 0;
  for (let i = 0; i < events.length; i += 1) {
    if (events[i]!.time <= now) keepFrom = i;
    else break;
  }
  return events.slice(keepFrom);
}

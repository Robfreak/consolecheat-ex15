// Live playback. The AudioContext is created or resumed only from ensureContext(),
// which the page calls from a click, a key press, or a gamepad button handler.

import { advance, currentStep, pruneEvents, startState, WAKE_MS, type SchedState, type StepEvent } from "./scheduler.ts";
import { createMaster, playNote, stepNotes } from "./synth.ts";
import type { Song } from "./model.ts";

type AudioContextCtor = typeof AudioContext;

export class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private state: SchedState | null = null;
  private events: StepEvent[] = [];

  constructor(private readonly song: () => Song) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Creates the context on first use and resumes it. Call only from a user gesture. */
  async ensureContext(): Promise<AudioContext | null> {
    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = createMaster(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      // Without a user gesture (for example a gamepad press) resume() can stay pending, so do not wait forever.
      const wait = new Promise<void>((done) => window.setTimeout(done, 400));
      try {
        await Promise.race([this.ctx.resume(), wait]);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  async start(onEnd: () => void): Promise<boolean> {
    const ctx = await this.ensureContext();
    if (!ctx || ctx.state !== "running") return false;
    this.stop();
    this.state = startState(ctx.currentTime);
    this.events = [];
    const tick = () => {
      if (!this.state || !this.ctx || !this.master) return;
      const song = this.song();
      const result = advance(this.state, this.ctx.currentTime, song.bpm, song.loop);
      this.state = result.state;
      for (const event of result.events) {
        this.events.push(event);
        for (const note of stepNotes(song, event.step, event.time)) playNote(this.ctx, this.master, note);
      }
      this.events = pruneEvents(this.events, this.ctx.currentTime);
      if (this.state.done) {
        const last = this.events[this.events.length - 1];
        const lastEnd = last ? last.time + 60 / song.bpm / 4 : 0;
        if (this.ctx.currentTime >= lastEnd) {
          this.stop();
          onEnd();
        }
      }
    };
    tick();
    this.timer = window.setInterval(tick, WAKE_MS);
    return true;
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.state = null;
    this.events = [];
  }

  /** The step to highlight right now, read from the audio clock. */
  step(): number | null {
    if (!this.ctx || !this.playing) return null;
    return currentStep(this.events, this.ctx.currentTime);
  }

  /** A short preview of one step, for example when a step is switched on. */
  async preview(song: Song, trackIndex: number, step: number) {
    const ctx = await this.ensureContext();
    if (!ctx || !this.master || ctx.state !== "running") return;
    for (const note of stepNotes(song, step, ctx.currentTime + 0.01)) {
      if (note.track === trackIndex) playNote(ctx, this.master, note);
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}

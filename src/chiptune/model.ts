// Song model for the Chiptune-Sequencer. Pure data and pure updates, no DOM, no audio.

export const STEPS = 16;
export const TRACK_IDS = ["pulse1", "pulse2", "triangle", "noise"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const DUTIES = [0.125, 0.25, 0.5] as const;
export type Duty = (typeof DUTIES)[number];

export const BPM_MIN = 60;
export const BPM_MAX = 240;
export const BPM_DEFAULT = 120;

/** Tonal tracks use MIDI notes C2 (36) to C7 (96). */
export const NOTE_MIN = 36;
export const NOTE_MAX = 96;
/** The noise track uses a "pitch" index 0 (brightest) to 15 (darkest). */
export const NOISE_MIN = 0;
export const NOISE_MAX = 15;

export const MAX_SONGS = 50;
export const NAME_MAX = 40;

export type Step = { on: boolean; note: number };

export type Track = {
  id: TrackId;
  volume: number; // 0..1
  mute: boolean;
  duty: Duty; // used by pulse tracks only
  note: number; // note given to a step when it is switched on
  steps: Step[];
};

export type Song = {
  name: string;
  bpm: number;
  loop: boolean;
  tracks: Track[];
};

export type Cursor = { track: number; step: number };

export function isTrackId(value: unknown): value is TrackId {
  return typeof value === "string" && (TRACK_IDS as readonly string[]).includes(value);
}

export function isDuty(value: unknown): value is Duty {
  return typeof value === "number" && (DUTIES as readonly number[]).includes(value);
}

export function isNoise(id: TrackId): boolean {
  return id === "noise";
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampBpm(value: number): number {
  return Math.round(clamp(value, BPM_MIN, BPM_MAX));
}

export function clampVolume(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}

export function noteRange(id: TrackId): { min: number; max: number } {
  return isNoise(id) ? { min: NOISE_MIN, max: NOISE_MAX } : { min: NOTE_MIN, max: NOTE_MAX };
}

export function clampNote(id: TrackId, value: number): number {
  const { min, max } = noteRange(id);
  return Math.round(clamp(value, min, max));
}

export function defaultNote(id: TrackId): number {
  if (id === "pulse1") return 72; // C5
  if (id === "pulse2") return 67; // G4
  if (id === "triangle") return 48; // C3
  return 4;
}

export function emptyTrack(id: TrackId): Track {
  const note = defaultNote(id);
  return {
    id,
    volume: id === "triangle" ? 0.9 : id === "noise" ? 0.5 : 0.6,
    mute: false,
    duty: id === "pulse2" ? 0.25 : 0.5,
    note,
    steps: Array.from({ length: STEPS }, () => ({ on: false, note })),
  };
}

export function emptySong(name = "Neuer Song"): Song {
  return { name, bpm: BPM_DEFAULT, loop: true, tracks: TRACK_IDS.map(emptyTrack) };
}

/** A short demo pattern so Play makes sound right away. `null` is an empty step. */
export function demoSong(): Song {
  const song = emptySong("Demo");
  const _ = null;
  const lines: (number | null)[][] = [
    [72, _, 76, _, 79, _, 76, _, 74, _, 77, _, 81, _, 79, _],
    [_, _, 64, _, _, _, 67, _, _, _, 65, _, _, _, 71, _],
    [48, _, _, _, 48, _, _, _, 50, _, _, _, 55, _, _, _],
    [10, _, 2, _, 10, _, 2, _, 10, _, 2, _, 10, _, 2, 2],
  ];
  song.tracks = song.tracks.map((track, t) => ({
    ...track,
    steps: track.steps.map((step, s) => {
      const value = lines[t]?.[s] ?? null;
      return value === null ? step : { on: true, note: value };
    }),
  }));
  return song;
}

function mapTrack(song: Song, index: number, fn: (track: Track) => Track): Song {
  if (index < 0 || index >= song.tracks.length) return song;
  return { ...song, tracks: song.tracks.map((track, i) => (i === index ? fn(track) : track)) };
}

export function toggleStep(song: Song, cursor: Cursor): Song {
  return mapTrack(song, cursor.track, (track) => ({
    ...track,
    steps: track.steps.map((step, i) => {
      if (i !== cursor.step) return step;
      // Switching a step on gives it the track's current note.
      return step.on ? { ...step, on: false } : { on: true, note: track.note };
    }),
  }));
}

export function setStepNote(song: Song, cursor: Cursor, note: number): Song {
  return mapTrack(song, cursor.track, (track) => {
    const value = clampNote(track.id, note);
    return {
      ...track,
      note: value,
      steps: track.steps.map((step, i) => (i === cursor.step ? { ...step, note: value } : step)),
    };
  });
}

export function shiftStepNote(song: Song, cursor: Cursor, delta: number): Song {
  const step = song.tracks[cursor.track]?.steps[cursor.step];
  if (!step) return song;
  return setStepNote(song, cursor, step.note + delta);
}

export function setTrack(song: Song, index: number, patch: Partial<Pick<Track, "volume" | "mute" | "duty" | "note">>): Song {
  return mapTrack(song, index, (track) => ({
    ...track,
    volume: patch.volume === undefined ? track.volume : clampVolume(patch.volume),
    mute: patch.mute === undefined ? track.mute : patch.mute,
    duty: patch.duty !== undefined && isDuty(patch.duty) ? patch.duty : track.duty,
    note: patch.note === undefined ? track.note : clampNote(track.id, patch.note),
  }));
}

export function clearTrack(song: Song, index: number): Song {
  return mapTrack(song, index, (track) => ({ ...track, steps: track.steps.map((step) => ({ ...step, on: false })) }));
}

export type Move = "left" | "right" | "up" | "down" | "home" | "end" | "nextTrack" | "prevTrack";

/** Moves the focus cursor. Left/right wrap inside a track, up/down wrap across the four tracks. */
export function moveCursor(cursor: Cursor, move: Move, tracks = TRACK_IDS.length, steps = STEPS): Cursor {
  const wrap = (value: number, size: number) => ((value % size) + size) % size;
  switch (move) {
    case "left":
      return { ...cursor, step: wrap(cursor.step - 1, steps) };
    case "right":
      return { ...cursor, step: wrap(cursor.step + 1, steps) };
    case "up":
    case "prevTrack":
      return { ...cursor, track: wrap(cursor.track - 1, tracks) };
    case "down":
    case "nextTrack":
      return { ...cursor, track: wrap(cursor.track + 1, tracks) };
    case "home":
      return { ...cursor, step: 0 };
    case "end":
      return { ...cursor, step: steps - 1 };
  }
}

export function countOn(song: Song): number {
  return song.tracks.reduce((sum, track) => sum + track.steps.filter((step) => step.on).length, 0);
}

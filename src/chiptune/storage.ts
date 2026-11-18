// What this page stores.
//
// localStorage key `consolecheat-chiptune-v1`, JSON:
//
//   {
//     "version": 1,
//     "draft": Song,          // the song you are editing
//     "songs": [Song, ...]    // saved songs, unique names, at most 50
//   }
//
//   Song = {
//     "name": "…",            // 1–40 characters
//     "bpm": 60–240,
//     "loop": true | false,
//     "tracks": [             // exactly 4, in the order pulse1, pulse2, triangle, noise
//       { "id": "pulse1", "volume": 0–1, "mute": false, "duty": 0.125 | 0.25 | 0.5,
//         "note": 36–96 (noise: 0–15),
//         "steps": [{ "on": true, "note": 72 }, … 16 entries] }
//     ]
//   }
//
// The key is written when you change the song or save it. A missing key is not created on load.
// Corrupt JSON, another version, or a broken draft falls back to the demo song and never throws.
// Broken entries in `songs` are dropped one by one. The reset on the Datenschutz page removes only
// this key. Language and appearance reuse `consolecheat-lang` and `consolecheat-theme`.

import {
  MAX_SONGS,
  NAME_MAX,
  STEPS,
  TRACK_IDS,
  clampBpm,
  clampNote,
  clampVolume,
  defaultNote,
  demoSong,
  emptyTrack,
  isDuty,
  type Song,
  type Step,
  type Track,
} from "./model.ts";

export const SAVE_KEY = "consolecheat-chiptune-v1";
export const THEME_KEY = "consolecheat-theme";
export const LANG_KEY = "consolecheat-lang";
export const SCHEMA_VERSION = 1;
export const FILE_FORMAT = "consolecheat-chiptune";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Library = { draft: Song; songs: Song[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  return name.length ? name : null;
}

function validTrack(raw: unknown, index: number): Track | null {
  if (!isRecord(raw)) return null;
  const id = TRACK_IDS[index]!;
  if (raw.id !== id) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length !== STEPS) return null;
  const steps: Step[] = [];
  for (const item of raw.steps) {
    if (!isRecord(item) || typeof item.on !== "boolean" || typeof item.note !== "number" || !Number.isFinite(item.note)) return null;
    steps.push({ on: item.on, note: clampNote(id, item.note) });
  }
  const base = emptyTrack(id);
  return {
    id,
    volume: typeof raw.volume === "number" ? clampVolume(raw.volume) : base.volume,
    mute: typeof raw.mute === "boolean" ? raw.mute : false,
    duty: isDuty(raw.duty) ? raw.duty : base.duty,
    note: typeof raw.note === "number" ? clampNote(id, raw.note) : defaultNote(id),
    steps,
  };
}

/** Returns a clean copy of a song, or null when the shape is wrong. Numbers are clamped. */
export function validateSong(raw: unknown): Song | null {
  if (!isRecord(raw)) return null;
  const name = cleanName(raw.name);
  if (!name) return null;
  if (typeof raw.bpm !== "number" || !Number.isFinite(raw.bpm)) return null;
  if (!Array.isArray(raw.tracks) || raw.tracks.length !== TRACK_IDS.length) return null;
  const tracks: Track[] = [];
  for (let i = 0; i < raw.tracks.length; i += 1) {
    const track = validTrack(raw.tracks[i], i);
    if (!track) return null;
    tracks.push(track);
  }
  return { name, bpm: clampBpm(raw.bpm), loop: typeof raw.loop === "boolean" ? raw.loop : true, tracks };
}

export function defaultLibrary(): Library {
  return { draft: demoSong(), songs: [] };
}

/** Corrupt, foreign, or partial data falls back safely. Never throws. */
export function parseLibrary(raw: string | null): Library {
  if (raw == null) return defaultLibrary();
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== SCHEMA_VERSION) return defaultLibrary();
    const draft = validateSong(data.draft) ?? demoSong();
    const songs: Song[] = [];
    if (Array.isArray(data.songs)) {
      for (const item of data.songs) {
        const song = validateSong(item);
        if (song && !songs.some((other) => other.name === song.name)) songs.push(song);
        if (songs.length >= MAX_SONGS) break;
      }
    }
    return { draft, songs };
  } catch {
    return defaultLibrary();
  }
}

export function serializeLibrary(library: Library): string {
  return JSON.stringify({ version: SCHEMA_VERSION, draft: library.draft, songs: library.songs.slice(0, MAX_SONGS) });
}

export function loadLibrary(local: StorageLike): Library {
  try {
    return parseLibrary(local.getItem(SAVE_KEY));
  } catch {
    return defaultLibrary();
  }
}

export function saveLibrary(local: StorageLike, library: Library): boolean {
  try {
    local.setItem(SAVE_KEY, serializeLibrary(library));
    return true;
  } catch {
    return false;
  }
}

/** Removes only `consolecheat-chiptune-v1`. Language and theme stay. */
export function resetLibrary(local: StorageLike): boolean {
  try {
    local.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Saves `song` under its name. A song with the same name is replaced. */
export function upsertSong(library: Library, song: Song): { library: Library; ok: boolean } {
  const exists = library.songs.some((item) => item.name === song.name);
  if (!exists && library.songs.length >= MAX_SONGS) return { library, ok: false };
  const songs = exists ? library.songs.map((item) => (item.name === song.name ? song : item)) : [...library.songs, song];
  return { library: { ...library, songs }, ok: true };
}

export function removeSong(library: Library, name: string): Library {
  return { ...library, songs: library.songs.filter((item) => item.name !== name) };
}

export function songToFile(song: Song): string {
  return JSON.stringify({ format: FILE_FORMAT, version: SCHEMA_VERSION, song }, null, 2);
}

/** Reads a song file. Accepts the file format, or a bare song object. */
export function songFromFile(text: string): Song | null {
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data)) return null;
    if (data.format === FILE_FORMAT) {
      if (data.version !== SCHEMA_VERSION) return null;
      return validateSong(data.song);
    }
    return validateSong(data);
  } catch {
    return null;
  }
}

export function fileName(song: Song, ext: string): string {
  const base = song.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "chiptune"}.${ext}`;
}

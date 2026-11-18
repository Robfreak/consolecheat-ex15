import assert from "node:assert/strict";
import test from "node:test";
import { demoSong, emptySong, toggleStep } from "./model.ts";
import {
  FILE_FORMAT,
  SAVE_KEY,
  defaultLibrary,
  fileName,
  loadLibrary,
  parseLibrary,
  removeSong,
  resetLibrary,
  saveLibrary,
  serializeLibrary,
  songFromFile,
  songToFile,
  upsertSong,
  validateSong,
  type StorageLike,
} from "./storage.ts";

function memory(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

test("the key is consolecheat-chiptune-v1 and a missing key gives the demo without writing", () => {
  assert.equal(SAVE_KEY, "consolecheat-chiptune-v1");
  const store = memory();
  const lib = loadLibrary(store);
  assert.deepEqual(lib, defaultLibrary());
  assert.equal(store.data.size, 0);
});

test("songs round-trip through storage with schema version 1", () => {
  const store = memory();
  let lib = defaultLibrary();
  const song = toggleStep({ ...emptySong("Boss"), bpm: 150, loop: false }, { track: 1, step: 7 });
  lib = upsertSong(lib, song).library;
  lib = upsertSong(lib, { ...demoSong(), name: "Titel" }).library;
  lib = { ...lib, draft: song };
  assert.equal(saveLibrary(store, lib), true);
  const raw = JSON.parse(store.data.get(SAVE_KEY)!);
  assert.equal(raw.version, 1);
  assert.equal(raw.songs.length, 2);
  assert.deepEqual(loadLibrary(store), lib);
});

test("saving under an existing name replaces it; delete removes one song", () => {
  let lib = defaultLibrary();
  lib = upsertSong(lib, emptySong("A")).library;
  lib = upsertSong(lib, { ...emptySong("A"), bpm: 200 }).library;
  assert.equal(lib.songs.length, 1);
  assert.equal(lib.songs[0]!.bpm, 200);
  lib = upsertSong(lib, emptySong("B")).library;
  lib = removeSong(lib, "A");
  assert.deepEqual(lib.songs.map((s) => s.name), ["B"]);
  for (let i = 0; i < 60; i += 1) lib = upsertSong(lib, emptySong(`S${i}`)).library;
  assert.equal(lib.songs.length, 50);
  assert.equal(upsertSong(lib, emptySong("zu viel")).ok, false);
});

test("corrupt or foreign data falls back safely and never throws", () => {
  for (const raw of ["{", "null", "[]", "42", '"x"', '{"version":2,"draft":{}}', '{"version":1,"draft":{"name":"x"}}']) {
    const lib = parseLibrary(raw);
    assert.equal(lib.draft.name, "Demo", raw);
    assert.ok(Array.isArray(lib.songs));
  }
  const good = serializeLibrary({ draft: emptySong("Gut"), songs: [emptySong("Eins")] });
  const mixed = JSON.parse(good);
  mixed.songs.push({ name: "kaputt", bpm: 120, tracks: [] }, { name: "Eins", bpm: 99, tracks: mixed.draft.tracks });
  const lib = parseLibrary(JSON.stringify(mixed));
  assert.equal(lib.draft.name, "Gut");
  assert.deepEqual(lib.songs.map((s) => s.name), ["Eins"], "broken and duplicate entries are dropped");
  const throwing: StorageLike = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(loadLibrary(throwing).draft.name, "Demo");
  assert.equal(saveLibrary(throwing, defaultLibrary()), false);
  assert.equal(resetLibrary(throwing), false);
});

test("validation clamps numbers and rejects wrong shapes", () => {
  const song = JSON.parse(JSON.stringify(demoSong()));
  song.bpm = 999;
  song.tracks[0].volume = -1;
  song.tracks[0].duty = 0.7;
  song.tracks[0].steps[0].note = 500;
  song.tracks[3].steps[0].note = -4;
  const clean = validateSong(song)!;
  assert.equal(clean.bpm, 240);
  assert.equal(clean.tracks[0]!.volume, 0);
  assert.equal(clean.tracks[0]!.duty, 0.5);
  assert.equal(clean.tracks[0]!.steps[0]!.note, 96);
  assert.equal(clean.tracks[3]!.steps[0]!.note, 0);
  const swapped = JSON.parse(JSON.stringify(demoSong()));
  swapped.tracks.reverse();
  assert.equal(validateSong(swapped), null);
  const short = JSON.parse(JSON.stringify(demoSong()));
  short.tracks[0].steps.pop();
  assert.equal(validateSong(short), null);
  assert.equal(validateSong({ ...demoSong(), name: "   " }), null);
});

test("reset removes only the chiptune key", () => {
  const store = memory({
    [SAVE_KEY]: "{}",
    "consolecheat-lang": "en",
    "consolecheat-theme": "light",
    "consolecheat-sprite-v1": "x",
    "consolecheat-ex6-merkliste-v1": "y",
  });
  assert.equal(resetLibrary(store), true);
  assert.equal(store.data.has(SAVE_KEY), false);
  assert.deepEqual([...store.data.keys()].sort(), [
    "consolecheat-ex6-merkliste-v1",
    "consolecheat-lang",
    "consolecheat-sprite-v1",
    "consolecheat-theme",
  ]);
});

test("JSON export and import of one song, with validation", () => {
  const song = toggleStep(emptySong("Überlied #1"), { track: 0, step: 0 });
  const file = songToFile(song);
  assert.equal(JSON.parse(file).format, FILE_FORMAT);
  assert.deepEqual(songFromFile(file), song);
  assert.deepEqual(songFromFile(JSON.stringify(song)), song, "a bare song object works too");
  assert.equal(songFromFile("nope"), null);
  assert.equal(songFromFile(JSON.stringify({ format: FILE_FORMAT, version: 9, song })), null);
  assert.equal(songFromFile(JSON.stringify({ format: FILE_FORMAT, version: 1, song: { name: "x" } })), null);
  assert.equal(fileName(song, "wav"), "uberlied-1.wav");
  assert.equal(fileName({ ...song, name: "!!!" }, "json"), "chiptune.json");
});

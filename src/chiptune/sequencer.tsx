import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { clampLoops, LOOPS_MAX, LOOPS_MIN, noteName, songSeconds } from "./audio-math.ts";
import { Engine } from "./engine.ts";
import { edgeActions, firstPad, readButtons, type PadAction, type PadLike } from "./gamepad.ts";
import { LoopIcon, PlayIcon, StopIcon } from "./icons.tsx";
import { globalAction, gridAction } from "./keys.ts";
import { fill, type Copy } from "./messages.ts";
import {
  BPM_MAX,
  BPM_MIN,
  DUTIES,
  STEPS,
  clampBpm,
  demoSong,
  emptySong,
  isNoise,
  moveCursor,
  noteRange,
  setStepNote,
  setTrack,
  shiftStepNote,
  toggleStep,
  clearTrack,
  type Cursor,
  type Duty,
  type Move,
  type Song,
  type TrackId,
} from "./model.ts";
import {
  cleanName,
  fileName,
  loadLibrary,
  removeSong,
  saveLibrary,
  songFromFile,
  songToFile,
  upsertSong,
  defaultLibrary,
  type Library,
  type StorageLike,
} from "./storage.ts";
import { EXPORT_RATE, renderSong } from "./synth.ts";
import { encodeWav, readWavHeader } from "./wav.ts";

function localStore(): StorageLike | null {
  try {
    localStorage.getItem("consolecheat-theme");
    return localStorage;
  } catch {
    return null;
  }
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function noteLabel(id: TrackId, note: number, text: Copy): string {
  return isNoise(id) ? fill(text.noisePitch, { n: note }) : noteName(note);
}

function shortNote(id: TrackId, note: number): string {
  return isNoise(id) ? String(note) : noteName(note);
}

function NoteSelect({
  id,
  trackId,
  value,
  label,
  text,
  onChange,
}: {
  id: string;
  trackId: TrackId;
  value: number;
  label: string;
  text: Copy;
  onChange: (note: number) => void;
}) {
  const { min, max } = noteRange(trackId);
  const options = [];
  for (let n = min; n <= max; n += 1) options.push(n);
  return (
    <label className="flex flex-col gap-1 text-sm text-muted" htmlFor={id}>
      {label}
      <select id={id} className="field" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((n) => (
          <option key={n} value={n}>
            {noteLabel(trackId, n, text)}
          </option>
        ))}
      </select>
    </label>
  );
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function Sequencer({ text }: { text: Copy }) {
  const store = useMemo(localStore, []);
  const [library, setLibrary] = useState<Library>(() => (store ? loadLibrary(store) : defaultLibrary()));
  const [touched, setTouched] = useState(false);
  const [cursor, setCursor] = useState<Cursor>({ track: 0, step: 0 });
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState<number | null>(null);
  const [status, setStatus] = useState(text.statusStopped);
  const [notice, setNotice] = useState("");
  const [loops, setLoops] = useState(2);
  const [rendering, setRendering] = useState(false);
  const [padName, setPadName] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const song = library.draft;

  const songRef = useRef(song);
  songRef.current = song;
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine(() => songRef.current);
  const engine = engineRef.current;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const focusOnMove = useRef(false);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const media = window.matchMedia?.(reducedMotionQuery);
    if (!media) return;
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!touched || !store) return;
    if (!saveLibrary(store, library)) setNotice(text.saveFailed);
  }, [library, touched, store, text.saveFailed]);

  const updateSong = useCallback((fn: (current: Song) => Song) => {
    setTouched(true);
    setLibrary((current) => ({ ...current, draft: fn(current.draft) }));
  }, []);

  const statusFor = useCallback(
    (isPlaying: boolean, bpm: number) => (isPlaying ? fill(text.statusPlaying, { bpm }) : text.statusStopped),
    [text],
  );

  useEffect(() => {
    setStatus(statusFor(engine.playing, songRef.current.bpm));
  }, [statusFor, engine]);

  const stop = useCallback(() => {
    engine.stop();
    setPlaying(false);
    setPlayStep(null);
    setStatus(text.statusStopped);
  }, [engine, text.statusStopped]);

  const togglePlay = useCallback(async () => {
    if (engine.playing) {
      stop();
      return;
    }
    if (typeof window.AudioContext === "undefined" && !("webkitAudioContext" in window)) {
      setNotice(text.noAudio);
      return;
    }
    const ok = await engine.start(() => {
      setPlaying(false);
      setPlayStep(null);
      setStatus(text.statusEnded);
    });
    if (!ok) {
      setNotice(text.audioBlocked);
      return;
    }
    setNotice("");
    setPlaying(true);
    setStatus(fill(text.statusPlaying, { bpm: songRef.current.bpm }));
  }, [engine, stop, text]);

  const changeBpm = useCallback(
    (next: number) => {
      const bpm = clampBpm(next);
      updateSong((current) => ({ ...current, bpm }));
      if (engine.playing) setStatus(fill(text.statusPlaying, { bpm }));
    },
    [engine, text.statusPlaying, updateSong],
  );

  const toggleLoop = useCallback(() => updateSong((current) => ({ ...current, loop: !current.loop })), [updateSong]);

  const toggleAt = useCallback(
    (at: Cursor, preview: boolean) => {
      const before = songRef.current;
      const next = toggleStep(before, at);
      updateSong(() => next);
      if (preview && !engine.playing && next.tracks[at.track]?.steps[at.step]?.on) void engine.preview(next, at.track, at.step);
    },
    [engine, updateSong],
  );

  const move = useCallback((how: Move, focus: boolean) => {
    focusOnMove.current = focus;
    setCursor((current) => moveCursor(current, how));
  }, []);

  // Keep keyboard focus on the cursor step when the cursor moves from inside the grid.
  useEffect(() => {
    if (!focusOnMove.current) return;
    focusOnMove.current = false;
    stepRefs.current[cursor.track * STEPS + cursor.step]?.focus();
  }, [cursor]);

  // Page-wide keyboard shortcuts.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat && (event.key === "p" || event.key === "P" || event.key === "l" || event.key === "L")) return;
      const action = globalAction(event, event.target as HTMLElement | null);
      if (!action) return;
      event.preventDefault();
      if (action === "play") void togglePlay();
      else if (action === "loop") toggleLoop();
      else if (action === "bpmUp") changeBpm(songRef.current.bpm + 1);
      else if (action === "bpmDown") changeBpm(songRef.current.bpm - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeBpm, toggleLoop, togglePlay]);

  // One animation frame loop: gamepad polling with edge detection, and the playhead.
  const padActions = useRef<(action: PadAction) => void>(() => {});
  padActions.current = (action: PadAction) => {
    const inGrid = !!gridRef.current?.contains(document.activeElement);
    if (action === "toggle") toggleAt(cursor, false);
    else if (action === "play") void togglePlay();
    else move(action, inGrid);
  };

  useEffect(() => {
    let frame = 0;
    let prev: boolean[] = [];
    let lastName: string | null = null;
    let lastStep: number | null = null;
    const loop = () => {
      const pads = typeof navigator.getGamepads === "function" ? (navigator.getGamepads() as readonly (PadLike | null)[]) : null;
      const pad = firstPad(pads);
      const name = pad ? ((pad as unknown as Gamepad).id ?? "Gamepad") : null;
      if (name !== lastName) {
        lastName = name;
        setPadName(name);
      }
      const next = pad ? readButtons(pad) : [];
      for (const action of edgeActions(prev, next)) padActions.current(action);
      prev = next;
      const step = engine.step();
      if (step !== lastStep) {
        lastStep = step;
        setPlayStep(step);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  function onStepKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const action = gridAction(event);
    if (!action) return;
    event.preventDefault();
    if ("move" in action) move(action.move, true);
    else if ("toggle" in action) toggleAt(cursor, true);
    else updateSong((current) => shiftStepNote(current, cursor, action.note));
  }

  const selectedTrack = song.tracks[cursor.track]!;
  const selectedStep = selectedTrack.steps[cursor.step]!;
  const seconds = songSeconds(song.bpm, loops);
  const secondsLabel = seconds.toFixed(seconds < 10 ? 2 : 1);

  function saveCurrent(nameValue: string) {
    const name = cleanName(nameValue);
    if (!name) return;
    const named = { ...song, name };
    const result = upsertSong({ ...library, draft: named }, named);
    if (!result.ok) {
      setNotice(text.limitReached);
      return;
    }
    setTouched(true);
    setLibrary(result.library);
    setNotice(fill(text.saved, { name }));
  }

  function loadSong(target: Song) {
    stop();
    setTouched(true);
    setLibrary((current) => ({ ...current, draft: structuredClone(target) }));
    setNotice(fill(text.loaded, { name: target.name }));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const parsed = file.size > 512 * 1024 ? null : songFromFile(await file.text());
    if (!parsed) {
      setNotice(text.importFailed);
      return;
    }
    stop();
    setTouched(true);
    setLibrary((current) => ({ ...current, draft: parsed }));
    setNotice(fill(text.imported, { name: parsed.name }));
  }

  async function exportWav() {
    if (typeof OfflineAudioContext === "undefined") {
      setNotice(text.noAudio);
      return;
    }
    setRendering(true);
    setNotice(text.rendering);
    try {
      const samples = await renderSong(song, loops, EXPORT_RATE);
      const wav = encodeWav([samples], EXPORT_RATE);
      const header = readWavHeader(wav);
      download(fileName(song, "wav"), wav, "audio/wav");
      setNotice(fill(text.wavReady, { seconds: header.seconds.toFixed(2) }));
    } catch {
      setNotice(text.wavFailed);
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className="panel flex flex-col gap-4 rounded-xl p-4" role="group" aria-label={text.transport}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary min-w-28"
            onClick={() => void togglePlay()}
            aria-keyshortcuts="P"
            data-testid="play"
          >
            {playing ? <StopIcon /> : <PlayIcon />}
            {playing ? text.stop : text.play}
          </button>
          <button
            type="button"
            className="btn btn-ghost tool-btn"
            aria-pressed={song.loop}
            onClick={toggleLoop}
            aria-keyshortcuts="L"
            data-testid="loop"
          >
            <LoopIcon />
            {text.loop}
          </button>
          <p className="text-sm text-muted" role="status" aria-live="polite" data-testid="status">
            {status}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="chiptune-bpm">
          <span>
            {text.bpm}: <output className="font-semibold text-fg">{fill(text.bpmValue, { bpm: song.bpm })}</output>
          </span>
          <input
            id="chiptune-bpm"
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            value={song.bpm}
            aria-keyshortcuts="+ -"
            onChange={(event) => changeBpm(Number(event.target.value))}
            data-testid="bpm"
          />
        </label>
      </div>

      <div
        ref={gridRef}
        className="panel flex flex-col gap-4 rounded-xl p-3 sm:p-4"
        role="group"
        aria-label={text.gridLabel}
        data-testid="grid"
      >
        {song.tracks.map((track, t) => (
          <div key={track.id} className="seq-row" data-track={track.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-semibold tracking-tight" id={`track-${track.id}`}>
                {text.tracks[track.id]}
              </p>
              <button
                type="button"
                className="btn btn-ghost tool-btn seq-mini"
                aria-pressed={track.mute}
                onClick={() => updateSong((current) => setTrack(current, t, { mute: !track.mute }))}
              >
                {text.mute}
                <span className="sr-only"> {text.tracks[track.id]}</span>
              </button>
            </div>
            <div className="seq-steps" role="group" aria-labelledby={`track-${track.id}`}>
              {track.steps.map((step, s) => {
                const isCursor = cursor.track === t && cursor.step === s;
                return (
                  <button
                    key={s}
                    ref={(node) => {
                      stepRefs.current[t * STEPS + s] = node;
                    }}
                    type="button"
                    className="seq-step"
                    data-on={step.on ? "true" : "false"}
                    data-cursor={isCursor ? "true" : "false"}
                    data-playhead={playStep === s ? "true" : "false"}
                    data-beat={s % 4 === 0 ? "true" : "false"}
                    data-testid={`step-${t}-${s}`}
                    tabIndex={isCursor ? 0 : -1}
                    aria-pressed={step.on}
                    aria-label={fill(text.stepLabel, {
                      track: text.tracks[track.id],
                      n: s + 1,
                      state: step.on ? text.stepOn : text.stepOff,
                      note: noteLabel(track.id, step.note, text),
                    })}
                    onFocus={() => {
                      if (!isCursor) setCursor({ track: t, step: s });
                    }}
                    onClick={() => {
                      setCursor({ track: t, step: s });
                      // Space and Enter are handled in onKeyDown (with preventDefault), so this is
                      // mouse, pen, touch, or an assistive technology click.
                      toggleAt({ track: t, step: s }, true);
                    }}
                    onKeyDown={onStepKey}
                  >
                    <span aria-hidden="true">{step.on ? shortNote(track.id, step.note) : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel flex flex-col gap-3 rounded-xl p-4" aria-labelledby="selected-heading">
          <h3 id="selected-heading" className="font-display text-lg font-semibold tracking-tight">
            {fill(text.selected, { track: text.tracks[selectedTrack.id], n: cursor.step + 1 })}
          </h3>
          <NoteSelect
            id="chiptune-step-note"
            trackId={selectedTrack.id}
            value={selectedStep.note}
            label={text.stepNote}
            text={text}
            onChange={(note) => updateSong((current) => setStepNote(current, cursor, note))}
          />
          {isNoise(selectedTrack.id) ? <p className="text-sm text-subtle">{text.noiseHint}</p> : null}
          <button
            type="button"
            className="btn btn-ghost tool-btn self-start"
            aria-pressed={selectedStep.on}
            onClick={() => toggleAt(cursor, true)}
          >
            {selectedStep.on ? text.stepOn : text.stepOff}
          </button>
        </section>

        <section className="panel flex flex-col gap-4 rounded-xl p-4" aria-labelledby="tracks-heading">
          <h3 id="tracks-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.trackControls}
          </h3>
          {song.tracks.map((track, t) => (
            <fieldset key={track.id} className="flex flex-col gap-2 border-t border-line pt-3 first-of-type:border-t-0 first-of-type:pt-0">
              <legend className="text-sm font-semibold text-fg">{text.tracks[track.id]}</legend>
              <label className="flex flex-col gap-1 text-sm text-muted" htmlFor={`vol-${track.id}`}>
                {text.volume}: {Math.round(track.volume * 100)} %
                <input
                  id={`vol-${track.id}`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(track.volume * 100)}
                  onChange={(event) => updateSong((current) => setTrack(current, t, { volume: Number(event.target.value) / 100 }))}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {track.id === "pulse1" || track.id === "pulse2" ? (
                  <label className="flex flex-col gap-1 text-sm text-muted" htmlFor={`duty-${track.id}`}>
                    {text.duty}
                    <select
                      id={`duty-${track.id}`}
                      className="field"
                      value={track.duty}
                      onChange={(event) => updateSong((current) => setTrack(current, t, { duty: Number(event.target.value) as Duty }))}
                    >
                      {DUTIES.map((duty) => (
                        <option key={duty} value={duty}>
                          {(duty * 100).toLocaleString(text.locale)} %
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <NoteSelect
                  id={`note-${track.id}`}
                  trackId={track.id}
                  value={track.note}
                  label={text.defaultNote}
                  text={text}
                  onChange={(note) => updateSong((current) => setTrack(current, t, { note }))}
                />
              </div>
              <button type="button" className="btn btn-ghost self-start" onClick={() => updateSong((current) => clearTrack(current, t))}>
                {text.clearTrack}
              </button>
            </fieldset>
          ))}
        </section>

        <section className="panel flex flex-col gap-3 rounded-xl p-4" aria-labelledby="songs-heading">
          <h3 id="songs-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.songHeading}
          </h3>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveCurrent(song.name);
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-muted" htmlFor="chiptune-name">
              {text.songName}
              <input
                id="chiptune-name"
                className="field"
                maxLength={40}
                value={song.name}
                onChange={(event) => updateSong((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!cleanName(song.name)}>
              {text.save}
            </button>
          </form>
          <p className="text-sm font-semibold text-fg">{text.savedSongs}</p>
          {library.songs.length ? (
            <ul className="flex flex-col gap-2">
              {library.songs.map((item) => (
                <li key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0 truncate">
                    {item.name} · {item.bpm} BPM
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-ghost seq-mini" onClick={() => loadSong(item)}>
                      {text.load}
                      <span className="sr-only"> {item.name}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-bad seq-mini"
                      onClick={() => {
                        setTouched(true);
                        setLibrary((current) => removeSong(current, item.name));
                        setNotice(fill(text.removed, { name: item.name }));
                      }}
                    >
                      {text.remove}
                      <span className="sr-only"> {item.name}</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">{text.noSongs}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => loadSong(emptySong(text.newSongName))}>
              {text.newSong}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => loadSong(demoSong())}>
              {text.demo}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => download(fileName(song, "json"), songToFile(song), "application/json")}>
              {text.exportJson}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              {text.importJson}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </section>

        <section className="panel flex flex-col gap-3 rounded-xl p-4" aria-labelledby="wav-heading">
          <h3 id="wav-heading" className="font-display text-lg font-semibold tracking-tight">
            {text.wavHeading}
          </h3>
          <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="chiptune-loops">
            {text.wavLoops}
            <select id="chiptune-loops" className="field" value={loops} onChange={(event) => setLoops(clampLoops(Number(event.target.value)))}>
              {Array.from({ length: LOOPS_MAX - LOOPS_MIN + 1 }, (_, i) => LOOPS_MIN + i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted" data-testid="wav-length">
            {fill(text.wavLength, { seconds: secondsLabel, loops, bpm: song.bpm })}
          </p>
          <button type="button" className="btn btn-primary self-start" disabled={rendering} onClick={() => void exportWav()}>
            {rendering ? text.rendering : text.exportWav}
          </button>
          <p className="text-sm text-subtle">{padName ? `${text.gamepad}: ${padName}` : text.noGamepad}</p>
        </section>
      </div>
      <p className="min-h-6 text-sm text-fg" role="status" aria-live="polite" data-testid="notice">
        {notice}
      </p>
    </div>
  );
}

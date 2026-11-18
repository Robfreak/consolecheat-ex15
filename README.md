# Chiptune-Sequencer

Ein 8-Bit-Musikbaukasten im Browser: vier Spuren (Puls 1, Puls 2, Dreieck, Rauschen) in einem Raster aus 16 Schritten, mit Tempo, Schleife, WAV-Export und lokal gespeicherten Songs. Teil der inoffiziellen consolecheat-Werkzeuge rund um [consolecheat.com](https://consolecheat.com). German is the primary language, English is the other. Light and dark theme, self-hosted fonts, footer, Impressum, and Datenschutz are included. There is no Webmail link.

No account, no tracking, nothing uploaded. All sound is generated with the Web Audio API; no sample or sound file is loaded from the network. Fonts (Outfit, Source Sans 3) are self-hosted from `@fontsource`, so the page makes no request to Google or any other third party. The Impressum fields are placeholders until the operator fills them in. No name or address was invented.

Site: <https://robfreak.github.io/consolecheat-ex15/>

Inoffiziell. Nicht von Sony.

## What it does

- **Four tracks, 16 steps.** Pulse 1 and Pulse 2 use an `OscillatorNode` with a `PeriodicWave` built from the Fourier series of a pulse wave, with a duty cycle of 12.5, 25, or 50 %. Triangle is a `triangle` oscillator. Noise plays an `AudioBuffer` filled with NES-style 15-bit LFSR samples generated in the page. Every step of a tonal track has its own note (C2–C7), every noise step a pitch 0 (bright) to 15 (dark). A newly switched-on step gets the track's current note. Each track has volume, mute, and **Spur leeren** (clear track).
- **Playback.** **Abspielen/Stopp**, **Schleife** (loop), and a tempo slider from 60 to 240 BPM. A step is a 16th note (`60 / BPM / 4` seconds). The step that is playing is highlighted. Notes are scheduled with a lookahead scheduler on `AudioContext.currentTime` (a 25 ms timer only wakes the scheduler; it never sets a note time), so timer jitter does not drift the beat. Tempo changes apply from the next step. Without loop the pattern plays once and stops.
- **Audio starts only after a gesture.** The `AudioContext` is created and resumed only from a click, key press, or gamepad press. Until then nothing is created.
- **WAV export.** The same note events are rendered with an `OfflineAudioContext` (44.1 kHz, mono) and encoded as a 16-bit PCM RIFF/WAVE file. Length = loops × 16 steps × `60 / BPM / 4` seconds, with 1–8 loops.
- **Songs.** Save the current song under a name (same name replaces it), load or delete saved songs (up to 50), start an empty song, or load the demo. **Song als JSON** downloads one song; **JSON importieren** reads one back and validates it.
- Usable at 390px: at narrow widths each track wraps its 16 steps into two rows of 8 so every step stays a 44px touch target.

## Controls

| Input | Action |
| --- | --- |
| Click/tap a step | toggle it (and preview its sound when stopped) |
| Arrow keys (grid focused) | move the focus cursor (roving `tabindex`, wraps around) |
| Space or Enter (grid focused) | toggle the focused step |
| Shift+↑ / Shift+↓ (grid focused) | change the focused step's note by one semitone (noise: pitch) |
| Home / End | first / last step of the track |
| P | play / stop |
| L | loop on / off |
| + / - | tempo ±1 BPM |
| Gamepad D-pad or left stick | move the cursor |
| Gamepad × (button 0) | toggle step |
| Gamepad Options (button 9) | play / stop |
| Gamepad L1 / R1 (buttons 4/5) | previous / next track |

Shortcuts are ignored while a text field, select, or slider has focus. The Gamepad API is polled on `requestAnimationFrame` with edge detection, so holding a button fires once.

Accessibility: every step is a button with an accessible name (track, step, on/off, note) and `aria-pressed`; play state is announced through an `aria-live` region; focus rings stay visible; `prefers-reduced-motion` turns off the playhead motion.

## Storage

- `consolecheat-chiptune-v1` (localStorage): `{ "version": 1, "draft": Song, "songs": [Song] }`. The schema is documented at the top of `src/chiptune/storage.ts`. A missing key is not created until you change or save a song. Corrupt JSON, another version, or a broken draft falls back to the demo song and never throws; broken saved songs are dropped one by one.
- `consolecheat-lang` and `consolecheat-theme` (localStorage, shared with the other consolecheat tools on robfreak.github.io)

The Datenschutz page has a button **Alle Songs zurücksetzen** that removes only `consolecheat-chiptune-v1`. Nothing else is stored, and nothing leaves the browser. The Datenschutz page names Art. 6 Abs. 1 lit. f DSGVO for the host's connection logs.

## Run and test

```bash
npm install
npm test        # node --experimental-strip-types --test src/chiptune/*.test.ts
npm run dev     # http://127.0.0.1:5173/consolecheat-ex15/
npm run build   # typecheck, Vite build (base /consolecheat-ex15/), offline check of dist/
npm run preview # http://127.0.0.1:4173/consolecheat-ex15/
```

Node `>=22.6` (`package.json` `engines`).

## Files

- `index.html` — the HTML entry (Vite input)
- `src/chiptune/` — React + TypeScript source, styles, and tests
  - `model.ts` (song data, step toggle, cursor), `audio-math.ts` (pitches, pulse coefficients, LFSR noise, duration math), `scheduler.ts` (lookahead scheduler), `synth.ts` (notes → Web Audio nodes, offline render), `wav.ts` (WAV encoder), `engine.ts` (live playback), `storage.ts`, `gamepad.ts`, `keys.ts`, `sequencer.tsx` (UI)
- `src/chiptune/tools.ts` + `src/chiptune/tool-links.tsx` — the footer list **Weitere Werkzeuge**
- `public/` — `favicon.svg`, `FONT-OFL.txt`, `.nojekyll`
- `scripts/check-dist.mjs` — offline check of `dist/` (no third-party hosts, no `.woff` fallback, woff2 fonts present)
- `.github/workflows/pages.yml` — test, build, and deploy to `gh-pages`

## Other tools

The footer group **Weitere Werkzeuge** (English: **Other tools**) links to the other consolecheat tools: Title-ID-Finder (ex1), PS-Plus-Archiv (ex2), Controller-Tester (ex3), Save-Info-Leser (ex4), Fehlercode-Nachschlager (ex5), the [Spiele-Merkliste](https://robfreak.github.io/consolecheat-ex6/), [Bildschirm-Test](https://robfreak.github.io/consolecheat-ex7/), [Download-Zeit-Rechner](https://robfreak.github.io/consolecheat-ex8/), [Tastenbelegung](https://robfreak.github.io/consolecheat-ex9/), [HDR/Helligkeit](https://robfreak.github.io/consolecheat-ex10/), [Audio-Kanal-Test](https://robfreak.github.io/consolecheat-ex11/), [USB-Stick-Checkliste](https://robfreak.github.io/consolecheat-ex12/), [Combo-Trainer](https://robfreak.github.io/consolecheat-ex13/), and [Sprite-Animator](https://robfreak.github.io/consolecheat-ex14/). These are ordinary links. The page does not request those sites.

## GitHub Pages

`.github/workflows/pages.yml` runs install, test, and build on pull requests and on every push. A push to `main` also pushes `dist/` to the orphan branch `gh-pages` (`peaceiris/actions-gh-pages`, Jekyll off). Vite `base` is `/consolecheat-ex15/`, which matches the project site <https://robfreak.github.io/consolecheat-ex15/>.

Enable once in the repository settings:

1. **Settings → Actions → General → Workflow permissions → Read and write permissions.** Save.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.** Branch: **`gh-pages`**, folder: **`/ (root)`.** Save.

After that, every push to `main` updates the site.

## Credits

Outfit and Source Sans 3 are bundled from `@fontsource` under the SIL Open Font License; see `public/FONT-OFL.txt` and `THIRD_PARTY_NOTICES.md`.

Replace the Impressum placeholders with the operator’s real details before treating that page as a legal notice.

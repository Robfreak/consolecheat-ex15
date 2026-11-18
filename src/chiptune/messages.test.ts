import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copy, fill, initialLang, languageOptions } from "./messages.ts";
import { SAVE_KEY } from "./storage.ts";

function leaves(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

test("German is the default and English has the same keys", () => {
  assert.equal(languageOptions[0]?.id, "de");
  assert.deepEqual(languageOptions.map((item) => item.id), ["de", "en"]);
  assert.equal(initialLang(null), "de");
  assert.equal(initialLang("nope"), "de");
  assert.equal(initialLang("en"), "en");
  assert.deepEqual(leaves(copy.de).sort(), leaves(copy.en).sort());
  for (const key of leaves(copy.de)) {
    const read = (lang: "de" | "en") =>
      key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], copy[lang]);
    assert.equal(typeof read("de"), "string", key);
    assert.equal(typeof read("en"), "string", key);
    assert.ok(String(read("de")).length > 0, key);
    assert.ok(String(read("en")).length > 0, key);
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(holes(String(read("de"))), holes(String(read("en"))), `placeholders in ${key}`);
  }
  assert.equal(copy.de.title, "Chiptune-Sequencer");
  assert.equal(copy.en.title, "Chiptune sequencer");
  assert.equal(copy.de.toolsHeading, "Weitere Werkzeuge");
  assert.equal(copy.en.toolsHeading, "Other tools");
  assert.match(copy.de.storageNote, new RegExp(SAVE_KEY));
  assert.match(copy.en.storageNote, new RegExp(SAVE_KEY));
  assert.match(copy.de.controls, /Leertaste/);
  assert.match(copy.de.controls, /Pfeiltasten/);
  assert.match(copy.de.controls, /L1 und R1/);
  assert.match(copy.en.controls, /Space/);
  assert.match(copy.en.controls, /Options/);
  assert.equal(fill(copy.de.bpmValue, { bpm: 120 }), "120 BPM");
  assert.equal(fill(copy.de.selected, { track: "Puls 1", n: 3 }), "Ausgewählt: Puls 1, Schritt 3");
});

test("privacy copy names the key, local-only storage, Art. 6, and the accessibility basics", () => {
  const legal = readFileSync(new URL("./legal.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const ui = readFileSync(new URL("./sequencer.tsx", import.meta.url), "utf8");
  assert.match(legal, /Art\. 6 Abs\. 1 lit\. f DSGVO/);
  assert.match(legal, /Article 6 \(1\) \(f\) GDPR/);
  assert.match(legal, new RegExp(SAVE_KEY));
  assert.match(legal, /verlassen den Browser nicht/);
  assert.match(legal, /never leave the browser/);
  assert.match(legal, /Web Audio/);
  assert.match(legal, /consolecheat-lang/);
  assert.match(legal, /consolecheat-theme/);
  assert.match(legal, /nur den Schlüssel/);
  assert.match(legal, /Platzhalter/);
  assert.match(legal, /\[Name einsetzen\]/);
  assert.doesNotMatch(legal, /sprite|avatar|webmail/i);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /390px/);
  assert.match(ui, /aria-pressed=\{step\.on\}/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /tabIndex=\{isCursor \? 0 : -1\}/);
  assert.match(ui, /aria-label=\{fill\(text\.stepLabel/);
  assert.match(ui, /prefers-reduced-motion/);
  assert.match(ui, /requestAnimationFrame/);
  assert.match(ui, /navigator\.getGamepads/);
});

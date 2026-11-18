import assert from "node:assert/strict";
import test from "node:test";
import { globalAction, gridAction, isTypingTarget } from "./keys.ts";

const button = { tagName: "BUTTON" };

test("page shortcuts: P, L, + and -", () => {
  assert.equal(globalAction({ key: "p" }, button), "play");
  assert.equal(globalAction({ key: "P", shiftKey: true }, button), "play");
  assert.equal(globalAction({ key: "l" }, null), "loop");
  assert.equal(globalAction({ key: "+" }, null), "bpmUp");
  assert.equal(globalAction({ key: "=" }, null), "bpmUp");
  assert.equal(globalAction({ key: "-" }, null), "bpmDown");
  assert.equal(globalAction({ key: "p", ctrlKey: true }, null), null, "Ctrl+P stays print");
  assert.equal(globalAction({ key: "x" }, null), null);
});

test("shortcuts never fire while typing", () => {
  const text = { tagName: "INPUT", type: "text" };
  assert.equal(isTypingTarget(text), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "range" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isTypingTarget(button), false);
  assert.equal(globalAction({ key: "p" }, text), null);
  assert.equal(globalAction({ key: "-" }, text), null);
});

test("grid keys: arrows move, Space and Enter toggle, Shift+arrow changes the note", () => {
  assert.deepEqual(gridAction({ key: "ArrowLeft" }), { move: "left" });
  assert.deepEqual(gridAction({ key: "ArrowRight" }), { move: "right" });
  assert.deepEqual(gridAction({ key: "ArrowUp" }), { move: "up" });
  assert.deepEqual(gridAction({ key: "ArrowDown" }), { move: "down" });
  assert.deepEqual(gridAction({ key: "Home" }), { move: "home" });
  assert.deepEqual(gridAction({ key: "End" }), { move: "end" });
  assert.deepEqual(gridAction({ key: " " }), { toggle: true });
  assert.deepEqual(gridAction({ key: "Enter" }), { toggle: true });
  assert.deepEqual(gridAction({ key: "ArrowUp", shiftKey: true }), { note: 1 });
  assert.deepEqual(gridAction({ key: "ArrowDown", shiftKey: true }), { note: -1 });
  assert.equal(gridAction({ key: "a" }), null);
  assert.equal(gridAction({ key: "ArrowLeft", altKey: true }), null);
});

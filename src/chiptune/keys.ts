// Keyboard shortcuts. Typing in a field never triggers a shortcut.

import type { Move } from "./model.ts";

export type KeyAction = "play" | "loop" | "bpmUp" | "bpmDown";

type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };
type TargetLike = { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined;

/** True for text inputs, selects, textareas, and editable content. */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target.type ?? "text").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset", "file", "color"].includes(type);
  }
  return false;
}

/** Page-wide shortcuts: P play/stop, L loop, + and - tempo by 1 BPM (numpad too). */
export function globalAction(event: KeyLike, target: TargetLike): KeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(target)) return null;
  const key = event.key;
  if (key === "p" || key === "P") return "play";
  if (key === "l" || key === "L") return "loop";
  if (key === "+" || key === "=") return "bpmUp";
  if (key === "-" || key === "_") return "bpmDown";
  return null;
}

export type GridAction = { move: Move } | { toggle: true } | { note: number };

/** Keys on a focused step: arrows move, Home/End jump, Space/Enter toggle, Shift+Up/Down change the note. */
export function gridAction(event: KeyLike): GridAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case "ArrowLeft":
      return { move: "left" };
    case "ArrowRight":
      return { move: "right" };
    case "ArrowUp":
      return event.shiftKey ? { note: 1 } : { move: "up" };
    case "ArrowDown":
      return event.shiftKey ? { note: -1 } : { move: "down" };
    case "Home":
      return { move: "home" };
    case "End":
      return { move: "end" };
    case " ":
    case "Spacebar":
    case "Enter":
      return { toggle: true };
    default:
      return null;
  }
}
